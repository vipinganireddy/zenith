// Self-check: tool counts are derived, never typed (CLAUDE.md rule 2).
//   node --test src/data/toolsData.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { toolsData, TOTAL_TOOLS, toolCountByCategory } = await import('./toolsData.ts');

test('TOTAL_TOOLS is the number of registered tools', () => {
  assert.equal(TOTAL_TOOLS, toolsData.length);
});

test('category counts add up to the total', () => {
  const sum = Object.values(toolCountByCategory as Record<string, number>).reduce((a, b) => a + b, 0);
  assert.equal(sum, TOTAL_TOOLS);
});

test('tool names are unique (each one has its own page)', () => {
  const names = toolsData.map((t: { name: string }) => t.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});
