import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Crop, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { visualFrame } from '../../../utils/pdfText';

const CropPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [margins, setMargins] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [error, setError] = useState('');
  const [_applyAll, _setApplyAll] = useState(true); void _applyAll; void _setApplyAll;

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleCrop = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      let skipped = 0;
      for (const page of pdfDoc.getPages()) {
        // Margins are measured on the page as the reader sees it (current crop,
        // rotation applied), then mapped back into PDF coordinates.
        const f = visualFrame(page);
        if (margins.left + margins.right >= f.width - 10 || margins.top + margins.bottom >= f.height - 10) { skipped++; continue; }
        const a = f.toPage(margins.left, margins.bottom);
        const b = f.toPage(f.width - margins.right, f.height - margins.top);
        page.setCropBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      }
      if (skipped === pdfDoc.getPageCount()) {
        setError('Those margins are larger than the page. Use smaller values (1 inch = 72 pt).');
        return;
      }
      const bytes = await pdfDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to crop PDF.'); }
    finally { setIsProcessing(false); }
  };

  const M = (label: string, key: keyof typeof margins) => (
    <div style={{ flex: '1 1 120px', minWidth: 0 }}>
      <label className="field-label">{label} (pt)</label>
      <input type="number" min={0} value={margins[key]} onChange={e => setMargins(m => ({ ...m, [key]: Math.max(0, Number(e.target.value)) }))}
        style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
    </div>
  );

  return (
    <ToolWorkspaceLayout title="Crop PDF" description="Trim margins from all pages by specifying how many points to remove from each side.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Crop</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, fontSize: '16px', lineHeight: '24px', overflowWrap: 'anywhere' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', minHeight: '44px' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Crop size={18} color="var(--accent)" /> Crop Margins</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`cropped_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box', width: '100%' }}>Download Cropped PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`cropped_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>Enter margin values in points (72 pt = 1 inch). Content outside the crop box is hidden but not deleted.</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{M('Top', 'top')}{M('Bottom', 'bottom')}</div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>{M('Left', 'left')}{M('Right', 'right')}</div>
              <button onClick={handleCrop} disabled={!file || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', background: file ? 'var(--accent)' : 'var(--surface-high)', color: file ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !file ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Cropping…' : 'Crop PDF'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default CropPdf;
