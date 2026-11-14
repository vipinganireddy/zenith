import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Minimize2, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { recompressImages } from '../../../utils/pdfImageCompress';

// Each target caps an image at the pixels a full-page-width (8.5 in) picture needs
// at that DPI. Smaller images are untouched; text and vectors are never rasterised.
const DPI_OPTIONS = [72, 96, 150, 200].map(dpi => ({
  label: `${dpi === 72 ? 'Screen' : dpi === 96 ? 'Low' : dpi === 150 ? 'Medium' : 'High'} (${dpi} DPI)`,
  maxDimension: Math.round(dpi * 8.5),
}));

const ReduceResolution = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dpiIdx, setDpiIdx] = useState(0);
  const [quality, setQuality] = useState(75);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [origSize, setOrigSize] = useState(0);
  const [newSize, setNewSize] = useState(0);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState(0);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); setOrigSize(accepted[0].size); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const fmt = (b: number) => b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(2)} MB`;

  const handleReduce = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setProgress(0);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const stats = await recompressImages(doc, {
        maxDimension: DPI_OPTIONS[dpiIdx].maxDimension,
        quality: quality / 100,
        onProgress: f => setProgress(Math.round(f * 90)),
      });
      const bytes = await doc.save({ useObjectStreams: true });
      setProgress(100);
      // Never return a larger file than the original.
      const keep = bytes.length >= file.size;
      setChanged(keep ? 0 : stats.recompressed);
      setNewSize(keep ? file.size : bytes.length);
      setDownloadUrl(URL.createObjectURL(keep ? file : new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Could not process this PDF. It may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Reduce Resolution" description="Lower the resolution of the images inside your PDF to cut its size — text stays sharp and selectable.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Images are downsampled; text and vectors stay untouched</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Minimize2 size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, fontSize: '16px', lineHeight: '24px', minWidth: 0, overflowWrap: 'anywhere' }}>{file.name}</div>
                <div style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{fmt(origSize)}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Minimize2 size={18} color="var(--accent)" /> Resolution</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-around', background: 'var(--surface-sunken)', padding: '12px', borderRadius: '16px', fontSize: '12px', lineHeight: '16px', marginBottom: '16px' }}>
                  <div><div style={{ color: 'var(--text-secondary)' }}>Before</div><div style={{ fontWeight: 600 }}>{fmt(origSize)}</div></div>
                  <div><div style={{ color: 'var(--text-secondary)' }}>After</div><div style={{ fontWeight: 600, color: 'var(--success)' }}>{fmt(newSize)}</div></div>
                  <div><div style={{ color: 'var(--text-secondary)' }}>Saved</div><div style={{ fontWeight: 600, color: 'var(--success)' }}>{origSize > newSize ? Math.round((1 - newSize / origSize) * 100) : 0}%</div></div>
                </div>
                <a href={downloadUrl} download={`lowres_${file?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>Download</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`lowres_${file?.name}`} />
                <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)', marginTop: '12px' }}>
                  {changed ? `${changed} image${changed > 1 ? 's' : ''} downsampled.` : 'No images needed reducing at this setting — your original is unchanged.'}
                </p>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="field-label">Target Resolution</label>
                {DPI_OPTIONS.map((opt, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', lineHeight: '20px', minHeight: '44px' }}>
                    <input type="radio" name="dpi" checked={dpiIdx === i} onChange={() => setDpiIdx(i)} />
                    {opt.label}
                  </label>
                ))}
              </div>
              <div>
                <label className="field-label">JPEG Quality: {quality}%</label>
                <input type="range" min={30} max={95} value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
              </div>
              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}><span>Processing…</span><span>{progress}%</span></div>
                  <ProgressBar progress={progress} color="var(--accent)" />
                </div>
              )}
              <button onClick={handleReduce} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Reducing…' : 'Reduce Resolution'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ReduceResolution;
