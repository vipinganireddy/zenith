/* ── API key storage ───────────────────────────────────────────────────────────
   Keys are saved per account so each signed-in user keeps their own keys, and
   they persist across logout/login and refreshes on this device. Stored only in
   localStorage — never sent to a O-Zenith server.

   NOTE: because there is no backend, keys live in this browser only; they do not
   sync to other devices. On the same browser + account they are never forgotten.
   ──────────────────────────────────────────────────────────────────────────── */

export type Provider = 'openai' | 'anthropic' | 'gemini' | 'groq' | 'openrouter' | 'deepseek';

// Legacy global keys (pre-account-scoping) — used as a migration fallback.
const LEGACY: Record<Provider, string> = {
  openai:     'zenith_openai_key',
  anthropic:  'zenith_anthropic_key',
  gemini:     'zenith_gemini_key',
  groq:       'zenith_groq_key',
  openrouter: 'zenith_openrouter_key',
  deepseek:   'zenith_deepseek_key',
};

export const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'deepseek'];

/** The id of the currently signed-in account (or "guest" when logged out). */
function currentUid(): string {
  try {
    const s = JSON.parse(localStorage.getItem('zenith_session') || 'null');
    return (s && s.id) ? String(s.id) : 'guest';
  } catch { return 'guest'; }
}

function nsKey(provider: Provider, uid = currentUid()): string {
  return `zenith_apikey_${provider}__${uid}`;
}

/** Read a provider's key for the current account (migrating any legacy global key). */
export function getApiKey(provider: Provider): string {
  const scoped = localStorage.getItem(nsKey(provider));
  if (scoped) return scoped;
  // One-time migration: the first signed-in account adopts a legacy global key,
  // which is then removed so no other account on this device inherits it
  const uid = currentUid();
  const legacy = uid !== 'guest' ? localStorage.getItem(LEGACY[provider]) : null;
  if (legacy) {
    try { localStorage.setItem(nsKey(provider, uid), legacy); localStorage.removeItem(LEGACY[provider]); } catch { /* keep legacy */ }
    return legacy;
  }
  return '';
}

/** Save (or clear) a provider's key for the current account. */
export function setApiKey(provider: Provider, value: string): void {
  const key = nsKey(provider);
  const v = value.trim();
  if (v) localStorage.setItem(key, v);
  else localStorage.removeItem(key);
  // Mirror to the user's Drive so keys follow them to other browsers.
  // Dynamic import: accountSync imports PROVIDERS from this module, so a
  // static import back would be a cycle.
  void import('./accountSync').then(m => m.pushAccountSyncSoon()).catch(() => {});
}
