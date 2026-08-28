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

type OpenLibrarySearchResult = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
};

type TvMazeSearchResult = {
  show?: {
    name?: string;
    image?: { medium?: string; original?: string } | null;
  };
};

type WikipediaSearchResult = {
  index?: number;
  title?: string;
  thumbnail?: { source?: string };
  original?: { source?: string };
  terms?: { description?: string[] };
};

type ImdbSuggestionResult = {
  id?: string;
  l?: string;
  q?: string;
  i?: { imageUrl?: string };
};

const imdbLandscapeArtwork: Record<string, string> = {
  tt1341338: 'https://images.contentstack.io/v3/assets/blt13adb7e2033fcee5/blt74478adb52ed41b1/69ab7906f6ace70008c3af14/GoodLuckHaveFunDontDie_keyart_mobile_3840x2160.jpg?width=1600'
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
    .replace(/\byrs?\b/g, ' years ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'of', 'on', 'the', 'to', 'with']);
  return normalize(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token));
}

function cleanCatalogTitle(value: string) {
  let candidate = value.trim();
  try {
    const parsed = new URL(candidate);
    candidate = parsed.searchParams.get('q') || parsed.pathname.split('/').filter(Boolean).at(-1) || candidate;
  } catch {
    // The title is ordinary text.
  }

  return candidate
    .replace(/\+/g, ' ')
    .replace(/^\s*(?:book|tv|movie|podcast|video)\s*:\s*/i, '')
    .split(/\s*;\s*|\n+/)[0]
    .replace(/\((?:or season|or series|if you|available)[^)]*\)/gi, ' ')
    .replace(/\s+(?:on|of)\s+(?:netflix|spotify|apple\s*tv\+?|peacock|hulu|max|hbo\s*max|paramount\s*plus|prime\s*video)\b/gi, ' ')
    .replace(/\s*[-–—]\s*(?:sketch comedy|series about|reality show|documentary about)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^["'“”]|["'“”]$/g, '')
    .trim()
    .slice(0, 140);
}

function catalogQueries(title: string, target: URL | null) {
  const candidates = [cleanCatalogTitle(title)];
  if (!/^https?:\/\//i.test(title)) {
    candidates.push(
      title
        .split(/\s*;\s*|\n+/)[0]
        .replace(/^\s*(?:book|tv|movie|podcast|video)\s*:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140)
    );
  }
  if (target) {
    const searchQuery = target.searchParams.get('q');
    if (searchQuery) candidates.push(cleanCatalogTitle(searchQuery));
    const slug = target.pathname.split('/').filter(Boolean).at(-1) || '';
    if (slug && !/^(?:title|show|shows|watch|video|movie)$/i.test(slug)) {
      candidates.push(cleanCatalogTitle(decodeURIComponent(slug).replace(/[-_]+/g, ' ')));
    }
  }
  const cleaned = candidates[0];
  if (cleaned.includes(':')) {
    candidates.push(cleaned.replace(/:/g, ' '));
    candidates.push(cleaned.split(':')[0]);
  }
  const compound = cleaned.split(/\s+and\s+/i);
  if (compound.length === 2 && compound.every((part) => meaningfulTokens(part).length >= 2)) {
    candidates.push(...compound);
  }
  candidates.push(cleaned.replace(/\b(?:documentary|docuseries|reality show)\b/gi, ' ').replace(/\s+/g, ' ').trim());
  candidates.push(cleaned.replace(/\b(?:podcast|songs?|interview)\b/gi, ' ').replace(/\s+/g, ' ').trim());
  return [...new Set(candidates.filter((candidate) => meaningfulTokens(candidate).length > 0))].slice(0, 3);
}

function titleDomainUrl(title: string) {
  const candidate = title.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i.test(candidate)) return null;
  return safeExternalUrl(`https://${candidate}`);
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
      if (imageTarget.toString() === currentUrl.toString()) return null;
      return { imageUrl: imageTarget.toString(), provider: currentUrl.hostname.replace(/^www\./, '') };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function lookupImdbArtwork(target: URL) {
  const titleId = target.pathname.match(/\/title\/(tt\d+)/i)?.[1];
  if (!titleId) return null;
  const preferredImage = safeExternalUrl(imdbLandscapeArtwork[titleId] || '')?.toString() || null;
  if (preferredImage) return { imageUrl: preferredImage, provider: 'Universal Pictures' };
  const response = await fetch(`https://v2.sg.media-imdb.com/suggestion/t/${titleId}.json`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 21600 }
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { d?: ImdbSuggestionResult[] };
  const imageUrl = safeExternalUrl(payload.d?.find((item) => item.id === titleId)?.i?.imageUrl || '')?.toString() || null;
  return imageUrl ? { imageUrl, provider: 'IMDb' } : null;
}

async function searchImdbArtwork(queries: string[], kind: string, creator: string) {
  const clues = normalize(`${queries.join(' ')} ${kind} ${creator}`);
  const hasScreenClue = /(?:movie|video|tv)/.test(normalize(kind)) || /\b(?:netflix|apple tv|peacock|hulu|documentary|series|show|season)\b/.test(clues);
  const exactTitleFallback = normalize(kind) === 'other' && meaningfulTokens(queries[0] || '').length >= 2;
  if (!hasScreenClue && !exactTitleFallback) return null;
  let best: { result: ImdbSuggestionResult; score: number } | null = null;

  for (const query of queries) {
    const response = await fetch(`https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 21600 }
    });
    if (!response.ok) continue;
    const payload = (await response.json()) as { d?: ImdbSuggestionResult[] };
    const match = (payload.d || [])
      .filter((result) => /^tt\d+$/i.test(result.id || '') && Boolean(result.i?.imageUrl))
      .map((result, index) => ({
        result,
        score: titleMatchScore(query, result.l || '') + Math.max(0, 0.1 - index * 0.02)
      }))
      .sort((a, b) => b.score - a.score)[0];
    if (match && (!best || match.score > best.score)) best = match;
  }

  if (!best || best.score < (exactTitleFallback && !hasScreenClue ? 1 : 0.76)) return null;
  const imageUrl = safeExternalUrl(best.result.i?.imageUrl || '')?.toString() || null;
  return imageUrl ? { imageUrl, provider: 'IMDb' } : null;
}

function appleSearchConfigs(title: string, kind: string, creator: string) {
  const normalizedKind = normalize(kind);
  const clues = normalize(`${title} ${creator}`);
  if (normalizedKind.includes('podcast')) return [{ media: 'podcast', entity: 'podcast' }];
  if (normalizedKind.includes('book')) return [{ media: 'ebook', entity: 'ebook' }];
  if (normalizedKind.includes('movie') || normalizedKind.includes('film')) {
    return [{ media: 'movie', entity: 'movie' }, { media: 'tvShow', entity: 'tvSeason' }];
  }
  if (normalizedKind.includes('tv') || normalizedKind.includes('video')) {
    return [{ media: 'tvShow', entity: 'tvSeason' }, { media: 'movie', entity: 'movie' }];
  }
  if (/\b(?:podcast|interview)\b/.test(clues)) return [{ media: 'podcast', entity: 'podcast' }];
  if (/\b(?:book|novel|memoir|kindle|by)\b/.test(clues)) return [{ media: 'ebook', entity: 'ebook' }];
  if (/\b(?:song|songs|music|album|spotify|band|singer)\b/.test(clues)) return [{ media: 'music', entity: 'album' }];
  if (/\b(?:netflix|apple tv|peacock|hulu|documentary|movie|series|show|season)\b/.test(clues)) {
    return [{ media: 'tvShow', entity: 'tvSeason' }, { media: 'movie', entity: 'movie' }];
  }
  return [];
}

function appleResultScore(query: string, result: AppleSearchResult) {
  return Math.max(
    titleMatchScore(query, result.trackName || ''),
    titleMatchScore(query, result.collectionName || ''),
    titleMatchScore(query, result.artistName || '')
  );
}

async function searchApple(queries: string[], kind: string, creator: string) {
  const configs = appleSearchConfigs(queries.join(' '), kind, creator);
  if (!configs.length || !queries.length) return null;
  let best: { result: AppleSearchResult; score: number } | null = null;

  for (const query of queries.slice(0, 3)) {
    for (const config of configs) {
      const endpoint = new URL('https://itunes.apple.com/search');
      endpoint.searchParams.set('term', query);
      endpoint.searchParams.set('country', 'US');
      endpoint.searchParams.set('media', config.media);
      endpoint.searchParams.set('entity', config.entity);
      endpoint.searchParams.set('limit', '8');
      const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, next: { revalidate: 21600 } });
      if (!response.ok) continue;
      const payload = (await response.json()) as { results?: AppleSearchResult[] };
      const match = (payload.results || [])
        .map((result) => ({ result, score: appleResultScore(query, result) }))
        .filter(({ result }) => Boolean(result.artworkUrl600 || result.artworkUrl100))
        .sort((a, b) => b.score - a.score)[0];
      if (match && (!best || match.score > best.score)) best = match;
    }
  }

  if (!best || best.score < 0.78) return null;
  return {
    imageUrl: best.result.artworkUrl600 || (best.result.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.'),
    provider: 'Apple media catalog'
  };
}

async function searchOpenLibrary(queries: string[], kind: string, creator: string) {
  const clues = normalize(`${queries[0] || ''} ${kind} ${creator}`);
  const hasBookClue = normalize(kind).includes('book') || /\b(?:book|novel|memoir|kindle|by)\b/.test(clues);
  const exactTitleFallback = normalize(kind) === 'other' && meaningfulTokens(queries[0] || '').length >= 3;
  if (!hasBookClue && !exactTitleFallback) return null;
  let best: { result: OpenLibrarySearchResult; score: number } | null = null;
  for (const query of queries.slice(0, 2)) {
    const endpoint = new URL('https://openlibrary.org/search.json');
    endpoint.searchParams.set('title', query.replace(/,?\s+by\s+.+$/i, ''));
    endpoint.searchParams.set('fields', 'title,author_name,cover_i');
    endpoint.searchParams.set('limit', '6');
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, next: { revalidate: 21600 } });
    if (!response.ok) continue;
    const payload = (await response.json()) as { docs?: OpenLibrarySearchResult[] };
    const match = (payload.docs || [])
      .filter((result) => Boolean(result.cover_i))
      .map((result) => ({ result, score: titleMatchScore(query, result.title || '') }))
      .sort((a, b) => b.score - a.score)[0];
    if (match && (!best || match.score > best.score)) best = match;
  }
  if (!best || best.score < (exactTitleFallback && !hasBookClue ? 0.96 : 0.76) || !best.result.cover_i) return null;
  return {
    imageUrl: `https://covers.openlibrary.org/b/id/${best.result.cover_i}-L.jpg?default=false`,
    provider: 'Open Library'
  };
}

async function searchTvMaze(queries: string[], kind: string, creator: string) {
  const clues = normalize(`${queries[0] || ''} ${kind} ${creator}`);
  if (!/(?:movie|video|tv)/.test(normalize(kind)) && !/\b(?:netflix|apple tv|peacock|hulu|documentary|series|show|season)\b/.test(clues)) return null;
  let best: { result: TvMazeSearchResult; score: number } | null = null;
  for (const query of queries.slice(0, 2)) {
    const endpoint = new URL('https://api.tvmaze.com/search/shows');
    endpoint.searchParams.set('q', query);
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, next: { revalidate: 21600 } });
    if (!response.ok) continue;
    const payload = (await response.json()) as TvMazeSearchResult[];
    const match = payload
      .filter((result) => Boolean(result.show?.image?.original || result.show?.image?.medium))
      .map((result) => ({ result, score: titleMatchScore(query, result.show?.name || '') }))
      .sort((a, b) => b.score - a.score)[0];
    if (match && (!best || match.score > best.score)) best = match;
  }
  if (!best || best.score < 0.8) return null;
  const imageUrl = safeExternalUrl(best.result.show?.image?.original || best.result.show?.image?.medium || '')?.toString() || null;
  return imageUrl ? { imageUrl, provider: 'TVmaze' } : null;
}

