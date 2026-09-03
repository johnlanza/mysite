import { isWeeklyReminderWindow, runWeeklyPodcastReviewSweep } from '@/lib/podcast-notifications';
import { isOneTimeSweepEligible } from '@/lib/notification-schedule';

declare global {
  var podcastNotificationInterval: ReturnType<typeof setInterval> | undefined;
  var podcastNotificationStartupTimer: ReturnType<typeof setTimeout> | undefined;
  var podcastNotificationOneTimeTimer: ReturnType<typeof setTimeout> | undefined;
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
function getOneTimeSweepAt() {
  const configuredAt = process.env.PODCAST_CLUB_ONE_TIME_SWEEP_AT;
  if (!configuredAt) return null;

  const date = new Date(configuredAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function checkOneTimePodcastReviewSweep() {
  const sweepAt = getOneTimeSweepAt();
  if (!sweepAt) return;

  if (!isOneTimeSweepEligible(sweepAt)) return;

  try {
    const result = await runWeeklyPodcastReviewSweep({
      reminderKey: `one-time:${sweepAt.toISOString()}`,
      mailingName: 'One-time review sweep',
      reminderField: 'oneTimePodcastReminderKey'
    });
    if (!result.notConfigured && (result.sent > 0 || result.failed > 0)) {
      console.log('[podcast-notifications] One-time sweep complete', result);
    }
  } catch (error) {
    console.error('[podcast-notifications] One-time sweep failed', error);
  }
}

async function checkWeeklyPodcastReminders() {
  if (!isWeeklyReminderWindow()) return;

  try {
    const result = await runWeeklyPodcastReviewSweep();
    if (!result.notConfigured && (result.sent > 0 || result.failed > 0)) {
      console.log('[podcast-notifications] Weekly sweep complete', result);
    }
  } catch (error) {
    console.error('[podcast-notifications] Weekly sweep failed', error);
  }
}

export function startPodcastNotificationScheduler() {
  if (global.podcastNotificationInterval) return;

  global.podcastNotificationStartupTimer = setTimeout(() => {
    void checkOneTimePodcastReviewSweep();
    void checkWeeklyPodcastReminders();
  }, 15_000);
  global.podcastNotificationStartupTimer.unref();

  global.podcastNotificationInterval = setInterval(() => {
    void checkOneTimePodcastReviewSweep();
    void checkWeeklyPodcastReminders();
  }, CHECK_INTERVAL_MS);
  global.podcastNotificationInterval.unref();

  const oneTimeSweepAt = getOneTimeSweepAt();
  if (oneTimeSweepAt) {
    const delay = oneTimeSweepAt.getTime() - Date.now();
    if (delay > 0 && delay <= MAX_TIMEOUT_MS) {
      global.podcastNotificationOneTimeTimer = setTimeout(() => {
        void checkOneTimePodcastReviewSweep();
      }, delay);
      global.podcastNotificationOneTimeTimer.unref();
    }
  }
}
