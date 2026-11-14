import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Database, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import ConversionNotes from '../../../components/tools/ConversionNotes';
import { htmlToPdf, escapeHtml, A4, A4_LANDSCAPE } from '../../../utils/htmlToPdf';

/** RFC 4180 parsing: quoted fields, "" escapes, CRLF, BOM; delimiter auto-detected (, ; tab |). */
const parseCSV = (input: string): string[][] => {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
  const firstLine = text.slice(0, text.search(/\r?\n/) >>> 0 || text.length);
  const delim = [',', ';', '\t', '|']
    .map(d => ({ d, n: firstLine.replace(/"[^"]*"/g, '').split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      inQuotes = true; cell = '';
    } else if (ch === delim) {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row); }
  const width = Math.max(0, ...rows.map(r => r.length));
  return rows.map(r => [...r, ...Array(width - r.length).fill('')]);
};

const CsvToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const f = acceptedFiles[0];
    setFile(f);
    setDownloadUrl(null);
    const text = await f.text();
    const rows = parseCSV(text);
    setRowCount(rows.length - 1);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'], 'text/plain': ['.csv'] },
    maxFiles: 1, multiple: false,
  });

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setNotes([]);
    setIsProcessing(true);
    try {
      const rows = parseCSV(await file.text());
      if (rows.length === 0) { setError('CSV file is empty.'); return; }
      const [headers, ...dataRows] = rows;
      // Right-align columns that are numeric in every non-empty data cell.
      const numeric = headers.map((_, c) => dataRows.some(r => r[c].trim()) &&
        dataRows.every(r => !r[c].trim() || /^[-+]?[\d,.\s]*\d[\d,.]*%?$/.test(r[c].trim())));
      const cell = (v: string, c: number) => `<td${numeric[c] ? ' class="n"' : ''}>${escapeHtml(v)}</td>`;
      const title = file.name.replace(/\.[^/.]+$/, '');
      const html = `
        <h2>${escapeHtml(title)}</h2>
        <p class="meta">${dataRows.length} rows × ${headers.length} columns</p>
        <table>
          <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
          <tbody>${dataRows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody>
        </table>`;
      const css = `
        body { font-size: ${headers.length > 10 ? 7 : headers.length > 6 ? 8 : 9}pt; }
        h2 { font-size: 14pt; margin: 0 0 4px; } .meta { color: #555; margin: 0 0 10px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #1e3a5f; color: #fff; padding: 5px 6px; text-align: left; }
        td { border: 1px solid #ddd; padding: 3px 6px; overflow-wrap: anywhere; }
        td.n { text-align: right; white-space: nowrap; }
        tbody tr:nth-child(even) td { background: #f5f8ff; }`;
      const { bytes, warnings } = await htmlToPdf(html, {
        css, title, margin: 28, pageSize: headers.length > 6 ? A4_LANDSCAPE : A4,
      });
      setNotes(warnings);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Failed to convert CSV file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="CSV to PDF"
      description="Convert CSV data files into a beautifully formatted PDF table. Wide sheets use landscape layout automatically."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
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
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload CSV File</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop .csv or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Database size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                {rowCount !== null && <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>{rowCount} data rows detected</p>}
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setRowCount(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600 }}>Settings</h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Done!</h4>
                  <a href={downloadUrl} download={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box', marginTop: '16px' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '20px' }}>
                  Parses your CSV and renders it as a formatted table in a PDF. Columns over 6 automatically switch to landscape.
                </p>
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
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

export default CsvToPdf;
