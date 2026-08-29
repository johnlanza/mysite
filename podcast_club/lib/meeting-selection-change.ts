export type MeetingSelectionChangeKind = 'selected' | 'updated' | 'cleared';

function uniqueSortedIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))].sort();
}

export function getMeetingSelectionChangeKind(
  previousPodcastIds: string[],
  nextPodcastIds: string[]
): MeetingSelectionChangeKind | null {
  const previous = uniqueSortedIds(previousPodcastIds);
  const next = uniqueSortedIds(nextPodcastIds);

  if (previous.length === next.length && previous.every((podcastId, index) => podcastId === next[index])) {
    return null;
  }
  if (next.length === 0) return 'cleared';
  return previous.length === 0 ? 'selected' : 'updated';
}
