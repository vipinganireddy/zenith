/* Work out which AI provider an API key belongs to, so Account → API keys can
   offer one "paste any key" field instead of a section per provider.

   1. The key's shape usually says it outright (sk-ant- → Anthropic, gsk_ →
      Groq, AIza → Gemini, sk-or- → OpenRouter, sk-proj- → OpenAI).
   2. A plain "sk-…" key is ambiguous between OpenAI and DeepSeek, so the app
      asks each provider's free model-list endpoint which one accepts it.
   Only an explicit 401/403 counts as "rejected": a network or CORS failure is
   "unknown", and the best guess is kept — a flaky check never blocks a save. */

import type { Provider } from './apiKeys';

export const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google Gemini',
  groq: 'Groq', openrouter: 'O-Zenith AI Gateway', deepseek: 'DeepSeek',
};

export interface Detection {
  provider: Provider;
  /** false when the shape alone can't tell (a plain sk- key) */
  confident: boolean;
}

/** Pure, synchronous guess from the key's shape. */
export function detectProvider(raw: string): Detection | null {
  const key = raw.trim();
  if (!key) return null;
  if (/^sk-ant-/.test(key)) return { provider: 'anthropic', confident: true };
  if (/^sk-or-/.test(key)) return { provider: 'openrouter', confident: true };
  if (/^gsk_/.test(key)) return { provider: 'groq', confident: true };
  if (/^AIza[0-9A-Za-z_-]{20,}$/.test(key)) return { provider: 'gemini', confident: true };
  if (/^sk-(proj|svcacct|admin)-/.test(key)) return { provider: 'openai', confident: true };
  // DeepSeek issues sk- + 32 lowercase hex; legacy OpenAI keys are 48 mixed-case
  // characters. The pattern is a strong hint, but it is still checked online.
  if (/^sk-[0-9a-f]{32}$/.test(key)) return { provider: 'deepseek', confident: false };
  if (/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) return { provider: 'openai', confident: false };
  return null;
}

/** Mask a key for display: sk-…a1b2 */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 10) return '••••';
  const head = k.match(/^(sk-ant-|sk-or-|sk-proj-|sk-|gsk_|AIza)/)?.[0] ?? k.slice(0, 3);
  return `${head}…${k.slice(-4)}`;
}

type Check = 'ok' | 'rejected' | 'unknown';

const CHECKS: Record<Provider, (key: string) => { url: string; headers: Record<string, string> }> = {
  openai:     key => ({ url: 'https://api.openai.com/v1/models', headers: { Authorization: `Bearer ${key}` } }),
  deepseek:   key => ({ url: 'https://api.deepseek.com/models', headers: { Authorization: `Bearer ${key}` } }),
  groq:       key => ({ url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: `Bearer ${key}` } }),
  openrouter: key => ({ url: 'https://openrouter.ai/api/v1/key', headers: { Authorization: `Bearer ${key}` } }),
  anthropic:  key => ({ url: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }),
  gemini:     key => ({ url: 'https://generativelanguage.googleapis.com/v1beta/models', headers: { 'x-goog-api-key': key } }),
};

/** Ask the provider whether it accepts the key (a free, read-only request). */
export async function checkKey(provider: Provider, key: string, timeoutMs = 8000): Promise<Check> {
  const { url, headers } = CHECKS[provider](key.trim());
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (res.ok) return 'ok';
    return res.status === 401 || res.status === 403 ? 'rejected' : 'unknown';
  } catch {
    return 'unknown';   // offline, blocked by CORS, timed out
  } finally {
    clearTimeout(timer);
  }
}

export type Identification =
  | { status: 'ok'; provider: Provider; verified: boolean }
  | { status: 'rejected'; provider: Provider }
  | { status: 'unrecognised' };

/** Decide which provider a key is for, confirming online where it matters.
    A key is only ever sent to one provider: for an ambiguous sk- key that is
    the one the user picked (`chosen`), else the likelier guess. */
export async function identifyKey(raw: string, check = checkKey, chosen?: Provider): Promise<Identification> {
  const guess = detectProvider(raw);
  if (!guess) return { status: 'unrecognised' };
  const provider = !guess.confident && chosen && AMBIGUOUS.includes(chosen) ? chosen : guess.provider;

  const result = await check(provider, raw);
  if (result === 'ok') return { status: 'ok', provider, verified: true };
  if (result === 'rejected') return { status: 'rejected', provider };
  return { status: 'ok', provider, verified: false };
}

/** Providers whose keys look alike (plain sk-…). */
export const AMBIGUOUS: Provider[] = ['openai', 'deepseek'];
