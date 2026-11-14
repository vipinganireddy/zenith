import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Code, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import { pdfToHtml } from '../../../utils/pdfToDocx';

const PdfToHtml = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setProgress(0);
    try {
      // Real HTML: headings, paragraphs, bold/italic and images — searchable and responsive.
      const { html, textPages, images } = await pdfToHtml(await file.arrayBuffer(), file.name.replace(/\.pdf$/i, ''), f => setProgress(Math.round(f * 95)));
      if (textPages === 0) setError(images ? 'This looks like a scanned PDF: the HTML contains the page images only. Run OCR PDF first for searchable text.' : 'No content was found in this PDF.');
      setProgress(100);
      setDownloadUrl(URL.createObjectURL(new Blob([html], { type: 'text/html' })));
    } catch (err) { console.error(err); setError('Could not convert this PDF. It may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="PDF to HTML" description="Convert your PDF into a clean, responsive HTML page with real, searchable text and images.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Text, headings and images become a web page</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Code size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, fontSize: '16px', lineHeight: '24px', minWidth: 0, overflowWrap: 'anywhere' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Code size={18} color="var(--accent)" /> HTML Output</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)', marginBottom: '12px' }}>Self-contained HTML — works offline</p>
                <a href={downloadUrl} download={`${file?.name.replace(/\.pdf$/i, '')}.html`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>Download .html</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.pdf$/i, '')}.html`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>Each PDF page is rendered as a JPEG image and embedded in a single HTML file. The output includes a minimal toolbar and opens in any browser — no software needed.</p>
              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}><span>Rendering pages…</span><span>{progress}%</span></div>
                  <ProgressBar progress={progress} color="var(--accent)" />
                </div>
              )}
              <button onClick={handleConvert} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Converting…' : 'Convert to HTML'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PdfToHtml;
