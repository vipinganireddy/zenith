/* ── Cross-device account sync via the user's own Google Drive ────────────────
   There is no O-Zenith backend, so localStorage is the only store — and it is
   per-browser. That is why a PRO member signing in on a second browser looked
   like a free user with no API keys.

   Fix: the app already holds a drive.file token from Google sign-in. A small
   JSON file in the app's Drive folder ("Zenith Uploads") carries the account
   state — subscription + API keys. drive.file scope covers files this app
   created on ANY device, so browser B can read what browser A wrote.

   - pushAccountSync(): write current state to Drive (fire-and-forget, called
     after subscribing/cancelling and after saving an API key).
   - pullAccountSync(uid): restore state into this browser, called during
     Google sign-in BEFORE the session is committed, so the UI mounts already
     knowing the user is PRO.

   The data lives in the user's own private Drive — the same trust boundary as
   the keys themselves ("bring your own key" already implies the user owns and
   stores their keys).
   ──────────────────────────────────────────────────────────────────────────── */

import { getDriveToken, ensureAppFolder } from './googleDrive';
import { PROVIDERS, type Provider } from './apiKeys';

const SYNC_FILE = 'o-zenith-account.json';
const SYNC_ID_CACHE = 'zenith_gd_syncfile';

interface SyncPayload {
  v: 1;
  updatedAt: string;
  subscription: { plan: string; activatedAt: string | null; expiresAt: string | null; autoRenew: boolean } | null;
  apiKeys: Partial<Record<Provider, string>>;
}

const subKey = (uid: string) => `zenith_subscription__${uid}`;
const apiKey = (p: Provider, uid: string) => `zenith_apikey_${p}__${uid}`;

function currentUid(): string {
  try {
    const s = JSON.parse(localStorage.getItem('zenith_session') || 'null');
    return (s && s.id) ? String(s.id) : 'guest';
  } catch { return 'guest'; }
}

const withTimeout = <T,>(p: Promise<T>, ms = 6000): Promise<T> =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('sync timeout')), ms))]);

