export const MAX_MEETING_PODCASTS = 3;

type PodcastRefLike = string | { _id?: string | null } | null | undefined;

function toPodcastId(value: PodcastRefLike) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(value._id || '').trim();
}

export function normalizeMeetingPodcastIds(input: {
  podcasts?: PodcastRefLike[] | null;
  podcast?: PodcastRefLike;
}) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of input.podcasts || []) {
    const id = toPodcastId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
    if (normalized.length >= MAX_MEETING_PODCASTS) return normalized;
  }

  const legacyPodcastId = toPodcastId(input.podcast);
  if (legacyPodcastId && !seen.has(legacyPodcastId) && normalized.length < MAX_MEETING_PODCASTS) {
    normalized.push(legacyPodcastId);
  }

  return normalized;
}
