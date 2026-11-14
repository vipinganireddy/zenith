import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import { prepareText, visualFrame, drawVisual } from '../../../utils/pdfText';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const HEX_COLORS: Record<string, [number, number, number]> = {
  '#000000': [0, 0, 0],
  '#1e3a5f': [0.118, 0.227, 0.373],
  '#EF4444': [0.937, 0.267, 0.267],
  '#2563EB': [0.145, 0.388, 0.922],
  '#6B7280': [0.42, 0.447, 0.502],
};

const colorOptions = Object.keys(HEX_COLORS);

const AddHeaderFooter = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [fontSize, setFontSize] = useState(10);
  const [color, setColor] = useState('#000000');
  const [showPageNum, setShowPageNum] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setDownloadUrl(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleApply = async () => {
    if (!file || (!headerText && !footerText && !showPageNum)) return;
    setError('');
    setIsProcessing(true);
    try {
      const ab = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(ab, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const [r, g, b] = HEX_COLORS[color] ?? [0, 0, 0];
      const textColor = rgb(r, g, b);

      // A rule across the visible page at visual height vy.
      const rule = (page: PDFPage, vy: number, margin: number, width: number) => {
        const f = visualFrame(page);
        const a = f.toPage(margin, vy), b = f.toPage(width - margin, vy);
        page.drawLine({ start: a, end: b, thickness: 0.5, color: textColor, opacity: 0.4 });
      };

      for (const [idx, page] of pages.entries()) {
        const { width, height } = visualFrame(page);
        const margin = 24;

        if (headerText) {
          const text = showPageNum ? `${headerText}  |  Page ${idx + 1} of ${pages.length}` : headerText;
          const t = await prepareText(pdfDoc, text, { size: fontSize, color: textColor });
          drawVisual(page, t, (width - t.width) / 2, height - margin - fontSize, { color: textColor, opacity: 0.85 });
          rule(page, height - margin - fontSize - 4, margin, width);
        }

        if (footerText || (showPageNum && !headerText)) {
          const baseText = footerText || '';
          const pageLabel = showPageNum ? (baseText ? `${baseText}  |  Page ${idx + 1} of ${pages.length}` : `Page ${idx + 1} of ${pages.length}`) : baseText;
          const t = await prepareText(pdfDoc, pageLabel, { size: fontSize, color: textColor });
          rule(page, margin + fontSize + 4, margin, width);
          drawVisual(page, t, (width - t.width) / 2, margin, { color: textColor, opacity: 0.85 });
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to add header/footer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const canApply = file && (headerText.trim() || footerText.trim() || showPageNum);

  return (
    <ToolWorkspaceLayout
      title="Add Header / Footer"
      description="Add custom text headers and footers to every page of your PDF. Optional page number support."
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
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to browse, or drag & drop</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '8px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', fontSize: '14px', minHeight: '44px', cursor: 'pointer' }}>
                  Change file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="var(--accent)" /> Header & Footer
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>Done!</h4>
                  <a href={downloadUrl} download={`hf_${file?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`hf_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">Header Text</label>
                  <input value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="e.g. Company Confidential" style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                </div>
                <div>
                  <label className="field-label">Footer Text</label>
                  <input value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="e.g. © 2024 Acme Corp" style={{ width: '100%', padding: '0 14px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
                </div>
                <div>
                  <label className="field-label">Font Size: {fontSize}pt</label>
                  <input type="range" min={7} max={18} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ width: '100%' }} />
                </div>
                <div>
                  <label className="field-label">Color</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {colorOptions.map(c => (
                      <button key={c} onClick={() => setColor(c)} aria-label={`Colour ${c}`} aria-pressed={color === c} style={{ width: '40px', height: '40px', borderRadius: '50%', background: c, border: 'none', cursor: 'pointer', minWidth: '40px', padding: 0, boxShadow: color === c ? '0 0 0 3px var(--surface), 0 0 0 5px var(--accent)' : 'inset 0 0 0 1.5px var(--hairline)' }} />
                    ))}
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', fontSize: '14px', lineHeight: '20px', minHeight: '44px' }}>
                  <input type="checkbox" checked={showPageNum} onChange={e => setShowPageNum(e.target.checked)} />
                  Include page numbers
                </label>
                <button onClick={handleApply} disabled={!canApply || isProcessing}
                  style={{
                    width: '100%',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    border: 'none',
                    background: canApply ? 'var(--accent)' : 'var(--surface-high)',
                    color: canApply ? 'var(--on-accent)' : 'var(--ink-faint)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: !canApply || isProcessing ? 'not-allowed' : 'pointer',
                    minHeight: '56px',
                    fontSize: '16px',
                  }}>
                  {isProcessing ? 'Applying…' : 'Apply Header/Footer'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AddHeaderFooter;
