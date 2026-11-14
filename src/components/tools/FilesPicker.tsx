import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Image, Film, Archive, FileCode, Check, Loader2, FolderOpen, Cloud, Folder, Lock, ChevronLeft, ChevronRight, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { loadFiles, loadFolders, type FileItem, type FileFolder } from '../../utils/fileLibrary';
import { isLibraryFileAvailable, loadLibraryFile } from '../../utils/fileStore';
import { matchesAccept } from '../../utils/acceptMatch';
import { isUnlocked, markUnlocked, verifyLock } from '../../utils/folderLock';
import { useIsMobile } from '../../hooks/useIsMobile';
import { showToastMessage } from '../../hooks/useToast';

interface Props {
  open: boolean;
  /** Accept string — only matching library files are offered */
  accept: string;
  multiple: boolean;
  onClose: () => void;
  onPick: (files: File[]) => void;
  title?: string;
  /** Adds a "From this device" row that opens the system picker instead */
  onPickFromDevice?: () => void;
}

const kind = (mime: string): { Icon: React.ElementType; color: string } => {
  if (mime === 'application/pdf') return { Icon: FileText, color: 'var(--cat-heart)' };
  if (mime.startsWith('image/')) return { Icon: Image, color: 'var(--cat-water)' };
  if (mime.startsWith('video/')) return { Icon: Film, color: 'var(--cat-mind)' };
  if (/zip|archive|tar|rar/.test(mime)) return { Icon: Archive, color: 'var(--cat-body)' };
  if (/text|json|xml/.test(mime)) return { Icon: FileCode, color: 'var(--cat-activity)' };
  return { Icon: FileText, color: 'var(--ink-faint)' };
};

const rowStyle = (active: boolean, enabled = true): React.CSSProperties => ({
  width: '100%', display: 'flex', alignItems: 'center', gap: '12px', minHeight: '64px', padding: '10px 14px', border: 'none', borderRadius: '20px', textAlign: 'left',
  cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.55,
  background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-sunken)', color: 'var(--ink)',
});
const disc = (color: string): React.CSSProperties => ({
  width: '40px', height: '40px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: `color-mix(in srgb, ${color} 14%, transparent)`, color,
});

/* Bottom sheet (dialog on desktop) for using a file already in the Files
   library: browse folders (locked ones ask for their password), pick, and the
   bytes are read from this device — or Google Drive for Drive-only files —
   and handed over as if uploaded. */
