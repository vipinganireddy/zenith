import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Camera, RotateCcw, CheckCircle, Download, Plus, Trash2,
  X, FileText, AlertCircle, FlipHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { isHeic, heicToJpeg } from '../../../utils/heic';

type Phase = 'request' | 'camera' | 'review' | 'building' | 'done';
type PermissionState = 'idle' | 'denied' | 'unavailable';

/* ── Shutter flash animation ── */
const ShutterFlash = ({ show }: { show: boolean }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        style={{ position: 'absolute', inset: 0, background: 'var(--surface)', borderRadius: '16px', zIndex: 10, pointerEvents: 'none' }}
      />
    )}
  </AnimatePresence>
);

/* ── Corner guides overlay ── */
const CornerGuides = () => {
  const corner = (style: React.CSSProperties) => (
    <div style={{
      position: 'absolute', width: '28px', height: '28px',
      borderColor: 'var(--primary)', borderStyle: 'solid', ...style,
    }} />
  );
  return (
    <div style={{ position: 'absolute', inset: '16px', pointerEvents: 'none' }}>
      {corner({ top: 0, left: 0, borderWidth: '3px 0 0 3px', borderRadius: '4px 0 0 0' })}
      {corner({ top: 0, right: 0, borderWidth: '3px 3px 0 0', borderRadius: '0 4px 0 0' })}
      {corner({ bottom: 0, left: 0, borderWidth: '0 0 3px 3px', borderRadius: '0 0 0 4px' })}
      {corner({ bottom: 0, right: 0, borderWidth: '0 3px 3px 0', borderRadius: '0 0 4px 0' })}
    </div>
  );
};

/**
 * Make a phone photo of a page look scanned: greyscale, then stretch the levels
 * so the paper goes white and the ink goes dark (2nd–98th percentile → 0–255).
 * Clearer to read and much smaller to store than the raw colour photo.
 */
