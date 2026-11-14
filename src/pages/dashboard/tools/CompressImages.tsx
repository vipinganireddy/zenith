import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, ArrowRight, Download } from 'lucide-react';
import { zipSync } from 'fflate';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import { isHeic, heicToJpeg } from '../../../utils/heic';

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
};

type Format = 'keep' | 'jpeg' | 'webp';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

interface Result { name: string; original: number; blob: Blob; url: string; kept: boolean }

/** Re-encode one image: optional downscale, chosen format; never returns something bigger. */
async function compressOne(file: File, quality: number, maxDim: number, format: Format): Promise<Result> {
  const source: Blob = isHeic(file) ? await heicToJpeg(file) : file;
  const bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
  const k = maxDim ? Math.min(1, maxDim / Math.max(bmp.width, bmp.height)) : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!;
  const inType = isHeic(file) ? 'image/jpeg' : file.type;
  const outType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp'
    : inType === 'image/png' || inType === 'image/webp' ? inType : 'image/jpeg';
  // JPEG has no transparency: paint white first, or transparent areas turn black.
  if (outType === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, outType, outType === 'image/png' ? undefined : quality));
  c.width = c.height = 0;
  if (!blob) throw new Error('encode failed');
  const base = file.name.replace(/\.[^.]+$/, '');
  // Re-encoding an already-optimised file can make it bigger — then keep the original.
  const kept = blob.size >= file.size && k === 1 && format === 'keep' && !isHeic(file);
  const out = kept ? file : blob;
  return { name: kept ? file.name : `${base}.${EXT[out.type] ?? 'jpg'}`, original: file.size, blob: out, url: URL.createObjectURL(out), kept };
}

const CompressImages = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [quality, setQuality] = useState(75);
  const [maxDim, setMaxDim] = useState(0);
  const [format, setFormat] = useState<Format>('keep');
  const [error, setError] = useState('');

  const resultsRef = useRef<Result[]>([]);
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
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/heic': ['.heic'], 'image/heif': ['.heif'] },
  });

  const handleCompress = async () => {
    setError(''); setIsProcessing(true); setProgress(0);
    const out: Result[] = [];
    const failed: string[] = [];
    for (const [i, f] of files.entries()) {
      try { out.push(await compressOne(f, quality / 100, maxDim, format)); }
      catch (e) { console.error(e); failed.push(f.name); }
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    setResults(out);
    if (failed.length) setError(`Could not process: ${failed.join(', ')}`);
    setIsProcessing(false);
  };

  const save = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click(); };
  const downloadAll = async () => {
    if (results.length === 1) return save(results[0].url, results[0].name);
    const used = new Set<string>();
    const entries = await Promise.all(results.map(async r => {
      let name = r.name, n = 2;
      while (used.has(name)) name = r.name.replace(/(\.[^.]+)$/, `-${n++}$1`);
      used.add(name);
      return [name, new Uint8Array(await r.blob.arrayBuffer())] as const;
    }));
    const url = URL.createObjectURL(new Blob([zipSync(Object.fromEntries(entries), { level: 0 }) as BlobPart], { type: 'application/zip' }));
    save(url, 'compressed_images.zip');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const before = results.reduce((s, r) => s + r.original, 0), after = results.reduce((s, r) => s + r.blob.size, 0);
  const select = (label: string, value: string | number, onChange: (v: string) => void, options: [string | number, string][]) => (
    <label className="field-label" style={{ margin: 0 }}>{label}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '8px', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', textTransform: 'none', letterSpacing: 0 }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  return (
    <ToolWorkspaceLayout title="Compress Images" description="Shrink JPG, PNG, WebP and HEIC photos — batch, resize, choose quality. Your files never leave your device.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '36px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: results.length ? 0 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
            <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '6px' }}>{files.length ? `${files.length} image${files.length > 1 ? 's' : ''} selected` : 'Upload images'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>JPG, PNG, WebP or HEIC — select several at once</p>
          </div>
          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {results.map(r => (
                <div key={r.url} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '16px', minWidth: 0 }}>
                  <img src={r.url} alt="" style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '12px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                    <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>
                      {formatBytes(r.original)} → {formatBytes(r.blob.size)}{' '}
                      {r.kept ? <span>(already optimal — kept)</span>
                        : r.blob.size > r.original ? <span style={{ color: 'var(--warn)' }}>larger in this format — try "Same as original"</span>
                        : <span style={{ color: 'var(--accent)', fontWeight: 600 }}>−{Math.round((1 - r.blob.size / r.original) * 100)}%</span>}
                    </p>
                  </div>
                  <button onClick={() => save(r.url, r.name)} aria-label={`Download ${r.name}`} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent)', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Download size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><ImageIcon size={18} color="var(--accent)" /> Settings</h3>
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="field-label">Quality: {quality}%</label>
              <input type="range" min={30} max={95} value={quality} onChange={e => setQuality(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
            </div>
            {select('Maximum size', maxDim, v => setMaxDim(Number(v)), [[0, 'Original size'], [2560, '2560 px (large)'], [1920, '1920 px (Full HD)'], [1280, '1280 px (web)'], [800, '800 px (email)']])}
            {select('Output format', format, v => setFormat(v as Format), [['keep', 'Same as original'], ['jpeg', 'JPG (smallest for photos)'], ['webp', 'WebP (smaller, modern)']])}
            {isProcessing && <ProgressBar progress={progress} color="var(--accent)" />}
            {results.length > 0 && <p style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600 }}>Total: {formatBytes(before)} → {formatBytes(after)} {before > after && <span style={{ color: 'var(--accent)' }}>(−{Math.round((1 - after / before) * 100)}%)</span>}</p>}
            <button onClick={handleCompress} disabled={!files.length || isProcessing} className="btn-primary" style={{ width: '100%' }}>
              {isProcessing ? 'Compressing…' : results.length ? 'Compress again' : `Compress ${files.length || ''} image${files.length === 1 ? '' : 's'}`} <ArrowRight size={16} />
            </button>
            {results.length > 0 && (
              <button onClick={downloadAll} className="btn-secondary" style={{ width: '100%' }}>
                <Download size={16} /> {results.length > 1 ? 'Download all (ZIP)' : 'Download'}
              </button>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default CompressImages;
