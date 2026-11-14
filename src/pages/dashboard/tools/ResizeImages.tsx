import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Maximize2, ArrowRight, Download } from 'lucide-react';
import { zipSync } from 'fflate';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { isHeic, heicToJpeg } from '../../../utils/heic';

type Mode = 'percent' | 'fit' | 'exact';
interface Source { file: File; width: number; height: number }
interface Result { name: string; blob: Blob; url: string; width: number; height: number }

const COLOR = 'var(--accent)';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Target size for one image under the chosen mode. */
function targetSize(s: Source, mode: Mode, percent: number, w: number, h: number, lock: boolean, upscale: boolean): [number, number] {
  if (mode === 'percent') return [Math.max(1, Math.round(s.width * percent / 100)), Math.max(1, Math.round(s.height * percent / 100))];
  if (mode === 'fit') {
    let k = Math.min((w || Infinity) / s.width, (h || Infinity) / s.height);
    if (!isFinite(k)) k = 1;
    if (!upscale) k = Math.min(1, k);
    return [Math.max(1, Math.round(s.width * k)), Math.max(1, Math.round(s.height * k))];
  }
  if (lock) { // exact width; height follows the image's own proportions
    const ww = w || Math.round(s.width * (h / s.height));
    return [Math.max(1, ww), Math.max(1, Math.round(ww * s.height / s.width))];
  }
  return [Math.max(1, w || s.width), Math.max(1, h || s.height)];
}

async function resizeOne(s: Source, [w, h]: [number, number]): Promise<Result> {
  const input: Blob = isHeic(s.file) ? await heicToJpeg(s.file) : s.file;
  const bmp = await createImageBitmap(input, { imageOrientation: 'from-image' });
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  // PNG and WebP keep their format (and transparency); everything else becomes JPEG on white.
  const type = s.file.type === 'image/png' || s.file.type === 'image/webp' ? s.file.type : 'image/jpeg';
  if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, type, 0.92));
  c.width = c.height = 0;
  if (!blob) throw new Error('encode failed');
  const name = `${s.file.name.replace(/\.[^.]+$/, '')}_${w}x${h}.${EXT[type]}`;
  return { name, blob, url: URL.createObjectURL(blob), width: w, height: h };
}

