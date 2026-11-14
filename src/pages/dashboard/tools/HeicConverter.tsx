import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Download, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { zipSync } from 'fflate';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import { heicToJpeg } from '../../../utils/heic';

interface Converted { name: string; url: string; blob: Blob }

/** iPhone HEIC photos → JPG, entirely in the browser. */
const HeicConverter = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Converted[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(90);
  const [error, setError] = useState('');

  const resultsRef = useRef<Converted[]>([]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => () => resultsRef.current.forEach(r => URL.revokeObjectURL(r.url)), []);

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return;
    setFiles(accepted);
    setResults(prev => { prev.forEach(r => URL.revokeObjectURL(r.url)); return []; });
    setError('');
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: true,
    accept: { 'image/heic': ['.heic'], 'image/heif': ['.heif'] },
  });

  const convert = async () => {
    setIsProcessing(true); setError(''); setProgress(0);
    const out: Converted[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      try {
        const blob = await heicToJpeg(f, quality / 100);
        out.push({ name: f.name.replace(/\.hei[cf]$/i, '') + '.jpg', url: URL.createObjectURL(blob), blob });
      } catch (e) {
        console.error(e);
        failed.push(f.name);
      }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setResults(out);
    if (failed.length) setError(`Could not convert: ${failed.join(', ')}. The file may be damaged or not a HEIC photo.`);
    setIsProcessing(false);
  };

  const save = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
  const downloadAll = async () => {
    if (results.length === 1) return save(results[0].url, results[0].name);
    const zip = zipSync(Object.fromEntries(await Promise.all(results.map(async r => [r.name, new Uint8Array(await r.blob.arrayBuffer())]))), { level: 0 });
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    save(url, 'photos_jpg.zip');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <ToolWorkspaceLayout title="Convert HEIC" description="Turn iPhone HEIC photos into JPGs that open everywhere — converted in your browser, never uploaded.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: results.length ? 0 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
            <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '6px' }}>{files.length ? `${files.length} HEIC photo${files.length > 1 ? 's' : ''} selected` : 'Upload HEIC photos'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click — select several at once</p>
          </div>
          {results.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '12px' }}>
              {results.map(r => (
                <div key={r.url} style={{ background: 'var(--surface-sunken)', borderRadius: '16px', overflow: 'hidden', minWidth: 0 }}>
                  <img src={r.url} alt={r.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <button onClick={() => save(r.url, r.name)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '4px', minHeight: '44px', padding: '6px 10px', background: 'transparent', border: 'none', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    <Download size={12} /> {r.name}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><ImageIcon size={18} color="var(--accent)" /> Convert to JPG</h3>
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="field-label">JPG quality: {quality}%</label>
              <input type="range" min={50} max={100} value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
            </div>
            {isProcessing && <ProgressBar progress={progress} color="var(--accent)" />}
            {results.length > 0 ? (
              <button onClick={downloadAll} className="btn-primary" style={{ width: '100%' }}>
                <Download size={16} /> {results.length > 1 ? `Download all (ZIP)` : 'Download JPG'}
              </button>
            ) : (
              <button onClick={convert} disabled={!files.length || isProcessing} className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Converting…' : 'Convert to JPG'} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default HeicConverter;
