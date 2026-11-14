import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, CheckCircle, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, degrees } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';
import { visualFrame } from '../../../utils/pdfText';
import { isHeic, heicToJpeg } from '../../../utils/heic';

interface Placement { page: number; x: number; y: number; w: number; h: number; imgData: string; imgType: 'png' | 'jpeg'; }

const AddImagesToPdf = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<Array<{ pdfW: number; pdfH: number; cW: number; cH: number }>>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [pendingImg, setPendingImg] = useState<{ data: string; type: 'png' | 'jpeg' } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragRect, setDragRect] = useState<[number, number, number, number] | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setPdfFile(f); setPlacements([]); setDownloadUrl(null); setCurrentPage(0);
    const ab = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
    const previews: string[] = [];
    const sizes: typeof pageSizes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1.5 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ intent: 'print', canvasContext: c.getContext('2d')!, viewport: vp }).promise;
      previews.push(c.toDataURL());
      sizes.push({ pdfW: page.getViewport({ scale: 1 }).width, pdfH: page.getViewport({ scale: 1 }).height, cW: vp.width, cH: vp.height });
    }
    setPagePreviews(previews); setPageSizes(sizes);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  useEffect(() => {
    if (!canvasRef.current || !pagePreviews[currentPage]) return;
    const ps = pageSizes[currentPage];
    const canvas = canvasRef.current;
    canvas.width = ps.cW; canvas.height = ps.cH;
    const img = new Image();
    img.onload = () => canvas.getContext('2d')!.drawImage(img, 0, 0);
    img.src = pagePreviews[currentPage];
  }, [pagePreviews, currentPage, pageSizes]);

  useEffect(() => {
    if (!overlayRef.current || !pageSizes[currentPage]) return;
    const ps = pageSizes[currentPage];
    const canvas = overlayRef.current;
    canvas.width = ps.cW; canvas.height = ps.cH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, ps.cW, ps.cH);
    placements.filter(p => p.page === currentPage).forEach(p => {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, p.x, p.y, p.w, p.h);
      img.src = p.imgData;
      ctx.strokeStyle = '#0EA5E9'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    });
    if (dragRect) {
      ctx.strokeStyle = '#0EA5E9'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.strokeRect(dragRect[0], dragRect[1], dragRect[2], dragRect[3]);
      ctx.setLineDash([]);
    }
  }, [placements, currentPage, pageSizes, dragRect]);

  const getPos = (e: React.MouseEvent): [number, number] => {
    const c = overlayRef.current!;
    const r = c.getBoundingClientRect();
    return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)];
  };

  const loadImageFile = async (f: File) => {
    try {
      // PDFs embed JPEG and PNG directly; anything else (WebP, GIF, HEIC…) becomes PNG first.
      let blob: Blob = f, type: 'png' | 'jpeg' = f.type === 'image/png' ? 'png' : 'jpeg';
      if (isHeic(f)) blob = await heicToJpeg(f);
      else if (f.type !== 'image/png' && f.type !== 'image/jpeg') {
        const bmp = await createImageBitmap(f);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        c.getContext('2d')!.drawImage(bmp, 0, 0);
        bmp.close();
        blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
        type = 'png';
      }
      const data = await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
      setPendingImg({ data, type });
      setPlacing(true);
    } catch (e) { console.error(e); setError('Could not read that image. Try a JPG or PNG.'); }
  };

  const handleMouseDown = (e: React.MouseEvent) => { if (!placing || !pendingImg) return; setDragStart(getPos(e)); };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!placing || !dragStart) return;
    const [x, y] = getPos(e);
    setDragRect([Math.min(dragStart[0], x), Math.min(dragStart[1], y), Math.abs(x - dragStart[0]), Math.abs(y - dragStart[1])]);
  };
  const handleMouseUp = () => {
    if (!placing || !dragStart || !dragRect || !pendingImg) return;
    if (dragRect[2] > 10 && dragRect[3] > 10) {
      setPlacements(prev => [...prev, { page: currentPage, x: dragRect[0], y: dragRect[1], w: dragRect[2], h: dragRect[3], imgData: pendingImg.data, imgType: pendingImg.type }]);
    }
    setDragStart(null); setDragRect(null); setPendingImg(null); setPlacing(false);
  };

  const handleApply = async () => {
    if (!pdfFile || !placements.length) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await pdfFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      for (const pl of placements) {
        const page = pages[pl.page];
        const ps = pageSizes[pl.page];
        // The preview is the page as seen (CropBox, /Rotate applied) — map through that frame.
        const frame = visualFrame(page);
        const sx = frame.width / ps.cW; const sy = frame.height / ps.cH;
        const resp = await fetch(pl.imgData);
        const imgAb = await (await resp.blob()).arrayBuffer();
        const embedded = pl.imgType === 'png' ? await pdfDoc.embedPng(imgAb) : await pdfDoc.embedJpg(imgAb);
        const at = frame.toPage(pl.x * sx, frame.height - (pl.y + pl.h) * sy);
        page.drawImage(embedded, { x: at.x, y: at.y, width: pl.w * sx, height: pl.h * sy, rotate: frame.rotate ? degrees(frame.rotate) : undefined });
      }
      const bytes = await pdfDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Could not add the images. The PDF may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Add Images to PDF" description="Insert images anywhere on your PDF pages by dragging to set position and size.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          {!pdfFile ? (
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Then insert images onto pages</p>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => { if (imgInputRef.current) imgInputRef.current.click(); }} className="btn-primary" style={{ height: '48px', minHeight: '48px', padding: '0 20px', borderRadius: '999px', fontSize: '14px' }}>
                  <ImageIcon size={16} /> Choose Image to Insert
                </button>
                <input ref={imgInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/heic,image/heif,.heic,.heif" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) loadImageFile(e.target.files[0]); e.target.value = ''; }} />
                {placing && <span style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--accent)', fontWeight: 600 }}>Drag on the page to place the image</span>}
                <button onClick={() => { setPdfFile(null); setPagePreviews([]); setPlacements([]); }} className="btn-secondary" style={{ marginLeft: 'auto', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>Change PDF</button>
              </div>
              <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                <canvas ref={canvasRef} style={{ display: 'block', width: '100%', borderRadius: '16px' }} />
                {/* Pointer events cover mouse, touch and stylus; touch-action stops scrolling mid-drag. */}
                <canvas ref={overlayRef}
                  onPointerDown={e => { if (placing) e.currentTarget.setPointerCapture(e.pointerId); handleMouseDown(e); }}
                  onPointerMove={handleMouseMove} onPointerUp={handleMouseUp} onPointerCancel={handleMouseUp}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: placing ? 'crosshair' : 'default', borderRadius: '16px', touchAction: placing ? 'none' : 'auto' }} />
              </div>
              {pagePreviews.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <button onClick={() => setCurrentPage(p => Math.max(0, p-1))} disabled={currentPage === 0} aria-label="Previous page" className="btn-secondary" style={{ width: '44px', height: '44px', minHeight: '44px', padding: 0, borderRadius: '999px', opacity: currentPage === 0 ? 0.5 : 1 }}><ChevronLeft size={16} /></button>
                  <span style={{ fontSize: '14px' }}>Page {currentPage + 1} / {pagePreviews.length}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(pagePreviews.length-1, p+1))} disabled={currentPage === pagePreviews.length-1} aria-label="Next page" className="btn-secondary" style={{ width: '44px', height: '44px', minHeight: '44px', padding: 0, borderRadius: '999px', opacity: currentPage === pagePreviews.length-1 ? 0.5 : 1 }}><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '24px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Image Placement</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`images_${pdfFile?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none' }}>Download PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`images_${pdfFile?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>1. Upload your PDF<br />2. Click "Choose Image" to select a JPG or PNG<br />3. Drag on the page to set its position & size<br />4. Repeat for more images, then apply.</p>
              {pdfFile && <div style={{ background: 'var(--surface-sunken)', padding: '12px 16px', borderRadius: '16px', fontSize: '14px' }}>{placements.length} image{placements.length !== 1 ? 's' : ''} placed</div>}
              <button onClick={handleApply} disabled={!pdfFile || !placements.length || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Applying…' : 'Apply & Download'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AddImagesToPdf;
