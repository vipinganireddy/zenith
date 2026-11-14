// ── Google Drive token helpers ────────────────────────────────────────────────
const GD_TOKEN_KEY = 'zenith_gd_token';

interface DriveToken { token: string; email: string; expires: number; }

export function getDriveToken(): DriveToken | null {
  try {
    const raw = localStorage.getItem(GD_TOKEN_KEY);
    if (!raw) return null;
    const parsed: DriveToken = JSON.parse(raw);
    if (Date.now() > parsed.expires) { localStorage.removeItem(GD_TOKEN_KEY); return null; }
    return parsed;
  } catch { return null; }
}

export function saveDriveToken(token: string, email: string, expiresIn: number) {
  const data: DriveToken = { token, email, expires: Date.now() + (expiresIn - 60) * 1000 };
  localStorage.setItem(GD_TOKEN_KEY, JSON.stringify(data));
}

export function clearDriveToken() {
  localStorage.removeItem(GD_TOKEN_KEY);
}

// ── Google OAuth redirect: state + nonce, and verifying what comes back ──────
/* Every redirect to Google carries a random `state` and `nonce`, kept in
   sessionStorage. A callback is only accepted when its state matches the one
   this tab sent (so a crafted link can't plant someone else's token) and Google
   itself confirms the id_token (signature, audience, expiry, nonce). */
const OAUTH_PENDING_KEY = 'g_oauth_pending';

const randomToken = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
};