async function enhanceScan(dataUrl: string): Promise<ArrayBuffer> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const frame = g.getImageData(0, 0, c.width, c.height);
  const d = frame.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  const total = d.length / 4;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = Math.max(0, Math.min(255, ((y - lo) / span) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(frame, 0, 0);
  const blob = await new Promise<Blob>(r => c.toBlob(b => r(b!), 'image/jpeg', 0.85));
  return blob.arrayBuffer();
}

const ScanToPdf = () => {
  const [phase, setPhase]           = useState<Phase>('request');
  const [permission, setPermission] = useState<PermissionState>('idle');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [enhance, setEnhance] = useState(true);
  const [captures, setCaptures]     = useState<string[]>([]);
  const [flash, setFlash]           = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress]     = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  /* ── Camera helpers ── */
  const startStream = useCallback(async (mode: 'environment' | 'user') => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  // Never leave the camera running after the user leaves this tool.
  useEffect(() => stopStream, [stopStream]);

  const requestCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unavailable');
      return;
    }
    try {
      await startStream(facingMode);
      setPhase('camera');
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      setPermission(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'unavailable');
    }
  };

  const flipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    try { await startStream(next); } catch { /* stay on current */ }
  };

  /* ── Capture ── */
  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    setCaptures(prev => [...prev, canvas.toDataURL('image/jpeg', 0.93)]);
  };

  const goReview = () => {
    stopStream();
    setPhase('review');
  };

  /* ── Import photos (no camera, or pictures already taken) ── */
  const importInputRef = useRef<HTMLInputElement>(null);
  const importPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const bmp = await createImageBitmap(isHeic(f) ? await heicToJpeg(f) : f, { imageOrientation: 'from-image' });
        const k = Math.min(1, 3000 / Math.max(bmp.width, bmp.height)); // phone photos can be 12+ MP
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        bmp.close();
        added.push(c.toDataURL('image/jpeg', 0.93));
      } catch { /* not an image we can decode: skip */ }
    }
    if (added.length) { stopStream(); setCaptures(prev => [...prev, ...added]); setPhase('review'); }
  };

  const addMore = async () => {
    setPhase('camera');
    try { await startStream(facingMode); } catch { setPhase('review'); }
  };

  const removeCapture = (idx: number) => {
    setCaptures(prev => prev.filter((_, i) => i !== idx));
    if (selectedIdx === idx) setSelectedIdx(null);
  };

  /* ── Build PDF ── */
  const buildPdf = async () => {
    if (!captures.length) return;
    setPhase('building');
    setProgress(0);
    try {
      const pdf = await PDFDocument.create();
      for (let i = 0; i < captures.length; i++) {
        setProgress(Math.round(((i + 0.5) / captures.length) * 90));
        const ab = enhance ? await enhanceScan(captures[i]) : await (await (await fetch(captures[i])).blob()).arrayBuffer();
        const img  = await pdf.embedJpg(ab);
        const { width, height } = img;
        /* Scale to A4 width (595pt) keeping aspect ratio */
        const maxW = 595, maxH = 842;
        const scale = Math.min(maxW / width, maxH / height, 1);
        const page = pdf.addPage([width * scale, height * scale]);
        page.drawImage(img, { x: 0, y: 0, width: width * scale, height: height * scale });
      }
      setProgress(95);
      const bytes = await pdf.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
      setProgress(100);
      setPhase('done');
    } catch (err) {
      console.error(err);
      setPhase('review');
    }
  };

  const reset = () => {
    stopStream();
    setCaptures([]);
    setDownloadUrl(null);
    setProgress(0);
    setSelectedIdx(null);
    setPermission('idle');
    setPhase('request');
  };

  return (
    <ToolWorkspaceLayout title="Scan to PDF" description="Use your device camera to scan physical documents and save them as a PDF.">
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', overflow: 'auto', minWidth: 0 }}>

        {/* ════════════════════════════════════════
            PHASE 1 — Permission Request
        ════════════════════════════════════════ */}
        <input ref={importInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" style={{ display: 'none' }}
          onChange={e => { importPhotos(e.target.files); e.target.value = ''; }} />
        {phase === 'request' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Hero */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '96px', height: '96px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <Camera size={44} color="var(--accent)" />
              </div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                Scan documents with your camera
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Point your camera at any physical document — notes, contracts, receipts — and turn them into a multi-page PDF instantly.
              </p>
            </div>

            {/* Feature list */}
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['📄', 'Scan multiple pages into one PDF'],
                ['🔒', 'Everything stays on your device — nothing is uploaded'],
                ['🔄', 'Switch between front and rear camera'],
                ['✂️', 'Review and remove pages before saving'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px', minWidth: 0 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Error states */}
            {permission === 'denied' && (
              <div style={{ padding: '14px 16px', background: 'var(--danger-bg)', borderRadius: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', marginBottom: '4px' }}>Camera access denied</p>
                  <p style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: 1.5 }}>
                    Please allow camera access in your browser settings, then try again. In Chrome: click the 🔒 lock icon in the address bar → Camera → Allow.
                  </p>
                </div>
              </div>
            )}
            {permission === 'unavailable' && (
              <div style={{ padding: '14px 16px', background: 'var(--danger-bg)', borderRadius: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '14px', color: 'var(--danger)', lineHeight: 1.5 }}>
                  No camera found on this device or your browser doesn't support camera access. Try using Chrome or Safari on a device with a camera.
                </p>
              </div>
            )}

            {/* CTA */}
            <button onClick={requestCamera}
              className="btn-primary" style={{ width: '100%' }}>
              <Camera size={20} />
              {permission === 'denied' ? 'Try Again' : 'Allow Camera & Start Scanning'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
              Your browser will ask for camera permission when you tap the button above.
            </p>
            <button onClick={() => importInputRef.current?.click()}
              className="btn-secondary" style={{ width: '100%', fontSize: '14px' }}>
              No camera? Import photos instead
            </button>
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            PHASE 2 — Camera Live
        ════════════════════════════════════════ */}
        {phase === 'camera' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Viewfinder */}
            <div style={{ position: 'relative', background: '#000', borderRadius: '16px', overflow: 'hidden', aspectRatio: '4/3' }}>
              <video
                ref={videoRef}
                autoPlay muted playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <CornerGuides />
              <ShutterFlash show={flash} />

              {/* Page counter badge */}
              {captures.length > 0 && (
                <div style={{ position: 'absolute', top: '14px', left: '14px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', color: 'white', minHeight: '32px', display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: '9999px', fontSize: '14px', lineHeight: '20px', fontWeight: 700 }} role="status" aria-label={`${captures.length} page${captures.length !== 1 ? 's' : ''} captured`}>
                  {captures.length} page{captures.length !== 1 ? 's' : ''} captured
                </div>
              )}

              {/* Flip camera */}
              <button onClick={flipCamera}
                style={{ position: 'absolute', top: '8px', right: '8px', width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}
                title="Flip camera" aria-label="Flip camera">
                <FlipHorizontal size={18} />
              </button>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <button onClick={() => { stopStream(); setPhase(captures.length ? 'review' : 'request'); }}
                className="btn-secondary" style={{ height: '48px', minHeight: '48px', padding: '0 16px', borderRadius: '16px', fontSize: '14px', minWidth: 0 }}>
                <X size={16} /> {captures.length ? 'Review Pages' : 'Cancel'}
              </button>

              {/* Shutter button */}
              <button onClick={capture}
                style={{ width: '72px', height: '72px', borderRadius: '50%', border: '4px solid var(--primary)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', transition: 'transform 0.1s', flexShrink: 0, boxShadow: 'var(--shadow-raised)' }} aria-label="Take photo" title="Take photo"
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--primary)' }} />
              </button>

              <button onClick={goReview} disabled={captures.length === 0}
                className="btn-primary" style={{ height: '48px', minHeight: '48px', padding: '0 20px', borderRadius: '16px', fontSize: '14px' }}>
                Done <CheckCircle size={16} />
              </button>
            </div>

            {/* Thumbnail strip */}
            {captures.length > 0 && (
              <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', padding: '8px 8px 4px 4px', scrollbarWidth: 'none' }}>
                {captures.map((src, i) => (
                  <div key={i} style={{ position: 'relative', flexShrink: 0 }}>
                    <img src={src} alt={`Page ${i + 1}`}
                      style={{ height: '72px', width: 'auto', borderRadius: '12px', boxShadow: '0 0 0 2px var(--accent)', display: 'block' }} />
                    <button onClick={() => removeCapture(i)} aria-label={`Remove page ${i + 1}`}
                      style={{ position: 'absolute', top: '-8px', right: '-8px', width: '44px', height: '44px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <span aria-hidden="true" style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', boxShadow: '0 0 0 2px var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></span>
                    </button>
                    <span style={{ position: 'absolute', bottom: '4px', left: '4px', background: 'rgba(0,0,0,0.65)', color: 'white', fontSize: '12px', lineHeight: '16px', fontWeight: 700, padding: '0 6px', borderRadius: '8px' }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
                <button onClick={capture}
                  aria-label="Add another page" style={{ width: '56px', height: '72px', flexShrink: 0, borderRadius: '12px', border: '1.5px dashed color-mix(in srgb, var(--accent) 30%, transparent)', background: 'var(--surface-sunken)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '12px' }}>
                  <Plus size={16} /><span>Add</span>
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            PHASE 3 — Review Scans
        ════════════════════════════════════════ */}
        {phase === 'review' && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '2px' }}>
                  Review your scans
                </h2>
                <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-muted)' }}>
                  {captures.length} page{captures.length !== 1 ? 's' : ''} · tap a page to preview · tap × to remove
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={addMore} className="btn-secondary"
                  style={{ flex: '1 1 140px', minWidth: 0, height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px' }}>
                  <Plus size={16} /> Add pages
                </button>
                <button onClick={() => importInputRef.current?.click()} className="btn-secondary"
                  style={{ flex: '1 1 140px', minWidth: 0, height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px' }}>
                  Import photos
                </button>
              </div>
            </div>

            {/* Page grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
              {captures.map((src, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}>
                  <img src={src} alt={`Page ${i + 1}`}
                    style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: '16px', boxShadow: selectedIdx === i ? '0 0 0 2px var(--accent)' : 'none', background: 'var(--surface-sunken)', display: 'block', transition: 'box-shadow 0.15s' }} />
                  <div style={{ position: 'absolute', bottom: '6px', left: '6px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', color: 'white', fontSize: '12px', lineHeight: '16px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px' }}>
                    Page {i + 1}
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeCapture(i); }} aria-label={`Remove page ${i + 1}`}
                    style={{ position: 'absolute', top: '-2px', right: '-2px', width: '44px', height: '44px', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                    <span aria-hidden="true" style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--danger)', color: 'white', boxShadow: 'var(--shadow-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></span>
                  </button>
                </motion.div>
              ))}
            </div>

            {/* Selected preview */}
            <AnimatePresence>
              {selectedIdx !== null && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '16px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>Page {selectedIdx + 1} preview</span>
                    <button onClick={() => setSelectedIdx(null)} aria-label="Close preview" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', padding: 0, margin: '-8px -8px -8px 0' }}><X size={16} /></button>
                  </div>
                  <img src={captures[selectedIdx]} alt="preview"
                    style={{ width: '100%', maxHeight: '360px', objectFit: 'contain', borderRadius: '16px' }} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {captures.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                <FileText size={36} style={{ opacity: 0.2, marginBottom: '10px' }} />
                <p style={{ fontSize: '14px' }}>No pages yet — add more scans.</p>
              </div>
            )}

            {/* Action row */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', cursor: 'pointer', minHeight: '44px', flex: '1 1 100%' }}>
                <input type="checkbox" checked={enhance} onChange={e => setEnhance(e.target.checked)} /> Enhance document
              </label>
              <button onClick={reset}
                className="btn-secondary" style={{ height: '56px', flex: '0 0 auto', fontSize: '14px' }}>
                <RotateCcw size={16} /> Start Over
              </button>
              <button onClick={buildPdf} disabled={captures.length === 0}
                className="btn-primary" style={{ flex: '1 1 180px', minWidth: 0 }}>
                <FileText size={18} /> Build PDF ({captures.length} page{captures.length !== 1 ? 's' : ''})
              </button>
            </div>
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            PHASE 4 — Building PDF
        ════════════════════════════════════════ */}
        {phase === 'building' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', maxWidth: '360px', width: '100%' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
              style={{ width: '64px', height: '64px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
            <div>
              <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>Building your PDF…</p>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Processing {captures.length} page{captures.length !== 1 ? 's' : ''}</p>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--surface-high)', borderRadius: '9999px', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'easeOut' }}
                style={{ height: '100%', background: 'var(--accent)', borderRadius: '9999px' }}
              />
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{progress}%</p>
          </motion.div>
        )}

        {/* ════════════════════════════════════════
            PHASE 5 — Done
        ════════════════════════════════════════ */}
        {phase === 'done' && downloadUrl && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: 'center', maxWidth: '420px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>

            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'var(--good-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={48} color="var(--success)" />
            </div>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }}>PDF Ready!</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {captures.length} page{captures.length !== 1 ? 's' : ''} compiled into a single PDF document.
              </p>
            </div>

            <a href={downloadUrl} download="scan.pdf"
              className="btn-primary" style={{ width: '100%', textDecoration: 'none', boxSizing: 'border-box' }}>
              <Download size={20} /> Download scan.pdf
            </a>
            <SaveToDriveButton downloadUrl={downloadUrl} fileName="scan.pdf" />

            {/* Thumbnail row */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', width: '100%', paddingBottom: '4px', justifyContent: 'center', scrollbarWidth: 'none' }}>
              {captures.map((src, i) => (
                <img key={i} src={src} alt={`Page ${i + 1}`}
                  style={{ height: '60px', width: 'auto', borderRadius: '12px', boxShadow: 'inset 0 0 0 1px var(--hairline)', flexShrink: 0 }} />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
              <button onClick={() => { setCaptures([]); setSelectedIdx(null); setDownloadUrl(null); setPhase('request'); }}
                className="btn-secondary" style={{ flex: '1 1 140px', minWidth: 0, fontSize: '14px' }}>
                <Camera size={16} /> Scan Again
              </button>
              <button onClick={() => { setPhase('review'); }}
                className="btn-secondary" style={{ flex: '1 1 140px', minWidth: 0, fontSize: '14px' }}>
                <Trash2 size={16} /> Edit Pages
              </button>
            </div>
          </motion.div>
        )}

      </div>
    </ToolWorkspaceLayout>
  );
};

export default ScanToPdf;
