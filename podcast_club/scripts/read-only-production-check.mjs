#!/usr/bin/env node

const baseUrl = new URL(
  (process.argv[2] || process.env.PODCAST_CLUB_BASE_URL || 'https://www.johnlanza.com/podcastclub').replace(/\/+$/, '') + '/'
);
const expectedCommit = String(process.argv[3] || process.env.PODCAST_CLUB_EXPECTED_COMMIT || '').trim();
const requiresEmailSignIn = ['johnlanza.com', 'www.johnlanza.com'].includes(baseUrl.hostname);

function url(path) {
  return new URL(path.replace(/^\//, ''), baseUrl).toString();
}

function commitsMatch(expected, actual) {
  return expected === actual || expected.startsWith(actual) || actual.startsWith(expected);
}

async function fetchChecked(path, expectedStatus = 200) {
  const response = await fetch(url(path), {
    cache: 'no-store',
    headers: { Accept: path.startsWith('/api/') ? 'application/json' : 'text/html' }
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  console.log(`PASS ${path} (${response.status})`);
  return response;
}

for (const path of ['/', '/login', '/podcasts', '/meetings', '/carveouts', '/more']) {
  await fetchChecked(path);
}

await fetchChecked('/manifest.webmanifest');
await fetchChecked('/sw.js');
await fetchChecked('/audio/rps-mouret-rondeau-opening.mp3');

const setup = await (await fetchChecked('/api/auth/setup-status')).json();
if (setup?.hasUsers !== true || (requiresEmailSignIn && setup?.emailSignInAvailable !== true)) {
  throw new Error('/api/auth/setup-status: users or required email sign-in are not ready');
}

await fetchChecked('/api/auth/me', 401);
await fetchChecked('/api/meetings', 401);
await fetchChecked('/api/members', 401);

const podcasts = await (await fetchChecked('/api/podcasts')).json();
if (!Array.isArray(podcasts) || podcasts.length === 0) {
  throw new Error('/api/podcasts: expected a non-empty public archive');
}
const invalidDurations = podcasts.filter(
  (podcast) => !Number.isFinite(Number(podcast?.totalTimeMinutes)) || Number(podcast.totalTimeMinutes) <= 1
);
if (invalidDurations.length > 0) {
  throw new Error(`/api/podcasts: ${invalidDurations.length} missing or placeholder duration(s)`);
}

const carveOuts = await (await fetchChecked('/api/carveouts')).json();
if (!Array.isArray(carveOuts) || carveOuts.length === 0) {
  throw new Error('/api/carveouts: expected a non-empty public archive');
}

const health = await (await fetchChecked('/api/health')).json();
if (health?.ok !== true || health?.service !== 'podcast-club') {
  throw new Error('/api/health: unexpected service response');
}
if (expectedCommit) {
  if (!health.commit || !commitsMatch(expectedCommit, String(health.commit))) {
    throw new Error(`/api/health: expected commit ${expectedCommit}, received ${health.commit || '(missing)'}`);
  }
  console.log(`PASS deployed commit ${health.commit}`);
}

console.log(`Read-only production check passed: ${baseUrl.toString()}`);
