import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FileText, MoreVertical, Search, UploadCloud, Star, Trash2, Archive,
  Image, Film, FileCode, Download, RotateCcw, Trash, Cloud, CheckCircle,
  AlertCircle, Loader2, Unlink, RefreshCcw, ExternalLink, Crown, Check, Minus, X,
  Smartphone, HardDrive, ChevronRight, ChevronLeft, Folder, FolderPlus, FolderInput, Eye, Pencil,
  Lock, LockOpen, KeyRound, CheckSquare, ListChecks, StarOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '../../context/SubscriptionContext';
import { useToast } from '../../hooks/useToast';
import { useIsMobile } from '../../hooks/useIsMobile';
import { isNativeApp } from '../../utils/pwa';
import {
  connectGoogleDrive, getDriveToken, getGDState, clearGDState,
  isDriveConnected, uploadFileToAppFolder, deleteFromDrive, listAppFolderFiles,
  APP_DRIVE_FOLDER, type GDState,
} from '../../utils/googleDrive';
import {
  loadFiles, saveFiles, formatSize, formatDate,
  loadFolders, saveFolders,
  type FileItem, type SyncState, type FileFolder,
} from '../../utils/fileLibrary';
import FileViewer from '../../components/files/FileViewer';
import { createLock, verifyLock, isUnlocked, markUnlocked, relock } from '../../utils/folderLock';
import { createPortal } from 'react-dom';
import { putFileBlob, getFileBlob, deleteFileBlob, loadLibraryFile, isLibraryFileAvailable } from '../../utils/fileStore';

type FileTab = 'recent' | 'starred' | 'trash';

// Google's darker brand blue: white text on it passes AA (the lighter #4285F4 is 3.6:1)
const DRIVE_BLUE = '#1A73E8';

/* Bulk-action bar button style */
const barBtn = (color?: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  minWidth: '36px', height: '36px', padding: '0 12px', borderRadius: '9999px',
  background: 'var(--surface)', border: 'none',
  color: color || 'var(--ink)',
  fontWeight: 600, fontSize: '14px', cursor: 'pointer',
});

/* Small Google-Drive backup badge shown next to synced files */
const DriveBadge = ({ state }: { state?: SyncState }) => {
  if (state === 'syncing')
    return <span title="Backing up to Google Drive…" style={{ display: 'inline-flex' }}><Loader2 size={13} color={DRIVE_BLUE} style={{ animation: 'spin 0.8s linear infinite' }} /></span>;
  if (state === 'synced')
    return <span title="Backed up to Google Drive" style={{ display: 'inline-flex' }}><Cloud size={13} color={DRIVE_BLUE} fill={DRIVE_BLUE} fillOpacity={0.15} /></span>;
  if (state === 'failed')
    return <span title="Drive backup failed — retry from the menu" style={{ display: 'inline-flex' }}><AlertCircle size={13} color="var(--danger)" /></span>;
  return null;
};

/* ── Selection checkbox (checked / unchecked / indeterminate) ── */
const Checkbox = ({ checked, indeterminate, onClick, title }: { checked: boolean; indeterminate?: boolean; onClick: (e: React.MouseEvent) => void; title?: string }) => {
  const active = checked || indeterminate;
  return (
    // 44pt target around a 22pt round box: accent fill when on, surface-high ring when off
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={title}
      onClick={onClick}
      style={{ width: '44px', height: '44px', flexShrink: 0, margin: '-11px -6px -11px -11px', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span aria-hidden style={{
        width: '22px', height: '22px', borderRadius: '9999px',
        background: active ? 'var(--accent)' : 'transparent',
        boxShadow: active ? 'none' : 'inset 0 0 0 2px var(--surface-high)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-accent)',
        transition: 'background-color var(--dur-spring) var(--ease-spring)',
      }}>
        {indeterminate ? <Minus size={14} strokeWidth={3} /> : checked ? <Check size={14} strokeWidth={3} /> : null}
      </span>
    </button>
  );
};

/* ── Reusable dropdown menu item ── */
const MenuItem = ({
  icon: Icon,
  label,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  color?: string;
  onClick: () => void;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', minHeight: '44px', padding: '0 12px', borderRadius: '12px',
        background: hovered ? 'var(--surface-high)' : 'transparent',
        border: 'none', textAlign: 'left', fontSize: '16px', fontWeight: 500,
        cursor: 'pointer', color: color || 'var(--ink)',
        display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'inherit',
      }}
    >
      <Icon size={18} />
      {label}
    </button>
  );
};

const fieldStyle: React.CSSProperties = { width: '100%', height: '52px', padding: '0 16px', borderRadius: '16px', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.1))', outline: 'none', background: 'var(--dash-input-bg, rgba(255, 255, 255, 0.05))', color: 'var(--dash-text, #ffffff)', fontSize: '15px', boxSizing: 'border-box' };

/* Timestamp ids for new uploads, bumped past any id already in use
   (several files added in the same millisecond). */
function freshIds(existing: Iterable<number>, count: number): number[] {
  const taken = new Set(existing);
  const out: number[] = [];
  let next = Date.now();
  while (out.length < count) { while (taken.has(next)) next++; taken.add(next); out.push(next); }
  return out;
}

/* Bottom sheet on phones, centred dialog on desktop — the app's one modal shape. */
const Sheet = ({ open, onClose, title, subtitle, children, mobile }: {
  open: boolean; onClose: () => void; title: string; subtitle?: React.ReactNode; children: React.ReactNode; mobile: boolean;
}) => createPortal(
  // Portalled to <body>: the page container is its own stacking layer, which
  // would otherwise trap the sheet under the app bar and tab island.
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', display: 'flex', alignItems: mobile ? 'flex-end' : 'center', justifyContent: 'center', padding: mobile ? '0 0 var(--kb, 0px)' : '24px', transition: 'padding-bottom 0.25s ease' }}
      >
        <motion.div
          role="dialog" aria-modal="true" aria-label={title}
          initial={{ y: mobile ? '100%' : 24, opacity: mobile ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: mobile ? '100%' : 24, opacity: mobile ? 1 : 0 }}
          transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
          onClick={e => e.stopPropagation()}
          style={{ background: 'var(--dash-card-bg, rgba(18, 18, 18, 0.95))', backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.12))', borderRadius: mobile ? '28px 28px 0 0' : '24px', padding: mobile ? '10px 16px calc(16px + var(--sheet-bottom))' : '24px 16px 16px', maxWidth: mobile ? 'none' : '440px', width: '100%', maxHeight: mobile ? 'min(80dvh, calc(var(--vvh, 100dvh) - env(safe-area-inset-top) - 24px))' : '75vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)', display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          {mobile && <span aria-hidden style={{ alignSelf: 'center', width: '36px', height: '5px', borderRadius: '9999px', background: 'rgba(255, 255, 255, 0.2)', flexShrink: 0, marginBottom: '10px' }} />}
          <div style={{ padding: '0 8px 8px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', lineHeight: '28px', fontWeight: 600, color: 'var(--dash-text, #ffffff)', letterSpacing: '-0.03em' }}>{title}</h3>
            {subtitle && <p style={{ margin: '2px 0 0', fontSize: '13px', lineHeight: '18px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</p>}
          </div>
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>,
  document.body,
);

/* A tappable row in a sheet: tinted icon disc, title, optional detail. */
const SheetRow = ({ icon: Icon, color = 'var(--accent)', title, detail, onClick, danger, current, disabled }: {
  icon: React.ElementType; color?: string; title: string; detail?: React.ReactNode; onClick?: () => void; danger?: boolean; current?: boolean; disabled?: boolean;
}) => (
  <button type="button" onClick={onClick} disabled={disabled || current}
    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '60px', padding: '10px 16px', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.06))', borderRadius: '20px', textAlign: 'left',
      cursor: disabled || current ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
      background: current ? 'var(--dash-pill-active-bg, rgba(255, 255, 255, 0.1))' : 'var(--dash-pill-bg, rgba(255, 255, 255, 0.04))', color: danger ? 'var(--danger)' : current ? 'var(--dash-pill-active-text, #ffffff)' : 'var(--dash-text, #ffffff)' }}>
    <span aria-hidden style={{ width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: danger ? 'rgba(239, 68, 68, 0.15)' : `color-mix(in srgb, ${color} 16%, transparent)`, color: danger ? 'var(--danger)' : color }}><Icon size={20} /></span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: '15px', lineHeight: '22px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      {detail && <span style={{ display: 'block', fontSize: '13px', lineHeight: '18px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}>{detail}</span>}
    </span>
    {current && <Check size={18} style={{ flexShrink: 0, color: 'currentColor' }} />}
  </button>
);

/* Grouped action list (Edit sheet): one rounded card per group, slim rows
   with inset hairlines — the settings-list look, not a stack of pills. */
