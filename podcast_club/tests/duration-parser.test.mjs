import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './import-typescript.mjs';

const { parseDurationMinutes } = await importTypeScript('../lib/csv-import.ts');

test('duration parser accepts supported legacy formats', () => {
  assert.equal(parseDurationMinutes('58'), 58);
  assert.equal(parseDurationMinutes('55:30'), 56);
  assert.equal(parseDurationMinutes('1:02:30'), 63);
  assert.equal(parseDurationMinutes('PT1H2M30S'), 63);
  assert.equal(parseDurationMinutes('1 hr 5 min'), 65);
});

test('duration parser rejects missing and unrecognized values', () => {
  assert.equal(parseDurationMinutes(''), null);
  assert.equal(parseDurationMinutes('0'), null);
  assert.equal(parseDurationMinutes('N/A'), null);
  assert.equal(parseDurationMinutes('unknown'), null);
});
