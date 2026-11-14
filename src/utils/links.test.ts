// Self-check for Add Hyperlinks' URL handling.
//   node --test src/utils/links.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { normaliseLink } = await import('./links.ts');

test('web, email and phone inputs become proper URIs', () => {
  assert.equal(normaliseLink('example.com/pricing'), 'https://example.com/pricing');
  assert.equal(normaliseLink('https://x.org'), 'https://x.org');
  assert.equal(normaliseLink('sam@example.co'), 'mailto:sam@example.co');
  assert.equal(normaliseLink('+91 (98) 765-43210'), 'tel:+919876543210');
});

test('script and unknown schemes are refused', () => {
  assert.equal(normaliseLink('javascript:alert(1)'), null);
  assert.equal(normaliseLink('file:///etc/passwd'), null);
  assert.equal(normaliseLink('not a link'), null);
  assert.equal(normaliseLink('  '), null);
});
