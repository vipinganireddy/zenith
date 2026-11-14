// Self-check for matching library files against a tool's accepted types.
//   node --test src/utils/acceptMatch.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { matchesAccept } = await import('./acceptMatch.ts');

test('MIME types, wildcards and extensions all match', () => {
  assert.equal(matchesAccept('a.pdf', 'application/pdf', 'application/pdf'), true);
  assert.equal(matchesAccept('photo.JPG', 'image/jpeg', 'image/*'), true);
  assert.equal(matchesAccept('Report.DOCX', '', '.docx,.doc'), true);
});

test('non-matching files are rejected', () => {
  assert.equal(matchesAccept('a.pdf', 'application/pdf', 'image/*'), false);
  assert.equal(matchesAccept('notes.txt', 'text/plain', 'application/pdf,.pdf'), false);
});

test('an empty accept takes anything', () => {
  assert.equal(matchesAccept('x.bin', 'application/octet-stream', ''), true);
  assert.equal(matchesAccept('x.bin', 'application/octet-stream', null), true);
});
