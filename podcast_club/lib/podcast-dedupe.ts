type PodcastLike = {
  title: string;
  host?: string;
  episodeNames?: string;
  link: string;
};

function normalizeText(value: string | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeLink(value: string | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function toDedupKey(podcast: PodcastLike) {
  return [
    normalizeText(podcast.title),
    normalizeText(podcast.host),
    normalizeText(podcast.episodeNames),
    normalizeLink(podcast.link)
  ].join('||');
}

export function dedupePodcastsByContent<T extends PodcastLike>(podcasts: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const podcast of podcasts) {
    const key = toDedupKey(podcast);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(podcast);
  }

  return deduped;
}
