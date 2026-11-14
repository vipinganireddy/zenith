import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Code, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import ProgressBar from '../../../components/tools/ProgressBar';
import ConversionNotes from '../../../components/tools/ConversionNotes';
import { htmlToPdf, A4, A4_LANDSCAPE } from '../../../utils/htmlToPdf';

const HtmlToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);
  const [landscape, setLandscape] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setIsDone(false);
      setNotes([]);
      setDownloadUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/html': ['.html', '.htm'] },
    maxFiles: 1, multiple: false
  });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setNotes([]);
    setProgress(0);
    setIsProcessing(true);
    try {
      // Rendered in a sandbox with scripts disabled: the page's own CSS applies,
      // but nothing in an uploaded HTML file can execute.
      const html = await file.text();
      const { bytes, warnings } = await htmlToPdf(html, {
        pageSize: landscape ? A4_LANDSCAPE : A4,
        title: file.name.replace(/\.[^/.]+$/, ''),
        onProgress: f => setProgress(Math.round(f * 100)),
      });
      setNotes(warnings);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      setIsDone(true);
    } catch (err) {
      console.error('Error converting HTML to PDF:', err);
      setError('Failed to convert HTML to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="HTML to PDF"
      description="Convert your HTML files into perfectly formatted, ready-to-print PDF documents."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        
        {/* Left Panel: Upload Area */}
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div 
            {...getRootProps()} 
            style={{ 
              border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, 
              borderRadius: '24px', padding: '40px 24px', textAlign: 'center', 
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s ease', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload HTML file</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Code size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>HTML Document Ready</p>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setIsDone(false); setDownloadUrl(null); }}
                  style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Action & Output */}
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Code size={20} color="var(--accent)" /> Converter
          </h3>

          <div style={{ flex: 1 }}>
            {isDone && downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '20px' }}>Your PDF is ready for download.</p>
                  
                  <a 
                    href={downloadUrl} 
                    download={`${file?.name.replace(/\.[^/.]+$/, "")}.pdf`}
                    className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
                  >
                    Download PDF
                  </a>
                    <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.[^/.]+$/, "")}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '20px' }}>
                  Renders your HTML file with its own styles into an A4 PDF with real, selectable text, images and clickable links. Scripts in the file are never run. External images need to be embedded in the file.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', minHeight: '44px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={landscape} onChange={e => setLandscape(e.target.checked)} /> Landscape pages
                </label>
                {isProcessing && <div style={{ marginBottom: '16px' }}><ProgressBar progress={progress} color="var(--accent)" /></div>}
                <button 
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
                >
                  {isProcessing ? 'Converting...' : 'Convert to PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
      
    </ToolWorkspaceLayout>
  );
};

export default HtmlToPdf;
