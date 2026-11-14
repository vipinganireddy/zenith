import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, pushGraphicsState, popGraphicsState, setFillingRgbColor, rectangle, fill } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';


const PRESETS = ['#ffffff', '#f8fafc', '#fef9c3', '#d1fae5', '#dbeafe', '#ede9fe', '#fee2e2', '#0f172a'];

const ChangeBackground = () => {
  const [file, setFile] = useState<File | null>(null);
  const [bgColor, setBgColor] = useState('#fef9c3');
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const hexToRgb01 = (hex: string) => [parseInt(hex.slice(1,3),16)/255, parseInt(hex.slice(3,5),16)/255, parseInt(hex.slice(5,7),16)/255] as [number,number,number];

  const handleApply = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setProgress(0);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const [r, g, b] = hexToRgb01(bgColor);
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        // A filled rectangle as the page's *first* content stream sits underneath
        // everything else — text, vectors and images stay exactly as they were.
        const box = page.getMediaBox();
        const under = doc.context.register(doc.context.contentStream([
          pushGraphicsState(), setFillingRgbColor(r, g, b),
          rectangle(box.x, box.y, box.width, box.height), fill(), popGraphicsState(),
        ]));
        page.node.normalizedEntries().Contents?.insert(0, under);
        setProgress(Math.round(((i + 1) / pages.length) * 90));
      });
      setProgress(100);
      const bytes = await doc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Could not change the background. The PDF may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Change Background" description="Replace the background color of every page with your chosen color.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 0 }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: bgColor, boxShadow: 'inset 0 0 0 1.5px var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} color="var(--accent)" /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Background will be applied to all pages</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: bgColor, boxShadow: 'inset 0 0 0 1.5px var(--hairline)', marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', padding: '0 16px', borderRadius: '16px', cursor: 'pointer', minHeight: '44px' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600 }}>Background Color</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`bg_${file?.name}`} style={{ display: 'flex', background: bgColor, color: hexToRgb01(bgColor)[0] < 0.5 ? 'white' : '#111', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', alignItems: 'center', justifyContent: 'center', minHeight: '56px', height: '56px', fontSize: '16px', boxSizing: 'border-box', width: '100%', boxShadow: 'inset 0 0 0 1.5px var(--hairline)' }}>Download PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`bg_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">Preset Colors</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {PRESETS.map(c => <button key={c} onClick={() => setBgColor(c)} aria-label={`Background ${c}`} aria-pressed={bgColor === c} style={{ width: '40px', height: '40px', minWidth: '40px', padding: 0, borderRadius: '50%', background: c, border: 'none', boxShadow: bgColor === c ? '0 0 0 3px var(--surface), 0 0 0 5px var(--accent)' : 'inset 0 0 0 1.5px var(--hairline)', cursor: 'pointer' }} />)}
                </div>
              </div>
              <div>
                <label className="field-label">Custom Color</label>
                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} aria-label="Custom background colour" style={{ width: '100%', height: '48px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', cursor: 'pointer', padding: '4px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ background: 'var(--surface-sunken)', borderRadius: '16px', padding: '12px', fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>Note: pages are rendered as images with the new background. Text will not be selectable.</div>
              {isProcessing && <ProgressBar progress={progress} color={bgColor} />}
              <button onClick={handleApply} disabled={!file || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', boxShadow: file ? 'inset 0 0 0 1.5px var(--hairline)' : 'none', background: file ? bgColor : 'var(--surface-high)', color: file ? (hexToRgb01(bgColor)[0] < 0.5 ? 'white' : '#111') : 'var(--ink-faint)', cursor: !file ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Applying…' : 'Apply Background'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ChangeBackground;
