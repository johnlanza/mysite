import { isWeeklyReminderWindow, runWeeklyPodcastReviewSweep } from '@/lib/podcast-notifications';

declare global {
  var podcastNotificationInterval: ReturnType<typeof setInterval> | undefined;
  var podcastNotificationStartupTimer: ReturnType<typeof setTimeout> | undefined;
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

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
    void checkWeeklyPodcastReminders();
  }, 15_000);
  global.podcastNotificationStartupTimer.unref();

  global.podcastNotificationInterval = setInterval(() => {
    void checkWeeklyPodcastReminders();
  }, CHECK_INTERVAL_MS);
  global.podcastNotificationInterval.unref();
}
