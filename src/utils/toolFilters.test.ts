// Self-check for the Tools filter state (URL round-trip, filtering, sorting).
//   node --test src/utils/toolFilters.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { readFilter, filterQuery, applyFilter, activeFilterCount, DEFAULT_FILTER } = await import('./toolFilters.ts');

const tools = [
  { name: 'Merge PDF', desc: 'Combine files', category: 'organize' },
  { name: 'AI Summarize PDF', desc: 'Short summaries', category: 'ai' },
  { name: 'Compress PDF', desc: 'Smaller files', category: 'edit' },
];

test('defaults are omitted from the URL and read back as defaults', () => {
  assert.equal(filterQuery(DEFAULT_FILTER), '');
  assert.deepEqual(readFilter(new URLSearchParams('')), DEFAULT_FILTER);
});

test('a filter survives the URL round-trip, with the search query kept', () => {
  const qs = filterQuery({ cat: 'ai', sort: 'az' }, ' pdf ');
  const p = new URLSearchParams(qs.slice(1));
  assert.equal(p.get('q'), 'pdf');
  assert.deepEqual(readFilter(p), { cat: 'ai', sort: 'az' });
});

test('an unknown sort falls back to recommended', () => {
  assert.equal(readFilter(new URLSearchParams('sort=zz')).sort, 'recommended');
});

test('category, search and A–Z sorting combine', () => {
  assert.deepEqual(applyFilter(tools, { cat: 'all', sort: 'az' }).map(t => t.name),
    ['AI Summarize PDF', 'Compress PDF', 'Merge PDF']);
  assert.deepEqual(applyFilter(tools, { cat: 'organize', sort: 'recommended' }).map(t => t.name), ['Merge PDF']);
  assert.deepEqual(applyFilter(tools, DEFAULT_FILTER, 'smaller').map(t => t.name), ['Compress PDF']);
  // Recommended keeps the catalogue order
  assert.deepEqual(applyFilter(tools, DEFAULT_FILTER).map(t => t.name), tools.map(t => t.name));
});

test('the badge counts only settings that differ from the defaults', () => {
  assert.equal(activeFilterCount(DEFAULT_FILTER), 0);
  assert.equal(activeFilterCount({ cat: 'ai', sort: 'az' }), 2);
});
