import { createHash, randomBytes } from 'crypto';

const TOKEN_BYTES = 32;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

export function createPasswordResetToken() {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(value: string) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

export function normalizeToken(value: string) {
  return String(value || '').trim();
}

export function hashIp(ip: string) {
  return createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

export function createPasswordResetCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    raw += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }

  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  return { code, tokenHash: hashToken(code) };
}
