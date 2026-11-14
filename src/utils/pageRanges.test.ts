// Self-check for the page-range parser.
//   node --test src/utils/pageRanges.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { parsePageRanges } = await import('./pageRanges.ts');

test('numbers and ranges, deduplicated and sorted', () => {
  const r = parsePageRanges('5, 1-3, 2', 10);
  assert.deepEqual(r.pages, [1, 2, 3, 5]);
  assert.deepEqual(r.groups, [[5], [1, 2, 3], [2]]);
  assert.deepEqual(r.errors, []);
});

test('open-ended and reversed ranges', () => {
  assert.deepEqual(parsePageRanges('8-', 10).pages, [8, 9, 10]);
  assert.deepEqual(parsePageRanges('-2', 10).pages, [1, 2]);
  assert.deepEqual(parsePageRanges('4-2', 10).pages, [2, 3, 4]);
  assert.deepEqual(parsePageRanges('all', 3).pages, [1, 2, 3]);
});

test('invalid parts are reported, not silently dropped', () => {
  const r = parsePageRanges('1-3, 99, abc, 0', 10);
  assert.deepEqual(r.pages, [1, 2, 3]);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /99/);
  assert.match(r.errors[1], /abc/);
});

test('empty input is an error', () => {
  assert.equal(parsePageRanges('  ', 5).errors.length, 1);
});
