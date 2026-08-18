import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { getSessionMember } from '@/lib/auth';
import { connectToDatabase } from '@/lib/db';
import CarveOutModel from '@/models/CarveOut';
import PodcastModel from '@/models/Podcast';

export const dynamic = 'force-dynamic';

type AppleSearchResult = {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function readMeta(html: string, attribute: 'name' | 'property', key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normal = new RegExp(`<meta[^>]+${attribute}=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escapedKey}["'][^>]*>`, 'i');
  return decodeHtml((html.match(normal) || html.match(reverse))?.[1] || '');
}

function readTagAttribute(tag: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']+)["']`, 'i');
  const unquoted = new RegExp(`\\b${escapedName}\\s*=\\s*([^\\s>]+)`, 'i');
  return decodeHtml((tag.match(quoted) || tag.match(unquoted))?.[1] || '');
}

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
  return normalize(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token));
}

function titleMatchScore(query: string, candidate: string) {
  const normalizedQuery = normalize(query);
  const normalizedCandidate = normalize(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;

  const querySet = new Set(meaningfulTokens(query));
  const candidateSet = new Set(meaningfulTokens(candidate));
  if (!querySet.size || !candidateSet.size) return 0;
  const overlap = [...querySet].filter((token) => candidateSet.has(token)).length;
  const coverage = overlap / querySet.size;
  const precision = overlap / candidateSet.size;
  let score = coverage * 0.72 + precision * 0.28;
  if (normalizedQuery.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedQuery)) score = Math.max(score, 0.86);
  return score;
}

function isUnsafeHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host.includes(':')) return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function safeExternalUrl(value: string, base?: URL) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isUnsafeHostname(url.hostname)) return null;
    if (url.port && !['80', '443'].includes(url.port)) return null;
    return url;
  } catch {
    return null;
  }
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) return isUnsafeHostname(normalized);
  if (normalized.startsWith('::ffff:')) return isUnsafeHostname(normalized.slice(7));
  if (normalized === '::' || normalized === '::1') return true;
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
}

async function resolvesToPublicAddress(url: URL) {
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
  } catch {
    return false;
  }
}

function readLikelyPageImage(html: string) {
  const imageTags = html.match(/<img\b[^>]*>/gi) || [];
  let best: { source: string; score: number } | null = null;

  for (const tag of imageTags.slice(0, 80)) {
    const source = readTagAttribute(tag, 'src') || readTagAttribute(tag, 'data-src') || readTagAttribute(tag, 'data-lazy-src');
    if (!source || /^data:/i.test(source)) continue;
    const width = Number(readTagAttribute(tag, 'width') || 0);
    const height = Number(readTagAttribute(tag, 'height') || 0);
    const descriptor = normalize([source, readTagAttribute(tag, 'alt'), readTagAttribute(tag, 'title'), readTagAttribute(tag, 'class')].join(' '));
    let score = 0;
    if (width >= 400 && height >= 220) score += 3;
    else if (width >= 250 && height >= 140) score += 2;
    if (/\b(?:hero|featured|feature|front|entry|museum|exhibit|cover|banner|main)\b/.test(descriptor)) score += 4;
    if (/\b(?:large|wide|landscape)\b/.test(descriptor)) score += 2;
    if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(source)) score += 1;
    if (/\b(?:logo|icon|avatar|sprite|badge|tracking|pixel|advertisement)\b/.test(descriptor)) score -= 8;
    if (/\.svg(?:\?|$)/i.test(source)) score -= 4;
    if (!best || score > best.score) best = { source, score };
  }
  return best && best.score >= 3 ? best.source : '';
}

async function fetchPage(target: URL) {
  let currentUrl = target;
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (!(await resolvesToPublicAddress(currentUrl))) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'RoyalPodcastSociety/1.0' }
      });
      if (response.status >= 300 && response.status < 400) {
        const nextUrl = safeExternalUrl(response.headers.get('location') || '', currentUrl);
        if (!nextUrl) return null;
        currentUrl = nextUrl;
        continue;
      }
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) return { imageUrl: currentUrl.toString(), provider: currentUrl.hostname };
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) return null;
      const html = (await response.text()).slice(0, 500_000);
      const source = readMeta(html, 'property', 'og:image:secure_url') || readMeta(html, 'property', 'og:image') ||
        readMeta(html, 'name', 'twitter:image') || readMeta(html, 'name', 'twitter:image:src') || readLikelyPageImage(html);
      const imageTarget = safeExternalUrl(source, currentUrl);
      if (!imageTarget || !(await resolvesToPublicAddress(imageTarget))) return null;
      return { imageUrl: imageTarget.toString(), provider: currentUrl.hostname.replace(/^www\./, '') };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

function appleSearchConfig(kind: string) {
  const normalized = normalize(kind);
  if (normalized.includes('podcast')) return { media: 'podcast', entity: 'podcast' };
  if (normalized.includes('book')) return { media: 'ebook', entity: 'ebook' };
  if (normalized.includes('movie') || normalized.includes('film')) return { media: 'movie', entity: 'movie' };
  if (normalized.includes('tv') || normalized.includes('video')) return { media: 'tvShow', entity: 'tvSeason' };
  if (normalized.includes('music') || normalized.includes('album')) return { media: 'music', entity: 'album' };
  return null;
}

async function searchApple(title: string, kind: string, creator: string) {
  const config = appleSearchConfig(kind);
  if (!config || !title.trim()) return null;
  const endpoint = new URL('https://itunes.apple.com/search');
  endpoint.searchParams.set('term', [title, creator].filter(Boolean).join(' '));
  endpoint.searchParams.set('country', 'US');
  endpoint.searchParams.set('media', config.media);
  endpoint.searchParams.set('entity', config.entity);
  endpoint.searchParams.set('limit', '8');
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, next: { revalidate: 21600 } });
  if (!response.ok) return null;
  const payload = (await response.json()) as { results?: AppleSearchResult[] };
  const match = (payload.results || [])
    .map((result) => ({ result, score: titleMatchScore(title, result.trackName || result.collectionName || '') }))
    .filter(({ result }) => Boolean(result.artworkUrl600 || result.artworkUrl100))
    .sort((a, b) => b.score - a.score)[0];
  if (!match || match.score < 0.78) return null;
  return {
    imageUrl: match.result.artworkUrl600 || (match.result.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    provider: 'Apple media catalog'
  };
}

async function isKnownPublicArtwork(rawUrl: string, title: string) {
  try {
    await connectToDatabase();
    const [podcast, carveOut] = await Promise.all([
      PodcastModel.exists({
        status: 'discussed',
        ...(rawUrl ? { link: rawUrl } : { title })
      }),
      CarveOutModel.exists(rawUrl ? { url: rawUrl } : { title })
    ]);
    return Boolean(podcast || carveOut);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawUrl = (url.searchParams.get('url') || '').trim().slice(0, 2000);
  const title = (url.searchParams.get('title') || '').trim().slice(0, 180);
  const kind = (url.searchParams.get('kind') || '').trim().slice(0, 40);
  const creator = (url.searchParams.get('creator') || '').trim().slice(0, 120);
  const target = rawUrl ? safeExternalUrl(rawUrl) : null;

  const session = await getSessionMember();
  if (!session && !(await isKnownPublicArtwork(rawUrl, title))) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  if (rawUrl && !target) return NextResponse.json({ imageUrl: null, message: 'Use a public web link.' }, { status: 400 });
  if (!target && !title) return NextResponse.json({ imageUrl: null, message: 'Provide a title or public web link.' }, { status: 400 });

  if (target) {
    const hostname = target.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'open.spotify.com' || hostname === 'youtube.com' || hostname === 'youtu.be') {
      const endpoint = hostname === 'open.spotify.com'
        ? `https://open.spotify.com/oembed?url=${encodeURIComponent(target.toString())}`
        : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target.toString())}`;
      try {
        const response = await fetch(endpoint, { next: { revalidate: 21600 } });
        if (response.ok) {
          const result = (await response.json()) as { thumbnail_url?: string };
          const imageUrl = safeExternalUrl(result.thumbnail_url || '')?.toString() || null;
          if (imageUrl) return NextResponse.json({ imageUrl, provider: hostname });
        }
      } catch {
        // Continue to linked-page and catalog fallbacks.
      }
    }
    const linked = await fetchPage(target);
    if (linked?.imageUrl) return NextResponse.json(linked, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  }

  try {
    const catalog = await searchApple(title, kind, creator);
    if (catalog?.imageUrl) return NextResponse.json(catalog, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Artwork is an enhancement; callers retain their designed fallback.
  }
  return NextResponse.json({ imageUrl: null, message: 'No confident artwork match was found.' });
}