// ── Locate (or create) the sync file in the app folder ───────────────────────
async function findSyncFile(token: string): Promise<string | null> {
  const cached = localStorage.getItem(SYNC_ID_CACHE);
  if (cached) {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) { const d = await r.json(); if (!d.trashed) return d.id; }
    localStorage.removeItem(SYNC_ID_CACHE);
  }
  const folderId = await ensureAppFolder(token);
  const q = encodeURIComponent(`name='${SYNC_FILE}' and '${folderId}' in parents and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const id = (await r.json()).files?.[0]?.id ?? null;
  if (id) localStorage.setItem(SYNC_ID_CACHE, id);
  return id;
}

// ── Push: this browser's state → Drive ───────────────────────────────────────
export async function pushAccountSync(uid = currentUid()): Promise<void> {
  const tok = getDriveToken();
  if (!tok || uid === 'guest') return;

  let subscription: SyncPayload['subscription'] = null;
  try { subscription = JSON.parse(localStorage.getItem(subKey(uid)) || 'null'); } catch { /* keep null */ }

  const keys: SyncPayload['apiKeys'] = {};
  for (const p of PROVIDERS) {
    const v = localStorage.getItem(apiKey(p, uid));
    if (v) keys[p] = v;
  }

  const payload: SyncPayload = { v: 1, updatedAt: new Date().toISOString(), subscription, apiKeys: keys };
  const body = JSON.stringify(payload);

  const existing = await findSyncFile(tok.token);
  if (existing) {
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing}?uploadType=media`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tok.token}`, 'Content-Type': 'application/json' },
      body,
    });
  } else {
    const folderId = await ensureAppFolder(tok.token);
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name: SYNC_FILE, parents: [folderId] })], { type: 'application/json' }));
    form.append('file', new Blob([body], { type: 'application/json' }), SYNC_FILE);
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { Authorization: `Bearer ${tok.token}` }, body: form,
    });
    if (r.ok) localStorage.setItem(SYNC_ID_CACHE, (await r.json()).id);
  }
}

/** Fire-and-forget wrapper so call sites stay one line. */
export function pushAccountSyncSoon(uid?: string): void {
  void withTimeout(pushAccountSync(uid)).catch(() => { /* best-effort */ });
}

// ── Pull: Drive → this browser (run during Google sign-in) ───────────────────
export async function pullAccountSync(uid: string): Promise<{ restoredKeys: number; restoredPlan: boolean }> {
  const none = { restoredKeys: 0, restoredPlan: false };
  const tok = getDriveToken();
  if (!tok || !uid || uid === 'guest') return none;

  const fileId = await withTimeout(findSyncFile(tok.token));
  if (!fileId) return none;

  const r = await withTimeout(fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${tok.token}` },
  }));
  if (!r.ok) return none;
  const remote: SyncPayload = await r.json();

  // API keys: fill the gaps only — a key typed on THIS browser wins.
  let restoredKeys = 0;
  for (const p of PROVIDERS) {
    const v = remote.apiKeys?.[p];
    if (v && !localStorage.getItem(apiKey(p, uid))) {
      localStorage.setItem(apiKey(p, uid), v);
      restoredKeys++;
    }
  }

  // Subscription: adopt the remote plan when it is paid and local is not, or
  // when both are paid and the remote activation is newer.
  let restoredPlan = false;
  const rs = remote.subscription;
  if (rs && rs.plan !== 'free') {
    let local: SyncPayload['subscription'] = null;
    try { local = JSON.parse(localStorage.getItem(subKey(uid)) || 'null'); } catch { /* keep null */ }
    const localPaid = local && local.plan !== 'free';
    const remoteNewer = !local?.activatedAt || (rs.activatedAt ?? '') > (local.activatedAt ?? '');
    if (!localPaid || remoteNewer) {
      localStorage.setItem(subKey(uid), JSON.stringify(rs));
      restoredPlan = true;
    }
  }
  return { restoredKeys, restoredPlan };
}

/** Bounded pull that never throws — safe to await inside the sign-in flow. */
export async function pullAccountSyncSafe(uid: string): Promise<void> {
  try { await withTimeout(pullAccountSync(uid)); } catch { /* sign-in must never hang on sync */ }
  // Immediately mirror back, so whatever this browser already had joins the
  // file too. Without this, a browser that never *changed* a key after sync
  // shipped would never publish its keys, and the second browser would find
  // an empty (or missing) mirror — exactly the "keys not saved" report.
  pushAccountSyncSoon(uid);
}

/** True when this browser holds anything worth mirroring. */
export function hasLocalStateToSync(uid = currentUid()): boolean {
  if (uid === 'guest') return false;
  if (PROVIDERS.some(p => localStorage.getItem(apiKey(p, uid)))) return true;
  try {
    const sub = JSON.parse(localStorage.getItem(subKey(uid)) || 'null');
    return !!sub && sub.plan !== 'free';
  } catch { return false; }
}

export type SyncStatus =
  | { state: 'idle' }
  | { state: 'no-drive' }
  | { state: 'syncing' }
  | { state: 'ok'; restoredKeys: number; restoredPlan: boolean; at: string }
  | { state: 'error'; message: string };

/**
 * Full reconcile: pull the mirror in, then publish the union back out.
 * Convergent, so it is safe to run on every app boot and from a manual button.
 */
export async function syncAccountNow(uid = currentUid()): Promise<SyncStatus> {
  if (uid === 'guest') return { state: 'idle' };
  if (!getDriveToken()) return { state: 'no-drive' };
  try {
    const res = await withTimeout(pullAccountSync(uid), 10000);
    await withTimeout(pushAccountSync(uid), 10000);
    return { state: 'ok', ...res, at: new Date().toISOString() };
  } catch (e) {
    return { state: 'error', message: e instanceof Error ? e.message : 'Sync failed' };
  }
}
