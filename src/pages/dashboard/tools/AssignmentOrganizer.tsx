import { useState, useCallback, type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight, ChevronUp, ChevronDown, X, FolderInput } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb } from 'pdf-lib';
import { pickFonts, wrapText, prepareText, visualFrame, drawVisual } from '../../../utils/pdfText';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

interface Item {
  id: string;
  file: File;
  label: string; // cover/divider label, editable
}

const A4: [number, number] = [595.28, 841.89];

const iconBtn: CSSProperties = { width: '44px', height: '44px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', padding: 0 };

const AssignmentOrganizer = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [coverPages, setCoverPages] = useState(true);
  const [numberPages, setNumberPages] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const reset = () => { setIsDone(false); setDownloadUrl(null); };

  const onDrop = useCallback((accepted: File[]) => {
    const pdfs = accepted.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) { setError('Please add PDF files only.'); return; }
    setError('');
    reset();
    setItems(prev => [
      ...prev,
      ...pdfs.map(f => ({ id: crypto.randomUUID(), file: f, label: f.name.replace(/\.[^/.]+$/, '') })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
  });

  const move = (idx: number, dir: -1 | 1) => {
    setItems(prev => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
    reset();
  };
  const remove = (id: string) => { setItems(prev => prev.filter(i => i.id !== id)); reset(); };
  const setLabel = (id: string, label: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, label } : i));

  const handleOrganize = async () => {
    if (items.length === 0) return;
    setError('');
    setIsProcessing(true);
    try {
      const out = await PDFDocument.create();
      const { regular: reg, bold, safe } = await pickFonts(out, items.flatMap(it => [it.label, it.file.name]));

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (coverPages) {
          const page = out.addPage(A4);
          const { width, height } = page.getSize();
          page.drawRectangle({ x: 0, y: height - 160, width, height: 160, color: rgb(0.94, 0.92, 0.88) });
          page.drawText(`${i + 1}`, { x: 40, y: height - 110, size: 54, font: bold, color: rgb(0.49, 0.28, 0.13) });
          // Title and file name wrap within the page instead of being cut off.
          const titleLines = wrapText(safe(item.label || item.file.name), bold, 22, width - 80).slice(0, 4);
          let ty = height / 2 + 20 + (titleLines.length - 1) * 14;
          for (const ln of titleLines) { page.drawText(ln, { x: 40, y: ty, size: 22, font: bold, color: rgb(0.1, 0.1, 0.1) }); ty -= 28; }
          for (const ln of wrapText(safe(item.file.name), reg, 12, width - 80).slice(0, 3)) {
            page.drawText(ln, { x: 40, y: ty + 4, size: 12, font: reg, color: rgb(0.4, 0.4, 0.4) }); ty -= 16;
          }
          page.drawText('O-ZENITH · Assignment Organizer', { x: 40, y: 40, size: 10, font: reg, color: rgb(0.6, 0.6, 0.6) });
        }

        const bytes = await item.file.arrayBuffer();
        let src: PDFDocument;
        try {
          src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        } catch {
          throw new Error(`"${item.file.name}" could not be read — it may be corrupted or password-protected.`);
        }
        const copied = await out.copyPages(src, src.getPageIndices());
        copied.forEach(p => out.addPage(p));
      }

      if (numberPages) {
        const pages = out.getPages();
        const color = rgb(0.5, 0.5, 0.5);
        for (const [idx, p] of pages.entries()) {
          // Bottom-right of the page as displayed, whatever its /Rotate.
          const t = await prepareText(out, `${idx + 1} / ${pages.length}`, { size: 9, color });
          drawVisual(p, t, visualFrame(p).width - t.width - 24, 18, { color });
        }
      }

      const saved = await out.save();
      const blob = new Blob([saved as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
      setIsDone(true);
    } catch (e) {
      console.error('Assignment organize failed:', e);
      setError(e instanceof Error ? e.message : 'Failed to organize the PDFs.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Assignment PDF Organizer"
      description="Combine multiple assignment PDFs into one tidy document — labeled cover pages, your order, page numbers."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        {/* Left: files + ordering */}
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', minWidth: 0 }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '28px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <UploadCloud size={24} />
            </div>
            <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>Add assignment PDFs</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Drag & drop or click — add as many as you like</p>
          </div>

          {items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {items.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 4px 8px 12px', borderRadius: '16px', background: 'var(--surface-sunken)' }}>
                  <span style={{ width: '28px', height: '28px', flexShrink: 0, borderRadius: '12px', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{idx + 1}</span>
                  <FileText size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <input
                    value={item.label}
                    onChange={e => setLabel(item.id, e.target.value)}
                    placeholder="Label for cover page"
                    aria-label={`Cover page label for document ${idx + 1}`}
                    style={{ flex: 1, minWidth: 0, minHeight: '44px', border: 'none', borderRadius: '12px', padding: '0 12px', fontSize: '16px', background: 'var(--surface)', color: 'var(--ink)' }}
                  />
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} title="Move up" aria-label="Move up" style={{ ...iconBtn, cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? 'var(--ink-faint)' : 'var(--ink-muted)', opacity: idx === 0 ? 0.4 : 1 }}><ChevronUp size={18} /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} title="Move down" aria-label="Move down" style={{ ...iconBtn, cursor: idx === items.length - 1 ? 'default' : 'pointer', color: idx === items.length - 1 ? 'var(--ink-faint)' : 'var(--ink-muted)', opacity: idx === items.length - 1 ? 0.4 : 1 }}><ChevronDown size={18} /></button>
                  <button onClick={() => remove(item.id)} title="Remove" aria-label="Remove" style={{ ...iconBtn, cursor: 'pointer', color: 'var(--danger)' }}><X size={18} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: options + action */}
        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderInput size={20} color="var(--accent)" /> Organizer
          </h3>

          <div style={{ flex: 1 }}>
            {isDone && downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Organized!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>{items.length} document{items.length !== 1 ? 's' : ''} combined into one PDF.</p>
                  <a href={downloadUrl} download="organized-assignments.pdf" className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName="organized-assignments.pdf" />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', marginBottom: '8px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-main)' }}>
                  <input type="checkbox" checked={coverPages} onChange={e => { setCoverPages(e.target.checked); reset(); }} />
                  Add labeled cover page before each
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', marginBottom: '16px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-main)' }}>
                  <input type="checkbox" checked={numberPages} onChange={e => { setNumberPages(e.target.checked); reset(); }} />
                  Add page numbers
                </label>
                <button
                  onClick={handleOrganize}
                  disabled={items.length === 0 || isProcessing}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {isProcessing ? 'Organizing…' : `Organize ${items.length || ''} PDF${items.length !== 1 ? 's' : ''}`} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AssignmentOrganizer;
