import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import * as pdfjsLib from 'pdfjs-dist';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';

interface PdfToExcelProps { format?: 'xlsx' | 'csv'; }

/** Numeric-looking cells become numbers so they can be summed: 1,250.50 · ₹1,250 · (300) · 12% */
function toCell(text: string): string | number {
  const t = text.replace(/\s/g, '');
  const m = t.match(/^(\()?[₹$€£]?(-?\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)(%)?(\))?$/);
  if (!m || (m[1] && !m[4])) return text;
  let n = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(n)) return text;
  if (m[1]) n = -n;
  if (m[3]) n = n / 100;
  return n;
}

const PdfToExcel = ({ format = 'xlsx' }: PdfToExcelProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [rowCount, setRowCount] = useState(0);
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true); setProgress(0);
    try {
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await file.arrayBuffer() }).promise;
      const sheets: (string | number)[][][] = [];
      let total = 0;

      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.round((i / pdf.numPages) * 90));
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();

        // Positioned, non-blank text pieces in reading coordinates (y down).
        const items = content.items.flatMap(item => {
          if (!('str' in item) || !item.str.trim()) return [];
          const m = pdfjsLib.Util.transform(vp.transform, item.transform);
          return [{ text: item.str.trim(), x: m[4], y: m[5], size: Math.hypot(m[2], m[3]) || 10 }];
        });

        // Rows: same baseline within half a line height.
        const rows: { y: number; size: number; cells: typeof items }[] = [];
        for (const it of items.sort((a, b) => a.y - b.y)) {
          const row = rows.find(r => Math.abs(r.y - it.y) < Math.min(r.size, it.size) * 0.5);
          if (row) row.cells.push(it); else rows.push({ y: it.y, size: it.size, cells: [it] });
        }

        // Columns: cluster left edges across the page, so the same column lines up in every row.
        const anchors: number[] = [];
        for (const x of items.map(it => it.x).sort((a, b) => a - b)) {
          if (!anchors.length || x - anchors[anchors.length - 1] > 12) anchors.push(x);
        }
        const columnOf = (x: number) => {
          let c = 0;
          anchors.forEach((a, k) => { if (a <= x + 6) c = k; });
          return c;
        };

        const grid = rows.map(r => {
          const line: (string | number)[] = [];
          for (const cell of r.cells.sort((a, b) => a.x - b.x)) {
            const c = columnOf(cell.x);
            line[c] = line[c] === undefined ? toCell(cell.text) : `${line[c]} ${cell.text}`;
          }
          return Array.from(line, v => v ?? '');
        });
        sheets.push(grid);
        total += grid.length;
      }

      setRowCount(total);
      setProgress(95);

      if (format === 'csv') {
        const csv = sheets.flat().map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        setDownloadUrl(URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }))); // BOM: Excel reads UTF-8 correctly
      } else {
        const wb = XLSX.utils.book_new();
        sheets.forEach((grid, k) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid.length ? grid : [['(no text on this page)']]), `Page ${k + 1}`));
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        setDownloadUrl(URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })));
      }
      if (total === 0) setError('No text was found — this looks like a scanned PDF. Run OCR PDF first.');
      setProgress(100);
    } catch (err) { console.error(err); setError('Could not convert this PDF. It may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  const ext = format === 'csv' ? 'csv' : 'xlsx';
  const label = format === 'csv' ? 'CSV' : 'Excel';
  const color = 'var(--accent)';

  return (
    <ToolWorkspaceLayout title={`PDF to ${label}`} description={`Extract text content from your PDF and export it as a ${label} file.`}>
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? color : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Text will be extracted page by page</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color={color} style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600, fontSize: '16px', lineHeight: '24px', minWidth: 0, overflowWrap: 'anywhere' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} style={{ marginTop: '16px', fontSize: '14px', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600 }}>Export to {label}</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--text-secondary)', marginBottom: '12px' }}>{rowCount} rows extracted</p>
                <a href={downloadUrl} download={`${file?.name.replace(/\.pdf$/i, '')}.${ext}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>Download .{ext}</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.pdf$/i, '')}.${ext}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>Text is grouped by row using Y-coordinate clustering. Works best with PDFs that have clear table or columnar layouts.</p>
              {isProcessing && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}><span>Extracting…</span><span>{progress}%</span></div>
                  <ProgressBar progress={progress} color={color} />
                </div>
              )}
              <button onClick={handleConvert} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Converting…' : `Convert to ${label}`} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PdfToExcel;
