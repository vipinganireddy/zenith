// Single source of truth for the Files page's list.
//
// Previously this shape lived only inside Files.tsx, so anything that wrote a
// file elsewhere — notably SaveToDriveButton, which 47 tools use — had no way
// to record it, and tool output saved to Drive never showed up under Files.
// Both sides now read and write through here.

export type SyncState = 'local' | 'syncing' | 'synced' | 'failed';

export interface FileItem {
  id: number;
  name: string;
  size: string;
  sizeBytes: number;
  date: string;
  mimeType: string;
  starred: boolean;
  trashed: boolean;
  // Google Drive sync metadata (client-side equivalent of a files table row)
  sync?: SyncState;
  driveId?: string;
  driveLink?: string;
  /** The bytes are kept on this device (utils/fileStore.ts, IndexedDB) */
  onDevice?: boolean;
  /** Folder in the Files library (app-level organisation; absent = top level) */
  folderId?: string;
}

/** A folder in the Files library. Folders organise the list in O-Zenith only;
    they don't move anything inside Google Drive. */
export interface FileFolder {
  id: string;
  name: string;
  createdAt: string;
  /** Optional password lock (utils/folderLock.ts) — a salted hash, never the password */
  lock?: import('./folderLock').FolderLock;
}

export const FOLDERS_STORAGE_KEY = 'zenith_folders';

export function loadFolders(): FileFolder[] {
  try { return JSON.parse(localStorage.getItem(FOLDERS_STORAGE_KEY) || '[]'); } catch { return []; }
}

export function saveFolders(folders: FileFolder[]): void {
  localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
}

export const FILES_STORAGE_KEY = 'zenith_files';

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function loadFiles(): FileItem[] {
  try {
    const raw = localStorage.getItem(FILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(f => f && typeof f === 'object') : [];
  } catch {
    return [];
  }
}

export function saveFiles(files: FileItem[]): void {
  localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(files));
}

/**
 * Record a file produced by a tool so it appears under Files.
 *
 * Re-reads storage immediately before writing rather than trusting a snapshot,
 * so a save triggered from a tool page cannot clobber records written by
 * another tab. Returns the stored row.
 */
export function addFileRecord(entry: {
  name: string;
  sizeBytes: number;
  mimeType?: string;
  sync?: SyncState;
  driveId?: string;
  driveLink?: string;
}): FileItem {
  const existing = loadFiles();

  // Date.now() alone collides when two files are recorded in the same
  // millisecond (a tool that emits several outputs at once).
  let id = Date.now();
  const taken = new Set(existing.map(f => f.id));
  while (taken.has(id)) id += 1;

  const item: FileItem = {
    id,
    name: entry.name,
    size: formatSize(entry.sizeBytes),
    sizeBytes: entry.sizeBytes,
    date: formatDate(Date.now()),
    mimeType: entry.mimeType || 'application/octet-stream',
    starred: false,
    trashed: false,
    sync: entry.sync ?? 'local',
    driveId: entry.driveId,
    driveLink: entry.driveLink,
  };

  saveFiles([item, ...existing]);
  return item;
}
