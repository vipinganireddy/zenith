// Self-check for streaming reply parsing (all provider formats).
//   node --test src/utils/aiStream.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';

// aiService imports pdf.js (browser-only), so test the pure helpers via a small shim
const src = (await import('node:fs')).readFileSync(new URL('./aiService.ts', import.meta.url), 'utf8');
const pick = (name: string) => { const i = src.indexOf(`export function ${name}`); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 2).replace('export ', ''); };
const ts = (await import('typescript')).default;
const js = ts.transpileModule(`type Provider = string;\n${pick('sseDelta')}\nexport { sseDelta };`, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sseDelta } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('OpenAI-compatible deltas (OpenAI, OpenRouter, Groq, DeepSeek)', () => {
  assert.equal(sseDelta('openrouter', '{"choices":[{"delta":{"content":"Hel"}}]}'), 'Hel');
  assert.equal(sseDelta('openai', '[DONE]'), '');
  assert.equal(sseDelta('groq', '{"choices":[{"delta":{}}]}'), '');
});

test('Anthropic text deltas only', () => {
  assert.equal(sseDelta('anthropic', '{"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}'), 'lo');
  assert.equal(sseDelta('anthropic', '{"type":"message_start","message":{}}'), '');
});

test('Gemini parts and junk', () => {
  assert.equal(sseDelta('gemini', '{"candidates":[{"content":{"parts":[{"text":"a"},{"text":"b"}]}}]}'), 'ab');
  assert.equal(sseDelta('openai', 'not json'), '');
});
