// Self-check for choosing a file's preview kind.
//   node --test src/utils/fileKind.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { previewKind } = await import('./fileKind.ts');

test('extension wins, case-insensitively', () => {
  assert.equal(previewKind('Report.PDF', ''), 'pdf');
  assert.equal(previewKind('IMG_0001.HEIC', 'image/jpeg'), 'heic');
  assert.equal(previewKind('deck.pptx', 'application/octet-stream'), 'pptx');
  assert.equal(previewKind('budget.xls', ''), 'sheet');
  assert.equal(previewKind('notes.md', 'text/plain'), 'markdown');
});

test('falls back to the MIME type when the extension is unknown', () => {
  assert.equal(previewKind('scan', 'application/pdf'), 'pdf');
  assert.equal(previewKind('clip', 'video/quicktime'), 'video');
  assert.equal(previewKind('data', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'sheet');
  assert.equal(previewKind('page', 'text/plain'), 'text');
});

test('unknown binaries get no preview', () => {
  assert.equal(previewKind('setup.exe', 'application/octet-stream'), 'none');
  assert.equal(previewKind('noext', ''), 'none');
});
