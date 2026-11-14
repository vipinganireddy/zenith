import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import { UploadCloud, Image as ImageIcon, CheckCircle, ArrowRight, ArrowUp, ArrowDown, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { isHeic, heicToJpeg } from '../../../utils/heic';

interface ImageToPdfProps {
  toolType: 'jpg' | 'png' | 'image';
}

type PageSize = 'fit' | 'a4' | 'letter';
const SIZES: Record<Exclude<PageSize, 'fit'>, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGINS = { none: 0, small: 18, large: 40 } as const;

interface Item { id: string; file: File; url: string }

/** EXIF orientation of a JPEG (1 = upright), read from the APP1 segment. */
async function jpegOrientation(file: File): Promise<number> {
  const v = new DataView(await file.slice(0, 128 * 1024).arrayBuffer());
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return 1;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const marker = v.getUint16(o), len = v.getUint16(o + 2);
    if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) { // "Exif"
      const t = o + 10, little = v.getUint16(t) === 0x4949;
      const ifd = t + v.getUint32(t + 4, little);
      for (let i = 0, n = v.getUint16(ifd, little); i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > v.byteLength) break;
        if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little);
      }
      return 1;
    }
    if ((marker & 0xff00) !== 0xff00) break;
    o += 2 + len;
  }
  return 1;
}

/**
 * Bytes pdf-lib can embed. Upright JPEGs and PNGs go in untouched (no quality
 * loss); everything else — rotated phone photos, WebP, GIF, BMP, AVIF, HEIC where
 * the browser can decode it — is drawn upright on a canvas and re-encoded.
 */
async function toEmbeddable(file: File): Promise<{ bytes: ArrayBuffer; kind: 'jpg' | 'png' }> {
  const type = file.type || '';
  if (type === 'image/png') return { bytes: await file.arrayBuffer(), kind: 'png' };
  if (type === 'image/jpeg' && (await jpegOrientation(file)) === 1) return { bytes: await file.arrayBuffer(), kind: 'jpg' };
  let bmp: ImageBitmap;
  try {
    // HEIC (iPhone photos) is decoded with libheif where the browser can't do it itself.
    const source: Blob = isHeic(file) ? await heicToJpeg(file) : file;
    bmp = await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`${file.name}: this image format isn't supported.`);
  }
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d')!;
  const opaque = type === 'image/jpeg' || /heic|heif/i.test(type);
  if (opaque) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, opaque ? 'image/jpeg' : 'image/png', 0.92));
  c.width = c.height = 0;
  if (!blob) throw new Error(`${file.name}: could not be converted.`);
  return { bytes: await blob.arrayBuffer(), kind: opaque ? 'jpg' : 'png' };
}

