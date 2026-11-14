import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Copy, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const DuplicatePages = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [copies, setCopies] = useState(1);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const f = acceptedFiles[0];
    setFile(f);
    setDownloadUrl(null);
    try {
      const ab = await f.arrayBuffer();
      const pdf = await PDFDocument.load(ab, { ignoreEncryption: true });
      setTotalPages(pdf.getPageCount());
      setPageNum(1);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleDuplicate = async () => {
    if (!file || !totalPages) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const newPdf = await PDFDocument.create();

      // Copy all pages in original order, then insert duplicates of the target page after it
      const allIndices = Array.from({ length: totalPages }, (_, i) => i);
      const copiedAll = await newPdf.copyPages(pdfDoc, allIndices);
      copiedAll.forEach(p => newPdf.addPage(p));

      // Append extra copies at the end (or insert after the page)
      const targetIdx = pageNum - 1;
      for (let i = 0; i < copies; i++) {
        const [extra] = await newPdf.copyPages(pdfDoc, [targetIdx]);
        newPdf.insertPage(targetIdx + 1 + i, extra);
      }

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to duplicate pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Duplicate Pages"
      description="Clone a specific page within your PDF. The duplicates are inserted immediately after the selected page."
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
                {totalPages && <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{totalPages} pages</p>}
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setTotalPages(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Copy size={20} color="var(--accent)" /> Duplication Settings
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Done!</h4>
                  <a href={downloadUrl} download={`duplicated_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', marginTop: '16px', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`duplicated_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">
                    Page to duplicate {totalPages ? `(1–${totalPages})` : ''}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 1}
                    value={pageNum}
                    onChange={(e) => setPageNum(Math.min(totalPages || 1, Math.max(1, Number(e.target.value))))}
                    disabled={!file}
                    style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }}
                  />
                </div>
                <div>
                  <label className="field-label">Number of extra copies</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value))))}
                    style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }}
                  />
                </div>
                <button
                  onClick={handleDuplicate}
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
                  {isProcessing ? 'Processing...' : 'Duplicate Page'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default DuplicatePages;
