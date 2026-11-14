import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, Download, Pipette } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import { isHeic, heicToJpeg } from '../../../utils/heic';
import { borderColor, removePlainBackground, transparentBorder } from '../../../utils/removeBackground';

const COLOR = 'var(--accent)';
const MAX_SIDE = 4096; // keeps the flood fill and canvas memory reasonable on phones
const CHECKER = 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 20px 20px';

const RemoveBackground = () => {
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ImageData | null>(null);
  const [bgColor, setBgColor] = useState<[number, number, number] | null>(null);
  const [tolerance, setTolerance] = useState(12);
  const [feather, setFeather] = useState(10);
  const [everywhere, setEverywhere] = useState(false);
  const [preTransparent, setPreTransparent] = useState(false);
  const [picking, setPicking] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [cleared, setCleared] = useState(0);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadId = useRef(0);

  const onDrop = useCallback(async (accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    const id = ++loadId.current; // a slower, older decode must not overwrite a newer upload
    setError(''); setFile(f); setSource(null); setPicking(false);
    try {
      const bmp = await createImageBitmap(isHeic(f) ? await heicToJpeg(f) : f, { imageOrientation: 'from-image' });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const img = g.getImageData(0, 0, c.width, c.height);
      if (id !== loadId.current) return;
      setPreTransparent(transparentBorder(img) > 0.5);
      setBgColor(borderColor(img));
      setSource(img);
    } catch (e) { console.error(e); if (id === loadId.current) { setError('Could not open this image.'); setFile(null); } }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, maxFiles: 1, multiple: false,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/heic': ['.heic'], 'image/heif': ['.heif'], 'image/bmp': ['.bmp'] },
  });

  // Re-run on every setting change; a short delay keeps slider drags smooth.
  useEffect(() => {
    if (!source || !bgColor) return;
    const t = setTimeout(() => {
      const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      setCleared(removePlainBackground(out, { tolerance, feather, color: bgColor, everywhere }) / (out.width * out.height));
      const c = canvasRef.current!;
      c.width = out.width; c.height = out.height;
      c.getContext('2d')!.putImageData(out, 0, 0);
      c.toBlob(b => { if (b) setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(b); }); }, 'image/png');
    }, 120);
    return () => clearTimeout(t);
  }, [source, bgColor, tolerance, feather, everywhere]);
  useEffect(() => () => { setResultUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; }); }, []);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!picking || !source) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * source.width), y = Math.floor((e.clientY - r.top) / r.height * source.height);
    const i = (y * source.width + x) * 4;
    setBgColor([source.data[i], source.data[i + 1], source.data[i + 2]]);
    setPicking(false);
  };

  const outName = `${file?.name.replace(/\.[^.]+$/, '') ?? 'image'}_no-bg.png`;
  const slider = (label: string, value: number, set: (n: number) => void, max: number, hint: string) => (
    <div>
      <label className="field-label">{label}: {value}</label>
      <input type="range" min={0} max={max} value={value} onChange={e => set(Number(e.target.value))} style={{ width: '100%', minHeight: '44px', accentColor: 'var(--accent)' }} />
      <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{hint}</p>
    </div>
  );

  return (
    <ToolWorkspaceLayout title="Remove Background" description="Make a plain background transparent — product photos, logos, signatures and scans. Runs on your device; the image is never uploaded.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? COLOR : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: source ? '14px' : '36px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: source ? 0 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!source && <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>}
            <h3 style={{ fontSize: source ? '14px' : '20px', lineHeight: source ? '20px' : '28px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{file ? file.name : 'Upload an image'}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '16px' }}>{source ? 'Click or drop to choose another' : 'JPG, PNG, WebP or HEIC with a plain background'}</p>
          </div>
          <div style={{ display: source ? 'flex' : 'none', justifyContent: 'center', background: CHECKER, borderRadius: '16px', padding: '12px' }}>
            <canvas ref={canvasRef} onClick={pick} style={{ maxWidth: '100%', maxHeight: '60vh', cursor: picking ? 'crosshair' : 'default' }} />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '260px', padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><ImageIcon size={18} color={COLOR} /> Settings</h3>
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '28px', height: '28px', borderRadius: '12px', border: '1px solid var(--hairline)', background: bgColor ? `rgb(${bgColor.join(',')})` : CHECKER, flexShrink: 0 }} />
              <span style={{ fontSize: '14px', lineHeight: '20px', flex: 1, minWidth: 0 }}>Background colour {bgColor ? '(detected)' : ''}</span>
              <button onClick={() => setPicking(p => !p)} disabled={!source} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'none', boxShadow: picking ? 'inset 0 0 0 2px var(--accent)' : 'none', background: picking ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--surface-high)', color: 'var(--ink)', cursor: source ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                <Pipette size={13} /> {picking ? 'Click the image' : 'Pick'}
              </button>
            </div>
            {slider('Tolerance', tolerance, setTolerance, 60, 'Raise it if background is left behind; lower it if the subject gets eaten.')}
            {slider('Edge softness', feather, setFeather, 40, 'Smooths the cut-out edge.')}
            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '14px', lineHeight: '20px', minHeight: '44px', cursor: 'pointer' }}>
              <input type="checkbox" checked={everywhere} onChange={e => setEverywhere(e.target.checked)} style={{ marginTop: '2px' }} />
              <span>Also remove this colour inside shapes <span style={{ color: 'var(--text-secondary)' }}>(e.g. the holes in letters of a logo)</span></span>
            </label>
            {source && <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{
              cleared >= 0.01 ? `${Math.round(cleared * 100)}% of the image made transparent`
                : preTransparent ? 'This image already has a transparent background.'
                : 'Nothing removed — the edges of this image don\'t share one plain colour. Try picking the background colour.'}</p>}
            <a href={resultUrl ?? undefined} download={outName} aria-disabled={!resultUrl}
              className="btn-primary" style={{ textDecoration: 'none', width: '100%', boxSizing: 'border-box', pointerEvents: resultUrl ? 'auto' : 'none' }}>
              <Download size={16} /> Download PNG
            </a>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>Works best on solid or near-solid backgrounds. Busy photo backgrounds (rooms, outdoors) aren't supported.</p>
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RemoveBackground;
