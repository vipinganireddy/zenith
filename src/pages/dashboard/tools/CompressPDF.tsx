import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, FileText, CheckCircle, Download, X, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';
import { recompressImages } from '../../../utils/pdfImageCompress';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

type Level = 'lossless' | 'recommended' | 'strong' | 'maximum';

const LEVELS: { id: Level; label: string; desc: string; color: string }[] = [
  { id: 'lossless',    label: 'Lossless',    desc: 'Structural optimisation only. Identical quality.',                     color: 'var(--cat-vitals)' },
  { id: 'recommended', label: 'Recommended', desc: 'Re-encodes photos (up to 2000 px). Text stays sharp and selectable.', color: 'var(--accent)' },
  { id: 'strong',      label: 'Strong',      desc: 'Smaller photos (up to 1200 px). Text stays sharp and selectable.',    color: 'var(--cat-body)' },
  { id: 'maximum',     label: 'Maximum',     desc: 'Flattens every page to a 96 DPI image. Text is no longer selectable.', color: 'var(--cat-heart)' },
];

/** Recompress embedded photos (optionally) and rewrite the file with object streams. */
async function optimise(file: File, images: { maxDimension: number; quality: number } | null, onProgress: (p: number) => void) {
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const stats = images ? await recompressImages(doc, { ...images, onProgress: f => onProgress(Math.round(f * 90)) }) : null;
  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  return { bytes, recompressed: stats?.recompressed ?? 0 };
}

async function rasterise(file: File, onProgress: (p: number) => void): Promise<Uint8Array> {
  const ab = await file.arrayBuffer();
  const src = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
  const numPages = src.numPages;
  const newDoc = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const page = await src.getPage(i);
    const vp = page.getViewport({ scale: 96 / 72 }); // 96 DPI
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ intent: 'print', canvasContext: ctx, viewport: vp }).promise;

    const jpeg = canvas.toDataURL('image/jpeg', 0.65);
    const imgBytes = await fetch(jpeg).then(r => r.arrayBuffer());
    const img = await newDoc.embedJpg(imgBytes);
    const newPage = newDoc.addPage([vp.width, vp.height]);
    newPage.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
    onProgress(Math.round((i / numPages) * 100));
  }
  newDoc.setProducer('O-Zenith');
  return newDoc.save();
}