const ResizeImages = () => {
  const [sources, setSources] = useState<Source[]>([]);
  const [mode, setMode] = useState<Mode>('percent');
  const [percent, setPercent] = useState(50);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [lockAspect, setLockAspect] = useState(true);
  const [upscale, setUpscale] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const resultsRef = useRef<Result[]>([]);
  useEffect(() => { resultsRef.current = results; }, [results]);
  useEffect(() => () => resultsRef.current.forEach(r => URL.revokeObjectURL(r.url)), []);

  const clearResults = () => {
    setResults(prev => { prev.forEach(r => URL.revokeObjectURL(r.url)); return []; });
    setZipUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    setError(''); clearResults();
    const out: Source[] = [];
    const failed: string[] = [];
    for (const f of accepted) {
      try {
        const bmp = await createImageBitmap(isHeic(f) ? await heicToJpeg(f) : f, { imageOrientation: 'from-image' });
        out.push({ file: f, width: bmp.width, height: bmp.height });
        bmp.close();
      } catch { failed.push(f.name); }
    }
    setSources(out);
    if (out.length === 1) { setWidth(out[0].width); setHeight(out[0].height); setMode('exact'); }
    if (failed.length) setError(`Could not open: ${failed.join(', ')}`);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: true,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/heic': ['.heic'], 'image/heif': ['.heif'], 'image/bmp': ['.bmp'], 'image/gif': ['.gif'] },
  });

  const single = sources.length === 1 ? sources[0] : null;
  const setW = (v: number) => { setWidth(v); if (mode === 'exact' && lockAspect && single) setHeight(Math.round(v * single.height / single.width)); };
  const setH = (v: number) => { setHeight(v); if (mode === 'exact' && lockAspect && single) setWidth(Math.round(v * single.width / single.height)); };

  const handleResize = async () => {
    setError(''); clearResults(); setIsProcessing(true); setProgress(0);
    const out: Result[] = [];
    const failed: string[] = [];
    for (const [i, s] of sources.entries()) {
      try { out.push(await resizeOne(s, targetSize(s, mode, percent, width, height, lockAspect, upscale))); }
      catch (e) { console.error(e); failed.push(s.file.name); }
      setProgress(Math.round((i + 1) / sources.length * 100));
    }
    setResults(out);
    if (out.length > 1) {
      const used = new Set<string>();
      const entries = await Promise.all(out.map(async r => {
        let n = r.name, k = 2;
        while (used.has(n)) n = r.name.replace(/(\.[^.]+)$/, `-${k++}$1`);
        used.add(n);
        return [n, new Uint8Array(await r.blob.arrayBuffer())] as const;
      }));
      setZipUrl(URL.createObjectURL(new Blob([zipSync(Object.fromEntries(entries), { level: 0 }) as BlobPart], { type: 'application/zip' })));
    }
    if (failed.length) setError(`Could not resize: ${failed.join(', ')}`);
    setIsProcessing(false);
  };

  const num = (label: string, value: number, onChange: (v: number) => void, suffix = 'px') => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <label className="field-label">{label} ({suffix})</label>
      <input type="number" min={1} value={value || ''} onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', boxSizing: 'border-box' }} />
    </div>
  );
  const preview = sources.slice(0, 1).map(s => targetSize(s, mode, percent, width, height, lockAspect, upscale))[0];
  const bundleName = sources.length > 1 ? 'resized_images.zip' : results[0]?.name;
  const bundleUrl = sources.length > 1 ? zipUrl : results[0]?.url;

  return (
    <ToolWorkspaceLayout title="Resize Images" description="Resize one image or a whole batch — by percentage, to fit a maximum size, or to exact pixels. Proportions and orientation are kept.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? COLOR : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: sources.length ? '16px' : '40px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: sources.length ? 0 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!sources.length && <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>}
            <h3 style={{ fontSize: sources.length ? '16px' : '20px', lineHeight: sources.length ? '24px' : '28px', marginBottom: '4px' }}>{sources.length ? `${sources.length} image${sources.length > 1 ? 's' : ''} selected` : 'Upload images'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '16px' }}>{sources.length ? 'Click or drop to choose others' : 'JPG, PNG, WebP or HEIC — select several at once'}</p>
          </div>
          {(results.length ? results : sources).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sources.map((s, i) => {
                const r = results[i];
                return (
                  <div key={s.file.name + i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', background: 'var(--surface-sunken)', borderRadius: '16px', minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.file.name}</p>
                      <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{s.width} × {s.height}px{r ? <> → <strong style={{ color: COLOR }}>{r.width} × {r.height}px</strong></> : ''}</p>
                    </div>
                    {r && <a href={r.url} download={r.name} aria-label={`Download ${r.name}`} style={{ color: COLOR, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Download size={16} /></a>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '260px', padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Maximize2 size={18} color={COLOR} /> Resize Settings</h3>
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="segmented">
              {([['percent', 'Percentage'], ['fit', 'Fit within'], ['exact', 'Exact size']] as const).map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id}>{label}</button>
              ))}
            </div>
            {mode === 'percent' && (
              <div>
                <label className="field-label">Scale: {percent}%</label>
                <input type="range" min={5} max={200} step={5} value={percent} onChange={e => setPercent(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
              </div>
            )}
            {mode !== 'percent' && <div style={{ display: 'flex', gap: '10px' }}>{num(mode === 'fit' ? 'Max width' : 'Width', width, setW)}{num(mode === 'fit' ? 'Max height' : 'Height', height, setH)}</div>}
            {mode === 'fit' && <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={upscale} onChange={e => setUpscale(e.target.checked)} /> Enlarge smaller images</label>}
            {mode === 'exact' && <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', minHeight: '44px', cursor: 'pointer' }}><input type="checkbox" checked={lockAspect} onChange={e => setLockAspect(e.target.checked)} /> Keep proportions{sources.length > 1 ? ' (uses the width)' : ''}</label>}
            {preview && <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{single ? 'Result' : 'First image'}: {preview[0]} × {preview[1]}px</p>}
            {isProcessing && <ProgressBar progress={progress} color={COLOR} />}
            <button onClick={handleResize} disabled={!sources.length || isProcessing}
              className="btn-primary" style={{ width: '100%' }}>
              {isProcessing ? 'Resizing…' : `Resize ${sources.length > 1 ? `${sources.length} images` : 'image'}`} <ArrowRight size={16} />
            </button>
            {bundleUrl && bundleName && (<>
              <a href={bundleUrl} download={bundleName} className="btn-secondary" style={{ textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                <Download size={16} /> {sources.length > 1 ? 'Download all (ZIP)' : 'Download'}
              </a>
              <SaveToDriveButton downloadUrl={bundleUrl} fileName={bundleName} />
            </>)}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ResizeImages;