const ImageToPdf = ({ toolType }: ImageToPdfProps) => {
  const [items, setItems] = useState<Item[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [margin, setMargin] = useState<keyof typeof MARGINS>('small');

  // Free thumbnail URLs when the tool closes (removals revoke their own).
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach(i => URL.revokeObjectURL(i.url)), []);

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted.length) return;
    setItems(prev => [...prev, ...accepted.map(file => ({ id: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) }))]);
    setDownloadUrl(null);
    setError('');
  }, []);

  const acceptType: Record<string, string[]> =
    toolType === 'jpg' ? { 'image/jpeg': ['.jpg', '.jpeg'] }
    : toolType === 'png' ? { 'image/png': ['.png'] }
    : {
      'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'], 'image/gif': ['.gif'],
      'image/bmp': ['.bmp'], 'image/avif': ['.avif'], 'image/heic': ['.heic'], 'image/heif': ['.heif'],
    };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: acceptType, multiple: true });

  const move = (i: number, d: -1 | 1) => setItems(prev => {
    const next = [...prev]; const j = i + d;
    if (j < 0 || j >= next.length) return prev;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const remove = (id: string) => setItems(prev => {
    const gone = prev.find(i => i.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    return prev.filter(i => i.id !== id);
  });

  const handleConvert = async () => {
    if (!items.length) return;
    setError('');
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.create();
      for (const { file } of items) {
        const { bytes, kind } = await toEmbeddable(file);
        const image = kind === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
        if (pageSize === 'fit') {
          // Page sized to the photo at 150 DPI, so it prints at a sensible size.
          const w = image.width * 72 / 150, h = image.height * 72 / 150;
          pdfDoc.addPage([w, h]).drawImage(image, { x: 0, y: 0, width: w, height: h });
          continue;
        }
        // Paper size, turned to match the photo, image centred and scaled to fit.
        const [short, long] = SIZES[pageSize];
        const [pw, ph] = image.width > image.height ? [long, short] : [short, long];
        const m = MARGINS[margin];
        const k = Math.min((pw - 2 * m) / image.width, (ph - 2 * m) / image.height);
        const w = image.width * k, h = image.height * k;
        pdfDoc.addPage([pw, ph]).drawImage(image, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      }
      const pdfBytes = await pdfDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error('Error converting Image to PDF:', err);
      setError(err instanceof Error && err.message.includes(':') ? err.message : 'Failed to convert the images to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const outName = items.length === 1 ? `${items[0].file.name.replace(/\.[^/.]+$/, '')}.pdf` : 'images.pdf';
  const label = toolType === 'image' ? 'Images' : toolType.toUpperCase();

  return (
    <ToolWorkspaceLayout
      title={toolType === 'image' ? 'Image to PDF' : `${toolType.toUpperCase()} to PDF`}
      description="Combine photos and images into one PDF — any order, A4/Letter or original size, phone photos kept upright."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', minWidth: 0 }}>
          <div
            {...getRootProps()}
            style={{
              border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: items.length ? '20px' : '40px 24px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s ease', flex: items.length ? 0 : 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ width: items.length ? '40px' : '64px', height: items.length ? '40px' : '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
              <UploadCloud size={items.length ? 20 : 32} />
            </div>
            <h3 style={{ fontSize: items.length ? '16px' : '20px', lineHeight: items.length ? '24px' : '28px', marginBottom: '6px' }}>{items.length ? 'Add more images' : `Upload ${label}`}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click — select several at once</p>
          </div>

          {items.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '12px' }}>
              {items.map((it, i) => (
                <div key={it.id} style={{ borderRadius: '16px', overflow: 'hidden', background: 'var(--surface-sunken)', minWidth: 0 }}>
                  <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
                    <img src={it.url} alt={it.file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', imageOrientation: 'from-image' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0', padding: '0 0 0 12px' }}>
                    <span style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 600, marginRight: 'auto' }}>{i + 1}</span>
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move earlier" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}><ArrowUp size={16} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move later" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-secondary)' }}><ArrowDown size={16} /></button>
                    <button onClick={() => remove(it.id)} aria-label="Remove" style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--danger)' }}><X size={16} /></button>
                  </div>
                  <p title={it.file.name} style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)', padding: '0 12px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.file.name}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600 }}>Conversion</h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Success!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '20px' }}>{items.length} image{items.length > 1 ? 's' : ''} → {items.length} page{items.length > 1 ? 's' : ''}</p>
                  <a href={downloadUrl} download={outName} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={outName} />
                  <button onClick={() => setDownloadUrl(null)} style={{ marginTop: '12px', minHeight: '44px', padding: '0 16px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>Change settings</button>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label className="field-label" style={{ margin: 0 }}>Page size
                  <select value={pageSize} onChange={e => setPageSize(e.target.value as PageSize)} style={{ display: 'block', width: '100%', marginTop: '8px', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', textTransform: 'none', letterSpacing: 0 }}>
                    <option value="a4">A4 (fit image)</option>
                    <option value="letter">US Letter (fit image)</option>
                    <option value="fit">Same as image</option>
                  </select>
                </label>
                {pageSize !== 'fit' && (
                  <label className="field-label" style={{ margin: 0 }}>Margin
                    <select value={margin} onChange={e => setMargin(e.target.value as keyof typeof MARGINS)} style={{ display: 'block', width: '100%', marginTop: '8px', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', textTransform: 'none', letterSpacing: 0 }}>
                      <option value="none">None</option>
                      <option value="small">Small</option>
                      <option value="large">Large</option>
                    </select>
                  </label>
                )}
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '16px' }}>
                  Each image becomes one page, turned to match its orientation. JPG and PNG are embedded without re-compression.
                </p>
                <button
                  onClick={handleConvert}
                  disabled={!items.length || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
                >
                  {isProcessing ? 'Converting...' : `Convert ${items.length || ''} to PDF`} <ArrowRight size={18} />
                </button>
                {!items.length && <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '16px' }}><ImageIcon size={13} /> JPG, PNG, WebP, GIF, BMP, AVIF, HEIC</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ImageToPdf;
