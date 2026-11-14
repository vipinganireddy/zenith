import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, PenTool, CheckCircle, ArrowRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { prepareText, visualFrame, drawVisual } from '../../../utils/pdfText';

/** PNG of the drawn signature cropped to its ink (the pad is mostly empty space). */
async function trimSignature(dataUrl: string): Promise<ArrayBuffer> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0);
  const { data } = g.getImageData(0, 0, c.width, c.height);
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    if (data[(y * c.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return (await fetch(dataUrl)).arrayBuffer();
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return (await new Promise<Blob>(r => out.toBlob(b => r(b!), 'image/png'))).arrayBuffer();
}

import '../../../utils/pdfWorker';

const INK = '#1e3a5f';
const SIG_FONTS = ['Dancing Script', 'Great Vibes', 'Caveat'] as const;
const SIG_WEIGHT: Record<typeof SIG_FONTS[number], number> = { 'Dancing Script': 600, 'Great Vibes': 400, Caveat: 600 };
let sheet: Promise<void> | null = null;
/** Handwriting fonts for typed signatures, fetched from Google Fonts only when first needed. */
async function loadSignatureFont(family: typeof SIG_FONTS[number], text: string) {
  sheet ??= new Promise<void>(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Dancing+Script:wght@600&family=Great+Vibes&display=swap';
    link.onload = () => resolve();
    link.onerror = () => resolve(); // offline: the cursive fallback is used
    document.head.appendChild(link);
  });
  await sheet;
  // Faces are split by unicode-range, so load the ones this text needs, at the weight that exists.
  await document.fonts.load(`${SIG_WEIGHT[family]} 48px "${family}"`, text).catch(() => []);
}

/** A photo or scan of a signature on paper → dark ink on a transparent background. */
function inkFromPhoto(img: CanvasImageSource & { width: number; height: number }, maxW: number, maxH: number): HTMLCanvasElement {
  const k = Math.min(1, maxW / img.width, maxH / img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height);
  const lum = new Uint8Array(c.width * c.height);
  for (let i = 0; i < lum.length; i++) {
    const a = d.data[i * 4 + 3] / 255; // already-transparent PNGs: treat transparent as paper
    lum[i] = Math.round(255 - a * (255 - (0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2])));
  }
  const sorted = Array.from(lum).sort((x, y) => x - y);
  const paper = Math.max(120, sorted[Math.floor(sorted.length * 0.6)]); // most of the photo is paper
  for (let i = 0; i < lum.length; i++) {
    const t = Math.min(1, Math.max(0, (paper - 12 - lum[i]) / Math.max(30, paper * 0.55)));
    d.data[i * 4 + 3] = Math.round(t * 255);
  }
  g.putImageData(d, 0, 0);
  return c;
}

const ESignPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pagePreview, setPagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState(false);
  const [position, setPosition] = useState<'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right'>('bottom-right');
  const [addDate, setAddDate] = useState(false);
  const [error, setError] = useState('');
  const [sigMode, setSigMode] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedName, setTypedName] = useState('');
  const [typedFont, setTypedFont] = useState<typeof SIG_FONTS[number]>('Dancing Script');

  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setDownloadUrl(null);
    setSignatureData(null);
    setHasSignature(false);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ intent: 'print', canvasContext: canvas.getContext('2d')!, viewport }).promise;
      setPagePreview(canvas.toDataURL('image/jpeg', 0.8));
    } catch (e) {
      console.error(e);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  // The pad stays transparent: only the ink may end up on the document.
  const resetPad = () => {
    const c = sigCanvasRef.current;
    c?.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };

  // Typed signature: render the name in the chosen handwriting font, fitted to the pad.
  useEffect(() => {
    if (sigMode !== 'type') return;
    let cancelled = false;
    (async () => {
      await loadSignatureFont(typedFont, typedName || 'A');
      const c = sigCanvasRef.current;
      if (cancelled || !c) return;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      const name = typedName.trim();
      if (!name) { setHasSignature(false); setSignatureData(null); return; }
      let size = 72;
      const font = (px: number) => `${SIG_WEIGHT[typedFont]} ${px}px "${typedFont}", cursive`;
      g.font = font(size);
      while (size > 18 && g.measureText(name).width > c.width - 40) { size -= 2; g.font = font(size); }
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, c.width / 2, c.height / 2);
      setHasSignature(true);
      setSignatureData(c.toDataURL('image/png'));
    })();
    return () => { cancelled = true; };
  }, [sigMode, typedName, typedFont, file]);

  const onSignatureImage = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
      const ink = inkFromPhoto(bmp, 1200, 600);
      bmp.close();
      const c = sigCanvasRef.current!;
      const g = c.getContext('2d')!;
      g.clearRect(0, 0, c.width, c.height);
      const k = Math.min((c.width - 20) / ink.width, (c.height - 20) / ink.height);
      g.drawImage(ink, (c.width - ink.width * k) / 2, (c.height - ink.height * k) / 2, ink.width * k, ink.height * k);
      setHasSignature(true);
      // Keep full resolution for the document; the pad only shows a preview.
      setSignatureData(ink.toDataURL('image/png'));
    } catch (e) { console.error(e); setError('Could not read that image. Try a JPG or PNG photo of your signature.'); }
  };

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!sigCanvasRef.current) return;
    setIsDrawing(true);
    const g = sigCanvasRef.current.getContext('2d')!;
    g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
    lastPos.current = getPos(e, sigCanvasRef.current);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !sigCanvasRef.current || !lastPos.current) return;
    e.preventDefault();
    const canvas = sigCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasSignature(true);
  };

  const stopDraw = () => {
    setIsDrawing(false);
    lastPos.current = null;
    if (sigCanvasRef.current && hasSignature) {
      setSignatureData(sigCanvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    resetPad();
    setTypedName('');
    setHasSignature(false);
    setSignatureData(null);
  };

  const handleSign = async () => {
    if (!file || !signatureData) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      const sigImage = await pdfDoc.embedPng(await trimSignature(signatureData));
      const pages = pdfDoc.getPages();
      const targets = applyToAll ? pages : [pages[pages.length - 1]];
      const stamp = addDate
        ? await prepareText(pdfDoc, `Signed ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`, { size: 8, color: rgb(0.35, 0.35, 0.35) })
        : null;

      for (const page of targets) {
        // Positions are on the page as displayed (CropBox, /Rotate applied).
        const view = visualFrame(page);
        const sigWidth = Math.min(180, view.width * 0.3);
        const sigHeight = sigWidth * (sigImage.height / sigImage.width);
        const margin = 36, below = stamp ? 12 : 0;
        const vx = position === 'bottom-left' ? margin
          : position === 'bottom-center' ? (view.width - sigWidth) / 2
          : view.width - sigWidth - margin;
        const vy = position === 'top-right' ? view.height - margin - sigHeight : margin + below;
        const o = view.toPage(vx, vy);
        page.drawImage(sigImage, { x: o.x, y: o.y, width: sigWidth, height: sigHeight, rotate: degrees(view.rotate) });
        if (stamp) drawVisual(page, stamp, vx, vy - 10);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to add signature to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="eSign PDF"
      description="Draw, type or upload your signature and place it on your PDF — the last page or every page."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          {!file ? (
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <UploadCloud size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Sign</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Drag & drop, or tap to browse</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <FileText size={16} color="var(--accent)" /> {file.name}
                </h3>
                <button onClick={() => { setFile(null); setPagePreview(null); setDownloadUrl(null); clearSignature(); }} className="btn-secondary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px' }}>
                  Change file
                </button>
              </div>

              {pagePreview && (
                <div style={{ borderRadius: '16px', background: 'var(--surface-sunken)', overflow: 'hidden', maxHeight: '240px' }}>
                  <img src={pagePreview} alt="PDF preview" style={{ width: '100%', objectFit: 'contain', display: 'block', maxHeight: '240px' }} />
                </div>
              )}

              <div>
                <div className="segmented" role="tablist" aria-label="Signature method" style={{ marginBottom: '12px' }}>
                  {(['draw', 'type', 'upload'] as const).map(m => (
                    <button key={m} role="tab" aria-selected={sigMode === m} onClick={() => { setSigMode(m); resetPad(); setHasSignature(false); setSignatureData(null); }}>
                      {m === 'draw' ? 'Draw' : m === 'type' ? 'Type' : 'Upload image'}
                    </button>
                  ))}
                </div>
                {sigMode === 'type' && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Type your full name" aria-label="Your full name" style={{ flex: 2, minWidth: 'min(160px, 100%)', minHeight: '48px', padding: '0 14px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', fontSize: '16px', boxSizing: 'border-box' }} />
                    <select value={typedFont} onChange={e => setTypedFont(e.target.value as typeof typedFont)} aria-label="Signature font" style={{ flex: 1, minWidth: 'min(120px, 100%)', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', fontSize: '16px', boxSizing: 'border-box' }}>
                      {SIG_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                )}
                {sigMode === 'upload' && (
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', lineHeight: '20px', padding: '14px', border: '1.5px dashed color-mix(in srgb, var(--accent) 30%, transparent)', background: 'var(--surface-sunken)', borderRadius: '16px', cursor: 'pointer', textAlign: 'center' }}>
                    Choose a photo or scan of your signature (on white paper)
                    <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onSignatureImage(f); e.target.value = ''; }} />
                  </label>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                  <label className="field-label" style={{ margin: 0 }}>{sigMode === 'draw' ? 'Draw your signature' : 'Preview'}</label>
                  <button onClick={clearSignature} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', minWidth: '44px', height: '44px', padding: '0 12px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Trash2 size={16} /> Clear
                  </button>
                </div>
                <canvas
                  ref={sigCanvasRef}
                  width={500}
                  height={150}
                  onMouseDown={sigMode === 'draw' ? startDraw : undefined}
                  onMouseMove={sigMode === 'draw' ? draw : undefined}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={sigMode === 'draw' ? startDraw : undefined}
                  onTouchMove={sigMode === 'draw' ? draw : undefined}
                  onTouchEnd={stopDraw}
                  style={{ width: '100%', height: '150px', border: 'none', boxShadow: 'inset 0 0 0 1.5px var(--hairline)', borderRadius: '16px', cursor: sigMode === 'draw' ? 'crosshair' : 'default', touchAction: 'none', display: 'block', background: '#fff' }}
                />
                {sigMode === 'draw' && <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)', marginTop: '8px' }}>Draw with mouse, finger or stylus</p>}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PenTool size={20} color="var(--accent)" /> Signing Options
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Document Signed!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>Your signature has been embedded.</p>
                  <a href={downloadUrl} download={`signed_${file?.name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', color: 'var(--on-accent)', minHeight: '56px', padding: '0 24px', borderRadius: '24px', fontWeight: 700, fontSize: '16px', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    Download Signed PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`signed_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '14px', lineHeight: '20px', minHeight: '44px' }}>
                  <input type="checkbox" checked={applyToAll} onChange={e => setApplyToAll(e.target.checked)} />
                  Apply signature to all pages
                </label>
                <label className="field-label" style={{ marginBottom: 0 }}>Position
                  <select value={position} onChange={e => setPosition(e.target.value as typeof position)} style={{ display: 'block', width: '100%', marginTop: '8px', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', fontSize: '16px', textTransform: 'none', letterSpacing: 0, color: 'var(--ink)', boxSizing: 'border-box' }}>
                    <option value="bottom-right">Bottom right</option>
                    <option value="bottom-center">Bottom centre</option>
                    <option value="bottom-left">Bottom left</option>
                    <option value="top-right">Top right</option>
                  </select>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '14px', lineHeight: '20px', minHeight: '44px' }}>
                  <input type="checkbox" checked={addDate} onChange={e => setAddDate(e.target.checked)} />
                  Add "Signed on" date
                </label>
                <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{applyToAll ? 'Placed on every page.' : 'Placed on the last page.'} This adds a visible signature image — it is not a certificate-based digital signature.</p>
                <button onClick={handleSign} disabled={!file || !hasSignature || isProcessing}
                  style={{ width: '100%', minHeight: '56px', padding: '0 24px', borderRadius: '24px', fontWeight: 700, fontSize: '16px', border: 'none',
                    background: !file || !hasSignature ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file || !hasSignature ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    cursor: !file || !hasSignature || isProcessing ? 'not-allowed' : 'pointer' }}>
                  {isProcessing ? 'Signing...' : 'Apply Signature'} <ArrowRight size={18} />
                </button>
                {!hasSignature && file && <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--ink-muted)', textAlign: 'center' }}>{sigMode === 'draw' ? 'Draw your signature first.' : sigMode === 'type' ? 'Type your name first.' : 'Choose a signature image first.'}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ESignPdf;