const CompressPDF = ({ defaultLevel = 'recommended' }: { defaultLevel?: Level }) => {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<Level>(defaultLevel);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [stats, setStats] = useState<{ original: number; compressed: number; recompressed: number; unchanged: boolean } | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setDownloadUrl(null); setStats(null); setError(''); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const handleCompress = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(0);
    setError('');
    try {
      let bytes: Uint8Array;
      let recompressed = 0;
      if (level === 'maximum') bytes = await rasterise(file, setProgress);
      else {
        const settings = level === 'recommended' ? { maxDimension: 2000, quality: 0.75 }
          : level === 'strong' ? { maxDimension: 1200, quality: 0.6 } : null;
        ({ bytes, recompressed } = await optimise(file, settings, setProgress));
      }
      // Never hand back a bigger file than the user gave us.
      const unchanged = bytes.length >= file.size;
      const blob = unchanged ? file : new Blob([bytes as BlobPart], { type: 'application/pdf' });
      setStats({ original: file.size, compressed: unchanged ? file.size : bytes.length, recompressed, unchanged });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError('Compression failed. The PDF may be encrypted or corrupted.');
      console.error(e);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const reduction = stats ? Math.max(0, Math.round((1 - stats.compressed / stats.original) * 100)) : 0;

  return (
    <ToolWorkspaceLayout
      title="Compress PDF"
      description="Shrink PDFs by re-encoding the photos inside them, while text and vector graphics stay sharp and selectable."
    >
      <div style={{ display: 'flex', flex: 1, minHeight: '520px' }}>
        {/* Left: upload */}
        <div style={{ flex: 2, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--hairline)', minWidth: 0 }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '32px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s', flex: file ? 0 : 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <UploadCloud size={26} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>Drop PDF to compress</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Click to browse — supports any PDF</p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', maxWidth: '400px' }}>
                <FileText size={28} color="var(--accent)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textAlign: 'left' }}>
                  <p style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', marginBottom: '2px' }}>{file.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{formatBytes(file.size)}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setStats(null); }} aria-label="Remove file" style={{ width: '44px', height: '44px', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          {/* Compression levels */}
          <div>
            <p style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 700, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '12px' }}>Compression Level</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {LEVELS.map(l => (
                <button
                  key={l.id}
                  onClick={() => setLevel(l.id)}
                  aria-pressed={level === l.id}
                  style={{
                    minHeight: '56px', padding: '12px 16px', borderRadius: '16px', border: 'none',
                    boxShadow: level === l.id ? 'inset 0 0 0 2px var(--accent)' : 'none',
                    background: level === l.id ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-sunken)',
                    color: 'var(--ink)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '2px' }}>{l.label}</p>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>{l.desc}</p>
                    </div>
                    {level === l.id && <div style={{ marginLeft: 'auto', width: '16px', height: '16px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--on-accent)' }} />
                    </div>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: action + result */}
        <div style={{ width: '260px', flexShrink: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Minimize2 size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Compression</h3>
          </div>

          <AnimatePresence mode="wait">
            {downloadUrl && stats ? (
              <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center' }}>
                <CheckCircle size={40} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>
                  {reduction > 0 ? `Reduced by ${reduction}%` : 'Processed!'}
                </p>
                {stats.unchanged && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-muted)', marginBottom: '4px' }}>This PDF is already well optimised — your original is unchanged. {level !== 'strong' && level !== 'maximum' ? 'Try a stronger level.' : ''}</p>}
                {stats.recompressed > 0 && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-muted)', marginBottom: '4px' }}>{stats.recompressed} image{stats.recompressed > 1 ? 's' : ''} re-encoded · text untouched</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--surface-sunken)', padding: '12px 16px', borderRadius: '16px', margin: '16px 0', fontSize: '14px', gap: '8px' }}>
                  <div style={{ textAlign: 'left' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Before</p>
                    <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>{formatBytes(stats.original)}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>Saved</p>
                    <p style={{ fontWeight: 700, color: reduction > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                      {reduction > 0 ? formatBytes(stats.original - stats.compressed) : '—'}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2px' }}>After</p>
                    <p style={{ fontWeight: 600, color: 'var(--success)' }}>{formatBytes(stats.compressed)}</p>
                  </div>
                </div>
                <a href={downloadUrl} download={`compressed_${file?.name}`}
                  className="btn-primary" style={{ textDecoration: 'none', marginBottom: '8px' }}>
                  <Download size={15} /> Download PDF
                </a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`compressed_${file?.name}`} />
                <button onClick={() => { setDownloadUrl(null); setStats(null); setFile(null); }} className="btn-secondary" style={{ width: '100%' }}>
                  Compress another
                </button>
              </motion.div>
            ) : (
              <motion.div key="action" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {isProcessing && progress > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)', gap: '12px', marginBottom: '8px' }}>
                      <span>{level === 'maximum' ? 'Rasterising pages…' : 'Optimising images…'}</span><span>{progress}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'var(--surface-high)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <motion.div animate={{ width: `${progress}%` }} style={{ height: '100%', background: 'var(--accent)', borderRadius: '9999px' }} />
                    </div>
                  </div>
                )}
                {error && <p style={{ fontSize: '14px', color: 'var(--danger)', lineHeight: '20px' }}>{error}</p>}
                <div style={{ background: 'var(--surface-sunken)', padding: '14px 16px', borderRadius: '16px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--text-secondary)' }}>
                  <span>Mode</span>
                  <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{LEVELS.find(l => l.id === level)?.label}</span>
                </div>
                <button
                  onClick={handleCompress}
                  disabled={!file || isProcessing}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {isProcessing ? (
                    <><div style={{ width: '14px', height: '14px', border: '2px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Compressing…</>
                  ) : <><Minimize2 size={15} /> Compress PDF</>}
                </button>
                {!file && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>Upload a PDF to start.</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ToolWorkspaceLayout>
  );
};

export default CompressPDF;
