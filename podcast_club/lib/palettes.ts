export const PALETTE_IDS = [
  'vibrant-fiesta',
  'golden-meadow',
  'pastel-daydream',
  'vintage-garden',
  'soft-bloom'
] as const;

export type PaletteId = (typeof PALETTE_IDS)[number];

export const DEFAULT_PALETTE: PaletteId = 'vibrant-fiesta';
export const PALETTE_STORAGE_KEY = 'podcast-club-palette';

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && PALETTE_IDS.some((palette) => palette === value);
}

export function getMemberPaletteStorageKey(memberId: string) {
  return `${PALETTE_STORAGE_KEY}:${memberId}`;
}
