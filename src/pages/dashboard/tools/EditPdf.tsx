import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Type, Pen, Square, Circle, Highlighter, Link2, Trash2, ChevronLeft, ChevronRight, CheckCircle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, PDFString, rgb } from 'pdf-lib';
import { prepareText } from '../../../utils/pdfText';
import { normaliseLink } from '../../../utils/links';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';

type ToolMode = 'draw' | 'text' | 'highlight' | 'underline' | 'strikethrough' | 'rect' | 'ellipse' | 'link';

interface Annotation {
  id: string;
  type: ToolMode;
  page: number;
  color: string;
  lineWidth: number;
  points?: Array<[number, number]>;
  text?: string;
  x?: number;
  y?: number;
  fontSize?: number;
  url?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** `toPdf` maps canvas pixels to PDF user space (pdf.js viewport inverse: handles /Rotate and CropBox). */
interface PageSize { pdfW: number; pdfH: number; canvasW: number; canvasH: number; rotation: number; toPdf: (x: number, y: number) => number[] }

interface EditPdfProps { defaultMode?: ToolMode; title?: string; description?: string; }

const COLORS = ['#000000', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'];

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
};

const toPdfCoords = (cx: number, cy: number, ps: PageSize) => {
  const [px, py] = ps.toPdf(cx, cy);
  return { px, py };
};

const EditPdf = ({ defaultMode = 'draw', title = 'Edit PDF', description = 'Annotate, draw, add text and shapes to your PDF.' }: EditPdfProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [pagePreviews, setPagePreviews] = useState<string[]>([]);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mode, setMode] = useState<ToolMode>(defaultMode);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(3);
  const [fontSize, setFontSize] = useState(14);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Array<[number, number]>>([]);
  const [dragStart, setDragStart] = useState<[number, number] | null>(null);
  const [dragCurrent, setDragCurrent] = useState<[number, number] | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [linkBox, setLinkBox] = useState<{ x1: number; y1: number; x2: number; y2: number; left: number; top: number } | null>(null);
  const [linkValue, setLinkValue] = useState('');
  const [linkError, setLinkError] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const bgRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const f = acceptedFiles[0];
    setFile(f);
    setAnnotations([]);
    setDownloadUrl(null);
    setCurrentPage(0);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
      const previews: string[] = [];
      const sizes: PageSize[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ intent: 'print', canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        previews.push(canvas.toDataURL());
        sizes.push({
          pdfW: page.getViewport({ scale: 1 }).width, pdfH: page.getViewport({ scale: 1 }).height,
          canvasW: vp.width, canvasH: vp.height, rotation: page.rotate,
          toPdf: (x: number, y: number) => vp.convertToPdfPoint(x, y),
        });
      }
      setPagePreviews(previews);
      setPageSizes(sizes);
    } catch (e) { console.error(e); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  // Draw bg page
  useEffect(() => {
    if (!bgRef.current || !pagePreviews[currentPage]) return;
    const canvas = bgRef.current;
    const ps = pageSizes[currentPage];
    canvas.width = ps.canvasW;
    canvas.height = ps.canvasH;
    const img = new Image();
    img.onload = () => canvas.getContext('2d')!.drawImage(img, 0, 0);
    img.src = pagePreviews[currentPage];
  }, [pagePreviews, currentPage, pageSizes]);

  // Draw overlay annotations
  useEffect(() => {
    if (!overlayRef.current || !pageSizes[currentPage]) return;
    const canvas = overlayRef.current;
    const ps = pageSizes[currentPage];
    canvas.width = ps.canvasW;
    canvas.height = ps.canvasH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderAnn = (ann: Annotation) => {
      ctx.save();
      ctx.strokeStyle = ann.color;
      ctx.fillStyle = ann.color;
      ctx.lineWidth = ann.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.type === 'draw' && ann.points && ann.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(ann.points[0][0], ann.points[0][1]);
        ann.points.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
        ctx.stroke();
      } else if (ann.type === 'text' && ann.text && ann.x !== undefined && ann.y !== undefined) {
        ctx.font = `${ann.fontSize}px sans-serif`;
        ctx.fillText(ann.text, ann.x, ann.y);
      } else if (ann.type === 'highlight' && ann.x1 !== undefined) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ann.color;
        ctx.fillRect(ann.x1, ann.y1!, ann.x2! - ann.x1, ann.y2! - ann.y1!);
      } else if (ann.type === 'underline' && ann.x1 !== undefined) {
        ctx.beginPath();
        ctx.moveTo(ann.x1, ann.y2!);
        ctx.lineTo(ann.x2!, ann.y2!);
        ctx.stroke();
      } else if (ann.type === 'strikethrough' && ann.x1 !== undefined) {
        const midY = (ann.y1! + ann.y2!) / 2;
        ctx.beginPath();
        ctx.moveTo(ann.x1, midY);
        ctx.lineTo(ann.x2!, midY);
        ctx.stroke();
      } else if (ann.type === 'rect' && ann.x1 !== undefined) {
        ctx.strokeRect(ann.x1, ann.y1!, ann.x2! - ann.x1, ann.y2! - ann.y1!);
      } else if (ann.type === 'ellipse' && ann.x1 !== undefined) {
        ctx.beginPath();
        ctx.ellipse((ann.x1 + ann.x2!) / 2, (ann.y1! + ann.y2!) / 2, Math.abs(ann.x2! - ann.x1) / 2, Math.abs(ann.y2! - ann.y1!) / 2, 0, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (ann.type === 'link' && ann.x1 !== undefined) {
        // Editor-only marker; the saved PDF gets an invisible clickable area.
        ctx.strokeStyle = '#2563EB'; ctx.fillStyle = 'rgba(37,99,235,0.08)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.fillRect(ann.x1, ann.y1!, ann.x2! - ann.x1, ann.y2! - ann.y1!);
        ctx.strokeRect(ann.x1, ann.y1!, ann.x2! - ann.x1, ann.y2! - ann.y1!);
        ctx.setLineDash([]); ctx.fillStyle = '#2563EB'; ctx.font = '13px sans-serif';
        ctx.fillText(`🔗 ${ann.url}`.slice(0, 60), Math.min(ann.x1, ann.x2!) + 4, Math.min(ann.y1!, ann.y2!) - 5);
      }
      ctx.restore();
    };

    annotations.filter(a => a.page === currentPage).forEach(renderAnn);

    // Live preview
    if (isDrawing && drawPoints.length > 1) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(drawPoints[0][0], drawPoints[0][1]);
      drawPoints.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.stroke(); ctx.restore();
    }
    if (dragStart && dragCurrent) {
      const [x1, y1] = dragStart; const [x2, y2] = dragCurrent;
      ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = 'round';
      if (mode === 'highlight') { ctx.globalAlpha = 0.35; ctx.fillRect(x1, y1, x2-x1, y2-y1); }
      else if (mode === 'underline') { ctx.beginPath(); ctx.moveTo(x1, y2); ctx.lineTo(x2, y2); ctx.stroke(); }
      else if (mode === 'strikethrough') { const my = (y1+y2)/2; ctx.beginPath(); ctx.moveTo(x1, my); ctx.lineTo(x2, my); ctx.stroke(); }
      else if (mode === 'rect') { ctx.strokeRect(x1, y1, x2-x1, y2-y1); }
      else if (mode === 'ellipse') { ctx.beginPath(); ctx.ellipse((x1+x2)/2,(y1+y2)/2,Math.abs(x2-x1)/2,Math.abs(y2-y1)/2,0,0,2*Math.PI); ctx.stroke(); }
      else if (mode === 'link') { ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x1, y1, x2-x1, y2-y1); }
      ctx.restore();
    }
  }, [annotations, currentPage, pageSizes, isDrawing, drawPoints, dragStart, dragCurrent, color, lineWidth, mode]);

  const getPos = (e: React.MouseEvent): [number, number] => {
    const canvas = overlayRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return [(e.clientX - rect.left) * sx, (e.clientY - rect.top) * sy];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [x, y] = getPos(e);
    if (mode === 'text') {
      const canvas = overlayRef.current!;
      const rect = canvas.getBoundingClientRect();
      setTextInput({ canvasX: x, canvasY: y, x: e.clientX - rect.left, y: e.clientY - rect.top });
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }
    setIsDrawing(true);
    if (mode === 'draw') setDrawPoints([[x, y]]);
    else setDragStart([x, y]);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDrawing) return;
    const [x, y] = getPos(e);
    if (mode === 'draw') setDrawPoints(prev => [...prev, [x, y]]);
    else setDragCurrent([x, y]);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const id = Math.random().toString(36).slice(2);
    if (mode === 'draw' && drawPoints.length > 1) {
      setAnnotations(prev => [...prev, { id, type: 'draw', page: currentPage, color, lineWidth, points: [...drawPoints] }]);
      setDrawPoints([]);
    } else if (dragStart && dragCurrent && mode === 'link') {
      const [x1, y1] = dragStart; const [x2, y2] = dragCurrent;
      setDragStart(null); setDragCurrent(null);
      if (Math.abs(x2 - x1) < 8 || Math.abs(y2 - y1) < 8) return; // a click, not a box
      const canvas = overlayRef.current!;
      const k = canvas.getBoundingClientRect().width / canvas.width;
      setLinkBox({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2), left: Math.min(x1, x2) * k, top: Math.max(y1, y2) * k + 4 });
      setLinkValue(''); setLinkError('');
      setTimeout(() => linkInputRef.current?.focus(), 50);
    } else if (dragStart && dragCurrent) {
      const [x1, y1] = dragStart; const [x2, y2] = dragCurrent;
      setAnnotations(prev => [...prev, { id, type: mode, page: currentPage, color, lineWidth, x1, y1, x2, y2 }]);
      setDragStart(null); setDragCurrent(null);
    }
  };

  const confirmText = () => {
    if (textInput && textValue.trim()) {
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => [...prev, { id, type: 'text', page: currentPage, color, lineWidth, text: textValue, x: textInput.canvasX, y: textInput.canvasY, fontSize }]);
    }
    setTextInput(null); setTextValue('');
  };

  const confirmLink = () => {
    if (!linkBox) return;
    if (!linkValue.trim()) { setLinkBox(null); return; }
    const url = normaliseLink(linkValue);
    if (!url) { setLinkError('Enter a web address, email or phone number.'); return; }
    setAnnotations(prev => [...prev, { id: Math.random().toString(36).slice(2), type: 'link', page: currentPage, color, lineWidth, url, x1: linkBox.x1, y1: linkBox.y1, x2: linkBox.x2, y2: linkBox.y2 }]);
    setLinkBox(null); setLinkValue(''); setLinkError('');
  };

  const undoLast = () => {
    const pageAnns = annotations.filter(a => a.page === currentPage);
    if (!pageAnns.length) return;
    const lastId = pageAnns[pageAnns.length - 1].id;
    setAnnotations(prev => prev.filter(a => a.id !== lastId));
  };

  const handleApply = async () => {
    if (!file || !annotations.length) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      for (const ann of annotations) {
        const page = pages[ann.page];
        const ps = pageSizes[ann.page];
        const c = hexToRgb(ann.color);
        const lw = ann.lineWidth;

        if (ann.type === 'draw' && ann.points && ann.points.length > 1) {
          for (let i = 1; i < ann.points.length; i++) {
            const { px: x1, py: y1 } = toPdfCoords(ann.points[i-1][0], ann.points[i-1][1], ps);
            const { px: x2, py: y2 } = toPdfCoords(ann.points[i][0], ann.points[i][1], ps);
            page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw * (ps.pdfW / ps.canvasW), color: c });
          }
        } else if (ann.type === 'text' && ann.text && ann.x !== undefined) {
          // Baseline sits one font-size below the top-left anchor; rotate with the page so it reads upright.
          const size = ann.fontSize! * (ps.pdfW / ps.canvasW);
          const { px, py } = toPdfCoords(ann.x, ann.y! + ann.fontSize!, ps);
          const t = await prepareText(pdfDoc, ann.text, { size, color: c });
          t.draw(page, { x: px, y: py, color: c, rotate: ps.rotation || undefined });
        } else if ((ann.type === 'link' || ann.type === 'highlight' || ann.type === 'rect' || ann.type === 'underline' || ann.type === 'strikethrough' || ann.type === 'ellipse') && ann.x1 !== undefined) {
          const { px: px1, py: py1 } = toPdfCoords(ann.x1, ann.y1!, ps);
          const { px: px2, py: py2 } = toPdfCoords(ann.x2!, ann.y2!, ps);
          // Normalised box in PDF space — drags can go in any direction, pages can be rotated.
          const bx = Math.min(px1, px2), by = Math.min(py1, py2), bw = Math.abs(px2 - px1), bh = Math.abs(py2 - py1);
          const thickness = lw * (ps.pdfW / ps.canvasW);

          if (ann.type === 'link' && ann.url) {
            // A real Link annotation with a URI action — clickable in every PDF viewer.
            const link = pdfDoc.context.obj({
              Type: 'Annot', Subtype: 'Link', Rect: [bx, by, bx + bw, by + bh], Border: [0, 0, 0],
              A: { Type: 'Action', S: 'URI', URI: PDFString.of(ann.url) },
            });
            page.node.addAnnot(pdfDoc.context.register(link));
          } else if (ann.type === 'highlight') {
            page.drawRectangle({ x: bx, y: by, width: bw, height: bh, color: hexToRgb('#fbbf24'), opacity: 0.35, borderWidth: 0 });
          } else if (ann.type === 'rect') {
            page.drawRectangle({ x: bx, y: by, width: bw, height: bh, borderColor: c, borderWidth: thickness, opacity: 0 });
          } else if (ann.type === 'ellipse') {
            page.drawEllipse({ x: bx + bw / 2, y: by + bh / 2, xScale: bw / 2, yScale: bh / 2, borderColor: c, borderWidth: thickness, opacity: 0 });
          } else if (ann.type === 'underline' || ann.type === 'strikethrough') {
            // Defined on screen (bottom edge / middle of the drag), then mapped — correct on rotated pages too.
            const cy = ann.type === 'underline' ? Math.max(ann.y1!, ann.y2!) : (ann.y1! + ann.y2!) / 2;
            const a = toPdfCoords(Math.min(ann.x1, ann.x2!), cy, ps), b = toPdfCoords(Math.max(ann.x1, ann.x2!), cy, ps);
            page.drawLine({ start: { x: a.px, y: a.py }, end: { x: b.px, y: b.py }, thickness, color: c });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to apply annotations.'); }
    finally { setIsProcessing(false); }
  };

  const pageAnnCount = annotations.filter(a => a.page === currentPage).length;

  const tools: Array<{ id: ToolMode; icon: React.ReactNode; label: string }> = [
    { id: 'draw', icon: <Pen size={16} />, label: 'Draw' },
    { id: 'text', icon: <Type size={16} />, label: 'Text' },
    { id: 'highlight', icon: <Highlighter size={16} />, label: 'Highlight' },
    { id: 'underline', icon: <span style={{ textDecoration: 'underline', fontWeight: 700, fontSize: 13 }}>U</span>, label: 'Underline' },
    { id: 'strikethrough', icon: <span style={{ textDecoration: 'line-through', fontWeight: 700, fontSize: 13 }}>S</span>, label: 'Strike' },
    { id: 'rect', icon: <Square size={16} />, label: 'Rect' },
    { id: 'ellipse', icon: <Circle size={16} />, label: 'Ellipse' },
    { id: 'link', icon: <Link2 size={16} />, label: 'Link' },
  ];

  return (
    <ToolWorkspaceLayout title={title} description={description}>
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        {/* Left: canvas editor */}
        <div style={{ flex: 2, padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          {!file ? (
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Edit</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Drag & drop, or tap to browse</p>
            </div>
          ) : (
            <>
              {/* Toolbar: one horizontal tray, scrolls instead of wrapping */}
              <div role="toolbar" aria-label="Editing tools" style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 2px', margin: '0 -2px' }}>
                {tools.map(t => (
                  <button key={t.id} onClick={() => setMode(t.id)} title={t.label} aria-label={t.label} aria-pressed={mode === t.id}
                    style={{ width: '44px', height: '44px', minWidth: '44px', flexShrink: 0, borderRadius: '50%', border: 'none', background: mode === t.id ? 'var(--accent)' : 'var(--surface-high)', color: mode === t.id ? 'var(--on-accent)' : 'var(--ink)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontSize: '14px' }}>
                    {t.icon}
                  </button>
                ))}
                <div aria-hidden="true" style={{ width: '2px', height: '24px', flexShrink: 0, borderRadius: '1px', background: 'var(--surface-high)', margin: '0 4px' }} />
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c}
                    style={{ width: '40px', height: '40px', minWidth: '40px', flexShrink: 0, borderRadius: '50%', padding: 0, background: c, border: 'none', boxShadow: color === c ? '0 0 0 3px var(--surface), 0 0 0 5px var(--accent)' : 'inset 0 0 0 1.5px var(--hairline)', cursor: 'pointer' }} />
                ))}
                <div aria-hidden="true" style={{ width: '2px', height: '24px', flexShrink: 0, borderRadius: '1px', background: 'var(--surface-high)', margin: '0 4px' }} />
                <button onClick={undoLast} title="Undo last" aria-label="Undo last" style={{ minWidth: '44px', height: '44px', flexShrink: 0, padding: '0 16px', borderRadius: '22px', border: 'none', color: 'var(--danger)', background: 'var(--danger-bg)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Trash2 size={16} /> Undo
                </button>
              </div>

              {/* Canvas */}
              <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                <canvas ref={bgRef} style={{ display: 'block', width: '100%', borderRadius: '16px' }} />
                {/* Pointer events: mouse, touch and stylus alike. touch-action: none stops the
                    page from scrolling while drawing; capture keeps a drag alive off-canvas. */}
                <canvas ref={overlayRef}
                  onPointerDown={e => { if (mode !== 'text') e.currentTarget.setPointerCapture(e.pointerId); handleMouseDown(e); }}
                  onPointerMove={handleMouseMove} onPointerUp={handleMouseUp} onPointerCancel={handleMouseUp}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: mode === 'text' ? 'text' : 'crosshair', borderRadius: '16px', touchAction: 'none' }} />
                {textInput && (
                  <input ref={textInputRef} value={textValue} onChange={e => setTextValue(e.target.value)}
                    onBlur={confirmText} onKeyDown={e => { if (e.key === 'Enter') confirmText(); if (e.key === 'Escape') { setTextInput(null); setTextValue(''); } }}
                    style={{ position: 'absolute', left: textInput.x, top: textInput.y, zIndex: 10, border: '1.5px dashed var(--accent)', borderRadius: '12px', padding: '2px 6px', fontSize: `${fontSize}px`, color, background: 'rgba(255,255,255,0.9)', minWidth: '80px', outline: 'none' }} />
                )}
                {linkBox && (
                  <div style={{ position: 'absolute', left: linkBox.left, top: linkBox.top, zIndex: 10, display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--surface)', borderRadius: '16px', padding: '12px', boxShadow: 'var(--shadow-raised)', width: 'min(300px, 80vw)', boxSizing: 'border-box' }}>
                    <input ref={linkInputRef} value={linkValue} onChange={e => { setLinkValue(e.target.value); setLinkError(''); }} placeholder="https://example.com, email or phone" aria-label="Link address"
                      onKeyDown={e => { if (e.key === 'Enter') confirmLink(); if (e.key === 'Escape') setLinkBox(null); }}
                      style={{ minHeight: '48px', padding: '0 14px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', fontSize: '16px', boxSizing: 'border-box', width: '100%' }} />
                    {linkError && <span style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--danger)' }}>{linkError}</span>}
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button className="btn-secondary" onClick={() => setLinkBox(null)} style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px' }}>Cancel</button>
                      <button className="btn-primary" onClick={confirmLink} style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px' }}>Add link</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Page nav */}
              {pagePreviews.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                  <button onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0} aria-label="Previous page" style={{ width: '44px', height: '44px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: 'var(--surface-high)', color: 'var(--ink)', cursor: 'pointer', opacity: currentPage === 0 ? 0.5 : 1 }}><ChevronLeft size={16} /></button>
                  <span style={{ fontSize: '14px', lineHeight: '20px' }}>Page {currentPage + 1} of {pagePreviews.length}</span>
                  <button onClick={() => setCurrentPage(p => Math.min(pagePreviews.length - 1, p + 1))} disabled={currentPage === pagePreviews.length - 1} aria-label="Next page" style={{ width: '44px', height: '44px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: 'none', background: 'var(--surface-high)', color: 'var(--ink)', cursor: 'pointer', opacity: currentPage === pagePreviews.length - 1 ? 0.5 : 1 }}><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: settings + apply */}
        <div style={{ flex: 1, padding: '24px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600 }}>Settings</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>PDF Saved!</h4>
                <a href={downloadUrl} download={`edited_${file?.name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--on-accent)', minHeight: '56px', padding: '0 24px', borderRadius: '24px', fontWeight: 700, fontSize: '16px', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                  <Download size={16} /> Download
                </a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`edited_${file?.name}`} />
                <button onClick={() => setDownloadUrl(null)} className="btn-secondary" style={{ marginTop: '10px', width: '100%', fontSize: '14px' }}>Edit more</button>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">Tool: <span style={{ color: 'var(--accent)', textTransform: 'capitalize' }}>{mode}</span></label>
              </div>
              <div>
                <label className="field-label">Line Width: {lineWidth}px</label>
                <input type="range" min={1} max={12} value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              {mode === 'text' && (
                <div>
                  <label className="field-label">Font Size: {fontSize}pt</label>
                  <input type="range" min={8} max={48} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%' }} />
                </div>
              )}
              {file && (
                <div style={{ background: 'var(--surface-sunken)', padding: '12px', borderRadius: '16px', fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>
                  {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} total<br />
                  {pageAnnCount} on page {currentPage + 1}
                </div>
              )}
              <button onClick={handleApply} disabled={!file || !annotations.length || isProcessing}
                style={{ width: '100%', minHeight: '56px', padding: '0 24px', borderRadius: '24px', fontWeight: 700, fontSize: '16px', border: 'none', background: annotations.length ? 'var(--accent)' : 'var(--surface-high)', color: annotations.length ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !annotations.length ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {isProcessing ? 'Saving…' : 'Save & Download'} {!isProcessing && <Download size={15} />}
              </button>
              {!annotations.length && file && <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--ink-muted)', textAlign: 'center' }}>Add at least one annotation first.</p>}
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default EditPdf;
