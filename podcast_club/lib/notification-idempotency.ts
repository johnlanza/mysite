import { createHash } from 'node:crypto';
import type { MeetingSelectionChangeKind } from '@/lib/meeting-selection-change';

export function buildEmailIdempotencyKey(namespace: string, ...parts: string[]) {
  const fingerprint = createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
  return `${namespace}-${fingerprint}`;
}

export function buildMeetingSelectionEventFingerprint({
  meetingId,
  changeKind,
  previousPodcastIds,
  nextPodcastIds
}: {
  meetingId: string;
  changeKind: MeetingSelectionChangeKind;
  previousPodcastIds: string[];
  nextPodcastIds: string[];
}) {
  return createHash('sha256')
    .update([
      meetingId,
      changeKind,
      [...new Set(previousPodcastIds)].sort().join(','),
      [...new Set(nextPodcastIds)].sort().join(',')
    ].join('|'))
    .digest('hex')
    .slice(0, 32);
}
