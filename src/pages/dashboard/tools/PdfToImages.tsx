import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';

import '../../../utils/pdfWorker';
import { zipSync } from 'fflate';

interface RenderedPage {
  pageNum: number;
  /** blob: URL — far lighter than a base64 data URL for many large pages. */
  url: string;
  blob: Blob;
}

interface PdfToImagesProps {
  outputFormat: 'jpg' | 'png';
}

const PdfToImages = ({ outputFormat }: PdfToImagesProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [progress, setProgress] = useState(0);
  const [scale, setScale] = useState(2);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setPages(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
      setProgress(0);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    setPages(prev => { prev.forEach(p => URL.revokeObjectURL(p.url)); return []; });
    setProgress(0);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: arrayBuffer }).promise;
      const rendered: RenderedPage[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        // PDFs often don't paint a page background; without this, the transparent
        // canvas turns black in a JPEG.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ intent: 'print', canvasContext: ctx, viewport }).promise;
        const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), mimeType, outputFormat === 'jpg' ? 0.92 : undefined));
        rendered.push({ pageNum: i, url: URL.createObjectURL(blob), blob });
        canvas.width = canvas.height = 0; // release the bitmap now, not at GC
        setProgress(Math.round((i / pdf.numPages) * 100));
      }

      setPages(rendered);
    } catch (err) {
      console.error(err);
      setError('Failed to convert PDF to images.');
    } finally {
      setIsProcessing(false);
    }
  };

  const baseName = file?.name.replace(/\.[^/.]+$/, '') ?? 'page';
  const pageName = (n: number) => `${baseName}_page_${String(n).padStart(String(pages.length).length, '0')}.${outputFormat}`;
  const save = (href: string, name: string) => {
    const a = document.createElement('a');
    a.href = href; a.download = name; a.click();
  };
  const downloadPage = (page: RenderedPage) => save(page.url, pageName(page.pageNum));

  // One ZIP instead of N separate downloads — browsers block bursts of downloads.
  const downloadAll = async () => {
    if (pages.length === 1) { downloadPage(pages[0]); return; }
    const files: Record<string, Uint8Array> = {};
    for (const p of pages) files[pageName(p.pageNum)] = new Uint8Array(await p.blob.arrayBuffer());
    const zip = zipSync(files, { level: 0 }); // already-compressed images
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    save(url, `${baseName}_${outputFormat}.zip`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const accentColor = 'var(--accent)';

  return (
    <ToolWorkspaceLayout
      title={`PDF to ${outputFormat.toUpperCase()}`}
      description={`Render every page of your PDF as a high-resolution ${outputFormat.toUpperCase()} image.`}
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', overflowY: 'auto' }}>
          {pages.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, minWidth: 0 }}>{pages.length} page(s) extracted</h3>
                <button onClick={downloadAll} className="btn-primary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '16px', fontSize: '14px', lineHeight: '20px', flexShrink: 0 }}>
                  <Download size={14} /> {pages.length > 1 ? 'Download all (ZIP)' : 'Download'}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                {pages.map((p) => (
                  <motion.div key={p.pageNum} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ borderRadius: '16px', overflow: 'hidden', background: 'var(--surface-sunken)' }}>
                    <img src={p.url} alt={`Page ${p.pageNum}`} style={{ width: '100%', display: 'block' }} />
                    <div style={{ padding: '0 0 0 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>Page {p.pageNum}</span>
                      <button onClick={() => downloadPage(p)} aria-label={`Download page ${p.pageNum}`} style={{ background: 'transparent', border: 'none', color: accentColor, padding: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Download size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <div
              {...getRootProps()}
              style={{
                border: `1.5px dashed ${isDragActive ? accentColor : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
                borderRadius: '24px', padding: '40px 24px', textAlign: 'center',
                background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
                cursor: 'pointer', transition: 'all 0.2s ease', flex: 1,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              }}
            >
              <input {...getInputProps()} />
              {!file ? (
                <>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <UploadCloud size={32} />
                  </div>
                  <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click to browse</p>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <FileText size={48} color={accentColor} style={{ marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Ready for extraction</p>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    Choose different file
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageIcon size={20} color={accentColor} /> Settings
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">
                  Resolution: {scale === 1 ? '72 dpi (Screen)' : scale === 2 ? '144 dpi (Standard)' : '216 dpi (High)'}
                </label>
                <input type="range" min={1} max={3} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
              </div>

              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
                    <span>Processing pages...</span>
                    <span style={{ fontWeight: 600, color: accentColor }}>{progress}%</span>
                  </div>
                  <ProgressBar progress={progress} color={accentColor} trackColor="var(--surface-high)" />
                </div>
              )}

              {pages.length === 0 && !isProcessing && (
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
                >
                  Extract as {outputFormat.toUpperCase()}
                </button>
              )}

              {pages.length > 0 && (
                <button
                  onClick={() => { setPages([]); setFile(null); }}
                  className="btn-secondary" style={{ width: '100%' }}
                >
                  Convert another PDF
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PdfToImages;
