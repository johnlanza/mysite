export const DISCOVERY_REACTIONS = ['listen', 'discuss', 'less'] as const;
export const DISCOVERY_LISTEN_STATES = ['listened', 'stopped'] as const;
export const DISCOVERY_REVIEW_LEVELS = ['strong', 'mixed', 'weak'] as const;
export const DISCOVERY_DISCUSSION_LEVELS = ['strong', 'maybe', 'weak'] as const;

export type DiscoveryReaction = (typeof DISCOVERY_REACTIONS)[number];
export type DiscoveryListenState = (typeof DISCOVERY_LISTEN_STATES)[number];
export type DiscoveryReviewLevel = (typeof DISCOVERY_REVIEW_LEVELS)[number];
export type DiscoveryDiscussionLevel = (typeof DISCOVERY_DISCUSSION_LEVELS)[number];

export type DiscoveryFeedbackRecord = {
  reaction?: DiscoveryReaction;
  themes: string[];
  discussionSignals: number;
  sourceKey?: string;
  listenState?: DiscoveryListenState;
  attention?: DiscoveryReviewLevel;
  subjectFit?: DiscoveryReviewLevel;
  guestValue?: DiscoveryReviewLevel;
  hostQuality?: DiscoveryReviewLevel;
  discussionPotential?: DiscoveryDiscussionLevel;
  findGuestElsewhere?: boolean;
  guestName?: string;
  note?: string;
};

export type DiscoveryReviewDraft = Required<Pick<
  DiscoveryFeedbackRecord,
  'listenState' | 'attention' | 'subjectFit' | 'guestValue' | 'hostQuality' | 'discussionPotential'
>> & Pick<DiscoveryFeedbackRecord, 'findGuestElsewhere' | 'guestName' | 'note'>;

export function isDiscoveryReaction(value: unknown): value is DiscoveryReaction {
  return typeof value === 'string' && DISCOVERY_REACTIONS.includes(value as DiscoveryReaction);
}

export function isDiscoveryListenState(value: unknown): value is DiscoveryListenState {
  return typeof value === 'string' && DISCOVERY_LISTEN_STATES.includes(value as DiscoveryListenState);
}

export function isDiscoveryReviewLevel(value: unknown): value is DiscoveryReviewLevel {
  return typeof value === 'string' && DISCOVERY_REVIEW_LEVELS.includes(value as DiscoveryReviewLevel);
}

export function isDiscoveryDiscussionLevel(value: unknown): value is DiscoveryDiscussionLevel {
  return typeof value === 'string' && DISCOVERY_DISCUSSION_LEVELS.includes(value as DiscoveryDiscussionLevel);
}

export function hasCompleteDiscoveryReview(record?: Partial<DiscoveryFeedbackRecord> | null): record is DiscoveryReviewDraft {
  return Boolean(
    record &&
    isDiscoveryListenState(record.listenState) &&
    isDiscoveryReviewLevel(record.attention) &&
    isDiscoveryReviewLevel(record.subjectFit) &&
    isDiscoveryReviewLevel(record.guestValue) &&
    isDiscoveryReviewLevel(record.hostQuality) &&
    isDiscoveryDiscussionLevel(record.discussionPotential)
  );
}

function threeLevelScore(value: DiscoveryReviewLevel | undefined, strong: number, weak: number) {
  if (value === 'strong') return strong;
  if (value === 'weak') return weak;
  return 0;
}

/**
 * Adjust the reviewed episode without conflating a strong guest with a weak host.
 * A request to find the guest elsewhere deliberately lowers the original episode.
 */
export function getDiscoveryEpisodeFeedbackScore(record: DiscoveryFeedbackRecord) {
  if (!hasCompleteDiscoveryReview(record)) {
    return record.reaction === 'discuss' ? 12 : record.reaction === 'listen' ? 7 : record.reaction === 'less' ? -30 : 0;
  }

  const discussionScore = record.discussionPotential === 'strong'
    ? 8
    : record.discussionPotential === 'maybe'
      ? 2
      : -5;

  return (
    threeLevelScore(record.attention, 5, -8) +
    threeLevelScore(record.subjectFit, 5, -5) +
    threeLevelScore(record.guestValue, 5, -4) +
    threeLevelScore(record.hostQuality, 4, -10) +
    discussionScore +
    (record.listenState === 'stopped' ? -3 : 0) +
    (record.findGuestElsewhere ? -6 : 0)
  );
}

/** Only subject, guest, and discussion judgments should shape future themes. */
export function getDiscoveryThemeFeedbackScore(record: DiscoveryFeedbackRecord) {
  if (!hasCompleteDiscoveryReview(record)) {
    return record.reaction === 'discuss'
      ? 4 + Math.min(2, record.discussionSignals)
      : record.reaction === 'listen'
        ? 2
        : record.reaction === 'less'
          ? -3
          : 0;
  }

  const discussionScore = record.discussionPotential === 'strong'
    ? 4
    : record.discussionPotential === 'maybe'
      ? 1
      : -2;

  return (
    threeLevelScore(record.subjectFit, 3, -3) +
    threeLevelScore(record.guestValue, 3, -2) +
    discussionScore
  );
}

/** Host quality applies only to the originating show, not to the guest or topic. */
export function getDiscoverySourceFeedbackScore(record: DiscoveryFeedbackRecord) {
  if (!hasCompleteDiscoveryReview(record)) return 0;
  return threeLevelScore(record.hostQuality, 3, -8) + (record.findGuestElsewhere ? -4 : 0);
}
