import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { pdfToDocx } from '../../../utils/pdfToDocx';

const PdfToWord = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setDownloadUrl(null);
    setPreview('');
    setProgress(0);
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
    setProgress(0);
    try {
      const result = await pdfToDocx(await file.arrayBuffer(), f => setProgress(Math.round(f * 95)));
      if (result.textPages === 0) {
        setError(result.images
          ? 'This looks like a scanned PDF (pages are images, with no text layer). The pictures were kept in the Word file — run OCR PDF first to get editable text.'
          : 'No text was found in this PDF.');
      }
      setPreview(result.preview);
      setDownloadUrl(URL.createObjectURL(result.blob));
      setProgress(100);
    } catch (err) {
      console.error(err);
      setError('Failed to convert PDF to Word.');
    } finally {
      setIsProcessing(false);
    }
  };

  const outputName = file ? file.name.replace(/\.pdf$/i, '.docx') : 'output.docx';

  return (
    <ToolWorkspaceLayout
      title="PDF to Word"
      description="Convert your PDF to an editable Word document — paragraphs, headings, bold and italic text, and images."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div
            {...getRootProps()}
            style={{
              border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '40px 24px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', flex: 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Ready for conversion</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setPreview(''); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>

          {preview && (
            <div style={{ padding: '16px', background: 'var(--surface-sunken)', borderRadius: '16px', minWidth: 0 }}>
              <p className="field-label">Text Preview</p>
              <pre style={{ fontSize: '12px', lineHeight: '16px', whiteSpace: 'pre-wrap', color: 'var(--text-main)', maxHeight: '140px', overflowY: 'auto', margin: 0 }}>{preview}</pre>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent)" /> Conversion
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Converted!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px', marginBottom: '16px' }}>Your Word document is ready.</p>
                  <a href={downloadUrl} download={outputName} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    Download .docx
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={outputName} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>
                  Text is extracted from all pages and exported as an editable .docx. Formatting is preserved as plain paragraphs with page headings.
                </p>
                {isProcessing && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                      <span>Converting...</span><span>{progress}%</span>
                    </div>
                    <ProgressBar progress={progress} color="var(--accent)" />
                  </div>
                )}
                <button onClick={handleConvert} disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}>
                  {isProcessing ? 'Converting...' : 'Convert to Word'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PdfToWord;
