// Self-check for folder password locks.
//   node --test src/utils/folderLock.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { createLock, verifyLock, isUnlocked, markUnlocked, relock } = await import('./folderLock.ts');

test('the right password opens the lock, a wrong one does not', async () => {
  const lock = await createLock('correct horse');
  assert.equal(await verifyLock(lock, 'correct horse'), true);
  assert.equal(await verifyLock(lock, 'Correct horse'), false);
  assert.equal(await verifyLock(lock, ''), false);
});

test('the password itself is never stored', async () => {
  const lock = await createLock('hunter2');
  assert.equal(JSON.stringify(lock).includes('hunter2'), false);
  // a fresh salt each time → different hashes for the same password
  const again = await createLock('hunter2');
  assert.notEqual(lock.hash, again.hash);
});

test('unlocks are per folder and can be cleared', () => {
  markUnlocked('a');
  assert.equal(isUnlocked('a'), true);
  assert.equal(isUnlocked('b'), false);
  relock('a');
  assert.equal(isUnlocked('a'), false);
  markUnlocked('a'); markUnlocked('b'); relock();
  assert.equal(isUnlocked('a') || isUnlocked('b'), false);
});
