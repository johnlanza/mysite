import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './import-typescript.mjs';

const {
  buildEmailIdempotencyKey,
  buildMeetingSelectionEventFingerprint
} = await importTypeScript('../lib/notification-idempotency.ts');
const { isOneTimeSweepEligible } = await importTypeScript('../lib/notification-schedule.ts');

test('email idempotency keys are deterministic and event-specific', () => {
  const first = buildEmailIdempotencyKey('new-podcast', 'podcast-1', 'member-1');
  assert.equal(first, buildEmailIdempotencyKey('new-podcast', 'podcast-1', 'member-1'));
  assert.notEqual(first, buildEmailIdempotencyKey('new-podcast', 'podcast-1', 'member-2'));
  assert.match(first, /^new-podcast-[a-f0-9]{32}$/);
});

test('meeting fingerprints ignore ordering and duplicates but capture actual changes', () => {
  const baseline = buildMeetingSelectionEventFingerprint({
    meetingId: 'meeting-1',
    changeKind: 'updated',
    previousPodcastIds: ['a', 'b'],
    nextPodcastIds: ['c', 'd']
  });
  assert.equal(
    baseline,
    buildMeetingSelectionEventFingerprint({
      meetingId: 'meeting-1',
      changeKind: 'updated',
      previousPodcastIds: ['b', 'a', 'a'],
      nextPodcastIds: ['d', 'c']
    })
  );
  assert.notEqual(
    baseline,
    buildMeetingSelectionEventFingerprint({
      meetingId: 'meeting-1',
      changeKind: 'updated',
      previousPodcastIds: ['a', 'b'],
      nextPodcastIds: ['e']
    })
  );
});

test('one-time review sweeps run only in their 24-hour grace window', () => {
  const sweepAt = new Date('2026-09-03T16:00:00.000Z');
  assert.equal(isOneTimeSweepEligible(sweepAt, new Date('2026-09-03T16:00:00.000Z')), true);
  assert.equal(isOneTimeSweepEligible(sweepAt, new Date('2026-09-04T15:59:59.999Z')), true);
  assert.equal(isOneTimeSweepEligible(sweepAt, new Date('2026-09-03T15:59:59.999Z')), false);
  assert.equal(isOneTimeSweepEligible(sweepAt, new Date('2026-09-04T16:00:00.001Z')), false);
});
