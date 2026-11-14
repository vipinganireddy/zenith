import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, EyeOff, CheckCircle, ArrowRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';
import { fontFor } from '../../../utils/pdfText';

interface RedactBox {
  page: number;
  x: number; // fraction 0-1
  y: number;
  w: number;
  h: number;
}

type PdfJsPage = Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>['getPage']>>;
type Viewport = ReturnType<PdfJsPage['getViewport']>;

/**
 * Keep a redacted page searchable: every word that lies clearly outside all
 * redaction boxes is written back as invisible text over the page image (the
 * same technique as OCR'd PDFs). Word positions inside a text run are
 * estimated, so a margin of a few characters around each box is dropped too —
 * a word near a box is lost rather than ever leaking redacted text.
 */
async function restoreTextLayer(pdfDoc: PDFDocument, out: PDFPage, page: PdfJsPage, vp: Viewport, boxes: RedactBox[]) {
  const content = await page.getTextContent();
  const W = vp.width, H = vp.height;
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    const [a, b, c, d, e, f] = pdfjsLib.Util.transform(vp.transform, item.transform);
    if (Math.abs(b) > 0.01 || Math.abs(c) > 0.01 || a <= 0) continue; // only upright horizontal text
    const fontSize = Math.abs(d), width = item.width; // viewport scale is 1, so text-space length = page units
    const chars = [...item.str];
    const charW = width / Math.max(1, chars.length);
    const pad = Math.max(charW * 3, fontSize * 0.5);
    const hit = (x0: number, x1: number) => boxes.some(bx => {
      const L = bx.x * W - pad, R = (bx.x + bx.w) * W + pad, T = bx.y * H - fontSize * 0.3, B = (bx.y + bx.h) * H + fontSize * 0.3;
      return x1 > L && x0 < R && f > T && f - fontSize < B;
    });
    // Split into words, estimating each word's x from its character offset.
    for (const m of item.str.matchAll(/\S+/g)) {
      const start = [...item.str.slice(0, m.index)].length, len = [...m[0]].length;
      const x0 = e + start * charW, x1 = x0 + len * charW;
      if (hit(x0, x1)) continue;
      const font = await fontFor(pdfDoc, m[0]);
      if (!font) continue; // scripts that need shaping: skipped
      const natural = font.widthOfTextAtSize(m[0], fontSize);
      const size = natural > 0 ? Math.min(fontSize * 1.5, fontSize * (len * charW) / natural) : fontSize;
      out.drawText(m[0], { x: x0, y: H - f, size, font, opacity: 0 });
    }
  }
}

