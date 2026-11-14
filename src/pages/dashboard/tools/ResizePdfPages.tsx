import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { visualFrame } from '../../../utils/pdfText';

// Paper sizes in points (short side × long side); orientation is chosen separately.
const PAGE_SIZES: Record<string, [number, number]> = {
  'A4 (210 × 297 mm)': [595.28, 841.89],
  'Letter (8.5 × 11 in)': [612, 792],
  'Legal (8.5 × 14 in)': [612, 1008],
  'A3 (297 × 420 mm)': [841.89, 1190.55],
  'A5 (148 × 210 mm)': [419.53, 595.28],
  'Square (595 × 595 pt)': [595, 595],
  'Custom': [0, 0],
};
type Orientation = 'auto' | 'portrait' | 'landscape';

const ResizePdfPages = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState('A4 (210 × 297 mm)');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [customW, setCustomW] = useState(595);
  const [customH, setCustomH] = useState(842);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const getTargetSize = (): [number, number] => {
    if (selectedSize === 'Custom') return [customW, customH];
    return PAGE_SIZES[selectedSize];
  };

  const handleResize = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const [tW, tH] = getTargetSize();
      pdfDoc.getPages().forEach(page => {
        // Each page keeps its orientation: a landscape page becomes landscape A4,
        // not a shrunken landscape on a portrait sheet. Sizes are worked out as the
        // page is displayed, then swapped back for pages carrying /Rotate 90/270.
        const box = page.getCropBox();
        const view = visualFrame(page);
        const [long, short] = [Math.max(tW, tH), Math.min(tW, tH)];
        const landscape = selectedSize === 'Custom' ? tW > tH
          : orientation === 'auto' ? view.width > view.height : orientation === 'landscape';
        const [vw, vh] = selectedSize === 'Custom' ? [tW, tH] : landscape ? [long, short] : [short, long];
        const [pw, ph] = view.rotate % 180 ? [vh, vw] : [vw, vh];
        const scale = Math.min(pw / box.width, ph / box.height);
        page.scaleContent(scale, scale);
        page.translateContent((pw - box.width * scale) / 2 - box.x * scale, (ph - box.height * scale) / 2 - box.y * scale);
        page.setMediaBox(0, 0, pw, ph);
        page.setCropBox(0, 0, pw, ph);
        page.setBleedBox(0, 0, pw, ph);
        page.setTrimBox(0, 0, pw, ph);
        page.setArtBox(0, 0, pw, ph);
      });
      const bytes = await pdfDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to resize.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Resize PDF Pages" description="Change all pages to a standard paper size (A4, Letter, etc.) with content scaled to fit.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', minHeight: '44px' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Target Page Size</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`resized_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box', width: '100%' }}>Download Resized PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`resized_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">Page Size</label>
                <select value={selectedSize} onChange={e => setSelectedSize(e.target.value)} style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}>
                  {Object.keys(PAGE_SIZES).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              {selectedSize !== 'Custom' && (
                <div>
                  <label className="field-label">Orientation</label>
                  <select value={orientation} onChange={e => setOrientation(e.target.value as Orientation)} style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}>
                    <option value="auto">Keep each page's orientation</option>
                    <option value="portrait">All portrait</option>
                    <option value="landscape">All landscape</option>
                  </select>
                </div>
              )}
              {selectedSize === 'Custom' && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                    <label className="field-label">Width (pt)</label>
                    <input type="number" min={72} value={customW} onChange={e => setCustomW(Number(e.target.value))} style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                  </div>
                  <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                    <label className="field-label">Height (pt)</label>
                    <input type="number" min={72} value={customH} onChange={e => setCustomH(Number(e.target.value))} style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                  </div>
                </div>
              )}
              <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>Content is scaled proportionally to fit the new page size, centered with equal margins.</p>
              <button onClick={handleResize} disabled={!file || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', background: file ? 'var(--accent)' : 'var(--surface-high)', color: file ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !file ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Resizing…' : 'Resize Pages'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ResizePdfPages;
