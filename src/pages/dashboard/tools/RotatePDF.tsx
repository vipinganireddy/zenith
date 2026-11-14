import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument, degrees } from 'pdf-lib';
import { UploadCloud, FileText, RotateCw, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const RotatePDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(90);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setDownloadUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false
  });

  const handleRotate = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      
      const pages = pdfDoc.getPages();
      pages.forEach(page => {
        // Add rotation to existing rotation to handle already rotated pages
        const currentRotation = page.getRotation().angle;
        page.setRotation(degrees(currentRotation + rotation));
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      setDownloadUrl(url);
    } catch (error) {
      console.error('Error rotating PDF:', error);
      setError('Failed to rotate the PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout 
      title="Rotate PDF" 
      description="Rotate all pages in your PDF by 90, 180, or 270 degrees."
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
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Drop PDF to rotate</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to choose a file, or drag it here</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }}
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
            <RotateCw size={20} color="var(--accent)" /> Rotation Settings
          </h3>

          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Pages Rotated!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>Your new PDF is ready to download.</p>
                  
                  <a 
                    href={downloadUrl} 
                    download={`rotated_${file?.name}`}
                    style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}
                  >
                    Download Rotated PDF
                  </a>
                    <SaveToDriveButton downloadUrl={downloadUrl} fileName={`rotated_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px' }}>
                
                <div style={{ marginBottom: '24px' }}>
                  <label className="field-label">
                    Direction
                  </label>
                  <div className="segmented" role="group" aria-label="Rotation angle">
                    {[90, 180, 270].map(deg => (
                      <button
                        key={deg}
                        onClick={() => setRotation(deg)}
                        aria-pressed={rotation === deg}
                      >
                        {deg}°
                      </button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={handleRotate}
                  disabled={!file || isProcessing}
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    fontSize: '16px',
                    border: 'none',
                    background: !file ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    cursor: !file || isProcessing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? 'Rotating...' : 'Rotate PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </ToolWorkspaceLayout>
  );
};

export default RotatePDF;
