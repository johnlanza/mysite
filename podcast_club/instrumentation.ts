import { isReadOnlyPreview } from '@/lib/preview-mode';

export async function register() {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.NODE_ENV !== 'production' ||
    isReadOnlyPreview()
  ) {
    return;
  }

  const { startPodcastNotificationScheduler } = await import(
    '@/lib/podcast-notification-scheduler'
  );
  startPodcastNotificationScheduler();
}
