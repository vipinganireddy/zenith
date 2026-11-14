import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Droplet, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { prepareText } from '../../../utils/pdfText';
import { asWatermark } from '../../../utils/pdfWatermark';

const PRESET_COLORS = [
  { label: 'Gray', r: 0.5, g: 0.5, b: 0.5 },
  { label: 'Red', r: 0.8, g: 0.1, b: 0.1 },
  { label: 'Blue', r: 0.1, g: 0.3, b: 0.8 },
  { label: 'Green', r: 0.1, g: 0.6, b: 0.2 },
];

const AddWatermark = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [opacity, setOpacity] = useState(0.25);
  const [fontSize, setFontSize] = useState(48);
  const [colorIdx, setColorIdx] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setDownloadUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleApply = async () => {
    if (!file || !watermarkText.trim()) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const c = PRESET_COLORS[colorIdx];
      const color = rgb(c.r, c.g, c.b);
      const text = watermarkText.trim();
      const prepared = new Map<number, Awaited<ReturnType<typeof prepareText>>>();
      const at = async (size: number) => {
        let t = prepared.get(size);
        if (!t) { t = await prepareText(pdfDoc, text, { size, bold: true, color }); prepared.set(size, t); }
        return t;
      };

      for (const page of pdfDoc.getPages()) {
        // Work in the visible area (CropBox) and compensate for /Rotate so the
        // stamp reads at 45° on screen, centred, whatever the page orientation.
        const box = page.getCropBox();
        const rot = page.getRotation().angle % 360;
        const angle = 45 + rot;
        // Shrink the stamp if it would run off the page diagonal.
        const diag = Math.hypot(box.width, box.height);
        let t = await at(fontSize);
        const size = t.width > diag * 0.85 ? Math.max(8, Math.floor(fontSize * (diag * 0.85) / t.width)) : fontSize;
        if (size !== fontSize) t = await at(size);
        const rad = angle * Math.PI / 180;
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        // Start point so the text's centre (half width along, ~0.35em up) lands on the page centre.
        const x = cx - Math.cos(rad) * t.width / 2 + Math.sin(rad) * size * 0.35;
        const y = cy - Math.sin(rad) * t.width / 2 - Math.cos(rad) * size * 0.35;
        asWatermark(pdfDoc, page, () => t.draw(page, { x, y, color, opacity, rotate: angle }));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to add watermark.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Add Watermark"
      description="Stamp a diagonal text watermark across every page of your PDF with custom text, color, and opacity."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', background: 'var(--card-bg)', minWidth: 0 }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px',
              padding: '40px',
              textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              minWidth: 0,
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ready for watermarking</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Droplet size={20} color="var(--accent)" /> Watermark Settings
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Watermark Applied!</h4>
                  <a href={downloadUrl} download={`watermarked_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', marginTop: '16px', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`watermarked_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">Watermark Text</label>
                  <input type="text" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                </div>
                <div>
                  <label className="field-label">Font Size: {fontSize}pt</label>
                  <input type="range" min={20} max={100} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label">Opacity: {Math.round(opacity * 100)}%</label>
                  <input type="range" min={5} max={60} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label">Color</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {PRESET_COLORS.map((c, i) => (
                      <button key={c.label} onClick={() => setColorIdx(i)} title={c.label} aria-label={c.label} aria-pressed={i === colorIdx}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', background: `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`, border: 'none', cursor: 'pointer', minWidth: '40px', padding: 0, boxShadow: i === colorIdx ? '0 0 0 3px var(--surface), 0 0 0 5px var(--accent)' : 'inset 0 0 0 1.5px var(--hairline)' }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleApply}
                  disabled={!file || isProcessing || !watermarkText.trim()}
                  style={{
                    width: '100%',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    border: 'none',
                    background: !file || !watermarkText.trim() ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file || !watermarkText.trim() ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: !file || isProcessing || !watermarkText.trim() ? 'not-allowed' : 'pointer',
                    minHeight: '56px',
                    fontSize: '16px',
                  }}
                >
                  {isProcessing ? 'Applying...' : 'Apply Watermark'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AddWatermark;
