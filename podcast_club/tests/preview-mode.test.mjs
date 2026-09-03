import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './import-typescript.mjs';

const { isReadOnlyPreview } = await importTypeScript('../lib/preview-mode.ts');

test('read-only preview recognizes explicit and pull-request flags', { concurrency: false }, () => {
  const originalPreview = process.env.PODCAST_CLUB_PREVIEW_READ_ONLY;
  const originalPullRequest = process.env.IS_PULL_REQUEST;
  try {
    delete process.env.PODCAST_CLUB_PREVIEW_READ_ONLY;
    delete process.env.IS_PULL_REQUEST;
    assert.equal(isReadOnlyPreview(), false);

    process.env.PODCAST_CLUB_PREVIEW_READ_ONLY = 'yes';
    assert.equal(isReadOnlyPreview(), true);

    process.env.PODCAST_CLUB_PREVIEW_READ_ONLY = 'false';
    process.env.IS_PULL_REQUEST = '1';
    assert.equal(isReadOnlyPreview(), true);
  } finally {
    if (originalPreview === undefined) delete process.env.PODCAST_CLUB_PREVIEW_READ_ONLY;
    else process.env.PODCAST_CLUB_PREVIEW_READ_ONLY = originalPreview;
    if (originalPullRequest === undefined) delete process.env.IS_PULL_REQUEST;
    else process.env.IS_PULL_REQUEST = originalPullRequest;
  }
});
