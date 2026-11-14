import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight, ArrowUp, ArrowDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';

interface PageItem {
  originalIndex: number;
  thumbnail: string;
}

const RearrangePages = () => {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const f = acceptedFiles[0];
    setFile(f);
    setPages([]);
    setDownloadUrl(null);
    setIsLoading(true);

    try {
      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: arrayBuffer }).promise;
      const items: PageItem[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ intent: 'print', canvasContext: ctx, viewport }).promise;
        items.push({ originalIndex: i - 1, thumbnail: canvas.toDataURL('image/jpeg', 0.6) });
      }
      setPages(items);
    } catch (err) {
      console.error(err);
      setError('Failed to load PDF pages.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const movePage = (idx: number, dir: 'up' | 'down') => {
    const newPages = [...pages];
    if (dir === 'up' && idx > 0) {
      [newPages[idx - 1], newPages[idx]] = [newPages[idx], newPages[idx - 1]];
    } else if (dir === 'down' && idx < newPages.length - 1) {
      [newPages[idx], newPages[idx + 1]] = [newPages[idx + 1], newPages[idx]];
    }
    setPages(newPages);
  };

  // Drag a page onto another position (desktop); the arrows remain for touch and keyboard.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dropAt = (to: number) => {
    if (dragFrom === null || dragFrom === to) return;
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragFrom, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragFrom(null);
  };

  const handleSave = async () => {
    if (!file || pages.length === 0) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const srcPdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const newPdf = await PDFDocument.create();
      const indices = pages.map(p => p.originalIndex);
      const copied = await newPdf.copyPages(srcPdf, indices);
      copied.forEach(p => newPdf.addPage(p));
      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to save rearranged PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Rearrange Pages"
      description="Visually drag pages up or down to reorder them, then save the new version."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          {pages.length === 0 ? (
            <div
              {...getRootProps()}
              style={{
                border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
                borderRadius: '24px',
                padding: '40px',
                textAlign: 'center',
                background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                minWidth: 0,
              }}
            >
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                {isLoading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ width: '24px', height: '24px', border: '3px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%' }} />
                ) : (
                  <UploadCloud size={32} />
                )}
              </div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{isLoading ? 'Loading pages...' : 'Upload PDF'}</h3>
              {!isLoading && <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, minWidth: 0 }}>{pages.length} pages — drag to reorder</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => setPages(prev => [...prev].reverse())} style={{ background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', fontSize: '14px', minHeight: '44px', cursor: 'pointer' }}>
                    Reverse order
                  </button>
                  <button onClick={() => { setFile(null); setPages([]); setDownloadUrl(null); }} style={{ background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', fontSize: '14px', minHeight: '44px', cursor: 'pointer' }}>
                    New file
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <AnimatePresence>
                  {pages.map((p, idx) => (
                    <motion.div
                      key={p.originalIndex}
                      layout
                      draggable
                      onDragStart={() => setDragFrom(idx)}
                      onDragOver={(e: React.DragEvent) => e.preventDefault()}
                      onDrop={() => dropAt(idx)}
                      onDragEnd={() => setDragFrom(null)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '16px', boxShadow: dragFrom === idx ? 'inset 0 0 0 2px var(--accent)' : 'none', cursor: 'grab', minWidth: 0, opacity: dragFrom === idx ? 0.5 : 1 }}
                    >
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', minWidth: '24px', fontWeight: 600 }}>{idx + 1}</span>
                      <img src={p.thumbnail} alt={`Page ${p.originalIndex + 1}`} style={{ height: '60px', flexShrink: 0, borderRadius: '12px', objectFit: 'cover', boxShadow: '0 0 0 1px var(--hairline)' }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)' }}>Original page {p.originalIndex + 1}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        <button onClick={() => movePage(idx, 'up')} disabled={idx === 0} aria-label={`Move page ${idx + 1} up`} style={{ background: 'transparent', color: idx === 0 ? 'var(--ink-faint)' : 'var(--accent)', width: '44px', height: '44px', padding: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.5 : 1 }}>
                          <ArrowUp size={16} />
                        </button>
                        <button onClick={() => movePage(idx, 'down')} disabled={idx === pages.length - 1} aria-label={`Move page ${idx + 1} down`} style={{ background: 'transparent', color: idx === pages.length - 1 ? 'var(--ink-faint)' : 'var(--accent)', width: '44px', height: '44px', padding: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: idx === pages.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === pages.length - 1 ? 0.5 : 1 }}>
                          <ArrowDown size={16} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent)" /> Actions
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Pages Reordered!</h4>
                  <a href={downloadUrl} download={`reordered_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', marginTop: '16px', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`reordered_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '20px' }}>
                  {pages.length > 0 ? `${pages.length} pages loaded. Use the arrows to reorder, then tap Save.` : 'Upload a PDF to see its pages and reorder them.'}
                </p>
                <button
                  onClick={handleSave}
                  disabled={pages.length === 0 || isProcessing}
                  style={{
                    width: '100%',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    border: 'none',
                    background: pages.length === 0 ? 'var(--surface-high)' : 'var(--accent)',
                    color: pages.length === 0 ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: pages.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
                    minHeight: '56px',
                    fontSize: '16px',
                  }}
                >
                  {isProcessing ? 'Saving...' : 'Save New Order'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RearrangePages;
