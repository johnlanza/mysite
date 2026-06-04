#!/usr/bin/env node

const baseUrl = (process.env.PODCAST_CLUB_BASE_URL || 'https://www.johnlanza.com/podcastclub').replace(/\/+$/, '');
const sessionCookie = process.env.PODCAST_CLUB_SESSION_COOKIE;
const runId = Date.now();

if (!sessionCookie) {
  console.error('Missing PODCAST_CLUB_SESSION_COOKIE.');
  console.error('Pass the full cookie value, for example: PODCAST_CLUB_SESSION_COOKIE="mysite_session=..." npm run smoke:live');
  process.exit(1);
}

const cleanup = {
  podcastId: '',
  carveOutId: ''
};

const results = [];

function note(name, status) {
  results.push({ name, status });
}

async function request(name, path, options = {}, expected = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Cookie: sessionCookie,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (expected.status && response.status !== expected.status) {
    throw new Error(`${name}: expected ${expected.status}, got ${response.status}: ${text.slice(0, 500)}`);
  }

  if (expected.ok && !response.ok) {
    throw new Error(`${name}: expected 2xx, got ${response.status}: ${text.slice(0, 500)}`);
  }

  note(name, response.status);
  return data;
}

async function cleanupRequest(name, path, body) {
  try {
    await request(name, path, {
      method: 'DELETE',
      body: JSON.stringify(body)
    }, { ok: true });
  } catch (error) {
    note(name, error instanceof Error ? error.message : String(error));
  }
}

try {
  await request('auth session', '/api/auth/me', {}, { ok: true });
  await request('submission health', '/api/submission-health', {}, { ok: true });

  const podcastTitle = `Codex Live Save Smoke Podcast ${runId}`;
  const podcast = await request('submit podcast', '/api/podcasts', {
    method: 'POST',
    body: JSON.stringify({
      title: podcastTitle,
      host: 'Codex Smoke Test',
      episodeCount: '1',
      episodeNames: 'Live save flow smoke',
      totalTimeMinutes: '5',
      link: 'https://example.com/codex-live-save-smoke',
      notes: 'Temporary live save-flow verification record. Safe to delete.'
    })
  }, { status: 201 });
  cleanup.podcastId = String(podcast?._id || '');

  const podcasts = await request('verify podcast listing', '/api/podcasts', {}, { ok: true });
  if (!JSON.stringify(podcasts).includes(podcastTitle)) {
    throw new Error('Created podcast was not returned by /api/podcasts.');
  }

  const meetings = await request('load meetings', '/api/meetings', {}, { ok: true });
  const meetingId = Array.isArray(meetings) ? meetings[0]?._id : '';
  if (!meetingId) {
    throw new Error('No meeting is available for carve-out submission.');
  }

  const carveOutTitle = `Codex Live Save Smoke Carve Out ${runId}`;
  const carveOut = await request('submit carve-out', '/api/carveouts', {
    method: 'POST',
    body: JSON.stringify({
      title: carveOutTitle,
      type: 'article',
      service: 'Example',
      url: 'https://example.com/codex-live-save-smoke-carveout',
      notes: 'Temporary live save-flow verification record. Safe to delete.',
      meeting: meetingId
    })
  }, { status: 201 });
  cleanup.carveOutId = String(carveOut?._id || '');

  const carveOuts = await request('verify carve-out listing', '/api/carveouts', {}, { ok: true });
  if (!JSON.stringify(carveOuts).includes(carveOutTitle)) {
    throw new Error('Created carve-out was not returned by /api/carveouts.');
  }
} finally {
  if (cleanup.carveOutId) {
    await cleanupRequest('cleanup carve-out', `/api/carveouts/${cleanup.carveOutId}`, { confirmText: 'DELETE' });
  }

  if (cleanup.podcastId) {
    await cleanupRequest('cleanup podcast', `/api/podcasts/${cleanup.podcastId}`, { confirmText: 'DELETE' });
  }

  console.log(JSON.stringify({ baseUrl, results }, null, 2));
}
