import { NextResponse } from 'next/server';

type AppleEpisodeResult = {
  collectionId?: number;
  collectionName?: string;
  episodeGuid?: string;
  episodeUrl?: string;
  trackName?: string;
};

type CastroEpisode = {
  public_id?: string | null;
  short_id?: string | null;
  title?: string | null;
};

const CASTRO_MCP_URL = 'https://castro.fm/mcp';
const episodeRequests = new Map<string, Promise<CastroEpisode | null>>();

function normalizeMatchText(value: string) {
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
  return normalizeMatchText(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token));
}

function matchScore(query: string, candidate: string) {
  const normalizedQuery = normalizeMatchText(query);
  const normalizedCandidate = normalizeMatchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedQuery === normalizedCandidate) return 1;

  const queryTokens = new Set(meaningfulTokens(query));
  const candidateTokens = new Set(meaningfulTokens(candidate));
  if (!queryTokens.size || !candidateTokens.size) return 0;
  const overlap = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
  const coverage = overlap / queryTokens.size;
  const precision = overlap / candidateTokens.size;
  const contained = normalizedQuery.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedQuery);
  return Math.max(coverage * 0.72 + precision * 0.28, contained ? 0.86 : 0);
}

function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function readMeta(html: string, attribute: 'name' | 'property', key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`<meta[^>]+${attribute}=["']${escapedKey}["'][^>]+content=["']([^"']*)["']`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${escapedKey}["']`, 'i');
  return (html.match(direct) || html.match(reverse))?.[1] || '';
}

function readJsonString(html: string, pattern: RegExp) {
  const match = html.match(pattern)?.[1];
  if (!match) return '';
  try {
    return JSON.parse(`"${match}"`) as string;
  } catch {
    return '';
  }
}

function parseMcpEvent(text: string, id: number) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    try {
      const payload = JSON.parse(line.slice(5).trim()) as {
        id?: number;
        result?: { structuredContent?: CastroEpisode; isError?: boolean };
      };
      if (payload.id === id) return payload;
    } catch {
      // Ignore keepalive or malformed SSE lines and continue to the requested event.
    }
  }
  return null;
}

async function callCastro(tool: 'get_episode' | 'get_episode_by_guid', args: Record<string, string>) {
  const initResponse = await fetch(CASTRO_MCP_URL, {
    method: 'POST',
    headers: { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'royal-podcast-society', version: '1.0' }
      }
    }),
    signal: AbortSignal.timeout(7000)
  });
  if (!initResponse.ok) return null;
  await initResponse.text();
  const sessionId = initResponse.headers.get('mcp-session-id');
  if (!sessionId) return null;

  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'Mcp-Session-Id': sessionId
  };

  try {
    await fetch(CASTRO_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
      signal: AbortSignal.timeout(7000)
    });
    const response = await fetch(CASTRO_MCP_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: tool, arguments: args } }),
      signal: AbortSignal.timeout(7000)
    });
    if (!response.ok) return null;
    const event = parseMcpEvent(await response.text(), 2);
    return event?.result?.isError ? null : event?.result?.structuredContent || null;
  } finally {
    void fetch(CASTRO_MCP_URL, {
      method: 'DELETE',
      headers: { 'Mcp-Session-Id': sessionId },
      signal: AbortSignal.timeout(3000)
    }).catch(() => undefined);
  }
}

async function getDirectAppleEpisode(link: URL) {
  const response = await fetch(link, {
    cache: 'no-store',
    headers: { Accept: 'text/html', 'User-Agent': 'RoyalPodcastSociety/1.0' },
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) return null;
  const html = await response.text();
  const mediaUrl = readJsonString(
    html,
    /"currentMediaEnclosure":\{"streamUrl":"((?:\\.|[^"\\])*)"/
  );
  return {
    mediaUrl,
    episodeTitle: readMeta(html, 'name', 'apple:title') || readMeta(html, 'property', 'og:title')
  };
}

