import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadSmokeEnv() {
  const envFile = process.env.PODCAST_CLUB_SMOKE_ENV_FILE || '.env.smoke';
  const resolvedPath = resolve(process.cwd(), envFile);

  if (!existsSync(resolvedPath)) {
    return { loaded: false, path: resolvedPath, keys: [] };
  }

  const keys = [];
  const content = readFileSync(resolvedPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;

    const { key, value } = parsed;
    if (process.env[key]) continue;

    process.env[key] = value;
    keys.push(key);
  }

  return { loaded: true, path: resolvedPath, keys };
}

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const normalized = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  const equalsIndex = normalized.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = normalized.slice(0, equalsIndex).trim();
  const rawValue = normalized.slice(equalsIndex + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  return { key, value: unquoteValue(rawValue) };
}

function unquoteValue(value) {
  if (value.length < 2) return value;

  const quote = value[0];
  if ((quote !== '"' && quote !== "'") || value[value.length - 1] !== quote) {
    return value;
  }

  return value.slice(1, -1);
}