/** Send the browser to Google's consent screen. `redirectPath` must be a registered redirect URI path. */
export function startGoogleOAuth(redirectPath: string, prompt: 'select_account' | 'consent' = 'select_account') {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const state = randomToken(), nonce = randomToken();
  sessionStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ state, nonce }));
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${window.location.origin}${redirectPath}`);
  // token + id_token: id_token says who signed in, access_token connects Drive
  url.searchParams.set('response_type', 'token id_token');
  url.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('prompt', prompt);
  window.location.href = url.toString();
}

export interface GoogleCallback {
  user: { id: string; email: string; name: string; picture: string };
  accessToken: string | null;
  expiresIn: number;
}

/** Validate the `#…` Google redirect. Throws with a user-facing message when it can't be trusted. */
export async function verifyGoogleCallback(hash: string): Promise<GoogleCallback> {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  let pending: { state?: string; nonce?: string } = {};
  try { pending = JSON.parse(sessionStorage.getItem(OAUTH_PENDING_KEY) || '{}'); } catch { /* none */ }
  sessionStorage.removeItem(OAUTH_PENDING_KEY); // one use only

  if (p.get('error')) throw new Error(`Google: ${p.get('error')!.replace(/_/g, ' ')}`);
  if (!pending.state || p.get('state') !== pending.state) throw new Error('This sign-in link didn’t start here. Please try again.');
  const idToken = p.get('id_token');
  if (!idToken) throw new Error('Google didn’t return your account details.');

  // Google checks the signature and expiry; we check it was meant for us
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`).catch(() => null);
  if (!res?.ok) throw new Error('Couldn’t confirm your Google account. Check your connection and try again.');
  const c = await res.json();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const issOk = c.iss === 'accounts.google.com' || c.iss === 'https://accounts.google.com';
  if (!issOk || c.aud !== clientId || c.nonce !== pending.nonce || Number(c.exp) * 1000 < Date.now()) {
    throw new Error('Google sign-in couldn’t be verified. Please try again.');
  }
  if (!c.email || String(c.email_verified) === 'false') throw new Error('Your Google email isn’t verified.');

  const expiresIn = parseInt(p.get('expires_in') ?? '', 10);
  return {
    user: { id: String(c.sub), email: String(c.email), name: String(c.name || c.email.split('@')[0]), picture: String(c.picture || '') },
    accessToken: p.get('access_token'),
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
  };
}

/** Is there a Google redirect waiting in the URL? */
export const hasGoogleCallback = () => /[#&](id_token|access_token|error)=/.test(window.location.hash);

// ── Start Google Drive OAuth (redirect flow) ──────────────────────────────────
export function connectGoogleDrive(redirectBackTo: string) {
  sessionStorage.setItem('gd_redirect_back', redirectBackTo);
  try { startGoogleOAuth('/dashboard/profile', 'consent'); }
  catch (e) { alert(e instanceof Error ? e.message : 'Google Drive is not configured.'); }
}

// ── Fetch user email from Google with the access token (fallback) ─────────────
export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch Google user info');
  const data = await res.json();
  return data.email as string;
}

// ── Upload a file to Google Drive ─────────────────────────────────────────────
export async function uploadToDrive(
  fileData: File | Blob,
  fileName: string,
  accessToken: string,
): Promise<{ id: string; name: string; webViewLink: string }> {
  // Step 1 — create file metadata
  const metadata = { name: fileName, parents: [] };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileData, fileName);

  let res: Response;
  try {
    res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      },
    );
  } catch (networkErr) {
    // "Failed to fetch" / "Load failed" — usually browser shields blocking googleapis.com
    const msg = networkErr instanceof Error ? networkErr.message : 'Network error';
    if (msg === 'Failed to fetch' || msg === 'Load failed' || msg.toLowerCase().includes('network')) {
      throw new Error(
        'Network error — your browser may be blocking the upload to Google. ' +
        'If you\'re using Brave, click the Shields icon in the address bar and disable shields for this site, then try again.',
        { cause: networkErr },
      );
    }
    throw new Error(msg, { cause: networkErr });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: { message?: string } }).error?.message || `Upload failed (${res.status})`;
    if (res.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    throw new Error(msg);
  }

  return res.json();
}

// ── Convert an Office file to PDF using Google Drive's import-conversion ───────
// Uploads the file asking Drive to import it as a Google-native doc, exports that
// as PDF, then deletes the temporary Drive file. Used for PowerPoint → PDF.
export async function convertToPdfViaDrive(
  file: File,
  googleMimeType: string,   // e.g. 'application/vnd.google-apps.presentation'
  accessToken: string,
): Promise<Blob> {
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1 — upload with conversion (metadata.mimeType = the Google-native target type)
  const metadata = { name: file.name, mimeType: googleMimeType };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file, file.name);

  let up: Response;
  try {
    up = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: auth, body: form },
    );
  } catch {
    throw new Error('Network error reaching Google — if you use Brave/strict shields, allow this site and retry.');
  }
  if (!up.ok) {
    if (up.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    const err = await up.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `Drive conversion upload failed (${up.status})`);
  }
  const { id } = await up.json() as { id: string };

  // 2 — export the converted doc as PDF
  let pdf: Blob;
  try {
    const exp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`,
      { headers: auth },
    );
    if (!exp.ok) {
      const err = await exp.json().catch(() => ({}));
      throw new Error((err as { error?: { message?: string } }).error?.message || `Drive export failed (${exp.status})`);
    }
    pdf = await exp.blob();
  } finally {
    // 3 — always clean up the temporary Drive file
    fetch(`https://www.googleapis.com/drive/v3/files/${id}`, { method: 'DELETE', headers: auth }).catch(() => {});
  }

  return pdf;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Drive connection state + upload pipeline (client-side equivalent of a backend)
//  This SPA has no server: OAuth, folder creation, and drive.files.create all run
//  directly in the browser with the user's own access token. Nothing is proxied
//  through a O-Zenith server, staying true to the "nothing uploaded to us" model.
// ══════════════════════════════════════════════════════════════════════════════

const GD_STATE_KEY = 'zenith_google_drive';
const GD_FOLDER_KEY = 'zenith_gd_folder_id';
export const APP_DRIVE_FOLDER = 'Zenith Uploads';

export interface GDState { linked: boolean; email: string; connectedAt: string; }

export function getGDState(): GDState {
  try { return JSON.parse(localStorage.getItem(GD_STATE_KEY) || 'null') || { linked: false, email: '', connectedAt: '' }; }
  catch { return { linked: false, email: '', connectedAt: '' }; }
}
export function saveGDState(s: GDState) { localStorage.setItem(GD_STATE_KEY, JSON.stringify(s)); }
export function clearGDState() {
  localStorage.removeItem(GD_STATE_KEY);
  localStorage.removeItem(GD_FOLDER_KEY);
  clearDriveToken();
}
/** True when Drive is linked AND we still hold a non-expired access token. */
export function isDriveConnected(): boolean {
  return getGDState().linked && !!getDriveToken();
}

