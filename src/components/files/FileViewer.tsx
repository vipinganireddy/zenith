import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Share2, Download, Loader2, FileQuestion, AlertCircle, HardDrive, Cloud, FileArchive } from 'lucide-react';
import type { FileItem } from '../../utils/fileLibrary';
import { loadLibraryFile } from '../../utils/fileStore';
import { previewKind, type PreviewKind } from '../../utils/fileKind';
import { isNativeApp } from '../../utils/pwa';
import MarkdownRenderer from '../tools/MarkdownRenderer';

interface Props {
  item: FileItem;
  onClose: () => void;
  /** Save a copy out of the app (on the phone app this opens the share sheet) */
  onSaveOut: (file: File) => void;
}

type Loaded =
  | { kind: 'url'; url: string }                        // image / video / audio
  | { kind: 'pdf'; data: ArrayBuffer }
  | { kind: 'frame'; html: string; fit: 'reflow' | 'zoom' | 'scroll' }
  | { kind: 'sheet'; sheets: { name: string; html: string }[] }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'markdown'; text: string }
  | { kind: 'zip'; entries: { name: string; size: number }[] }
  | { kind: 'none' };

const MAX_TEXT = 1_500_000;     // characters shown for text files
const MAX_PDF_PAGES = 80;

// Converted documents render in a sandboxed frame: no scripts (no allow-scripts)
// and a CSP that blocks every network request, so a hostile file can't run code
// or phone home. allow-same-origin only lets this page measure it to fit.
const frameDoc = (body: string, css = '') => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; font-src data:">
<style>html,body{margin:0;background:#fff;color:#222;font:15px/1.5 -apple-system,system-ui,sans-serif}img{max-width:100%;height:auto}
table{border-collapse:collapse;font-size:13px}td,th{border:1px solid #ddd;padding:4px 8px;white-space:nowrap}tr:first-child td{background:#f4f4f6;font-weight:600}${css}</style>
</head><body>${body}</body></html>`;

const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

async function prepare(file: File, kind: PreviewKind): Promise<Loaded> {
  switch (kind) {
    case 'image': case 'video': case 'audio':
      return { kind: 'url', url: URL.createObjectURL(file) };
    case 'heic': {
      const { heicToJpeg } = await import('../../utils/heic');
      return { kind: 'url', url: URL.createObjectURL(await heicToJpeg(file)) };
    }
    case 'pdf':
      return { kind: 'pdf', data: await file.arrayBuffer() };
    case 'docx': {
      const { docxToHtml } = await import('../../utils/docxToHtml');
      // Reflow Word's fixed-size pages to the screen width for reading
      return { kind: 'frame', fit: 'reflow', html: frameDoc(await docxToHtml(await file.arrayBuffer()),
        'section.docx{width:auto!important;min-height:0!important;padding:20px!important;margin:0 0 12px!important;box-shadow:none!important}') };
    }
    case 'pptx': {
      const { pptxToHtml } = await import('../../utils/pptxToHtml');
      const { html } = await pptxToHtml(await file.arrayBuffer());
      return { kind: 'frame', fit: 'zoom', html: frameDoc(html, 'body{background:#eee}') };
    }
    case 'sheet': case 'csv': {
      const XLSX = await import('xlsx');
      const wb = kind === 'csv'
        ? XLSX.read(await file.text(), { type: 'string', FS: /\.tsv$/i.test(file.name) ? '\t' : undefined })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map(name => ({ name, html: frameDoc(XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' }), 'body{padding:8px}') }));
      return { kind: 'sheet', sheets };
    }
    case 'html':
      return { kind: 'frame', fit: 'scroll', html: frameDoc(await file.text()) };
    case 'markdown':
      return { kind: 'markdown', text: (await file.text()).slice(0, MAX_TEXT) };
    case 'json': {
      const raw = await file.text();
      let text = raw;
      try { text = JSON.stringify(JSON.parse(raw), null, 2); } catch { /* show as-is */ }
      return { kind: 'text', text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
    }
    case 'text': {
      let text = await file.text();
      // RTF: show the readable text, not the control words
      if (/\.rtf$/i.test(file.name)) text = text.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '');
      return { kind: 'text', text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
    }
    case 'zip': {
      const { unzipSync } = await import('fflate');
      const entries: { name: string; size: number }[] = [];
      // List only — the filter records each entry and skips decompressing it
      unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: f => { if (!f.name.endsWith('/')) entries.push({ name: f.name, size: f.originalSize }); return false; } });
      return { kind: 'zip', entries };
    }
    default:
      return { kind: 'none' };
  }
}

/* Full-screen viewer for a Files library item. */
const FileViewer = ({ item, onClose, onSaveOut }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [sheetIdx, setSheetIdx] = useState(0);
  const kind = previewKind(item.name, item.mimeType);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const f = await loadLibraryFile(item);
        if (cancelled) return;
        setFile(f);
        const l = await prepare(f, kind);
        if (cancelled) { if (l.kind === 'url') URL.revokeObjectURL(l.url); return; }
        if (l.kind === 'url') url = l.url;
        setLoaded(l);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Couldn’t open this file.');
      }
    })();
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [item, kind]);

  // The viewer is its own history step: Back (button, Android back, iOS
  // swipe-back) closes the viewer instead of leaving the Files page.
  const closedByHistory = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });
  useEffect(() => {
    window.history.pushState({ ...(window.history.state ?? {}), fileViewer: true }, '');
    const onPop = () => { closedByHistory.current = true; onCloseRef.current(); };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by the X / Esc: drop the history step we added
      if (!closedByHistory.current && window.history.state?.fileViewer) window.history.back();
    };
  }, []);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roundBtn: React.CSSProperties = { flexShrink: 0, width: '44px', height: '44px', borderRadius: '9999px', border: 'none', background: 'var(--surface-high)', color: 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const native = isNativeApp();

  return (
    <motion.div
      role="dialog" aria-modal="true" aria-label={item.name}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', damping: 18, stiffness: 260, mass: 0.6 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9997, background: 'var(--canvas)', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: 'calc(env(safe-area-inset-top) + 8px) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left))' }}>
        <button type="button" onClick={onClose} aria-label="Close" style={roundBtn}><X size={20} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '16px', lineHeight: '22px', fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', lineHeight: '16px', color: 'var(--ink-faint)' }}>
            {item.onDevice ? <HardDrive size={12} /> : <Cloud size={12} />}
            {item.onDevice ? (item.driveId ? 'On this device · Google Drive' : 'On this device') : 'Google Drive'} · {item.size}
          </div>
        </div>
        <button type="button" onClick={() => file && onSaveOut(file)} disabled={!file} aria-label={native ? 'Share or open in another app' : 'Download'} style={{ ...roundBtn, opacity: file ? 1 : 0.5 }}>
          {native ? <Share2 size={18} /> : <Download size={18} />}
        </button>
      </div>

      {/* Sheet tabs */}
      {loaded?.kind === 'sheet' && loaded.sheets.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', padding: '0 16px 12px' }}>
          {loaded.sheets.map((s, i) => (
            <button key={s.name} type="button" onClick={() => setSheetIdx(i)} aria-pressed={i === sheetIdx}
              style={{ flexShrink: 0, minHeight: '36px', padding: '0 14px', borderRadius: '9999px', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap',
                background: i === sheetIdx ? 'var(--accent)' : 'var(--surface-high)', color: i === sheetIdx ? 'var(--on-accent)' : 'var(--ink)' }}>
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Body — images zoom inside ZoomableImage; everything else (documents,
          sheets, text, video…) is one pinch-zoomable, scrollable surface */}
      <ZoomScroller enabled={!(loaded?.kind === 'url' && (kind === 'image' || kind === 'heic')) && !!loaded && !error && loaded.kind !== 'none'}>
        {error ? (
          <Notice icon={AlertCircle} tone="danger" title="Couldn’t open this file" text={error} />
        ) : !loaded ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--ink-muted)', fontSize: '14px' }}>
            <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} /> Opening…
          </div>
        ) : loaded.kind === 'url' ? (
          kind === 'video' ? <video src={loaded.url} controls playsInline style={{ width: '100%', maxHeight: '100%', borderRadius: '16px', background: '#000' }} />
          : kind === 'audio' ? <div style={{ paddingTop: '40px' }}><audio src={loaded.url} controls style={{ width: '100%' }} /></div>
          : <ZoomableImage src={loaded.url} alt={item.name} />
        ) : loaded.kind === 'pdf' ? (
          <PdfPages data={loaded.data} />
        ) : loaded.kind === 'frame' ? (
          <SandboxFrame html={loaded.html} fit={loaded.fit} />
        ) : loaded.kind === 'sheet' ? (
          <SandboxFrame key={sheetIdx} html={loaded.sheets[sheetIdx]?.html ?? ''} fit="scroll" />
        ) : loaded.kind === 'markdown' ? (
          <div style={{ background: 'var(--surface)', borderRadius: '20px', padding: '20px', color: 'var(--ink)' }}><MarkdownRenderer content={loaded.text} /></div>
        ) : loaded.kind === 'text' ? (
          <>
            <pre style={{ margin: 0, padding: '16px', background: 'var(--surface)', borderRadius: '20px', color: 'var(--ink)', fontSize: '13px', lineHeight: '20px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{loaded.text}</pre>
            {loaded.truncated && <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--ink-faint)' }}>Showing the start of a long file.</p>}
          </>
        ) : loaded.kind === 'zip' ? (
          <div style={{ background: 'var(--surface)', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', color: 'var(--ink-muted)', fontSize: '14px' }}>
              <FileArchive size={18} /> {loaded.entries.length} item{loaded.entries.length !== 1 ? 's' : ''} in this archive
            </div>
            {loaded.entries.slice(0, 500).map(e => (
              <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 16px', borderTop: '1px solid var(--hairline)', fontSize: '14px', color: 'var(--ink)' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <span style={{ flexShrink: 0, color: 'var(--ink-faint)' }}>{fmtSize(e.size)}</span>
              </div>
            ))}
          </div>
        ) : (
          <Notice icon={FileQuestion} title="No preview for this type"
            text={native ? 'Use Share to open it in another app on your phone.' : 'Download it to open with an app on your computer.'}
            action={file ? <button type="button" className="btn-primary" onClick={() => onSaveOut(file)} style={{ padding: '0 28px' }}>{native ? <><Share2 size={18} />Open in another app</> : <><Download size={18} />Download</>}</button> : null} />
        )}
      </ZoomScroller>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
};

const Notice = ({ icon: Icon, title, text, action, tone }: { icon: React.ElementType; title: string; text: string; action?: React.ReactNode; tone?: 'danger' }) => (
  <div style={{ margin: '40px auto 0', maxWidth: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
    <span style={{ width: '64px', height: '64px', borderRadius: '9999px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px',
      background: tone === 'danger' ? 'var(--danger-bg)' : 'color-mix(in srgb, var(--accent) 14%, transparent)', color: tone === 'danger' ? 'var(--danger)' : 'var(--accent)' }}><Icon size={28} /></span>
    <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: '28px', fontWeight: 700, color: 'var(--ink)' }}>{title}</h3>
    <p style={{ margin: 0, fontSize: '14px', lineHeight: '20px', color: 'var(--ink-muted)' }}>{text}</p>
    {action && <div style={{ marginTop: '16px' }}>{action}</div>}
  </div>
);

/* Pinch-zoomable scroll surface for documents. Zoom uses CSS `zoom`, so the
   content genuinely re-lays-out larger and the container scrolls it natively in
   both directions — one finger pans, two fingers zoom around the pinch point,
   double-tap toggles 1× / 2×, ctrl+wheel (trackpad pinch) zooms on desktop.
   Two-finger touchmoves are preventDefault-ed so the browser doesn't zoom the
   whole app instead; one-finger scrolling stays native and smooth. */
const DOC_MIN = 0.5, DOC_MAX = 5;
const VIEWER_ZOOM_EVENT = 'zenith-viewer-zoom';
const ZoomScroller = ({ enabled, children }: { enabled: boolean; children: React.ReactNode }) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const [scale, setScale] = useState(1);
  // Content is laid out at the screen's width (in unzoomed px) — an auto width
  // would re-wrap to fit under `zoom` instead of growing past the screen.
  const [baseW, setBaseW] = useState<number | null>(null);
  useEffect(() => {
    const o = outer.current;
    if (!o) return;
    const measure = () => setBaseW(o.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    return () => ro.disconnect();
  }, []);

  // Apply a zoom level, keeping the content point under (mx, my) — viewport
  // coords relative to the scroller — fixed on screen.
  const applyZoom = (next: number, mx: number, my: number) => {
    const o = outer.current, el = inner.current;
    if (!o || !el) return;
    const prev = scaleRef.current;
    const s = Math.min(DOC_MAX, Math.max(DOC_MIN, next));
    if (Math.abs(s - prev) < 0.001) return;
    const cx = (o.scrollLeft + mx) / prev, cy = (o.scrollTop + my) / prev;
    scaleRef.current = s;
    (el.style as CSSStyleDeclaration & { zoom: string }).zoom = String(s);
    o.scrollLeft = cx * s - mx;
    o.scrollTop = cy * s - my;
  };
  // Settled zoom: update the pill and let content (PDF pages) re-render sharply
  const commit = () => {
    setScale(Math.round(scaleRef.current * 100) / 100);
    window.dispatchEvent(new CustomEvent(VIEWER_ZOOM_EVENT, { detail: scaleRef.current }));
  };

  useEffect(() => {
    const o = outer.current;
    if (!o || !enabled) return;
    let start: { dist: number; scale: number } | null = null;
    let lastTap = 0;
    const rel = (x: number, y: number) => { const r = o.getBoundingClientRect(); return { x: x - r.left, y: y - r.top }; };
    const pair = (t: TouchList) => {
      const a = rel(t[0].clientX, t[0].clientY), b = rel(t[1].clientX, t[1].clientY);
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { start = { dist: pair(e.touches).dist || 1, scale: scaleRef.current }; e.preventDefault(); return; }
      if (e.touches.length === 1) {
        const now = Date.now();
        if (now - lastTap < 280) {
          const p = rel(e.touches[0].clientX, e.touches[0].clientY);
          applyZoom(scaleRef.current > 1.05 ? 1 : 2, p.x, p.y); commit();
          lastTap = 0; e.preventDefault();
        } else lastTap = now;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      const { dist, mid } = pair(e.touches);
      applyZoom(start.scale * (dist / start.dist), mid.x, mid.y);
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2 && start) { start = null; commit(); } };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;   // plain wheel keeps scrolling
      e.preventDefault();
      const p = rel(e.clientX, e.clientY);
      applyZoom(scaleRef.current * Math.exp(-e.deltaY * 0.01), p.x, p.y); commit();
    };
    // iOS Safari's own gesture events would zoom the page; claim them
    const stopGesture = (e: Event) => e.preventDefault();
    o.addEventListener('touchstart', onStart, { passive: false });
    o.addEventListener('touchmove', onMove, { passive: false });
    o.addEventListener('touchend', onEnd);
    o.addEventListener('touchcancel', onEnd);
    o.addEventListener('wheel', onWheel, { passive: false });
    o.addEventListener('gesturestart', stopGesture);
    o.addEventListener('gesturechange', stopGesture);
    return () => {
      o.removeEventListener('touchstart', onStart); o.removeEventListener('touchmove', onMove);
      o.removeEventListener('touchend', onEnd); o.removeEventListener('touchcancel', onEnd);
      o.removeEventListener('wheel', onWheel); o.removeEventListener('gesturestart', stopGesture); o.removeEventListener('gesturechange', stopGesture);
    };
  }, [enabled]);

  const reset = () => { applyZoom(1, 0, 0); if (outer.current) outer.current.scrollLeft = 0; commit(); };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div ref={outer} style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', touchAction: enabled ? 'pan-x pan-y' : 'auto', overscrollBehavior: 'contain' }}>
        <div ref={inner} style={{ width: enabled && baseW ? `${baseW}px` : undefined, minHeight: '100%', boxSizing: 'border-box', padding: '0 max(16px, env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))' }}>
          {children}
        </div>
      </div>
      {enabled && Math.abs(scale - 1) > 0.02 && (
        <button type="button" onClick={reset}
          style={{ position: 'absolute', bottom: 'calc(16px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', height: '36px', padding: '0 14px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            background: 'color-mix(in srgb, var(--surface) 90%, transparent)', color: 'var(--ink)', fontSize: '13px', fontWeight: 600, boxShadow: 'var(--shadow-floating)' }}>
          {Math.round(scale * 10) / 10}× · Reset
        </button>
      )}
    </div>
  );
};

/* Image with pinch-to-zoom (1×–6×), drag to pan while zoomed, double-tap to
   toggle 2.5×, and wheel / trackpad zoom on desktop. Pointer events, so touch,
   pen and mouse all work; touch-action: none keeps the browser from zooming
   the whole page instead. */
const MIN_ZOOM = 1, MAX_ZOOM = 6;
const ZoomableImage = ({ src, alt }: { src: string; alt: string }) => {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const [animate, setAnimate] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; scale: number; mid: { x: number; y: number }; x: number; y: number } | null>(null);
  const lastTap = useRef(0);

  // Keep the image covering its box: no panning past the edges, no gap at 1×
  const clamp = (scale: number, x: number, y: number) => {
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
    const el = box.current;
    if (!el || s === 1) return { scale: s, x: 0, y: 0 };
    const maxX = (el.clientWidth * (s - 1)) / 2, maxY = (el.clientHeight * (s - 1)) / 2;
    return { scale: s, x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };
  // Zoom to `next` keeping the point (px, py) — relative to the box centre — under the finger
  const zoomAt = (from: typeof t, next: number, px: number, py: number) => {
    const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    const k = s / from.scale;
    return clamp(s, px - (px - from.x) * k, py - (py - from.y) * k);
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    setAnimate(false);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: t.scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x: t.x, y: t.y };
    } else if (pointers.current.size === 1) {
      const p = local(e);
      gesture.current = { dist: 0, scale: t.scale, mid: p, x: t.x, y: t.y };
      // Double-tap: toggle between fit and 2.5× at the tapped point
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setAnimate(true);
        setT(prev => prev.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomAt(prev, 2.5, p.x, p.y));
        lastTap.current = 0;
      } else lastTap.current = now;
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const next = zoomAt({ scale: g.scale, x: g.x, y: g.y }, g.scale * (dist / (g.dist || 1)), g.mid.x, g.mid.y);
      setT(clamp(next.scale, next.x + (mid.x - g.mid.x), next.y + (mid.y - g.mid.y)));
    } else if (t.scale > 1) {
      const p = pointers.current.get(e.pointerId)!;
      setT(clamp(t.scale, g.x + (p.x - g.mid.x), g.y + (p.y - g.mid.y)));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // Re-anchor so lifting one finger of a pinch continues as a pan
    const rest = [...pointers.current.values()][0];
    gesture.current = rest ? { dist: 0, scale: t.scale, mid: rest, x: t.x, y: t.y } : null;
    if (t.scale < 1.02) { setAnimate(true); setT({ scale: 1, x: 0, y: 0 }); }
  };

  // Wheel / trackpad pinch (ctrlKey) on desktop — native listener so it can preventDefault
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2;
      setAnimate(false);
      setT(prev => {
        const next = prev.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
        const s = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        const k = s / prev.scale;
        if (s === 1) return { scale: 1, x: 0, y: 0 };
        const maxX = (el.clientWidth * (s - 1)) / 2, maxY = (el.clientHeight * (s - 1)) / 2;
        const x = px - (px - prev.x) * k, y = py - (py - prev.y) * k;
        return { scale: s, x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={box}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ position: 'relative', height: '100%', minHeight: '60vh', overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: t.scale > 1 ? 'grab' : 'zoom-in' }}>
      <img src={src} alt={alt} draggable={false}
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: t.scale > 1 ? 0 : '12px', objectFit: 'contain', pointerEvents: 'none',
          transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: 'center center',
          transition: animate ? 'transform var(--dur-spring) var(--ease-spring)' : 'none', willChange: 'transform' }} />
      {t.scale > 1 && (
        <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { setAnimate(true); setT({ scale: 1, x: 0, y: 0 }); }}
          style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', height: '36px', padding: '0 14px', borderRadius: '9999px', border: 'none', cursor: 'pointer',
            background: 'color-mix(in srgb, var(--surface) 88%, transparent)', color: 'var(--ink)', fontSize: '13px', fontWeight: 600, boxShadow: 'var(--shadow-raised)' }}>
          {Math.round(t.scale * 10) / 10}× · Reset
        </button>
      )}
    </div>
  );
};

/* A document in a script-less, network-less frame, fitted to the screen. */
const SandboxFrame = ({ html, fit }: { html: string; fit: 'reflow' | 'zoom' | 'scroll' }) => {
  const ref = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<{ w: number | null; h: number }>({ w: null, h: 400 });
  const onLoad = () => {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    if (fit === 'zoom') {
      // Fixed-size slides: scale down to the frame's width
      const w = doc.documentElement.scrollWidth;
      const scale = w > frame.clientWidth ? Math.max(0.25, frame.clientWidth / w) : 1;
      (doc.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(scale);
    }
    // The frame is sized to its whole content and never scrolls itself: the
    // viewer's zoom surface scrolls and pinch-zooms it (touches inside an
    // iframe would never reach the parent, so it ignores pointer input).
    const w = fit === 'scroll' ? Math.max(frame.clientWidth, doc.documentElement.scrollWidth) : null;
    setSize({ w, h: Math.max(200, doc.documentElement.scrollHeight + 4) });
  };
  return (
    <iframe ref={ref} title="Document preview" srcDoc={html} sandbox="allow-same-origin" onLoad={onLoad} scrolling="no"
      style={{ width: size.w ? `${size.w}px` : '100%', height: `${size.h}px`, border: 'none', borderRadius: '16px', background: '#fff', display: 'block', pointerEvents: 'none' }} />
  );
};

/* PDF pages drawn with pdf.js, fitted to the width, rendered one after another. */
const PdfPages = ({ data }: { data: ArrayBuffer }) => {
  const box = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState('');
  useEffect(() => {
    let cancelled = false;
    // Each page's canvas and the zoom it was drawn for
    const pages: { page: import('pdfjs-dist').PDFPageProxy; canvas: HTMLCanvasElement; drawnAt: number; busy: boolean }[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const MAX_PIXELS = 12_000_000;   // per canvas; iOS refuses canvases much past ~16.7M

    const draw = async (entry: typeof pages[number], zoom: number) => {
      const width = box.current?.clientWidth || 360;
      const base = entry.page.getViewport({ scale: 1 });
      let scale = (width / base.width) * dpr * zoom;
      const px = base.width * base.height * scale * scale;
      if (px > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / px);
      const vp = entry.page.getViewport({ scale });
      const off = document.createElement('canvas');
      off.width = Math.floor(vp.width); off.height = Math.floor(vp.height);
      await entry.page.render({ canvasContext: off.getContext('2d')!, viewport: vp, intent: 'print' }).promise;
      // Swap the bitmap in one step (no blank flash while rendering)
      entry.canvas.width = off.width; entry.canvas.height = off.height;
      entry.canvas.getContext('2d')!.drawImage(off, 0, 0);
      entry.drawnAt = zoom;
    };

    // After a pinch settles, redraw the pages on screen at the new zoom
    let timer: number | undefined;
    const onZoom = (e: Event) => {
      const zoom = Math.max(1, (e as CustomEvent<number>).detail);
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        for (const entry of pages) {
          if (cancelled) return;
          const r = entry.canvas.getBoundingClientRect();
          const onScreen = r.bottom > 0 && r.top < window.innerHeight;
          // Sharper when zooming in; drop back to the light version when zoomed out
          const wanted = onScreen ? zoom : 1;
          if (entry.busy || Math.abs(entry.drawnAt - wanted) < 0.25) continue;
          entry.busy = true;
          try { await draw(entry, wanted); } finally { entry.busy = false; }
        }
      }, 200);
    };
    window.addEventListener(VIEWER_ZOOM_EVENT, onZoom);

    (async () => {
      const pdfjsLib = await import('pdfjs-dist');
      await import('../../utils/pdfWorker');
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(data.slice(0)) }).promise;
      const total = pdf.numPages;
      const n = Math.min(total, MAX_PDF_PAGES);
      if (total > n) setInfo(`Showing the first ${n} of ${total} pages.`);
      for (let i = 1; i <= n && !cancelled; i++) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'width:100%;height:auto;display:block;border-radius:12px;background:#fff;margin-bottom:12px;box-shadow:var(--shadow-raised)';
        const entry = { page: await pdf.getPage(i), canvas, drawnAt: 0, busy: false };
        await draw(entry, 1);
        if (cancelled) break;
        pages.push(entry);
        box.current?.appendChild(canvas);
      }
    })().catch(() => !cancelled && setInfo('This PDF couldn’t be displayed. Try downloading it.'));
    return () => { cancelled = true; window.clearTimeout(timer); window.removeEventListener(VIEWER_ZOOM_EVENT, onZoom); };
  }, [data]);
  return (
    <div>
      <div ref={box} />
      {info && <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--ink-faint)' }}>{info}</p>}
    </div>
  );
};

export default FileViewer;
