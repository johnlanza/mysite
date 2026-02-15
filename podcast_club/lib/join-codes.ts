import { createHash, randomBytes } from 'crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

export function normalizeJoinCode(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function hashJoinCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

export function generateJoinCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
