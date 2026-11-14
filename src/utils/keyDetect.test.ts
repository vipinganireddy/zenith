// Self-check for API key provider detection.
//   node --test src/utils/keyDetect.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const { detectProvider, identifyKey, maskKey } = await import('./keyDetect.ts');

const hex32 = 'a'.repeat(16) + '0123456789abcdef';

test('distinctive prefixes are recognised outright', () => {
  assert.deepEqual(detectProvider('sk-ant-api03-abcdefghijklmnop'), { provider: 'anthropic', confident: true });
  assert.deepEqual(detectProvider('sk-or-v1-abcdefghijklmnopqrstu'), { provider: 'openrouter', confident: true });
  assert.deepEqual(detectProvider('gsk_abcdefghijklmnopqrstuvwxyz'), { provider: 'groq', confident: true });
  assert.deepEqual(detectProvider('AIzaSyA-abcdefghijklmnopqrstuvwxyz12'), { provider: 'gemini', confident: true });
  assert.deepEqual(detectProvider('sk-proj-abcdefghijklmnopqrstuvwxyz'), { provider: 'openai', confident: true });
});

test('plain sk- keys are only a guess', () => {
  assert.deepEqual(detectProvider(`sk-${hex32}`), { provider: 'deepseek', confident: false });
  assert.deepEqual(detectProvider('sk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefABCD'), { provider: 'openai', confident: false });
});

test('whitespace is ignored and nonsense is not recognised', () => {
  assert.equal(detectProvider('  sk-ant-api03-abcdefghijklmnop \n')?.provider, 'anthropic');
  assert.equal(detectProvider(''), null);
  assert.equal(detectProvider('hello world'), null);
  assert.equal(detectProvider('sk-short'), null);
});

test('an ambiguous key goes only to one provider: the likelier, or the one chosen', async () => {
  const calls: string[] = [];
  const res = await identifyKey(`sk-${hex32}`, async (p) => { calls.push(p); return 'rejected'; });
  assert.deepEqual(res, { status: 'rejected', provider: 'deepseek' });
  assert.deepEqual(calls, ['deepseek']);             // never also sent to OpenAI
  calls.length = 0;
  const picked = await identifyKey(`sk-${hex32}`, async (p) => { calls.push(p); return 'ok'; }, 'openai');
  assert.deepEqual(picked, { status: 'ok', provider: 'openai', verified: true });
  assert.deepEqual(calls, ['openai']);
});

test('a key every reachable provider rejects is reported as rejected', async () => {
  const res = await identifyKey('gsk_abcdefghijklmnopqrstuvwxyz', async () => 'rejected');
  assert.equal(res.status, 'rejected');
});

test('an unreachable check keeps the best guess instead of blocking', async () => {
  const res = await identifyKey('sk-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefABCD', async () => 'unknown');
  assert.deepEqual(res, { status: 'ok', provider: 'openai', verified: false });
});

test('keys are masked for display', () => {
  assert.equal(maskKey('sk-ant-api03-abcdefghijklmnop1234'), 'sk-ant-…1234');
  assert.equal(maskKey('AIzaSyA-abcdefghijklmnopqrstuvwxyz12'), 'AIza…yz12');
});
