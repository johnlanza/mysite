import { createHash, randomBytes } from 'crypto';

const TOKEN_BYTES = 32;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;
const CODE_REGEX = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function createPasswordResetToken() {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(value: string) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

export function normalizeToken(value: string) {
  const trimmed = String(value || '').trim();
  const compactCode = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Human-entered reset codes should be forgiving (case/dash/whitespace),
  // while emailed URL tokens must stay exact and case-sensitive.
  if (CODE_REGEX.test(compactCode)) {
    return `${compactCode.slice(0, 4)}-${compactCode.slice(4, 8)}-${compactCode.slice(8)}`;
  }

  return trimmed;
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
  return { code, tokenHash: hashToken(normalizeToken(code)) };
}
