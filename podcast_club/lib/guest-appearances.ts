type AppleEpisodeResult = {
  trackId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  episodeUrl?: string;
  artworkUrl600?: string;
  artworkUrl160?: string;
  releaseDate?: string;
  trackTimeMillis?: number;
  shortDescription?: string;
  description?: string;
};

export type GuestAppearance = {
  id: string;
  title: string;
  showTitle: string;
  host: string;
  href: string;
  artworkUrl: string;
  durationMinutes: number;
  releaseDate?: string;
  description: string;
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function durationMinutes(value?: number) {
  return value ? Math.round(value / 60000) : 0;
}

function compact(value?: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function scoreAppearance(result: AppleEpisodeResult, guestName: string) {
  const guestKey = normalize(guestName);
  const title = normalize(result.trackName || '');
  const description = normalize(`${result.shortDescription || ''} ${result.description || ''}`);
  const duration = durationMinutes(result.trackTimeMillis);
  let score = 0;
  if (title.includes(guestKey)) score += 30;
  if (description.includes(guestKey)) score += 14;
  if (duration >= 35 && duration <= 130) score += 10;
  if (compact(result.shortDescription || result.description).length >= 150) score += 5;
  if (result.releaseDate) {
    const releaseTime = new Date(result.releaseDate).getTime();
    if (Number.isFinite(releaseTime)) {
      score += Math.max(0, 6 - Math.floor((Date.now() - releaseTime) / 31_536_000_000));
    }
  }
  return score;
}

export async function findGuestAppearances({
  guestName,
  excludeShow = '',
  excludeEpisodeId = ''
}: {
  guestName: string;
  excludeShow?: string;
  excludeEpisodeId?: string;
}) {
  const params = new URLSearchParams({
    term: guestName,
    country: 'US',
    media: 'podcast',
    entity: 'podcastEpisode',
    limit: '40'
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Apple Podcasts search did not respond.');
    const payload = await response.json() as { results?: AppleEpisodeResult[] };
    const showKey = normalize(excludeShow);
    const seenShows = new Set<string>();

    return (payload.results || [])
      .filter((result) => result.trackName && (result.trackViewUrl || result.episodeUrl || result.collectionViewUrl))
      .filter((result) => String(result.trackId || '') !== excludeEpisodeId)
      .filter((result) => !showKey || normalize(result.collectionName || '') !== showKey)
      .map((result) => ({ result, score: scoreAppearance(result, guestName) }))
      .filter(({ score }) => score >= 14)
      .sort((a, b) => b.score - a.score)
      .filter(({ result }) => {
        const candidateShow = normalize(result.collectionName || result.artistName || result.trackName || '');
        if (!candidateShow || seenShows.has(candidateShow)) return false;
        seenShows.add(candidateShow);
        return true;
      })
      .slice(0, 6)
      .map(({ result }): GuestAppearance => ({
        id: String(result.trackId || `${result.collectionName}-${result.trackName}`),
        title: compact(result.trackName),
        showTitle: compact(result.collectionName) || 'Podcast episode',
        host: compact(result.artistName),
        href: result.trackViewUrl || result.episodeUrl || result.collectionViewUrl || '',
        artworkUrl: result.artworkUrl600 || result.artworkUrl160 || '',
        durationMinutes: durationMinutes(result.trackTimeMillis),
        releaseDate: result.releaseDate,
        description: compact(result.shortDescription || result.description).slice(0, 220)
      }));
  } finally {
    clearTimeout(timeout);
  }
}