const ActionGroup = ({ label, children }: { label?: string; children: React.ReactNode }) => (
  <div>
    {label && <p className="t-caps" style={{ margin: '0 0 6px 12px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.4))' }}>{label}</p>}
    <div style={{ background: 'var(--dash-card-bg, rgba(255, 255, 255, 0.04))', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.08))', borderRadius: '20px', overflow: 'hidden' }}>{children}</div>
  </div>
);
const ActionRow = ({ icon: Icon, title, onClick, danger, trailing, more, first }: {
  icon: React.ElementType; title: string; onClick: () => void; danger?: boolean; trailing?: React.ReactNode; more?: boolean; first?: boolean;
}) => (
  <button type="button" onClick={onClick}
    style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '52px', padding: '0 16px', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: danger ? 'var(--danger)' : 'var(--dash-text, #ffffff)' }}>
    {!first && <span aria-hidden style={{ position: 'absolute', top: 0, left: '50px', right: 0, height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />}
    <Icon size={20} style={{ flexShrink: 0, color: danger ? 'var(--danger)' : 'var(--dash-text, #ffffff)' }} />
    <span style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: '22px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
    {trailing != null && <span style={{ flexShrink: 0, fontSize: '13px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.4))' }}>{trailing}</span>}
    {more && <ChevronRight size={18} style={{ flexShrink: 0, color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.3))' }} />}
  </button>
);

const Files = () => {
  const isMobile = useIsMobile(768);
  const location = useLocation();
  const navigate = useNavigate();
  const { isPaid } = useSubscription();
  const { showToast } = useToast();

  const initialTab = (new URLSearchParams(location.search).get('tab') as FileTab) || 'recent';
  const [activeTab, setActiveTab]   = useState<FileTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [files, setFiles]           = useState<FileItem[]>(loadFiles);
  const [menuOpen, setMenuOpen]     = useState<number | null>(null);
  const [menuPos, setMenuPos]       = useState<{ x: number; y: number; canDownload: boolean } | null>(null);
  const [dragOver, setDragOver]     = useState(false);

  // ── Google Drive connection ──
  const [drive, setDrive]           = useState<GDState>(getGDState);
  const [connected, setConnected]   = useState<boolean>(isDriveConnected);
  // Files waiting for the "Save to…" choice (this device / Google Drive)
  const [pendingUpload, setPendingUpload] = useState<File[] | null>(null);
  const [selected, setSelected]     = useState<Set<number>>(new Set()); // multi-select
  // Selection circles only appear after Edit → Select; until then a tap opens the file
  const [selectMode, setSelectMode] = useState(false);

  // ── Folders (app-level organisation, see FileFolder) ──
  const [folders, setFolders]       = useState<FileFolder[]>(loadFolders);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<FileItem | null>(null);
  const [moveIds, setMoveIds]       = useState<number[] | null>(null);       // "Move to…" sheet
  const [folderActions, setFolderActions] = useState<FileFolder | null>(null); // rename / delete sheet
  const [nameSheet, setNameSheet]   = useState<{ mode: 'create' | 'rename'; folderId?: string; value: string; thenMove?: number[]; lockOn?: boolean; pw?: string; pw2?: string; error?: string } | null>(null);
  const [editOpen, setEditOpen]     = useState(false);   // the ✎ actions sheet
  // Password sheet for a locked folder: unlock to open / change it, or set / change / remove the lock
  const [lockSheet, setLockSheet]   = useState<{ mode: 'unlock' | 'set' | 'change' | 'remove'; folder: FileFolder; why?: string; then?: () => void; pw: string; pw2: string; error?: string; busy?: boolean } | null>(null);
  const [, setLockTick]             = useState(0);       // re-render after (un)locking — unlock state lives in utils/folderLock
  const bumpLocks = () => setLockTick(t => t + 1);
  // Every folder relocks when Files closes
  useEffect(() => () => relock(), []);
  useEffect(() => { saveFolders(folders); }, [folders]);

  const fileInputRef  = useRef<HTMLInputElement>(null);
  const menuRef       = useRef<HTMLDivElement>(null);

  useEffect(() => { saveFiles(files); }, [files]);

  // Re-check Drive status when returning from the OAuth flow / another tab
  useEffect(() => {
    const refresh = () => { setDrive(getGDState()); setConnected(isDriveConnected()); };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); };
  }, []);

  // Cloud files must appear here: when Drive is connected, list the app folder
  // and merge anything this browser doesn't know yet (saved from a tool page,
  // another device, or before a reinstall). Matched by driveId so nothing dupes.
  useEffect(() => {
    if (!connected) return;
    const token = getDriveToken();
    if (!token) return;
    let cancelled = false;
    listAppFolderFiles(token.token).then(remote => {
      if (cancelled || remote.length === 0) return;
      setFiles(prev => {
        const known = new Set(prev.map(f => f.driveId).filter(Boolean));
        let id = Date.now();
        const taken = new Set(prev.map(f => f.id));
        const fresh = remote.filter(r => !known.has(r.id)).map(r => {
          while (taken.has(id)) id += 1;
          taken.add(id);
          const bytes = Number(r.size ?? 0);
          const item: FileItem = {
            id: id++,
            name: r.name,
            size: formatSize(bytes),
            sizeBytes: bytes,
            date: formatDate(r.modifiedTime ? Date.parse(r.modifiedTime) : Date.now()),
            mimeType: r.mimeType || 'application/octet-stream',
            starred: false, trashed: false,
            sync: 'synced', driveId: r.id, driveLink: r.webViewLink,
          };
          return item;
        });
        return fresh.length ? [...fresh, ...prev] : prev;
      });
    }).catch(() => {}); // best-effort — local records still render
    return () => { cancelled = true; };
  }, [connected]);

  /* Close menu on outside click */
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null); setMenuPos(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  /* Close menu on scroll */
  useEffect(() => {
    const close = () => { setMenuOpen(null); setMenuPos(null); };
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, []);

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    e.stopPropagation();
    if (menuOpen === id) { setMenuOpen(null); setMenuPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const item = files.find(f => f.id === id);
    setMenuPos({ x: rect.right, y: rect.bottom, canDownload: !!item && isLibraryFileAvailable(item) });
    setMenuOpen(id);
  };

  // ── Drive connect / disconnect (managed right here in Files) ──
  const connectDrive = () => {
    setPendingUpload(null);
    connectGoogleDrive('/dashboard/files'); // redirects out to Google, returns to Files
  };
  const changeAccount = () => {
    clearGDState();
    setConnected(false);
    connectGoogleDrive('/dashboard/files');
  };
  const disconnectDrive = () => {
    clearGDState();
    setDrive(getGDState());
    setConnected(false);
    showToast('Google Drive disconnected.');
  };

  // ── Sync one file to the app's Drive folder ──
  const syncToDrive = async (item: FileItem, blob: File) => {
    const token = getDriveToken();
    if (!token) {
      setConnected(false);
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, sync: 'failed' } : f));
      return;
    }
    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, sync: 'syncing' } : f));
    try {
      const meta = await uploadFileToAppFolder(blob, item.name, token.token);
      setFiles(prev => prev.map(f => f.id === item.id
        ? { ...f, sync: 'synced', driveId: meta.id, driveLink: meta.webViewLink }
        : f));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Drive backup failed';
      if (/expired|reconnect/i.test(msg)) { clearGDState(); setConnected(false); }
      // Never lose the upload: keep it on this device instead
      const kept = await putFileBlob(item.id, blob).then(() => true, () => false);
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, sync: 'failed', onDevice: kept || f.onDevice } : f));
      showToast(kept ? `Couldn’t reach Google Drive. "${item.name}" was saved on this device instead.` : `Couldn’t save "${item.name}". Try again.`, 'error');
    }
  };

  // Upload: always ask where to keep the files — this device, or Google Drive.
  // (The native apps have no Google sign-in, so there Drive shows as unavailable.)
  const addFiles = (incoming: File[]) => { setPendingUpload(incoming); };

  const storeFiles = async (incoming: File[], dest: 'device' | 'drive') => {
    setPendingUpload(null);
    const ids = freshIds(files.map(f => f.id), incoming.length);
    const newItems: FileItem[] = incoming.map((f, i) => {
      return {
      id: ids[i],
      name: f.name,
      size: formatSize(f.size),
      sizeBytes: f.size,
      date: formatDate(Date.now()),
      mimeType: f.type,
      starred: false,
      trashed: false,
      sync: dest === 'drive' ? 'syncing' : 'local',
      onDevice: false,
      // Uploads made inside a folder land in that folder
      folderId: activeTab === 'recent' && currentFolder ? currentFolder : undefined,
      };
    });
    setFiles(prev => [...newItems, ...prev]);
    const n = incoming.length, plural = n > 1 ? 's' : '';

    if (dest === 'drive') {
      showToast(`Saving ${n} file${plural} to Google Drive…`, 'info');
      newItems.forEach((item, i) => { syncToDrive(item, incoming[i]); });
      return;
    }
    const results = await Promise.all(newItems.map((item, i) => putFileBlob(item.id, incoming[i]).then(() => true, () => false)));
    setFiles(prev => prev.map(f => {
      const k = newItems.findIndex(x => x.id === f.id);
      return k >= 0 ? { ...f, onDevice: results[k] } : f;
    }));
    const failed = results.filter(ok => !ok).length;
    showToast(failed
      ? `${failed} file${failed > 1 ? 's' : ''} couldn’t be saved — this device may be out of space.`
      : `Saved ${n} file${plural} on this device.`, failed ? 'error' : 'success');
  };

  const handleUploadClick = () => { fileInputRef.current?.click(); };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length) addFiles(picked);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) addFiles(dropped);
  };

  const retrySync = async (id: number) => {
    const item = files.find(f => f.id === id);
    setMenuOpen(null); setMenuPos(null);
    if (!item) return;
    if (!connected) { showToast('Reconnect Google Drive first, then retry.', 'info'); return; }
    const blob = item.onDevice ? await getFileBlob(id).catch(() => undefined) : undefined;
    if (!blob) { showToast('This file isn’t stored on this device. Upload it again to back it up.', 'error'); return; }
    syncToDrive(item, new File([blob], item.name, { type: item.mimeType }));
  };

  const openInDrive = (link?: string) => {
    setMenuOpen(null); setMenuPos(null);
    if (link) window.open(link, '_blank', 'noopener');
  };

  const toggleStar = (id: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, starred: !f.starred } : f));
    setMenuOpen(null); setMenuPos(null);
  };
  const toggleStarInline = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFiles(prev => prev.map(f => f.id === id ? { ...f, starred: !f.starred } : f));
  };
  const moveToTrash = (id: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, trashed: true } : f));
    setMenuOpen(null); setMenuPos(null);
  };
  const restoreFromTrash = (id: number) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, trashed: false } : f));
    setMenuOpen(null); setMenuPos(null);
  };
  // Also remove the file from Google Drive if it was backed up there
  const deleteFromDriveIfSynced = (item?: FileItem) => {
    if (!item?.driveId) return;
    const token = getDriveToken();
    if (!token) return;
    deleteFromDrive(item.driveId, token.token)
      .catch(() => showToast(`"${item.name}" removed locally, but Drive deletion failed.`));
  };

  const permanentDelete = (id: number) => {
    const item = files.find(f => f.id === id);
    deleteFromDriveIfSynced(item);
    setFiles(prev => prev.filter(f => f.id !== id));
    deleteFileBlob(id);
    setMenuOpen(null); setMenuPos(null);
    if (item?.driveId) showToast(`"${item.name}" deleted from O-Zenith and Google Drive`);
  };
  // Save a copy out of the app (the native bridge turns this into the share sheet)
  const saveOut = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const downloadFile = async (id: number) => {
    setMenuOpen(null); setMenuPos(null);
    const item = files.find(f => f.id === id);
    if (!item) return;
    try { saveOut(await loadLibraryFile(item)); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Couldn’t open that file.', 'error'); }
  };

  // ── Multi-select helpers ──
  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const clearSelection = () => { setSelected(new Set()); setSelectMode(false); };
  const switchTab = (tab: FileTab) => { setActiveTab(tab); clearSelection(); };

  const bulkStar = () => {
    setFiles(prev => prev.map(f => selected.has(f.id) ? { ...f, starred: true } : f));
    showToast(`⭐ ${selected.size} file${selected.size !== 1 ? 's' : ''} starred`);
    clearSelection();
  };
  const bulkTrash = () => {
    const n = selected.size;
    setFiles(prev => prev.map(f => selected.has(f.id) ? { ...f, trashed: true } : f));
    showToast(`${n} file${n !== 1 ? 's' : ''} moved to Trash`);
    clearSelection();
  };
  const bulkRestore = () => {
    const n = selected.size;
    setFiles(prev => prev.map(f => selected.has(f.id) ? { ...f, trashed: false } : f));
    showToast(`${n} file${n !== 1 ? 's' : ''} restored`);
    clearSelection();
  };
  const bulkDelete = () => deleteForGood([...selected]);
  const deleteForGood = (ids: number[]) => {
    const set = new Set(ids);
    const n = set.size;
    let drive = 0;
    set.forEach(id => {
      const item = files.find(f => f.id === id);
      if (item?.driveId) { deleteFromDriveIfSynced(item); drive++; }
      deleteFileBlob(id);
    });
    setFiles(prev => prev.filter(f => !set.has(f.id)));
    showToast(drive > 0
      ? `${n} file${n !== 1 ? 's' : ''} deleted — ${drive} also removed from Google Drive`
      : `${n} file${n !== 1 ? 's' : ''} deleted permanently`);
    clearSelection();
  };
  const bulkDownload = async () => {
    const items = files.filter(f => selected.has(f.id));
    clearSelection();
    let skipped = 0;
    for (const item of items) {
      try { saveOut(await loadLibraryFile(item)); } catch { skipped++; }
    }
    if (skipped) showToast(`${skipped} file${skipped > 1 ? 's' : ''} couldn’t be opened and ${skipped > 1 ? 'were' : 'was'} skipped.`, 'error');
  };

  const folderIds = useMemo(() => new Set(folders.map(f => f.id)), [folders]);
  // Locked folders that aren't open: their files stay out of every list
  const hiddenIds = new Set(folders.filter(f => f.lock && !isUnlocked(f.id)).map(f => f.id));
  const hiddenKey = [...hiddenIds].sort().join(',');
  // A file whose folder was deleted counts as top level
  const folderOf = (f: FileItem) => (f.folderId && folderIds.has(f.folderId) ? f.folderId : null);
  const visibleFiles = useMemo(() => {
    let list = files;
    if (activeTab === 'recent') {
      list = files.filter(f => !f.trashed);
      // Searching looks across every folder; otherwise show the open folder's files
      if (!searchQuery.trim()) list = list.filter(f => (f.folderId && folderIds.has(f.folderId) ? f.folderId : null) === currentFolder);
    }
    if (activeTab === 'starred') list = files.filter(f => f.starred && !f.trashed);
    if (activeTab === 'trash')   list = files.filter(f => f.trashed);
    if (searchQuery.trim()) {
      list = list.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    const hidden = new Set(hiddenKey ? hiddenKey.split(',') : []);
    return list.filter(f => !(f.folderId && hidden.has(f.folderId)));
  }, [files, activeTab, searchQuery, currentFolder, folderIds, hiddenKey]);
  const showFolders = activeTab === 'recent' && !currentFolder && !searchQuery.trim();
  const openFolder = folders.find(f => f.id === currentFolder) ?? null;
  const folderCount = (id: string) => files.filter(f => !f.trashed && f.folderId === id).length;

  // ── Folder locks ──
  // Run `then` straight away, or after the folder's password when it's locked
  const requireUnlock = (folder: FileFolder | undefined, why: string, then: () => void) => {
    if (!folder?.lock || isUnlocked(folder.id)) { then(); return; }
    setLockSheet({ mode: 'unlock', folder, why, then, pw: '', pw2: '' });
  };
  const enterFolder = (folder: FileFolder) => requireUnlock(folder, 'Enter the password to open this folder.', () => {
    if (folder.lock) markUnlocked(folder.id);
    setCurrentFolder(folder.id); clearSelection(); bumpLocks();
  });
  const leaveFolder = () => { if (currentFolder) relock(currentFolder); setCurrentFolder(null); clearSelection(); bumpLocks(); };
  const submitLock = async () => {
    if (!lockSheet || lockSheet.busy) return;
    const { mode, folder, pw, pw2 } = lockSheet;
    const fail = (error: string) => setLockSheet(l => l && { ...l, error, busy: false });
    setLockSheet(l => l && { ...l, busy: true, error: undefined });
    if (mode === 'unlock' || mode === 'remove' || mode === 'change') {
      if (!folder.lock || !(await verifyLock(folder.lock, pw))) { fail('That password isn’t right.'); return; }
    }
    if (mode === 'unlock') { const then = lockSheet.then; setLockSheet(null); then?.(); return; }
    if (mode === 'remove') {
      setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, lock: undefined } : f));
      setLockSheet(null); bumpLocks(); showToast(`Removed the password from "${folder.name}".`); return;
    }
    if (mode === 'change') { setLockSheet({ mode: 'set', folder, pw: '', pw2: '', why: 'Choose the new password.' }); return; }
    // set
    if (pw.length < 4) { fail('Use at least 4 characters.'); return; }
    if (pw !== pw2) { fail('The passwords don’t match.'); return; }
    const lock = await createLock(pw);
    setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, lock } : f));
    setLockSheet(null); bumpLocks(); showToast(`"${folder.name}" is locked with a password.`);
  };

  // ── Folder actions ──
  const newFolderId = () => (crypto.randomUUID?.() ?? `f${Date.now()}${Math.random().toString(36).slice(2, 7)}`);
  const submitName = () => {
    if (!nameSheet) return;
    const name = nameSheet.value.trim().slice(0, 60);
    if (!name) return;
    if (nameSheet.mode === 'rename' && nameSheet.folderId) {
      setFolders(prev => prev.map(f => f.id === nameSheet.folderId ? { ...f, name } : f));
      showToast(`Renamed to "${name}".`);
    } else {
      if (nameSheet.lockOn) {
        if ((nameSheet.pw ?? '').length < 4) { setNameSheet({ ...nameSheet, error: 'Use at least 4 characters for the password.' }); return; }
        if (nameSheet.pw !== nameSheet.pw2) { setNameSheet({ ...nameSheet, error: 'The passwords don’t match.' }); return; }
      }
      const sheet = nameSheet;
      setNameSheet(null);
      void (async () => {
        const folder: FileFolder = { id: newFolderId(), name, createdAt: new Date().toISOString(), ...(sheet.lockOn ? { lock: await createLock(sheet.pw!) } : {}) };
        setFolders(prev => [...prev, folder]);
        if (sheet.thenMove?.length) moveFiles(sheet.thenMove, folder.id, true);
        else showToast(sheet.lockOn ? `Created "${name}", locked with a password.` : `Created "${name}".`);
      })();
      return;
    }
    setNameSheet(null);
  };
  const moveFiles = (ids: number[], target: string | null, skipLock = false) => {
    const dest = target ? folders.find(f => f.id === target) : undefined;
    // Moving into a locked folder needs its password (the folder stays locked)
    if (!skipLock && dest?.lock && !isUnlocked(dest.id)) {
      setMoveIds(null);
      requireUnlock(dest, `Enter the password to move files into "${dest.name}".`, () => moveFiles(ids, target, true));
      return;
    }
    const set = new Set(ids);
    setFiles(prev => prev.map(f => set.has(f.id) ? { ...f, folderId: target ?? undefined } : f));
    const where = target ? `"${folders.find(f => f.id === target)?.name ?? 'the new folder'}"` : 'All files';
    showToast(`Moved ${ids.length} file${ids.length !== 1 ? 's' : ''} to ${where}.`);
    setMoveIds(null);
    clearSelection();
  };
  const deleteFolder = (folder: FileFolder, unlocked = false) => {
    if (!unlocked && folder.lock && !isUnlocked(folder.id)) {
      setFolderActions(null);
      requireUnlock(folder, 'Enter the password to delete this folder.', () => deleteFolder(folder, true));
      return;
    }
    setFolders(prev => prev.filter(f => f.id !== folder.id));
    setFiles(prev => prev.map(f => f.folderId === folder.id ? { ...f, folderId: undefined } : f));
    if (currentFolder === folder.id) setCurrentFolder(null);
    setFolderActions(null);
    showToast(`Deleted "${folder.name}". Its files are back in All files.`);
  };

  // Where a file's bytes live, said plainly
  const storageLabel = (f: FileItem): { Icon: React.ElementType; text: string } =>
    f.sync === 'syncing' ? { Icon: Loader2, text: 'Uploading to Drive…' }
    : f.onDevice && f.driveId ? { Icon: HardDrive, text: 'Device · Drive' }
    : f.onDevice ? { Icon: HardDrive, text: 'On device' }
    : f.driveId ? { Icon: Cloud, text: 'Google Drive' }
    : { Icon: AlertCircle, text: 'Not stored' };

  const trashCount = files.filter(f => f.trashed && !(f.folderId && hiddenIds.has(f.folderId))).length;
  const syncedCount = files.filter(f => f.sync === 'synced' && !f.trashed).length;

  // Selection state relative to the currently-visible list
  const selectedVisible = visibleFiles.filter(f => selected.has(f.id)).length;
  const allSelected = visibleFiles.length > 0 && selectedVisible === visibleFiles.length;
  const someSelected = selectedVisible > 0 && !allSelected;
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) visibleFiles.forEach(f => next.delete(f.id));
      else visibleFiles.forEach(f => next.add(f.id));
      return next;
    });
  };

  // File type → icon + category colour for its round disc
  const fileKind = (mimeType: string): { Icon: React.ElementType; color: string } => {
    if (mimeType === 'application/pdf') return { Icon: FileText, color: 'var(--cat-heart)' };
    if (mimeType.startsWith('image/'))  return { Icon: Image, color: 'var(--cat-water)' };
    if (mimeType.startsWith('video/'))  return { Icon: Film, color: 'var(--cat-mind)' };
    if (/zip|archive|tar|rar/.test(mimeType)) return { Icon: Archive, color: 'var(--cat-body)' };
    if (/text|json|xml/.test(mimeType)) return { Icon: FileCode, color: 'var(--cat-activity)' };
    return { Icon: FileText, color: 'var(--ink-faint)' };
  };

  // Files in a closed locked folder aren't counted — the count shouldn't leak them
  const liveCount = files.filter(f => !f.trashed && !(f.folderId && hiddenIds.has(f.folderId))).length;
  const tabs: { id: FileTab; label: string; count?: number }[] = [
    { id: 'recent',  label: 'All files' },
    { id: 'starred', label: 'Starred' },
    { id: 'trash',   label: 'Trash', count: trashCount },
  ];

  // Empty state: icon in a tinted circle, a title, one sentence, one action
  const empty = currentFolder && activeTab === 'recent' && !searchQuery
    ? { Icon: Folder, title: 'This folder is empty', text: 'Upload files here, or move files in from their menu.', action: <button type="button" className="h-10 px-6 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all border-none cursor-pointer" onClick={handleUploadClick}><UploadCloud size={16} />Upload here</button> }
    : searchQuery
    ? { Icon: Search, title: 'No matches', text: `Nothing called “${searchQuery}” in ${activeTab === 'trash' ? 'Trash' : activeTab === 'starred' ? 'Starred' : 'your files'}.`, action: <button type="button" className="h-10 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 transition-all border border-white/10 cursor-pointer" onClick={() => setSearchQuery('')}>Clear search</button> }
    : activeTab === 'starred'
    ? { Icon: Star, title: 'No starred files', text: 'Star a file from its menu to keep it here.', action: liveCount > 0 ? <button type="button" className="h-10 px-6 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 transition-all border border-white/10 cursor-pointer" onClick={() => switchTab('recent')}>View all files</button> : null }
    : activeTab === 'trash'
    ? { Icon: Trash2, title: 'Trash is empty', text: 'Files you delete wait here, so you can restore them.', action: null }
    : { Icon: UploadCloud, title: 'No files yet', text: isMobile ? 'Upload a file to keep it here.' : 'Upload a file, or drop one anywhere on this page.', action: <button type="button" className="h-10 px-6 rounded-full bg-[#0297DE] hover:bg-[#19ADFF] text-white text-sm font-medium inline-flex items-center justify-center gap-2 shrink-0 shadow-[0_0_20px_rgba(2,151,222,0.35)] transition-all border-none cursor-pointer" onClick={handleUploadClick}><UploadCloud size={16} />Upload files</button> };

  const roundIconBtn = (active = false): React.CSSProperties => ({
    flexShrink: 0, width: '40px', height: '40px', borderRadius: '9999px',
    border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.08))', padding: 0, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: active ? 'var(--dash-pill-active-bg, rgba(255, 255, 255, 0.1))' : 'var(--dash-pill-bg, rgba(255, 255, 255, 0.04))',
    color: active ? 'var(--dash-pill-active-text, #ffffff)' : 'var(--dash-text, #ffffff)',
    backdropFilter: 'blur(12px)',
  });

  const openFile = menuOpen !== null ? files.find(f => f.id === menuOpen) : null;

  return (
    <div
      className="workspace-page-container max-w-6xl mx-auto px-6 sm:px-10 mt-4 mb-8 relative z-10 w-full"
      style={{ paddingBottom: '64px', display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '24px' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Drop overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <div style={{ background: 'var(--dash-card-bg, rgba(18, 18, 18, 0.95))', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.15))', borderRadius: '24px', padding: '48px 64px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div className="spatial-portal-dropzone is-dragover my-2">
                <div className="portal-ring portal-ring-1" />
                <div className="portal-ring portal-ring-2" />
                <div className="portal-ring portal-ring-3" />
                <span style={{ width: '64px', height: '64px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dash-pill-bg, rgba(255, 255, 255, 0.12))', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.2))', color: 'var(--dash-text, #ffffff)', position: 'relative', zIndex: 1 }}><UploadCloud size={28} /></span>
              </div>
              <p style={{ margin: 0, fontSize: '20px', lineHeight: '28px', fontWeight: 600, color: 'var(--dash-text, #ffffff)', letterSpacing: '-0.03em' }}>Drop to upload</p>
              {connected && <p style={{ margin: 0, fontSize: '14px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}>They’ll back up to your Google Drive</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleInputChange} />

      {/* Header — desktop only. On phones the app bar carries the title and
          upload is the round button beside the file search. */}
      {!isMobile && (
      <div className="files-page-header">
        <h1 className="files-page-title">Files</h1>
        <button type="button" className="btn-primary" onClick={handleUploadClick} style={{ padding: '0 24px', height: '40px', fontSize: '13px' }}>
          <UploadCloud size={16} /> Upload files
        </button>
      </div>
      )}

      {/* ── Google Drive card ── */}
      {/* Drive needs Google sign-in, which the native apps don't offer (docs/MOBILE.md) */}
      {!isNativeApp() && (
      <div className="files-drive-glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span aria-hidden className="files-drive-icon-pod">
            <Cloud size={20} />
          </span>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <div style={{ fontSize: '15px', lineHeight: '22px', fontWeight: 600, color: 'var(--dash-text, #ffffff)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {connected ? <>Backing up to Google Drive <CheckCircle size={16} color="var(--success)" /></>
                : drive.linked ? 'Drive session expired'
                : isPaid ? 'Back up to Google Drive' : 'Google Drive backup'}
            </div>
            <div style={{ fontSize: '13px', lineHeight: '18px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}>
              {connected
                ? <>{drive.email ? `${drive.email} · ` : ''}{syncedCount > 0 ? `${syncedCount} backed up` : 'Pick Google Drive when you upload'}</>
                : drive.linked
                  // Linked, but the 1-hour OAuth token lapsed: a session refresh, NOT a new link.
                  ? <>{drive.email ? `${drive.email} is still linked.` : 'Your Drive is still linked.'} Google sessions last an hour.</>
                  : isPaid ? <>Every upload is saved to a “{APP_DRIVE_FOLDER}” folder in your Drive.</>
                  : 'Included with PRO.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', ...(isMobile ? { width: '100%' } : {}) }}>
          {connected ? (<>
            <button type="button" onClick={changeAccount} className="files-drive-btn" style={{ flex: isMobile ? 1 : undefined }}><RefreshCcw size={15} /> Change account</button>
            <button type="button" onClick={disconnectDrive} className="files-drive-btn" style={{ flex: isMobile ? 1 : undefined, color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.2)' }}><Unlink size={15} /> Disconnect</button>
          </>) : drive.linked ? (
            <button type="button" onClick={connectDrive} className="btn-primary" style={{ padding: '0 20px', height: '36px', fontSize: '13px', flex: isMobile ? 1 : undefined }}><RefreshCcw size={15} /> Resume session</button>
          ) : isPaid ? (
            <button type="button" onClick={connectDrive} className="btn-primary" style={{ padding: '0 20px', height: '36px', fontSize: '13px', flex: isMobile ? 1 : undefined }}><Cloud size={15} /> Connect Google Drive</button>
          ) : (
            <button type="button" onClick={() => navigate('/dashboard/subscription')} className="btn-primary" style={{ padding: '0 20px', height: '36px', fontSize: '13px', flex: isMobile ? 1 : undefined }}><Crown size={15} /> Upgrade to PRO</button>
          )}
        </div>
      </div>
      )}

      {/* ── Tabs (segmented) & search ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div className="segmented" role="tablist" aria-label="Files" style={{ flex: isMobile ? '1 1 100%' : '0 0 auto', minWidth: isMobile ? 0 : '320px' }}>
          {tabs.map(tab => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => switchTab(tab.id)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  zIndex: 1,
                  background: 'transparent',
                }}
              >
                {isSelected && (
                  <motion.div
                    layoutId="files-tab-pill"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '12px',
                      background: 'var(--dash-pill-active-bg, #ffffff)',
                      boxShadow: '0 0 20px rgba(255, 255, 255, 0.28)',
                      zIndex: -1,
                    }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 2, color: isSelected ? 'var(--dash-pill-active-text, #000000)' : 'var(--ink-muted)', fontWeight: isSelected ? 600 : 500 }}>
                  {tab.label}
                </span>
                {!!tab.count && (
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 2,
                      minWidth: '20px',
                      height: '20px',
                      padding: '0 6px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      lineHeight: '20px',
                      fontWeight: 700,
                      background: isSelected ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                      color: isSelected ? 'var(--on-accent, #000000)' : 'var(--ink)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, minWidth: isMobile ? '100%' : '240px', justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: isMobile ? undefined : '320px' }}>
            <Search size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.4))', pointerEvents: 'none' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files"
              aria-label="Search files"
              style={{ width: '100%', height: '40px', padding: '0 16px 0 42px', borderRadius: '9999px', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.08))', outline: 'none', background: 'var(--dash-input-bg, rgba(255, 255, 255, 0.04))', boxSizing: 'border-box', color: 'var(--dash-text, #ffffff)', fontSize: '13px', backdropFilter: 'blur(16px)' }}
            />
          </div>
          {/* Phones: upload sits beside the search (desktop has its header button); not in Trash */}
          {isMobile && activeTab !== 'trash' && (
            <button type="button" onClick={handleUploadClick} aria-label="Upload files" style={roundIconBtn(true)}>
              <UploadCloud size={16} />
            </button>
          )}
          {/* One edit button holds the list actions (select, folders, star, trash…) */}
          <button type="button" onClick={() => setEditOpen(true)} disabled={selectMode} aria-label="Edit" aria-haspopup="dialog"
            style={{ ...roundIconBtn(true), opacity: selectMode ? 0.4 : 1, cursor: selectMode ? 'default' : 'pointer' }}>
            <Pencil size={16} />
          </button>
        </div>
      </div>

      {/* ── File list ── */}
      <section>
        {/* Section label, or the bulk-action bar while files are selected */}
        <div style={{ minHeight: selectMode || openFolder ? '44px' : '24px', marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
          {selectMode ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', width: '100%', padding: '4px 4px 4px 12px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
            >
              <Checkbox checked={allSelected} indeterminate={someSelected} onClick={toggleSelectAll} title={allSelected ? 'Deselect all' : 'Select all'} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginRight: 'auto', marginLeft: '6px' }}>{selectedVisible ? `${selectedVisible} selected` : 'Select files'}</span>
              {selectedVisible === 0 ? null : activeTab === 'trash' ? (
                <>
                  <button type="button" onClick={bulkRestore} style={barBtn()}><RotateCcw size={16} /> Restore</button>
                  <button type="button" onClick={bulkDelete} style={barBtn('var(--danger)')}><Trash size={16} /> Delete</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setMoveIds(visibleFiles.filter(f => selected.has(f.id)).map(f => f.id))} style={barBtn()} aria-label="Move selected to a folder"><FolderInput size={16} />{!isMobile && ' Move'}</button>
                  <button type="button" onClick={bulkDownload} style={barBtn()} aria-label="Download selected"><Download size={16} />{!isMobile && ' Download'}</button>
                  <button type="button" onClick={bulkStar} style={barBtn()} aria-label="Star selected"><Star size={16} />{!isMobile && ' Star'}</button>
                  <button type="button" onClick={bulkTrash} style={barBtn('var(--danger)')} aria-label="Move selected to trash"><Trash2 size={16} />{!isMobile && ' Trash'}</button>
                </>
              )}
              <button type="button" onClick={clearSelection} aria-label="Done selecting" style={{ ...roundIconBtn(), width: '36px', height: '36px', color: 'var(--ink)' }}><X size={16} /></button>
            </motion.div>
          ) : openFolder && activeTab === 'recent' && !searchQuery ? (
            // Inside a folder: back to All files · folder name · folder options
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button type="button" onClick={leaveFolder} aria-label="Back to All files" style={{ ...roundIconBtn(true), width: '40px', height: '40px', color: 'var(--ink)' }}><ChevronLeft size={20} /></button>
              <span aria-hidden style={{ color: 'var(--accent)', display: 'flex' }}>{openFolder.lock ? <LockOpen size={18} /> : <Folder size={18} />}</span>
              <h2 style={{ margin: 0, minWidth: 0, fontSize: '16px', lineHeight: '24px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{openFolder.name}</h2>
            </div>
          ) : (
            <h2 className="t-caps" style={{ margin: '0 0 0 16px', color: 'var(--ink-faint)', flex: 1 }}>
              {activeTab === 'recent' ? (searchQuery.trim() ? 'Results' : `All files${liveCount ? ` · ${liveCount}` : ''}`) : activeTab === 'starred' ? 'Starred' : `Trash${trashCount ? ` · ${trashCount}` : ''}`}
            </h2>
          )}
        </div>

        {showFolders && folders.length > 0 && (
          <div style={{ background: 'var(--dash-card-bg, rgba(255, 255, 255, 0.03))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.08))', borderRadius: '24px', overflow: 'hidden', marginBottom: '12px' }}>
            {folders.map((folder, i) => {
              const n = folderCount(folder.id);
              const locked = !!folder.lock;
              return (
                <div key={folder.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: '64px', padding: '0 8px 0 0' }}>
                  {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 0, left: '68px', right: '16px', height: '1px', background: 'var(--dash-border-subtle, rgba(255, 255, 255, 0.06))' }} />}
                  <button type="button" onClick={() => enterFolder(folder)} aria-label={locked ? `${folder.name}, locked` : folder.name}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '14px', minHeight: '64px', padding: '10px 4px 10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--dash-text, #ffffff)' }}>
                    <span aria-hidden style={{ width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dash-pill-bg, rgba(255, 255, 255, 0.08))', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.1))', color: 'var(--dash-text, #ffffff)' }}>{locked ? <Lock size={18} /> : <Folder size={20} />}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '15px', lineHeight: '22px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                      <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.45))' }}>{locked ? 'Locked with a password' : `${n} file${n !== 1 ? 's' : ''}`}</span>
                    </span>
                    <ChevronRight size={18} style={{ flexShrink: 0, color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.3))' }} />
                  </button>
                  <button type="button" onClick={() => setFolderActions(folder)} aria-label={`Options for ${folder.name}`} style={{ ...roundIconBtn(), color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}><MoreVertical size={18} /></button>
                </div>
              );
            })}
          </div>
        )}

        {visibleFiles.length === 0 && !(showFolders && folders.length > 0) ? (
          <div className="w-full min-h-[320px] rounded-[24px] p-8 sm:p-10 flex flex-col items-center justify-center text-center bg-white/[0.02] border border-white/[0.08] backdrop-blur-[24px]">
            <div className="w-14 h-14 shrink-0 aspect-square rounded-2xl bg-[#0297DE]/12 border border-[#0297DE]/25 text-[#38BDF8] flex items-center justify-center mb-5 relative overflow-hidden">
              <empty.Icon size={24} className="w-6 h-6 shrink-0 static text-[#38BDF8]" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white leading-snug mb-1.5 m-0">
              {empty.title}
            </h3>
            <p className="text-sm text-slate-500 dark:text-white/55 max-w-xs leading-relaxed mb-6 m-0">
              {empty.text}
            </p>
            {empty.action && (
              <div className="flex justify-center">
                {empty.action}
              </div>
            )}
          </div>
        ) : visibleFiles.length === 0 ? null : (
          <div style={{ background: 'var(--dash-card-bg, rgba(255, 255, 255, 0.03))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--dash-card-border, rgba(255, 255, 255, 0.08))', borderRadius: '24px', overflow: 'hidden' }}>
            <AnimatePresence initial={false}>
              {visibleFiles.map((file, i) => {
                const { Icon } = fileKind(file.mimeType);
                const isSel = selected.has(file.id);
                return (
                  <motion.div key={file.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '68px', padding: '10px 8px 10px 12px', background: isSel ? 'var(--dash-pill-bg, rgba(255, 255, 255, 0.08))' : 'transparent' }}>
                    {i > 0 && <span aria-hidden style={{ position: 'absolute', top: 0, left: selectMode ? '108px' : '64px', right: '16px', height: '1px', background: 'var(--dash-border-subtle, rgba(255, 255, 255, 0.06))' }} />}
                    {selectMode && <Checkbox checked={isSel} onClick={e => toggleSelect(file.id, e)} title={isSel ? 'Deselect file' : 'Select file'} />}
                    {/* Tap the file to open it — or, while selecting, to tick it */}
                    <button type="button" onClick={e => (selectMode ? toggleSelect(file.id, e) : setViewerItem(file))} aria-label={selectMode ? `${isSel ? 'Deselect' : 'Select'} ${file.name}` : `Open ${file.name}`} aria-pressed={selectMode ? isSel : undefined}
                      style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
                    <span aria-hidden style={{ width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--dash-pill-bg, rgba(255, 255, 255, 0.06))', border: '1px solid var(--dash-border-subtle, rgba(255, 255, 255, 0.08))', color: 'var(--dash-text, #ffffff)' }}>
                      <Icon size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                        <span className="truncate max-w-[180px] sm:max-w-xs md:max-w-md" style={{ fontSize: '15px', lineHeight: '22px', fontWeight: 500, color: 'var(--dash-text, #ffffff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                        {file.sync === 'failed' && <DriveBadge state={file.sync} />}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', lineHeight: '16px', color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.45))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isMobile && file.starred && <Star size={12} fill="currentColor" color="var(--dash-star-color, #FF9A76)" aria-label="Starred" style={{ flexShrink: 0 }} />}
                        {(() => { const st = storageLabel(file); return (
                          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '0 6px', borderRadius: '9999px', fontWeight: 600,
                            background: st.text === 'Not stored' ? 'rgba(239, 68, 68, 0.15)' : file.driveId && !file.onDevice ? 'rgba(26, 115, 232, 0.15)' : 'var(--dash-pill-bg, rgba(255, 255, 255, 0.06))',
                            color: st.text === 'Not stored' ? 'var(--danger)' : file.driveId && !file.onDevice ? DRIVE_BLUE : 'var(--dash-text-muted, rgba(255, 255, 255, 0.6))' }}>
                            <st.Icon size={11} style={st.Icon === Loader2 ? { animation: 'spin 0.8s linear infinite' } : undefined} /> {st.text}
                          </span>); })()}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {file.size} · {file.date}{(searchQuery.trim() || activeTab !== 'recent') && folderOf(file) ? ` · in ${folders.find(f => f.id === folderOf(file))?.name}` : ''}
                        </span>
                      </div>
                    </div>
                    </button>
                    {/* Phones star from the menu, so the name keeps the row's width */}
                    {activeTab !== 'trash' && !isMobile && (
                      <button type="button" onClick={e => toggleStarInline(file.id, e)} aria-label={file.starred ? `Unstar ${file.name}` : `Star ${file.name}`} aria-pressed={!!file.starred}
                        style={{ ...roundIconBtn(), color: file.starred ? 'var(--dash-star-color, #FF9A76)' : 'var(--dash-text-muted, rgba(255, 255, 255, 0.3))' }}>
                        <Star size={18} fill={file.starred ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    <button type="button" onClick={e => openMenu(e, file.id)} aria-label={`More options for ${file.name}`} aria-haspopup="menu" aria-expanded={menuOpen === file.id}
                      style={{ ...roundIconBtn(menuOpen === file.id), color: 'var(--dash-text-muted, rgba(255, 255, 255, 0.5))' }}>
                      <MoreVertical size={18} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Drag hint (desktop) */}
      {!isMobile && liveCount > 0 && activeTab === 'recent' && (
        <p style={{ margin: 0, textAlign: 'center', fontSize: '14px', color: 'var(--ink-faint)' }}>
          Drop files anywhere on this page to upload more{connected ? '. They back up to Google Drive.' : '.'}
        </p>
      )}

      {/* ── "Save to…" sheet: where new uploads are kept ── */}
      {createPortal(<AnimatePresence>
        {pendingUpload && (() => {
          const n = pendingUpload.length;
          const driveReady = connected && isPaid;
          const option = (opts: { icon: React.ElementType; color: string; title: string; text: React.ReactNode; onClick: () => void; trailing?: React.ReactNode; muted?: boolean }) => (
            <button type="button" onClick={opts.onClick}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', minHeight: '76px', padding: '12px 16px', border: 'none', borderRadius: '20px', cursor: 'pointer', textAlign: 'left', background: 'var(--surface-sunken)', color: 'var(--ink)' }}>
              <span aria-hidden style={{ width: '44px', height: '44px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${opts.color} 16%, transparent)`, color: opts.color, opacity: opts.muted ? 0.7 : 1 }}>
                <opts.icon size={22} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', fontWeight: 600 }}>{opts.title}</span>
                <span style={{ display: 'block', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)', overflowWrap: 'anywhere' }}>{opts.text}</span>
              </span>
              {opts.trailing ?? <ChevronRight size={20} style={{ flexShrink: 0, color: 'var(--chevron)' }} />}
            </button>
          );
          const pill = (label: string, bg: string, fg: string) => (
            <span style={{ flexShrink: 0, height: '32px', padding: '0 12px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', fontSize: '14px', fontWeight: 600, background: bg, color: fg }}>{label}</span>
          );
          return (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPendingUpload(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? '0 0 var(--kb, 0px)' : '24px', transition: 'padding-bottom 0.25s ease' }}
            >
              <motion.div
                role="dialog" aria-modal="true" aria-labelledby="save-to-title"
                initial={{ y: isMobile ? '100%' : 24, opacity: isMobile ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: isMobile ? '100%' : 24, opacity: isMobile ? 1 : 0 }}
                transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--surface)', borderRadius: isMobile ? '28px 28px 0 0' : '24px', padding: isMobile ? '10px 16px calc(16px + var(--sheet-bottom))' : '24px 16px 16px', maxWidth: isMobile ? 'none' : '440px', width: '100%', boxShadow: 'var(--shadow-floating)', display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {isMobile && <span aria-hidden style={{ alignSelf: 'center', width: '36px', height: '5px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--ink) 18%, transparent)', flexShrink: 0, marginBottom: '10px' }} />}
                <div style={{ padding: '0 8px 8px' }}>
                  <h3 id="save-to-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>
                    Save {n === 1 ? 'this file' : `${n} files`} to…
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n === 1 ? pendingUpload[0].name : pendingUpload.map(f => f.name).join(', ')}
                  </p>
                </div>

                {option({
                  icon: isMobile ? Smartphone : HardDrive, color: 'var(--accent)',
                  title: 'This device',
                  text: `Kept in O-Zenith on this ${isMobile ? 'phone' : 'computer'}. Works offline.`,
                  onClick: () => storeFiles(pendingUpload, 'device'),
                })}

                {isNativeApp()
                  ? option({ icon: Cloud, color: DRIVE_BLUE, muted: true, title: 'Google Drive',
                      text: 'Not available in the phone app yet. Link Drive on the O-Zenith website to back up there.',
                      trailing: <span />, onClick: () => showToast('Google Drive is available on the O-Zenith website.', 'info') })
                  : driveReady
                  ? option({ icon: Cloud, color: DRIVE_BLUE, title: 'Google Drive', text: <>Saved to “{APP_DRIVE_FOLDER}”{drive.email ? ` in ${drive.email}` : ''}.</>, onClick: () => storeFiles(pendingUpload, 'drive') })
                  : isPaid
                    ? option({ icon: Cloud, color: DRIVE_BLUE, muted: true, title: 'Google Drive',
                        text: drive.linked ? 'Your Drive session expired. Resume it, then upload again.' : 'Link your Drive, then upload again.',
                        trailing: pill(drive.linked ? 'Resume' : 'Connect', DRIVE_BLUE, '#FFFFFF'), onClick: connectDrive })
                    : option({ icon: Cloud, color: DRIVE_BLUE, muted: true, title: 'Google Drive', text: 'Back up your uploads to your own Drive.',
                        trailing: pill('PRO', 'var(--accent)', 'var(--on-accent)'), onClick: () => { setPendingUpload(null); navigate('/dashboard/subscription'); } })}

                <button type="button" className="btn-secondary" onClick={() => setPendingUpload(null)} style={{ width: '100%', marginTop: '8px' }}>Cancel</button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>, document.body)}

      {/* ── "Move to…" sheet ── */}
      <Sheet open={!!moveIds} onClose={() => setMoveIds(null)} mobile={isMobile}
        title={moveIds && moveIds.length > 1 ? `Move ${moveIds.length} files to…` : 'Move to…'}
        subtitle={moveIds?.length === 1 ? files.find(f => f.id === moveIds[0])?.name : undefined}>
        {(() => {
          const sources = new Set((moveIds ?? []).map(id => folderOf(files.find(f => f.id === id)!) ?? '__root'));
          const onlyIn = sources.size === 1 ? [...sources][0] : null;
          return (<>
            <SheetRow icon={FileText} title="All files" detail="Not in a folder" current={onlyIn === '__root'} onClick={() => moveIds && moveFiles(moveIds, null)} />
            {folders.map(f => (
              <SheetRow key={f.id} icon={f.lock ? Lock : Folder} title={f.name} detail={f.lock && !isUnlocked(f.id) ? 'Locked — needs the password' : `${folderCount(f.id)} file${folderCount(f.id) !== 1 ? 's' : ''}`} current={onlyIn === f.id} onClick={() => moveIds && moveFiles(moveIds, f.id)} />
            ))}
            <SheetRow icon={FolderPlus} title="New folder" detail="Create one and move here" onClick={() => { setNameSheet({ mode: 'create', value: '', thenMove: moveIds ?? undefined }); setMoveIds(null); }} />
            <button type="button" className="btn-secondary" onClick={() => setMoveIds(null)} style={{ width: '100%', marginTop: '8px' }}>Cancel</button>
          </>);
        })()}
      </Sheet>

      {/* ── Folder options ── */}
      <Sheet open={!!folderActions} onClose={() => setFolderActions(null)} mobile={isMobile}
        title={folderActions?.name ?? ''} subtitle={folderActions ? (folderActions.lock && !isUnlocked(folderActions.id) ? 'Locked' : `${folderCount(folderActions.id)} file${folderCount(folderActions.id) !== 1 ? 's' : ''}`) : undefined}>
        {folderActions && (<>
          <SheetRow icon={Pencil} title="Rename" onClick={() => { const f = folderActions; setFolderActions(null); requireUnlock(f, 'Enter the password to rename this folder.', () => setNameSheet({ mode: 'rename', folderId: f.id, value: f.name })); }} />
          {folderActions.lock ? (<>
            <SheetRow icon={KeyRound} title="Change password" onClick={() => { const f = folderActions; setFolderActions(null); setLockSheet({ mode: 'change', folder: f, pw: '', pw2: '', why: 'Enter the current password.' }); }} />
            <SheetRow icon={LockOpen} title="Remove password" detail="Anyone using this device can open it" onClick={() => { const f = folderActions; setFolderActions(null); setLockSheet({ mode: 'remove', folder: f, pw: '', pw2: '', why: 'Enter the password to remove the lock.' }); }} />
          </>) : (
            <SheetRow icon={Lock} title="Lock with password" detail="Needed to open this folder" onClick={() => { const f = folderActions; setFolderActions(null); setLockSheet({ mode: 'set', folder: f, pw: '', pw2: '' }); }} />
          )}
          <SheetRow icon={Trash2} danger title="Delete folder" detail="Files inside move back to All files" onClick={() => deleteFolder(folderActions)} />
          <button type="button" className="btn-secondary" onClick={() => setFolderActions(null)} style={{ width: '100%', marginTop: '8px' }}>Cancel</button>
        </>)}
      </Sheet>

      {/* ── New folder / rename ── */}
      <Sheet open={!!nameSheet} onClose={() => setNameSheet(null)} mobile={isMobile}
        title={nameSheet?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        subtitle={nameSheet?.thenMove?.length ? `Then move ${nameSheet.thenMove.length} file${nameSheet.thenMove.length !== 1 ? 's' : ''} into it` : undefined}>
        {nameSheet && (
          <form onSubmit={e => { e.preventDefault(); submitName(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 8px' }}>
            <input autoFocus value={nameSheet.value} maxLength={60} placeholder="Folder name" aria-label="Folder name"
              onChange={e => setNameSheet({ ...nameSheet, value: e.target.value, error: undefined })}
              style={fieldStyle} />
            {nameSheet.mode === 'create' && (<>
              <button type="button" role="switch" aria-checked={!!nameSheet.lockOn} onClick={() => setNameSheet({ ...nameSheet, lockOn: !nameSheet.lockOn, error: undefined })}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '52px', padding: '0 14px', border: 'none', borderRadius: '16px', background: 'var(--surface-sunken)', cursor: 'pointer', color: 'var(--ink)', textAlign: 'left' }}>
                <Lock size={18} style={{ color: 'var(--accent)' }} />
                <span style={{ flex: 1, fontSize: '16px', fontWeight: 600 }}>Lock with password</span>
                <span aria-hidden style={{ width: '44px', height: '26px', borderRadius: '9999px', padding: '3px', boxSizing: 'border-box', background: nameSheet.lockOn ? 'var(--accent)' : 'var(--surface-high)', transition: 'background-color var(--dur-spring) var(--ease-spring)' }}>
                  <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '9999px', background: 'var(--surface)', transform: nameSheet.lockOn ? 'translateX(18px)' : 'none', transition: 'transform var(--dur-spring) var(--ease-spring)' }} />
                </span>
              </button>
              {nameSheet.lockOn && (<>
                <input type="password" autoComplete="new-password" value={nameSheet.pw ?? ''} placeholder="Password" aria-label="Folder password" onChange={e => setNameSheet({ ...nameSheet, pw: e.target.value, error: undefined })} style={fieldStyle} />
                <input type="password" autoComplete="new-password" value={nameSheet.pw2 ?? ''} placeholder="Repeat password" aria-label="Repeat folder password" onChange={e => setNameSheet({ ...nameSheet, pw2: e.target.value, error: undefined })} style={fieldStyle} />
                <p style={{ margin: 0, fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>The folder stays closed in O-Zenith until the password is entered. It’s saved on this device only and can’t be recovered — and the files aren’t encrypted.</p>
              </>)}
            </>)}
            {nameSheet.error && <p role="alert" style={{ margin: 0, fontSize: '14px', color: 'var(--danger)' }}>{nameSheet.error}</p>}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn-secondary" onClick={() => setNameSheet(null)} style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!nameSheet.value.trim()} style={{ flex: 2 }}>{nameSheet.mode === 'rename' ? 'Save' : 'Create'}</button>
            </div>
          </form>
        )}
      </Sheet>

      {/* ── Folder password ── */}
      <Sheet open={!!lockSheet} onClose={() => setLockSheet(null)} mobile={isMobile}
        title={lockSheet ? (lockSheet.mode === 'set' ? `Lock "${lockSheet.folder.name}"` : lockSheet.mode === 'remove' ? 'Remove password' : lockSheet.mode === 'change' ? 'Change password' : `"${lockSheet.folder.name}" is locked`) : ''}
        subtitle={lockSheet?.why ?? (lockSheet?.mode === 'set' ? 'Needed to open, change or move files into it.' : undefined)}>
        {lockSheet && (
          <form onSubmit={e => { e.preventDefault(); void submitLock(); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 8px' }}>
            <input autoFocus type="password" autoComplete={lockSheet.mode === 'set' ? 'new-password' : 'current-password'} value={lockSheet.pw}
              placeholder={lockSheet.mode === 'set' ? 'New password' : 'Password'} aria-label="Password"
              onChange={e => setLockSheet({ ...lockSheet, pw: e.target.value, error: undefined })} style={fieldStyle} />
            {lockSheet.mode === 'set' && (
              <input type="password" autoComplete="new-password" value={lockSheet.pw2} placeholder="Repeat password" aria-label="Repeat password"
                onChange={e => setLockSheet({ ...lockSheet, pw2: e.target.value, error: undefined })} style={fieldStyle} />
            )}
            {lockSheet.mode === 'set' && <p style={{ margin: 0, fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>Saved on this device only and can’t be recovered. The folder stays closed in O-Zenith; its files aren’t encrypted.</p>}
            {lockSheet.error && <p role="alert" style={{ margin: 0, fontSize: '14px', color: 'var(--danger)' }}>{lockSheet.error}</p>}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn-secondary" onClick={() => setLockSheet(null)} style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!lockSheet.pw || lockSheet.busy || (lockSheet.mode === 'set' && !lockSheet.pw2)} style={{ flex: 2 }}>
                {lockSheet.busy ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> : lockSheet.mode === 'set' ? 'Lock folder' : lockSheet.mode === 'remove' ? 'Remove password' : lockSheet.mode === 'change' ? 'Continue' : 'Unlock'}
              </button>
            </div>
          </form>
        )}
      </Sheet>

      {/* ── Edit (✎) — list actions for the current view ── */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} mobile={isMobile} title="Edit"
        subtitle={openFolder && activeTab === 'recent' ? openFolder.name : activeTab === 'trash' ? 'Trash' : activeTab === 'starred' ? 'Starred' : 'All files'}>
        {(() => {
          const close = () => setEditOpen(false);
          const ids = visibleFiles.map(f => f.id);
          const n = ids.length;
          const plural = (k: number) => `${k} file${k !== 1 ? 's' : ''}`;
          const inFolder = !!openFolder && activeTab === 'recent';
          const groups: { label?: string; rows: { key: string; icon: React.ElementType; title: string; onClick: () => void; danger?: boolean; trailing?: React.ReactNode; more?: boolean }[] }[] = [];

          if (n) groups.push({ rows: [
            { key: 'sel', icon: CheckSquare, title: 'Select files', onClick: () => { setSelected(new Set()); setSelectMode(true); close(); } },
            ...(n > 1 ? [{ key: 'selall', icon: ListChecks, title: 'Select all', trailing: n, onClick: () => { setSelected(new Set(ids)); setSelectMode(true); close(); } }] : []),
          ] });

          if (activeTab === 'trash') {
            if (n) groups.push({ rows: [
              { key: 'restore', icon: RotateCcw, title: 'Restore all', onClick: () => { const set = new Set(ids); setFiles(prev => prev.map(f => set.has(f.id) ? { ...f, trashed: false } : f)); showToast(`Restored ${plural(n)}.`); close(); } },
              { key: 'empty', icon: Trash, danger: true, title: 'Empty trash', onClick: () => { if (!window.confirm(`Delete ${plural(n)} for good?`)) return; close(); deleteForGood(ids); } },
            ] });
          } else {
            const organise = [];
            if (activeTab === 'recent' && !openFolder) organise.push({ key: 'new', icon: FolderPlus, title: 'New folder', more: true, onClick: () => { close(); setNameSheet({ mode: 'create', value: '' }); } });
            if (n) {
              const allStarred = visibleFiles.every(f => f.starred);
              organise.push({ key: 'star', icon: allStarred ? StarOff : Star, title: allStarred ? 'Unstar all' : 'Star all', onClick: () => { const set = new Set(ids); setFiles(prev => prev.map(f => set.has(f.id) ? { ...f, starred: !allStarred } : f)); showToast(allStarred ? 'Unstarred.' : `Starred ${plural(n)}.`); close(); } });
              organise.push({ key: 'move', icon: FolderInput, title: 'Move all to folder', more: true, onClick: () => { close(); setMoveIds(ids); } });
            }
            if (organise.length) groups.push({ rows: organise });
            if (inFolder) {
              const f = openFolder!;
              groups.push({ label: 'This folder', rows: [
                { key: 'rename', icon: Pencil, title: 'Rename', more: true, onClick: () => { close(); setNameSheet({ mode: 'rename', folderId: f.id, value: f.name }); } },
                f.lock
                  ? { key: 'lock', icon: KeyRound, title: 'Password', more: true, onClick: () => { close(); setFolderActions(f); } }
                  : { key: 'lock', icon: Lock, title: 'Lock with password', more: true, onClick: () => { close(); setLockSheet({ mode: 'set', folder: f, pw: '', pw2: '' }); } },
                { key: 'del', icon: Trash2, danger: true, title: 'Delete folder', onClick: () => { close(); deleteFolder(f, true); } },
              ] });
            }
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {groups.length === 0
                ? <p style={{ margin: 0, padding: '0 8px', fontSize: '14px', color: 'var(--ink-muted)' }}>Nothing to edit here yet.</p>
                : groups.map((g, gi) => (
                  <ActionGroup key={gi} label={g.label}>
                    {g.rows.map(({ key, ...r }, i) => <ActionRow key={key} first={i === 0} {...r} />)}
                  </ActionGroup>
                ))}
              <button type="button" className="btn-secondary" onClick={close} style={{ width: '100%' }}>Done</button>
            </div>
          );
        })()}
      </Sheet>

      {/* ── Viewer ── */}
      {createPortal(<AnimatePresence>
        {viewerItem && <FileViewer key={viewerItem.id} item={viewerItem} onClose={() => setViewerItem(null)} onSaveOut={saveOut} />}
      </AnimatePresence>, document.body)}

      {/* ── File menu (fixed position) ── */}
      <AnimatePresence>
        {menuOpen !== null && menuPos && openFile && (
          <motion.div
            ref={menuRef}
            key="file-menu"
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'fixed', right: window.innerWidth - menuPos.x, top: menuPos.y + 6,
              zIndex: 9999, background: 'var(--surface)', borderRadius: '16px',
              boxShadow: 'var(--shadow-floating)', minWidth: '220px', overflow: 'hidden', padding: '6px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <MenuItem icon={Eye} label="Open" onClick={() => { setMenuOpen(null); setMenuPos(null); setViewerItem(openFile); }} />
            {openFile.trashed ? (
              <>
                <MenuItem icon={RotateCcw} label="Restore" onClick={() => restoreFromTrash(openFile.id)} />
                <MenuItem icon={Trash} label="Delete forever" color="var(--danger)" onClick={() => permanentDelete(openFile.id)} />
              </>
            ) : (
              <>
                {openFile.driveLink && (
                  <MenuItem icon={ExternalLink} label="Open in Drive" onClick={() => openInDrive(openFile.driveLink)} />
                )}
                {openFile.sync === 'failed' && (
                  <MenuItem icon={RefreshCcw} label="Retry Drive backup" onClick={() => retrySync(openFile.id)} />
                )}
                {menuPos.canDownload && (
                  <MenuItem icon={Download} label={isNativeApp() ? 'Save or share' : 'Download'} onClick={() => downloadFile(openFile.id)} />
                )}
                <MenuItem icon={FolderInput} label="Move to folder…" onClick={() => { setMenuOpen(null); setMenuPos(null); setMoveIds([openFile.id]); }} />
                <MenuItem icon={Star} label={openFile.starred ? 'Unstar' : 'Star'} onClick={() => toggleStar(openFile.id)} />
                <MenuItem icon={Trash2} label="Move to trash" color="var(--danger)" onClick={() => moveToTrash(openFile.id)} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Files;