// ── Delete a file from the user's Drive (scoped to files the app created) ─────
export async function deleteFromDrive(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // 204 = deleted, 404 = already gone (treat as success)
  if (!res.ok && res.status !== 404) {
    if (res.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    throw new Error(`Could not delete from Drive (${res.status})`);
  }
}

// ── Find (or create) the dedicated "Zenith Uploads" folder in the user's Drive
export async function ensureAppFolder(accessToken: string): Promise<string> {
  const cached = localStorage.getItem(GD_FOLDER_KEY);
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Verify a cached folder id still exists (user may have deleted it)
  if (cached) {
    try {
      const r = await fetch(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`, { headers: auth });
      if (r.ok) { const d = await r.json(); if (!d.trashed) return cached; }
    } catch { /* fall through to search/create */ }
  }

  // Search for an existing non-trashed folder with our name
  const q = encodeURIComponent(`name='${APP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  try {
    const sr = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, { headers: auth });
    if (sr.ok) {
      const sd = await sr.json();
      if (sd.files?.length) { localStorage.setItem(GD_FOLDER_KEY, sd.files[0].id); return sd.files[0].id; }
    }
  } catch { /* fall through to create */ }

  // Create it (drive.files.create with the folder mime type)
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: APP_DRIVE_FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!cr.ok) {
    if (cr.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    throw new Error('Could not create the Zenith Uploads folder in Drive.');
  }
  const cd = await cr.json();
  localStorage.setItem(GD_FOLDER_KEY, cd.id);
  return cd.id;
}

export interface DriveFileMeta { id: string; name: string; webViewLink?: string; webContentLink?: string; }

// ── Upload pipeline: stream a file into the app folder via drive.files.create ──
export async function uploadFileToAppFolder(fileData: File | Blob, fileName: string, accessToken: string): Promise<DriveFileMeta> {
  const folderId = await ensureAppFolder(accessToken);
  const metadata = { name: fileName, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', fileData, fileName);

  let res: Response;
  try {
    res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
      { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form },
    );
  } catch {
    throw new Error('Network error reaching Google — check your connection (or browser shields) and retry.');
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } }).error?.message || `Drive upload failed (${res.status})`);
  }
  return res.json();
}

// ── Drive storage quota (drive/v3/about) ─────────────────────────────────────
export interface DriveQuota { usage: number; limit: number | null; usageInDrive: number }

export async function fetchDriveQuota(accessToken: string): Promise<DriveQuota> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    throw new Error(`Could not read Drive storage (${res.status})`);
  }
  const q = (await res.json()).storageQuota ?? {};
  return {
    usage: Number(q.usage ?? 0),
    // Workspace accounts can have unlimited storage — Google omits `limit`.
    limit: q.limit != null ? Number(q.limit) : null,
    usageInDrive: Number(q.usageInDrive ?? 0),
  };
}

// ── List the app folder's files so cloud saves appear in the Files page ──────
export interface DriveListedFile extends DriveFileMeta { size?: string; mimeType?: string; modifiedTime?: string }

export async function listAppFolderFiles(accessToken: string): Promise<DriveListedFile[]> {
  const folderId = await ensureAppFolder(accessToken);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,size,mimeType,modifiedTime,webViewLink)&pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return []; // listing is best-effort; the page still renders local records
  const files: DriveListedFile[] = (await res.json()).files ?? [];
  // The account-sync mirror lives in the same folder but is app plumbing,
  // not a user document — never surface it in the Files page.
  return files.filter(f => f.name !== 'o-zenith-account.json');
}

// ── Read a file's bytes back (for using a Drive-only library file in a tool) ──
export async function downloadDriveFile(fileId: string, accessToken: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new Error('Network error reaching Google — check your connection and retry.');
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Drive token expired — please reconnect Google Drive.');
    throw new Error(`Could not download from Drive (${res.status})`);
  }
  return res.blob();
}
