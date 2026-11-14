/* Password locks for Files folders, kept on this device.

   Only a salted PBKDF2-SHA-256 hash of the password is stored (in the folder
   record, localStorage) — never the password. This is an app-level lock: it
   keeps a folder closed inside O-Zenith (its files are hidden from the list,
   search, Starred, Trash and the tool picker until it's unlocked). It does not
   encrypt the file contents, and the UI says so. */

export interface FolderLock {
  salt: string;   // hex
  hash: string;   // hex, PBKDF2-SHA-256
  iterations: number;
}

const hex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map(h => parseInt(h, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return hex(bits);
}

export async function createLock(password: string): Promise<FolderLock> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 150_000;
  return { salt: hex(salt), hash: await derive(password, salt, iterations), iterations };
}

export async function verifyLock(lock: FolderLock, password: string): Promise<boolean> {
  const got = await derive(password, unhex(lock.salt), lock.iterations);
  // constant-time compare
  if (got.length !== lock.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ lock.hash.charCodeAt(i);
  return diff === 0;
}

/* Folders unlocked in this session. A folder relocks when you leave it, when
   the app reloads, or when Files is closed. Shared so the tool picker and
   Chat honour the same state. */
const unlocked = new Set<string>();
export const isUnlocked = (id: string) => unlocked.has(id);
export const markUnlocked = (id: string) => { unlocked.add(id); };
export const relock = (id?: string) => { if (id) unlocked.delete(id); else unlocked.clear(); };