const RedactPdf = ({ fillColor = 'black' }: { fillColor?: 'black' | 'white' }) => {
  const whiteout = fillColor === 'white';
  const [file, setFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setBoxes([]);
    setDownloadUrl(null);
    setCurrentPage(0);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
      const previews: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ intent: 'print', canvasContext: canvas.getContext('2d')!, viewport }).promise;
        previews.push(canvas.toDataURL('image/jpeg', 0.85));
      }
      setPagePreviews(previews);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  useEffect(() => {
    if (!canvasRef.current || !pagePreviews[currentPage]) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      boxes.filter(b => b.page === currentPage).forEach(b => {
        ctx.fillStyle = 'black';
        ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
      });
      if (dragging) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(dragging.x, dragging.y, dragging.w, dragging.h);
      }
    };
    img.src = pagePreviews[currentPage];
  }, [pagePreviews, currentPage, boxes, dragging]);

  const getRelPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getRelPos(e);
    setIsDrawing(true);
    setStartPos(pos);
    setDragging({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos) return;
    const pos = getRelPos(e);
    setDragging({ x: Math.min(startPos.x, pos.x), y: Math.min(startPos.y, pos.y), w: Math.abs(pos.x - startPos.x), h: Math.abs(pos.y - startPos.y) });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDrawing || !startPos || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const pos = getRelPos(e);
    const rx = Math.min(startPos.x, pos.x) / canvas.width;
    const ry = Math.min(startPos.y, pos.y) / canvas.height;
    const rw = Math.abs(pos.x - startPos.x) / canvas.width;
    const rh = Math.abs(pos.y - startPos.y) / canvas.height;
    if (rw > 0.005 && rh > 0.005) {
      setBoxes(prev => [...prev, { page: currentPage, x: rx, y: ry, w: rw, h: rh }]);
    }
    setIsDrawing(false);
    setStartPos(null);
    setDragging(null);
  };

  const clearPage = () => setBoxes(prev => prev.filter(b => b.page !== currentPage));

  const handleRedact = async () => {
    if (!file || !boxes.length) return;
    setError('');
    setIsProcessing(true);
    try {
      // True redaction. A box drawn on top would leave the text underneath in the
      // file (copy-paste reveals it), so each page with redactions is rendered,
      // the boxes are burned into the pixels, and the page is replaced by that
      // image. The output is a brand-new document: pages without redactions are
      // copied as-is, and nothing from a redacted page's original content is carried
      // over — pdf-lib would otherwise keep orphaned objects in the saved file.
      const data = new Uint8Array(await file.arrayBuffer());
      const source = await PDFDocument.load(data.slice(), { ignoreEncryption: true });
      const rendered = await pdfjsLib.getDocument({ isEvalSupported: false, data: data.slice() }).promise;
      const pdfDoc = await PDFDocument.create();
      const redactedPages = new Set(boxes.map(b => b.page));
      const DPI = 200;
      for (let i = 0; i < source.getPageCount(); i++) {
        if (!redactedPages.has(i)) {
          const [copy] = await pdfDoc.copyPages(source, [i]);
          pdfDoc.addPage(copy);
          continue;
        }
        const page = await rendered.getPage(i + 1);
        const vp = page.getViewport({ scale: DPI / 72 }); // rotation applied — same view the boxes were drawn on
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ intent: 'print', canvasContext: ctx, viewport: vp }).promise;
        ctx.fillStyle = fillColor === 'white' ? '#fff' : '#000';
        for (const b of boxes.filter(b => b.page === i)) {
          ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height);
        }
        const jpg = await pdfDoc.embedJpg(await (await new Promise<Blob>(res => canvas.toBlob(bl => res(bl!), 'image/jpeg', 0.9))).arrayBuffer());
        const size = page.getViewport({ scale: 1 });
        const out = pdfDoc.addPage([size.width, size.height]);
        out.drawImage(jpg, { x: 0, y: 0, width: size.width, height: size.height });
        await restoreTextLayer(pdfDoc, out, page, size, boxes.filter(b => b.page === i));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Could not process this PDF. It may be damaged or password-protected.');
    } finally {
      setIsProcessing(false);
    }
  };

  const pageBoxCount = boxes.filter(b => b.page === currentPage).length;
  const totalBoxCount = boxes.length;

  return (
    <ToolWorkspaceLayout
      title={whiteout ? 'Whiteout Text' : 'Legal Redaction'}
      description={whiteout
        ? 'Cover text with white boxes — and remove it from the file, not just hide it. The rest of the page stays searchable.'
        : 'Black out sensitive content. What is under each box is permanently removed, not just covered; the rest of the page stays searchable.'}
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          {!file ? (
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <UploadCloud size={32} />
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Redact</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflowWrap: 'anywhere' }}>
                  <FileText size={15} color="var(--accent)" /> {file.name}
                </h3>
                <button onClick={() => { setFile(null); setPagePreviews([]); setBoxes([]); setDownloadUrl(null); }} style={{ background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', fontSize: '14px', minHeight: '44px', cursor: 'pointer' }}>Change</button>
              </div>

              {pagePreviews.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0' }}>
                  {pagePreviews.map((_, i) => (
                    <button key={i} onClick={() => setCurrentPage(i)} aria-label={`Page ${i + 1}`} aria-pressed={currentPage === i} style={{ flexShrink: 0, padding: '0 16px', borderRadius: '12px', fontSize: '14px', border: 'none', background: currentPage === i ? 'var(--accent)' : 'var(--surface-high)', color: currentPage === i ? 'var(--on-accent)' : 'var(--ink)', cursor: 'pointer', minHeight: '44px' }}>
                      p.{i + 1}
                    </button>
                  ))}
                </div>
              )}

              <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>Draw rectangles over content to redact. Page {currentPage + 1} has {pageBoxCount} box{pageBoxCount !== 1 ? 'es' : ''}.</p>

              <canvas
                ref={canvasRef}
                // Pointer events: mouse, touch and stylus. Capture keeps a drag alive past the edge.
                onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); handleMouseDown(e); }}
                onPointerMove={handleMouseMove}
                onPointerUp={handleMouseUp}
                onPointerCancel={handleMouseUp}
                style={{ width: '100%', border: 'none', boxShadow: '0 0 0 1.5px var(--hairline)', borderRadius: '16px', cursor: 'crosshair', display: 'block', userSelect: 'none', touchAction: 'none' }}
              />

              <button onClick={clearPage} style={{ alignSelf: 'flex-start', background: 'var(--danger-bg)', color: 'var(--danger)', border: 'none', padding: '0 16px', borderRadius: '16px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px', justifyContent: 'center' }}>
                <Trash2 size={16} /> Clear page {currentPage + 1}
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <EyeOff size={20} color="var(--accent)" /> Redaction
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>PDF Redacted!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>{totalBoxCount} area{totalBoxCount !== 1 ? 's' : ''} permanently redacted.</p>
                  <a href={downloadUrl} download={`redacted_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download Redacted PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`redacted_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Draw rectangles over sensitive content on the canvas. Redactions are drawn as solid black rectangles directly into the PDF.
                </p>
                {file && (
                  <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '16px', fontSize: '14px', lineHeight: '20px' }}>
                    <div>{pagePreviews.length} page{pagePreviews.length !== 1 ? 's' : ''} loaded</div>
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>{totalBoxCount} redaction{totalBoxCount !== 1 ? 's' : ''} marked</div>
                  </div>
                )}
                <button onClick={handleRedact} disabled={!file || !totalBoxCount || isProcessing}
                  style={{
                    width: '100%',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    border: 'none',
                    background: !file || !totalBoxCount ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file || !totalBoxCount ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: !file || !totalBoxCount || isProcessing ? 'not-allowed' : 'pointer',
                    minHeight: '56px',
                    fontSize: '16px',
                  }}>
                  {isProcessing ? 'Redacting...' : 'Apply Redactions'} <ArrowRight size={18} />
                </button>
                {!totalBoxCount && file && <p style={{ fontSize: '12px', color: 'var(--ink-muted)', textAlign: 'center' }}>Draw at least one redaction box first.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RedactPdf;
