import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScript } from './import-typescript.mjs';

const { getMeetingSelectionChangeKind } = await importTypeScript('../lib/meeting-selection-change.ts');

test('meeting selection changes are classified without order or duplicate noise', () => {
  assert.equal(getMeetingSelectionChangeKind([], ['a']), 'selected');
  assert.equal(getMeetingSelectionChangeKind(['a'], ['b']), 'updated');
  assert.equal(getMeetingSelectionChangeKind(['a'], []), 'cleared');
  assert.equal(getMeetingSelectionChangeKind(['b', 'a', 'a'], ['a', 'b']), null);
});
