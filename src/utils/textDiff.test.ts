// Self-check for the word diff used by Compare PDFs.
//   node --test src/utils/textDiff.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { diffWords, changeCount } = await import('./textDiff.ts');

const render = (ops: { type: string; text: string }[]) =>
  ops.map(o => (o.type === 'same' ? o.text : o.type === 'add' ? `+[${o.text}]` : `-[${o.text}]`)).join(' ');

test('identical text has no changes', () => {
  const ops = diffWords('the quick brown fox', 'the quick brown fox');
  assert.equal(changeCount(ops), 0);
  assert.equal(render(ops), 'the quick brown fox');
});

test('a replaced word is one change', () => {
  const ops = diffWords('pay within 30 days of invoice', 'pay within 15 days of invoice');
  assert.equal(render(ops), 'pay within -[30] +[15] days of invoice');
  assert.equal(changeCount(ops), 1);
});

test('insertions and deletions in different places', () => {
  const ops = diffWords('a b c d e', 'a x b c e');
  assert.equal(render(ops), 'a +[x] b c -[d] e');
  assert.equal(changeCount(ops), 2);
});

test('whitespace and line breaks are not differences', () => {
  assert.equal(changeCount(diffWords('one  two\nthree', 'one two three')), 0);
});
