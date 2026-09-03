import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadSmokeEnv } from '../scripts/load-smoke-env.mjs';

test('smoke env loading preserves shell values and ignores invalid lines', { concurrency: false }, async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rps-smoke-env-'));
  const envFile = path.join(tempDir, '.env.smoke');
  const originalFile = process.env.PODCAST_CLUB_SMOKE_ENV_FILE;
  const originalBaseUrl = process.env.PODCAST_CLUB_BASE_URL;
  const originalServiceId = process.env.RENDER_SERVICE_ID;

  try {
    await writeFile(envFile, [
      'PODCAST_CLUB_BASE_URL="https://file.example/podcastclub"',
      "RENDER_SERVICE_ID='srv-from-file'",
      'NOT A KEY=value',
      '# comment'
    ].join('\n'));
    process.env.PODCAST_CLUB_SMOKE_ENV_FILE = envFile;
    process.env.PODCAST_CLUB_BASE_URL = 'https://shell.example/podcastclub';
    delete process.env.RENDER_SERVICE_ID;

    const result = loadSmokeEnv();

    assert.equal(result.loaded, true);
    assert.equal(process.env.PODCAST_CLUB_BASE_URL, 'https://shell.example/podcastclub');
    assert.equal(process.env.RENDER_SERVICE_ID, 'srv-from-file');
    assert.deepEqual(result.keys, ['RENDER_SERVICE_ID']);
  } finally {
    if (originalFile === undefined) delete process.env.PODCAST_CLUB_SMOKE_ENV_FILE;
    else process.env.PODCAST_CLUB_SMOKE_ENV_FILE = originalFile;
    if (originalBaseUrl === undefined) delete process.env.PODCAST_CLUB_BASE_URL;
    else process.env.PODCAST_CLUB_BASE_URL = originalBaseUrl;
    if (originalServiceId === undefined) delete process.env.RENDER_SERVICE_ID;
    else process.env.RENDER_SERVICE_ID = originalServiceId;
    await rm(tempDir, { recursive: true, force: true });
  }
});
