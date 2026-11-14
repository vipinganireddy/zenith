import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Hash, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb } from 'pdf-lib';
import { prepareText, visualFrame, drawVisual } from '../../../utils/pdfText';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const AddPageNumbers = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [position, setPosition] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center'>('bottom-center');
  const [format, setFormat] = useState<'page-of-total' | 'page-only'>('page-of-total');
  const [startPage, setStartPage] = useState(1);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setDownloadUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleApply = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const total = pages.length;
      const textSize = 10;
      const margin = 24;
      const color = rgb(0.3, 0.3, 0.3);

      for (const [idx, page] of pages.entries()) {
        // Positions are on the page as displayed (CropBox, /Rotate applied).
        const { width, height } = visualFrame(page);
        const pageNum = startPage + idx;
        const label = format === 'page-of-total' ? `Page ${pageNum} of ${startPage + total - 1}` : `${pageNum}`;
        const t = await prepareText(pdfDoc, label, { size: textSize, color });

        let x: number;
        let y: number;
        switch (position) {
          case 'bottom-center': x = (width - t.width) / 2; y = margin; break;
          case 'bottom-right': x = width - t.width - margin; y = margin; break;
          case 'bottom-left': x = margin; y = margin; break;
          case 'top-center': x = (width - t.width) / 2; y = height - margin - textSize; break;
        }
        drawVisual(page, t, x, y, { color });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to add page numbers.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Add Page Numbers"
      description="Automatically add page numbers to every page of your PDF with customizable position and format."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', minWidth: 0 }}>
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
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ready for page numbering</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Hash size={20} color="var(--accent)" /> Settings
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Page Numbers Added!</h4>
                  <a href={downloadUrl} download={`numbered_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', marginTop: '16px', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`numbered_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">Position</label>
                  <select value={position} onChange={(e) => setPosition(e.target.value as typeof position)} style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}>
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-center">Top Center</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Format</label>
                  <select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} style={{ width: '100%', padding: '0 12px', borderRadius: '16px', border: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}>
                    <option value="page-of-total">Page X of Y</option>
                    <option value="page-only">X (number only)</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Start numbering at</label>
                  <input type="number" min={1} value={startPage} onChange={(e) => setStartPage(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                </div>
                <button
                  onClick={handleApply}
                  disabled={!file || isProcessing}
                  style={{
                    width: '100%',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    border: 'none',
                    background: !file ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: !file || isProcessing ? 'not-allowed' : 'pointer',
                    minHeight: '56px',
                    fontSize: '16px',
                  }}
                >
                  {isProcessing ? 'Adding Numbers...' : 'Add Page Numbers'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AddPageNumbers;
