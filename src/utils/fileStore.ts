/* File contents for the Files library, kept on this device.

   fileLibrary.ts records metadata in localStorage (names, sizes, Drive ids);
   the bytes themselves live here, in IndexedDB, keyed by the same id — large
   binary data doesn't belong in localStorage. Files saved to Google Drive only
   are read back from Drive on demand (loadLibraryFile). */

import { getDriveToken, downloadDriveFile } from './googleDrive';
import type { FileItem } from './fileLibrary';

const DB_NAME = 'zenith-file-store';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('Could not open file storage')); };
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('File storage error'));
  }));
}

export const putFileBlob = (id: number, blob: Blob) => run<IDBValidKey>('readwrite', s => s.put(blob, id));
export const getFileBlob = (id: number) => run<Blob | undefined>('readonly', s => s.get(id));
export const deleteFileBlob = (id: number) => run<undefined>('readwrite', s => s.delete(id)).catch(() => undefined);

/** Can this library item be opened right now (device copy, or Drive with a live session)? */
export function isLibraryFileAvailable(item: FileItem): boolean {
  return !!item.onDevice || (!!item.driveId && !!getDriveToken());
}

/** The item's bytes as a File: from this device first, otherwise from Google Drive. */
export async function loadLibraryFile(item: FileItem): Promise<File> {
  const type = item.mimeType || 'application/octet-stream';
  if (item.onDevice) {
    const blob = await getFileBlob(item.id).catch(() => undefined);
    if (blob) return new File([blob], item.name, { type: blob.type || type });
  }
  if (item.driveId) {
    const token = getDriveToken();
    if (!token) throw new Error('Your Google Drive session expired. Reconnect it in Files to use this file.');
    const blob = await downloadDriveFile(item.driveId, token.token);
    return new File([blob], item.name, { type: blob.type || type });
  }
  throw new Error(`"${item.name}" isn’t stored on this device. Upload it again to use it.`);
}
