import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import ConversionNotes from '../../../components/tools/ConversionNotes';
import { htmlToPdf, escapeHtml } from '../../../utils/htmlToPdf';

const TxtToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(12);
  const [error, setError] = useState('');
  const [mono, setMono] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setDownloadUrl(null);
      setNotes([]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt', '.text', '.log', '.md'] },
    maxFiles: 1, multiple: false,
  });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      // The browser lays the text out (wrapping, long URLs, tabs, any script);
      // line endings are normalised so Windows (CRLF) files work.
      const text = (await file.text()).replace(/\r\n?/g, '\n');
      const family = mono ? '"Courier New", Courier, monospace' : 'Arial, Helvetica, sans-serif';
      const { bytes, warnings } = await htmlToPdf(`<pre>${escapeHtml(text)}</pre>`, {
        title: file.name.replace(/\.[^/.]+$/, ''),
        css: `pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4;
                    font-family: ${family}; font-size: ${fontSize}pt; line-height: 1.4; }`,
      });
      setNotes(warnings);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Failed to convert text file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="TXT to PDF"
      description="Convert plain text files into clean, readable PDF documents with automatic line wrapping and page breaks."
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
              cursor: 'pointer', transition: 'all 0.2s ease', flex: 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload Text File</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop .txt, .log or .md, or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>{(file.size / 1024).toFixed(1)} KB</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600 }}>Settings</h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <a href={downloadUrl} download={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box', marginTop: '16px' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">Font Size: {fontSize}pt</label>
                  <input type="range" min={8} max={24} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', minHeight: '44px', marginTop: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mono} onChange={e => setMono(e.target.checked)} /> Monospace font (code, logs, tables)
                  </label>
                </div>
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

export default TxtToPdf;