const FilesPicker = ({ open, accept, multiple, onClose, onPick, title = 'Choose from Files', onPickFromDevice }: Props) => {
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<{ folder: FileFolder; pw: string; error?: string; busy?: boolean } | null>(null);
  const [, bump] = useState(0);

  const { items, folders } = useMemo(() => {
    if (!open) return { items: [] as FileItem[], folders: [] as FileFolder[] };
    const fs = loadFolders();
    const ids = new Set(fs.map(f => f.id));
    const all = loadFiles().filter(f => !f.trashed && matchesAccept(f.name, f.mimeType, accept));
    const here = all.filter(f => (f.folderId && ids.has(f.folderId) ? f.folderId : null) === folderId);
    return { items: here, folders: folderId ? [] : fs };
  }, [open, accept, folderId]);
  const countIn = (id: string) => loadFiles().filter(f => !f.trashed && f.folderId === id && matchesAccept(f.name, f.mimeType, accept)).length;
  const current = folderId ? loadFolders().find(f => f.id === folderId) : null;

  const reset = () => { setSelected([]); setFolderId(null); setUnlocking(null); };
  const close = () => { if (!loading) { reset(); onClose(); } };
  const toggle = (item: FileItem) => {
    if (!isLibraryFileAvailable(item)) return;
    if (!multiple) { setSelected([item.id]); return; }
    setSelected(prev => prev.includes(item.id) ? prev.filter(x => x !== item.id) : [...prev, item.id]);
  };
  const openFolder = (f: FileFolder) => {
    if (f.lock && !isUnlocked(f.id)) { setUnlocking({ folder: f, pw: '' }); return; }
    setFolderId(f.id); setSelected([]);
  };
  const tryUnlock = async () => {
    if (!unlocking?.folder.lock) return;
    setUnlocking(u => u && { ...u, busy: true, error: undefined });
    if (await verifyLock(unlocking.folder.lock, unlocking.pw)) {
      markUnlocked(unlocking.folder.id);
      setFolderId(unlocking.folder.id); setUnlocking(null); setSelected([]); bump(n => n + 1);
    } else setUnlocking(u => u && { ...u, busy: false, error: 'That password isn’t right.' });
  };

  const use = async () => {
    setLoading(true);
    try {
      const chosen = loadFiles().filter(i => selected.includes(i.id));
      const files = await Promise.all(chosen.map(loadLibraryFile));
      reset();
      onPick(files);
    } catch (e) {
      showToastMessage(e instanceof Error ? e.message : 'Couldn’t open that file.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const empty = !items.length && !folders.length;

  // Portalled to <body> so it covers the app bar and tab island
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={close}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? '0 0 var(--kb, 0px)' : '24px', transition: 'padding-bottom 0.25s ease' }}
        >
          <motion.div
            role="dialog" aria-modal="true" aria-labelledby="files-picker-title"
            initial={{ y: isMobile ? '100%' : 24, opacity: isMobile ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: isMobile ? '100%' : 24, opacity: isMobile ? 1 : 0 }}
            transition={{ type: 'spring', damping: 32, stiffness: 340, mass: 0.8 }}
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', borderRadius: isMobile ? '28px 28px 0 0' : '24px', maxWidth: isMobile ? 'none' : '480px', width: '100%', paddingBottom: isMobile ? 'var(--sheet-bottom)' : 0, boxSizing: 'border-box', maxHeight: isMobile ? 'min(80dvh, calc(var(--vvh, 100dvh) - env(safe-area-inset-top) - 24px))' : '72vh', boxShadow: 'var(--shadow-floating)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {isMobile && <span aria-hidden style={{ alignSelf: 'center', width: '36px', height: '5px', borderRadius: '9999px', background: 'color-mix(in srgb, var(--ink) 18%, transparent)', flexShrink: 0, marginTop: '10px' }} />}
            <div style={{ padding: isMobile ? '12px 20px 12px' : '20px 20px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {(current || unlocking) && (
                <button type="button" aria-label="Back" onClick={() => { if (unlocking) setUnlocking(null); else { setFolderId(null); setSelected([]); } }}
                  style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '9999px', border: 'none', background: 'var(--surface-high)', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={20} />
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <h3 id="files-picker-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {unlocking ? unlocking.folder.name : current ? current.name : title}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>
                  {unlocking ? 'This folder is locked. Enter its password.' : empty ? 'Nothing here fits yet.' : current ? 'In this folder' : onPickFromDevice ? 'From your device or your Files library.' : multiple ? 'Pick one or more saved files.' : 'Pick a saved file.'}
                </p>
              </div>
            </div>

            {unlocking ? (
              <form onSubmit={e => { e.preventDefault(); void tryUnlock(); }} style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input autoFocus type="password" autoComplete="current-password" value={unlocking.pw} placeholder="Password" aria-label="Folder password"
                  onChange={e => setUnlocking({ ...unlocking, pw: e.target.value, error: undefined })}
                  style={{ width: '100%', height: '56px', padding: '0 16px', borderRadius: '16px', border: 'none', outline: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', boxSizing: 'border-box' }} />
                {unlocking.error && <p role="alert" style={{ margin: 0, fontSize: '14px', color: 'var(--danger)' }}>{unlocking.error}</p>}
                <button type="submit" className="btn-primary" disabled={!unlocking.pw || unlocking.busy} style={{ width: '100%' }}>
                  {unlocking.busy ? <Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Unlock'}
                </button>
              </form>
            ) : (<>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {onPickFromDevice && !current && (
                  <button type="button" onClick={() => { reset(); onPickFromDevice(); }} style={rowStyle(false)}>
                    <span aria-hidden style={disc('var(--accent)')}><Smartphone size={20} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', fontWeight: 600 }}>From this device</span>
                      <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>Photos, Files app and other storage</span>
                    </span>
                    <ChevronRight size={18} style={{ color: 'var(--chevron)' }} />
                  </button>
                )}
                {folders.map(f => {
                  const locked = !!f.lock && !isUnlocked(f.id);
                  return (
                    <button key={f.id} type="button" onClick={() => openFolder(f)} style={rowStyle(false)}>
                      <span aria-hidden style={disc('var(--accent)')}>{f.lock ? <Lock size={18} /> : <Folder size={20} />}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>{locked ? 'Locked' : `${countIn(f.id)} file${countIn(f.id) !== 1 ? 's' : ''}`}</span>
                      </span>
                      <ChevronRight size={18} style={{ color: 'var(--chevron)' }} />
                    </button>
                  );
                })}
                {empty ? (
                  <div style={{ padding: '20px 12px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
                    <span style={{ width: '64px', height: '64px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', marginBottom: '8px' }}><FolderOpen size={28} /></span>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)', maxWidth: '300px' }}>{current ? 'No matching files in this folder.' : 'Files you save in O-Zenith show up here, ready to use anywhere in the app.'}</p>
                    {!current && <button type="button" className="btn-secondary" onClick={() => { close(); navigate('/dashboard/files'); }} style={{ marginTop: '12px', padding: '0 28px' }}>Open Files</button>}
                  </div>
                ) : items.map(item => {
                  const { Icon, color } = kind(item.mimeType);
                  const available = isLibraryFileAvailable(item);
                  const on = selected.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => toggle(item)} disabled={!available} role={multiple ? 'checkbox' : 'radio'} aria-checked={on} style={rowStyle(on, available)}>
                      <span aria-hidden style={disc(color)}><Icon size={20} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '16px', lineHeight: '24px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>
                          {!item.onDevice && item.driveId && <Cloud size={12} style={{ flexShrink: 0 }} />}
                          {available ? `${item.date} · ${item.size}` : item.driveId ? 'In Google Drive — reconnect Drive in Files' : 'Not stored on this device'}
                        </span>
                      </span>
                      <span aria-hidden style={{ width: '24px', height: '24px', borderRadius: '9999px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--accent)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 2px var(--surface-high)', color: 'var(--on-accent)' }}>
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '12px', padding: '16px' }}>
                <button type="button" className="btn-secondary" onClick={close} disabled={loading} style={{ flex: 1 }}>Cancel</button>
                {items.length > 0 && (
                  <button type="button" className="btn-primary" onClick={use} disabled={!selected.length || loading} style={{ flex: 2 }}>
                    {loading ? <><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} />Opening…</>
                      : selected.length > 1 ? `Use ${selected.length} files` : 'Use file'}
                  </button>
                )}
              </div>
            </>)}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default FilesPicker;
