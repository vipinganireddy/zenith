import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import { UploadCloud, FileText, Trash2, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { parsePageRanges } from '../../../utils/pageRanges';

const DeletePages = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pageRange, setPageRange] = useState('');
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setDownloadUrl(null);
      setError('');
      setTotalPages(null);
      try {
        const pdfDoc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        setTotalPages(pdfDoc.getPageCount());
      } catch (e) {
        console.error('Could not read page count', e);
        setError('This PDF could not be opened. It may be damaged — try Repair PDF first.');
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false
  });

  const handleDelete = async () => {
    if (!file || !totalPages) return;
    setError('');
    const { pages, errors } = parsePageRanges(pageRange, totalPages);
    if (errors.length) { setError(errors.join(' ')); return; }
    const pagesToDelete = [...pages].reverse(); // highest first, so earlier indices don't shift

    if (pagesToDelete.length === totalPages) {
      setError("You cannot delete all pages in the document.");
      return;
    }

    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      // Remove pages (0-indexed). Remove from highest index first so indices don't shift
      pagesToDelete.forEach(pageNum => {
        pdfDoc.removePage(pageNum - 1);
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setDownloadUrl(url);
    } catch (error) {
      console.error('Error deleting pages:', error);
      setError('Failed to delete pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Delete Pages"
      description="Remove specific pages from your PDF document."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        
        {/* Left Panel: Upload Area */}
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
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Drop PDF to edit</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to choose a file, or drag it here</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                {totalPages && <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{totalPages} Pages detected</p>}
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setTotalPages(null); }}
                  style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}
                >
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Action */}
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trash2 size={20} color="var(--danger)" /> Deletion Settings
          </h3>

          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Pages Deleted!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>Your updated PDF is ready to download.</p>
                  
                  <a 
                    href={downloadUrl} 
                    download={`updated_${file?.name}`}
                    style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}
                  >
                    Download Updated PDF
                  </a>
                    <SaveToDriveButton downloadUrl={downloadUrl} fileName={`updated_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px' }}>
                
                <div style={{ marginBottom: '24px' }}>
                  <label className="field-label">
                    Pages to Delete
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1-3, 5, 8-10"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    disabled={!file}
                    style={{ width: '100%', padding: '0 16px', borderRadius: '16px', border: 'none', outline: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Enter page numbers and/or ranges separated by commas.
                  </p>
                </div>

                <button 
                  onClick={handleDelete}
                  disabled={!file || isProcessing || !pageRange}
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    fontSize: '16px',
                    border: 'none',
                    background: !file || !pageRange ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file || !pageRange ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    cursor: !file || isProcessing || !pageRange ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? 'Processing...' : 'Delete Pages'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </ToolWorkspaceLayout>
  );
};

export default DeletePages;