async function getSpotifyEpisodeTitle(link: URL) {
  const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(link.toString())}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) return '';
  const payload = (await response.json()) as { title?: string };
  return String(payload.title || '').trim();
}

async function findAppleEpisode(title: string, episodeTitle: string) {
  const query = new URLSearchParams({
    term: [episodeTitle, title].filter(Boolean).join(' '),
    country: 'US',
    media: 'podcast',
    entity: 'podcastEpisode',
    limit: '20'
  });
  const response = await fetch(`https://itunes.apple.com/search?${query.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(7000)
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { results?: AppleEpisodeResult[] };
  const ranked = (payload.results || [])
    .map((result) => {
      const episodeScore = matchScore(episodeTitle, result.trackName || '');
      const showScore = matchScore(title, result.collectionName || '');
      return { result, episodeScore, showScore, score: episodeScore * 0.78 + showScore * 0.22 };
    })
    .sort((a, b) => b.score - a.score);
  const match = ranked[0];
  if (!match || match.episodeScore < 0.62 || (match.showScore < 0.42 && match.episodeScore < 0.92)) return null;
  return match.result;
}

async function resolveEpisode(title: string, episodeNames: string, link: string) {
  const sourceUrl = safeUrl(link);
  if (!sourceUrl) return null;
  const hostname = sourceUrl.hostname.replace(/^www\./, '').toLowerCase();

  if (hostname === 'podcasts.apple.com' && sourceUrl.searchParams.get('i')) {
    const direct = await getDirectAppleEpisode(sourceUrl).catch(() => null);
    if (direct?.mediaUrl) {
      const exact = await callCastro('get_episode', { enclosure_url: direct.mediaUrl }).catch(() => null);
      if (exact?.short_id || exact?.public_id) return exact;
    }
    if (direct?.episodeTitle) episodeNames = direct.episodeTitle;
  } else if (hostname === 'open.spotify.com' && sourceUrl.pathname.startsWith('/episode/')) {
    const spotifyTitle = await getSpotifyEpisodeTitle(sourceUrl).catch(() => '');
    if (spotifyTitle) episodeNames = spotifyTitle;
  }

  const appleEpisode = await findAppleEpisode(title, episodeNames);
  if (!appleEpisode) return null;
  if (appleEpisode.episodeGuid && appleEpisode.collectionId) {
    const exact = await callCastro('get_episode_by_guid', {
      guid: appleEpisode.episodeGuid,
      itunes_id: String(appleEpisode.collectionId)
    }).catch(() => null);
    if (exact?.short_id || exact?.public_id) return exact;
  }
  if (appleEpisode.episodeUrl) {
    return callCastro('get_episode', { enclosure_url: appleEpisode.episodeUrl }).catch(() => null);
  }
  return null;
}

function cachedResolve(title: string, episodeNames: string, link: string) {
  const key = normalizeMatchText(`${title}|${episodeNames}|${link}`);
  const cached = episodeRequests.get(key);
  if (cached) return cached;
  const request = resolveEpisode(title, episodeNames, link)
    .catch(() => null)
    .then((episode) => {
      if (!episode) episodeRequests.delete(key);
      return episode;
    });
  if (episodeRequests.size >= 200) episodeRequests.delete(episodeRequests.keys().next().value || '');
  episodeRequests.set(key, request);
  return request;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = String(params.get('title') || '').trim().slice(0, 240);
  const episodeNames = String(params.get('episodeNames') || '').trim().slice(0, 400);
  const link = String(params.get('link') || '').trim().slice(0, 2048);

  if (!title || !episodeNames || !link) {
    return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }

  const episode = await cachedResolve(title, episodeNames, link);
  const id = String(episode?.short_id || episode?.public_id || '');
  if (!id || !/^[a-z0-9-]{2,64}$/i.test(id)) {
    return NextResponse.json({ available: false }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  }

  return NextResponse.json(
    {
      available: true,
      url: `https://castro.fm/episode/${id}`,
      episodeTitle: episode?.title || episodeNames
    },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } }
  );
}
