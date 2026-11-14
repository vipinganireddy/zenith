// Self-check for the Files record helper.
//   node --test src/utils/fileLibrary.test.ts
// Node 26 strips the types natively, so there is no framework or build step.

import assert from 'node:assert/strict';
import test from 'node:test';

// Minimal localStorage stand-in — the module only needs get/set.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

const { addFileRecord, loadFiles, saveFiles, formatSize } = await import('./fileLibrary.ts');

test('a tool save shows up in the Files list', () => {
  store.clear();
  addFileRecord({ name: 'compressed_report.pdf', sizeBytes: 2048, mimeType: 'application/pdf' });

  const files = loadFiles();
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'compressed_report.pdf');
  assert.equal(files[0].size, '2.0 KB');
  assert.equal(files[0].trashed, false);
});

test('Drive metadata is carried through so the synced badge renders', () => {
  store.clear();
  addFileRecord({
    name: 'ocr.txt', sizeBytes: 10, sync: 'synced',
    driveId: 'abc123', driveLink: 'https://drive.google.com/file/d/abc123',
  });

  const [f] = loadFiles();
  assert.equal(f.sync, 'synced');
  assert.equal(f.driveId, 'abc123');
  assert.match(f.driveLink!, /abc123/);
});

test('ids stay unique when several files are recorded in the same millisecond', () => {
  store.clear();
  // The real collision case: one tool emitting a batch of outputs at once.
  for (let i = 0; i < 25; i++) addFileRecord({ name: `page_${i}.pdf`, sizeBytes: 100 });

  const ids = loadFiles().map(f => f.id);
  assert.equal(new Set(ids).size, 25, 'every record must get a distinct id');
});

test('newest lands first, and existing records survive', () => {
  store.clear();
  addFileRecord({ name: 'first.pdf', sizeBytes: 1 });
  addFileRecord({ name: 'second.pdf', sizeBytes: 1 });

  const names = loadFiles().map(f => f.name);
  assert.deepEqual(names, ['second.pdf', 'first.pdf']);
});

test('a record written elsewhere is not clobbered', () => {
  store.clear();
  // Simulates the Files page having saved rows before a tool records one.
  saveFiles([{
    id: 1, name: 'manual-upload.pdf', size: '1 B', sizeBytes: 1,
    date: 'Jan 1, 2026', mimeType: 'application/pdf', starred: true, trashed: false,
  }]);

  addFileRecord({ name: 'from-tool.pdf', sizeBytes: 1 });

  const files = loadFiles();
  assert.equal(files.length, 2);
  assert.ok(files.some(f => f.name === 'manual-upload.pdf' && f.starred));
});

test('corrupt storage degrades to empty rather than throwing', () => {
  store.clear();
  store.set('zenith_files', '{not json');
  assert.deepEqual(loadFiles(), []);
});

test('formatSize boundaries', () => {
  assert.equal(formatSize(0), '0 B');
  assert.equal(formatSize(1023), '1023 B');
  assert.equal(formatSize(1024), '1.0 KB');
  assert.equal(formatSize(1024 * 1024), '1.0 MB');
});
