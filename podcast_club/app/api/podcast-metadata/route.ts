import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';

type AppleLookupResult = {
  wrapperType?: string;
  kind?: string;
  artistName?: string;
  collectionName?: string;
  trackName?: string;
  trackTimeMillis?: number;
  trackViewUrl?: string;
  artworkUrl600?: string;
  artworkUrl100?: string;
  shortDescription?: string;
  description?: string;
};

type OEmbedResult = { title?: string; author_name?: string; thumbnail_url?: string };

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
  const pattern = new RegExp(`<meta[^>]+${attribute}=["']${escapedKey}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escapedKey}["'][^>]*>`, 'i');
  return decodeHtml((html.match(pattern) || html.match(reversePattern))?.[1] || '');
}

function minutesFromAppleDescription(value: string) {
  const hours = value.match(/(\d+)\s*hr/i)?.[1];
  const minutes = value.match(/(\d+)\s*min/i)?.[1];
  if (!hours && !minutes) return null;
  return Number(hours || 0) * 60 + Number(minutes || 0);
}

function safeDescription(value?: string) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 700);
}

function validateProviderUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Paste a secure public podcast episode link.');
  }
  return url;
}

async function getAppleMetadata(url: URL) {
  const episodeId = url.searchParams.get('i');
  if (!episodeId || !/^\d+$/.test(episodeId)) {
    throw new Error('Use a direct Apple Podcasts episode link, not the show page.');
  }

  const country = url.pathname.match(/^\/([a-z]{2})\//i)?.[1]?.toLowerCase() || 'us';
  const response = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(episodeId)}&entity=podcastEpisode&country=${country}`,
    { cache: 'no-store', signal: AbortSignal.timeout(8000) }
  );
  if (response.ok) {
    const payload = (await response.json()) as { results?: AppleLookupResult[] };
    const episode = payload.results?.find((result) => result.wrapperType === 'podcastEpisode' || result.kind === 'podcast');
    if (episode) {
      return {
        provider: 'Apple Podcasts',
        title: episode.collectionName || '',
        host: episode.artistName || episode.collectionName || '',
        episodeNames: episode.trackName || '',
        episodeCount: 1,
        totalTimeMinutes: episode.trackTimeMillis ? Math.max(1, Math.round(episode.trackTimeMillis / 60000)) : null,
        notes: safeDescription(episode.shortDescription || episode.description),
        link: episode.trackViewUrl || url.toString(),
        artworkUrl: episode.artworkUrl600 || episode.artworkUrl100 || null
      };
    }
  }

  const [pageResponse, oEmbedResponse] = await Promise.all([
    fetch(url, {
      cache: 'no-store',
      headers: { Accept: 'text/html', 'User-Agent': 'RoyalPodcastSociety/1.0' },
      signal: AbortSignal.timeout(8000)
    }),
    fetch(`https://podcasts.apple.com/api/oembed?url=${encodeURIComponent(url.toString())}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    })
  ]);
  if (!pageResponse.ok || !oEmbedResponse.ok) throw new Error('Apple Podcasts did not return episode details.');

  const html = await pageResponse.text();
  const oEmbed = (await oEmbedResponse.json()) as OEmbedResult;
  const episodeName = readMeta(html, 'name', 'apple:title') || readMeta(html, 'property', 'og:title');
  if (!episodeName) throw new Error('Apple Podcasts did not return episode details.');
  const summary = readMeta(html, 'name', 'apple:description') || readMeta(html, 'name', 'description');
  const displayDescription = readMeta(html, 'property', 'og:description');

  return {
    provider: 'Apple Podcasts',
    title: oEmbed.title || '',
    host: oEmbed.author_name || oEmbed.title || '',
    episodeNames: episodeName,
    episodeCount: 1,
    totalTimeMinutes: minutesFromAppleDescription(displayDescription),
    notes: safeDescription(summary),
    link: url.toString(),
    artworkUrl: readMeta(html, 'property', 'og:image') || oEmbed.thumbnail_url || null
  };
}

async function getOEmbedMetadata(url: URL, provider: 'Spotify' | 'YouTube') {
  const endpoint = provider === 'Spotify'
    ? `https://open.spotify.com/oembed?url=${encodeURIComponent(url.toString())}`
    : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`;
  const response = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`${provider} did not return episode details.`);
  const payload = (await response.json()) as OEmbedResult;
  return {
    provider,
    title: payload.author_name || '',
    host: payload.author_name || '',
    episodeNames: payload.title || '',
    episodeCount: 1,
    totalTimeMinutes: null,
    notes: '',
    link: url.toString(),
    artworkUrl: payload.thumbnail_url || null
  };
}

export async function GET(request: Request) {
  const session = await requireSession();
  if (!session.ok) return NextResponse.json({ message: session.message }, { status: session.status });

  try {
    const rawUrl = new URL(request.url).searchParams.get('url') || '';
    const url = validateProviderUrl(rawUrl);
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    if (hostname === 'podcasts.apple.com') return NextResponse.json(await getAppleMetadata(url));
    if (hostname === 'open.spotify.com') return NextResponse.json(await getOEmbedMetadata(url, 'Spotify'));
    if (hostname === 'youtube.com' || hostname === 'youtu.be') return NextResponse.json(await getOEmbedMetadata(url, 'YouTube'));
    return NextResponse.json(
      { message: 'Automatic details currently support Apple Podcasts, Spotify, and YouTube links.' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Unable to read that podcast link.' },
      { status: 400 }
    );
  }
}