async function searchWikipedia(queries: string[]) {
  let best: { result: WikipediaSearchResult; score: number } | null = null;
  for (const query of queries.slice(0, 2)) {
    if (meaningfulTokens(query).length < 2) continue;
    const endpoint = new URL('https://en.wikipedia.org/w/api.php');
    endpoint.searchParams.set('action', 'query');
    endpoint.searchParams.set('generator', 'search');
    endpoint.searchParams.set('gsrsearch', query);
    endpoint.searchParams.set('gsrlimit', '6');
    endpoint.searchParams.set('prop', 'pageimages|pageterms');
    endpoint.searchParams.set('piprop', 'thumbnail|original');
    endpoint.searchParams.set('pithumbsize', '1200');
    endpoint.searchParams.set('wbptterms', 'description');
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('formatversion', '2');
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, next: { revalidate: 21600 } });
    if (!response.ok) continue;
    const payload = (await response.json()) as { query?: { pages?: WikipediaSearchResult[] } };
    const match = (payload.query?.pages || [])
      .filter((result) => Boolean(result.original?.source || result.thumbnail?.source))
      .map((result) => ({ result, score: titleMatchScore(query, result.title || '') }))
      .sort((a, b) => b.score - a.score)[0];
    if (match && (!best || match.score > best.score)) best = match;
  }
  if (!best || best.score < 0.8) return null;
  const imageUrl = safeExternalUrl(best.result.original?.source || best.result.thumbnail?.source || '')?.toString() || null;
  return imageUrl ? { imageUrl, provider: 'Wikipedia' } : null;
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
  const target = rawUrl ? safeExternalUrl(rawUrl) : titleDomainUrl(title);

  const session = await getSessionMember();
  if (!session && !(await isKnownPublicArtwork(rawUrl, title))) {
    return NextResponse.json({ message: 'Authentication required.' }, { status: 401 });
  }

  if (rawUrl && !target) return NextResponse.json({ imageUrl: null, message: 'Use a public web link.' }, { status: 400 });
  if (!target && !title) return NextResponse.json({ imageUrl: null, message: 'Provide a title or public web link.' }, { status: 400 });

  if (target) {
    const hostname = target.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'imdb.com') {
      try {
        const imdb = await lookupImdbArtwork(target);
        if (imdb?.imageUrl) return NextResponse.json(imdb, { headers: { 'Cache-Control': 'private, max-age=21600' } });
      } catch {
        // Continue to linked-page and catalog fallbacks.
      }
    }
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

  const queries = catalogQueries(title, target);
  try {
    const imdb = await searchImdbArtwork(queries, kind, creator);
    if (imdb?.imageUrl) return NextResponse.json(imdb, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Continue to other public catalogs.
  }
  try {
    const catalog = await searchApple(queries, kind, creator);
    if (catalog?.imageUrl) return NextResponse.json(catalog, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Continue to other public catalogs.
  }
  try {
    const book = await searchOpenLibrary(queries, kind, creator);
    if (book?.imageUrl) return NextResponse.json(book, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Continue to other public catalogs.
  }
  try {
    const television = await searchTvMaze(queries, kind, creator);
    if (television?.imageUrl) return NextResponse.json(television, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Continue to the broad knowledge fallback.
  }
  try {
    const knowledge = await searchWikipedia(queries);
    if (knowledge?.imageUrl) return NextResponse.json(knowledge, { headers: { 'Cache-Control': 'private, max-age=21600' } });
  } catch {
    // Artwork is an enhancement; callers retain their designed fallback.
  }
  return NextResponse.json({ imageUrl: null, message: 'No confident artwork match was found.' });
}
