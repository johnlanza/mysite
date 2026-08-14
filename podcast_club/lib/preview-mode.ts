const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

function isEnabled(value: string | undefined) {
  return ENABLED_VALUES.has(String(value || '').trim().toLowerCase());
}

export function isReadOnlyPreview() {
  return (
    isEnabled(process.env.PODCAST_CLUB_PREVIEW_READ_ONLY) ||
    isEnabled(process.env.IS_PULL_REQUEST)
  );
}

export const READ_ONLY_PREVIEW_MESSAGE =
  'This preview uses live Podcast Club data in read-only mode. Changes are disabled.';
