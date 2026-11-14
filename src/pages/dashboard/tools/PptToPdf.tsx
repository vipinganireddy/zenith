import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Presentation, CheckCircle, ArrowRight, Cloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { getDriveToken, convertToPdfViaDrive } from '../../../utils/googleDrive';
import { pptxToHtml } from '../../../utils/pptxToHtml';
import { htmlToPdf } from '../../../utils/htmlToPdf';
import ConversionNotes from '../../../components/tools/ConversionNotes';

const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';

const PptToPdf = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const driveToken = getDriveToken();
  // In-browser by default (private, works for everyone); Drive when the user wants Google's renderer.
  const [engine, setEngine] = useState<'browser' | 'drive'>('browser');
  const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'presentation';

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) {
      setFile(accepted[0]);
      setIsDone(false);
      setDownloadUrl(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
    },
    maxFiles: 1, multiple: false,
  });
  const isLegacyPpt = !!file && /\.ppt$/i.test(file.name);

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setNotes([]);
    if (engine === 'browser' && !isLegacyPpt) {
      setIsProcessing(true);
      try {
        const { html, slides } = await pptxToHtml(await file.arrayBuffer());
        if (!slides) throw new Error('This presentation has no slides.');
        const { bytes, warnings } = await htmlToPdf(html, { pageSelector: 'section.slide', title: baseName });
        setNotes(warnings);
        setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
        setIsDone(true);
      } catch (e) {
        console.error('PPTX to PDF (browser) failed:', e);
        setError(e instanceof Error && /pptx|slides/i.test(e.message) ? e.message : 'Could not read this presentation. Try the Google Drive option.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }
    const token = getDriveToken();
    if (!token) { navigate('/dashboard/files'); return; }
    setIsProcessing(true);
    try {
      const pdfBlob = await convertToPdfViaDrive(file, GOOGLE_SLIDES_MIME, token.token);
      setDownloadUrl(URL.createObjectURL(pdfBlob));
      setIsDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Conversion failed.';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('reconnect')) {
        navigate('/dashboard/files');
        return;
      }
      console.error('PPTX to PDF failed:', e);
      setError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="PowerPoint to PDF"
      description="Convert PowerPoint presentations to PDF — privately in your browser, or pixel-perfect through your own Google Drive."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        {/* Left: Upload */}
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div
            {...getRootProps()}
            style={{
              border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '40px 24px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s', flex: 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PowerPoint</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop a .pptx / .ppt or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Presentation size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Presentation Ready</p>
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

        {/* Right: Action */}
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Presentation size={20} color="var(--accent)" /> Converter
          </h3>

          <div style={{ flex: 1 }}>
            {isDone && downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '20px' }}>Your PDF is ready for download.</p>
                  <a href={downloadUrl} download={`${baseName}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${baseName}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {([
                  ['browser', 'In your browser', 'Private — nothing is uploaded. Text, images, tables and layouts; charts and SmartArt are skipped.'],
                  ['drive', 'Via your Google Drive', 'Google Slides renders it pixel-perfect. The temporary copy in your Drive is deleted right after.'],
                ] as const).map(([id, label, hint]) => (
                  <label key={id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minHeight: '44px', padding: '12px', borderRadius: '16px', background: 'var(--surface-sunken)', boxShadow: engine === id ? 'inset 0 0 0 2px var(--accent)' : 'none', cursor: 'pointer' }}>
                    <input type="radio" name="ppt-engine" checked={engine === id} onChange={() => setEngine(id)} style={{ marginTop: '3px' }} />
                    <span style={{ minWidth: 0 }}><span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', lineHeight: '20px', fontWeight: 600 }}>{id === 'drive' && <Cloud size={14} color="#4285F4" />}{label}</span><span style={{ display: 'block', fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{hint}</span></span>
                  </label>
                ))}
                {(engine === 'drive' || isLegacyPpt) && !driveToken && (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>
                    {isLegacyPpt ? 'Old .ppt files can only be converted through Google Drive. ' : ''}Connect Google Drive from the Files page first.
                  </p>
                )}
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
                >
                  {isProcessing ? 'Converting…' : (engine === 'drive' || isLegacyPpt) && !driveToken ? 'Connect Drive' : 'Convert to PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PptToPdf;
