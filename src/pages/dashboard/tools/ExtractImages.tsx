import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, Download, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import { zipSync } from 'fflate';
import '../../../utils/pdfWorker';
import { extractPageImages } from '../../../utils/pdfToDocx';
import { PDFDocument } from 'pdf-lib';
import { jpegImagesByPage } from '../../../utils/pdfJpegImages';

interface Extracted { url: string; data: Uint8Array; page: number; width: number; height: number; name: string }

const ExtractImages = () => {
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<Extracted[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minSize, setMinSize] = useState(32);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setImages(prev => { prev.forEach(i => URL.revokeObjectURL(i.url)); return []; }); setDone(false); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleExtract = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setImages([]); setProgress(0); setDone(false);
    try {
      // The images embedded in the PDF, decoded by pdf.js at their native
      // resolution (all formats, transparency kept) — not screenshots of pages.
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: bytes.slice() }).promise;
      // Embedded JPEG photos are handed back byte-for-byte (lossless, original size).
      let jpegs: ReturnType<typeof jpegImagesByPage> = [];
      try { jpegs = jpegImagesByPage(await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })); } catch { /* pdf-lib can't parse it: PNG for everything */ }
      const out: Extracted[] = [];
      const seen = new Set<string>();
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.round((i / pdf.numPages) * 100));
        const page = await pdf.getPage(i);
        const pageJpegs = [...(jpegs[i - 1] ?? [])];
        for (const img of await extractPageImages(page, undefined, 0)) {
          if (img.pixelWidth < minSize || img.pixelHeight < minSize) continue; // icons, bullets, rules
          const k = pageJpegs.findIndex(j => j.width === img.pixelWidth && j.height === img.pixelHeight);
          const jpeg = k >= 0 ? pageJpegs.splice(k, 1)[0].bytes : null;
          const data = jpeg ?? img.png;
          // The same picture is often repeated (logos on every page): keep one copy.
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', data as BufferSource)).slice(0, 8)).join('.');
          if (seen.has(hash)) continue;
          seen.add(hash);
          const type = jpeg ? 'image/jpeg' : 'image/png';
          out.push({ url: URL.createObjectURL(new Blob([data as BlobPart], { type })), data, page: i, width: img.pixelWidth, height: img.pixelHeight, name: `page${i}_image${out.filter(o => o.page === i).length + 1}.${jpeg ? 'jpg' : 'png'}` });
        }
      }
      setImages(out);
      if (!out.length) setError('No embedded images were found in this PDF. (To save whole pages as pictures, use PDF to JPG.)');
      setDone(out.length > 0);
    } catch (err) { console.error(err); setError('Could not read this PDF. It may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  // One ZIP instead of a burst of downloads, which browsers block.
  const downloadAll = () => {
    const base = file?.name.replace(/\.pdf$/i, '') ?? 'images';
    const zip = zipSync(Object.fromEntries(images.map(i => [i.name, i.data])), { level: 0 });
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${base}_images.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <ToolWorkspaceLayout title="Extract Images from PDF" description="Pull out every photo and graphic embedded in a PDF, at its original resolution.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '16px', padding: '32px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '6px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Embedded pictures are saved at full quality</p>
            </>) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, maxWidth: '100%' }}>
                <ImageIcon size={32} color="var(--accent)" />
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</div></div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setImages([]); setDone(false); }} style={{ fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', minHeight: '44px' }}>Change</button>
              </div>
            )}
          </div>

          {images.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
              {images.map(img => (
                <div key={img.name} style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', background: 'repeating-conic-gradient(var(--surface-high) 0 25%, var(--surface) 0 50%) 0 0 / 16px 16px', boxShadow: '0 0 0 1px var(--hairline)' }}>
                  <img src={img.url} alt={img.name} style={{ width: '100%', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontSize: '12px', lineHeight: '16px', minWidth: 0 }}>p.{img.page} · {img.width}×{img.height}</span>
                    <a href={img.url} download={img.name} aria-label={`Download ${img.name}`} style={{ color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', margin: '-10px -8px -10px 0', flexShrink: 0 }}><Download size={16} /></a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: '24px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><ImageIcon size={18} color="var(--accent)" /> Settings</h3>
          {done ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <p style={{ fontWeight: 600 }}>{images.length} images ready!</p>
                <button onClick={downloadAll} className="btn-primary" style={{ width: '100%' }}>
                  <Download size={16} /> {images.length > 1 ? 'Download all (ZIP)' : 'Download'}
                </button>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">Skip images smaller than {minSize} px</label>
                <input type="range" min={0} max={256} step={16} value={minSize} onChange={e => setMinSize(Number(e.target.value))} style={{ width: '100%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}><span>Keep everything</span><span>Photos only</span></div>
              </div>
              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}><span>Scanning pages…</span><span>{progress}%</span></div>
                  <ProgressBar progress={progress} color="var(--accent)" />
                </div>
              )}
              <button onClick={handleExtract} disabled={!file || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', background: file ? 'var(--accent)' : 'var(--surface-high)', color: file ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !file ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Extracting…' : 'Extract Images'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ExtractImages;
