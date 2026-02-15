export const RATING_POINTS: Record<string, number> = {
  'I like it a lot.': 2,
  'I like it.': 1,
  Meh: 0,
  'My podcast': 0,
  'No selection': 0,
  'No Selection': 0
};

export const RATING_OPTIONS = ['I like it a lot.', 'I like it.', 'Meh', 'My podcast', 'No selection'] as const;

export function getRatingPoints(value: string) {
  return RATING_POINTS[value] ?? 0;
}
