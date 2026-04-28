import type { Meeting, Podcast } from '@/lib/types';

export const MAX_MEETING_PODCASTS = 3;

type PodcastRefLike = string | { _id?: string | null } | null | undefined;
export type MeetingPodcastSelection = Podcast | NonNullable<Meeting['podcast']>;

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

export function getMeetingPodcasts(
  meeting: Pick<Meeting, 'podcasts' | 'podcast'>,
  podcastsById?: Map<string, Podcast>
): MeetingPodcastSelection[] {
  const selectedPodcasts =
    meeting.podcasts && meeting.podcasts.length > 0 ? meeting.podcasts : meeting.podcast ? [meeting.podcast] : [];

  return selectedPodcasts.map((podcast) => podcastsById?.get(podcast._id) || podcast);
}
