import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Layers, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { flattenVector } from '../../../utils/pdfFlatten';

import '../../../utils/pdfWorker';

const FlattenPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(90);
  const [mode, setMode] = useState<'vector' | 'raster'>('vector');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleFlatten = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setProgress(0); setSummary('');
    try {
      if (mode === 'vector') {
        const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
        const r = await flattenVector(doc);
        const bytes = await doc.save();
        setSummary(r.fields + r.annotations === 0
          ? 'This PDF had no form fields or annotations to flatten — the content is unchanged.'
          : `Flattened ${r.fields} form field${r.fields === 1 ? '' : 's'} and ${r.annotations} annotation${r.annotations === 1 ? '' : 's'}. Text is still selectable.`);
        setProgress(100);
        setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
        return;
      }
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
      const newDoc = await PDFDocument.create();

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.round((i / pdf.numPages) * 95));
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ intent: 'print', canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        const jpegData = canvas.toDataURL('image/jpeg', quality / 100);
        const resp = await fetch(jpegData);
        const imgAb = await (await resp.blob()).arrayBuffer();
        const jpgImage = await newDoc.embedJpg(imgAb);
        const realVp = page.getViewport({ scale: 1 });
        const newPage = newDoc.addPage([realVp.width, realVp.height]);
        newPage.drawImage(jpgImage, { x: 0, y: 0, width: realVp.width, height: realVp.height });
      }

      setProgress(100);
      const bytes = await newDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed to flatten PDF.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Flatten PDF" description="Bake form fields and annotations into the page so they can't be edited — text stays selectable.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Flatten</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Form fields and annotations will be merged into the page</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Layers size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Layers size={18} color="var(--accent)" /> Flatten Settings</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`flat_${file?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>Download Flattened PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`flat_${file?.name}`} />
                {summary && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)', marginTop: '12px' }}>{summary}</p>}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {([
                ['vector', 'Forms & annotations', 'Fields, comments and stamps become part of the page. Text stays selectable and searchable.'],
                ['raster', 'Flatten to images', 'Every page becomes a picture. Nothing can be selected or edited — largest files.'],
              ] as const).map(([id, label, hint]) => (
                <label key={id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', minHeight: '56px', padding: '12px 16px', borderRadius: '16px', border: 'none', background: mode === id ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-sunken)', boxShadow: mode === id ? 'inset 0 0 0 2px var(--accent)' : 'none', cursor: 'pointer' }}>
                  <input type="radio" name="flatten-mode" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: '3px' }} />
                  <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: '14px', lineHeight: '20px', fontWeight: 600 }}>{label}</span><span style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)' }}>{hint}</span></span>
                </label>
              ))}
              {mode === 'raster' && (
                <div>
                  <label style={{ display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Image Quality: {quality}%</label>
                  <input type="range" min={50} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ width: '100%' }} />
                </div>
              )}
              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', gap: '12px', marginBottom: '8px' }}><span>Rendering pages…</span><span>{progress}%</span></div>
                  <ProgressBar progress={progress} color="var(--accent)" />
                </div>
              )}
              <button onClick={handleFlatten} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Flattening…' : 'Flatten PDF'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default FlattenPdf;
