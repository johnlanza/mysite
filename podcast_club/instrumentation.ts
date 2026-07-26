export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return;
  }

  const { startPodcastNotificationScheduler } = await import(
    '@/lib/podcast-notification-scheduler'
  );
  startPodcastNotificationScheduler();
}
