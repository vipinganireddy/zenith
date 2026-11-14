import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import { PDFDocument } from 'pdf-lib';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

function sanitizeSvg(svgText: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return '';

  // Drop processing instructions, comments and CDATA: none of them draw anything,
  // and they are how markup hides from an element-only sanitizer.
  const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION);
  const strays: Node[] = [];
  while (walker.nextNode()) strays.push(walker.currentNode);
  strays.forEach(n => n.parentNode?.removeChild(n));

  // Remove elements that can execute code or embed foreign content
  doc.querySelectorAll('script, foreignObject, iframe, embed, object').forEach(el => el.remove());
  // <animate>/<set> can write an href (e.g. javascript:) after attributes are cleaned.
  doc.querySelectorAll('animate, set, animateMotion, animateTransform').forEach(el => {
    if (/href/i.test(el.getAttribute('attributeName') || '') || el.tagName.toLowerCase() === 'set') el.remove();
  });

  // Walk every element and strip dangerous attributes
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      const val = attr.value.toLowerCase().replace(/\s/g, '');
      if (name.startsWith('on')) { el.removeAttribute(attr.name); return; }
      if (val.startsWith('javascript:')) { el.removeAttribute(attr.name); return; }
      // Strip external href/xlink:href (keep fragment-only refs like #id)
      if ((name === 'href' || name === 'xlink:href') && !attr.value.startsWith('#')) {
        el.removeAttribute(attr.name);
      }
    });
  });

  return new XMLSerializer().serializeToString(doc.documentElement);
}

const SvgToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fitA4, setFitA4] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const f = acceptedFiles[0];
    setFile(f);
    setDownloadUrl(null);
    const svgText = await f.text();
    const clean = sanitizeSvg(svgText);
    if (!clean) { setError('Invalid or unsupported SVG file.');
      return; }
    setPreview(clean);
    // Shown through <img>, where an SVG can never run script
    setPreviewUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(new Blob([clean], { type: 'image/svg+xml' })); });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/svg+xml': ['.svg'] },
    maxFiles: 1, multiple: false,
  });

  const handleConvert = async () => {
    if (!file || !preview) return;
    setError('');
    setIsProcessing(true);
    try {
      // Intrinsic size: width/height attributes, else the viewBox, else a sane default.
      const root = new DOMParser().parseFromString(preview, 'image/svg+xml').documentElement;
      const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const len = (v: string | null) => { const n = parseFloat(v || ''); return /%$/.test(v || '') ? NaN : n; };
      let w = len(root.getAttribute('width')), h = len(root.getAttribute('height'));
      if (!(w > 0 && h > 0)) {
        if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
          w = w > 0 ? w : (h > 0 ? h * vb[2] / vb[3] : vb[2]);
          h = h > 0 ? h : w * vb[3] / vb[2];
        } else { w = 800; h = 600; }
      }
      // Width/height are needed for the browser to rasterize at the right aspect.
      root.setAttribute('width', String(w));
      root.setAttribute('height', String(h));
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(root));
      await img.decode();

      // Page sized to the drawing unless it's tiny/huge or A4 was requested.
      const pageW = w * 0.75, pageH = h * 0.75; // CSS px → pt
      const useA4 = fitA4 || Math.max(pageW, pageH) < 144 || Math.max(pageW, pageH) > 2400;
      const [pw, ph] = !useA4 ? [pageW, pageH] : pageW > pageH ? [841.89, 595.28] : [595.28, 841.89];
      const k = useA4 ? Math.min((pw - 72) / pageW, (ph - 72) / pageH) : 1;
      const drawW = pageW * k, drawH = pageH * k;

      // 300 dpi at the printed size (px per pt = 300/72), capped for memory.
      const scale = Math.min((drawW * 300 / 72) / w, 5000 / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = await (await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('render failed')), 'image/png'))).arrayBuffer();

      const pdf = await PDFDocument.create();
      pdf.setTitle(file.name.replace(/\.[^/.]+$/, ''));
      const image = await pdf.embedPng(png);
      pdf.addPage([pw, ph]).drawImage(image, { x: (pw - drawW) / 2, y: (ph - drawH) / 2, width: drawW, height: drawH });
      const bytes = await pdf.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Failed to convert SVG file. It may use features the browser cannot render.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="SVG to PDF"
      description="Convert SVG graphics into a high-resolution PDF, on a page sized to the drawing or on A4."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', minWidth: 0 }}>
          {preview ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file?.name}</h3>
                <button onClick={() => { setFile(null); setPreview(null); setDownloadUrl(null); }} style={{ background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  Change file
                </button>
              </div>
              <div style={{ flex: 1, background: 'var(--surface-sunken)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'hidden' }}>
                {previewUrl && <img src={previewUrl} alt={file?.name ?? 'SVG preview'} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />}
              </div>
            </div>
          ) : (
            <div
              {...getRootProps()}
              style={{
                border: `1.5px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
                borderRadius: '24px', padding: '40px 24px', textAlign: 'center',
                background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
                cursor: 'pointer', transition: 'all 0.2s ease', flex: 1,
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              }}
            >
              <input {...getInputProps()} />
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <UploadCloud size={32} />
              </div>
              <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload SVG File</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop .svg or click to browse</p>
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageIcon size={20} color="var(--accent)" /> Converter
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <a href={downloadUrl} download={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', marginTop: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '20px' }}>
                  Renders your SVG at print resolution (transparency kept). By default the page matches the drawing's size and shape.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', lineHeight: '20px', minHeight: '44px', marginBottom: '16px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={fitA4} onChange={e => setFitA4(e.target.checked)} /> Center on an A4 page instead
                </label>
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {isProcessing ? 'Converting...' : 'Convert to PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default SvgToPdf;
