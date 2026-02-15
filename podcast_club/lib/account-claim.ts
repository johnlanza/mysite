import { createHash, randomBytes } from 'crypto';

const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CLAIM_CODE_LENGTH = 10;
const CLAIM_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashClaimCode(value: string) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

export function normalizeClaimCode(value: string) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function createClaimCode() {
  const bytes = randomBytes(CLAIM_CODE_LENGTH);
  let raw = '';
  for (let i = 0; i < CLAIM_CODE_LENGTH; i += 1) {
    raw += CLAIM_CODE_ALPHABET[bytes[i] % CLAIM_CODE_ALPHABET.length];
  }

  const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
  const expiresAt = new Date(Date.now() + CLAIM_CODE_TTL_MS);

  return {
    code,
    codeHash: hashClaimCode(normalizeClaimCode(code)),
    expiresAt
  };
}
