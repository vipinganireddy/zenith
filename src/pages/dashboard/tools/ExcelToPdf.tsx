import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, BarChart2, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import * as XLSX from 'xlsx';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import ProgressBar from '../../../components/tools/ProgressBar';
import ConversionNotes from '../../../components/tools/ConversionNotes';
import { htmlToPdf, escapeHtml, A4, A4_LANDSCAPE } from '../../../utils/htmlToPdf';

const ALL_SHEETS = '__all__';

/** One sheet as an HTML table; the first row becomes a <thead> so it repeats on every page. */
function sheetHtml(wb: XLSX.WorkBook, name: string): { html: string; cols: number } {
  const sheet = wb.Sheets[name];
  if (!sheet || !sheet['!ref']) return { html: '', cols: 0 };
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const table = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
  const doc = new DOMParser().parseFromString(table, 'text/html');
  const t = doc.querySelector('table');
  if (!t) return { html: '', cols: 0 };
  const first = t.querySelector('tr');
  if (first && t.rows.length > 1) {
    const thead = doc.createElement('thead');
    thead.appendChild(first);
    t.insertBefore(thead, t.firstChild);
  }
  return { html: `<h2>${escapeHtml(name)}</h2>${t.outerHTML}`, cols: range.e.c - range.s.c + 1 };
}

const ExcelToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbookRef, setWorkbookRef] = useState<XLSX.WorkBook | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const f = acceptedFiles[0];
    setFile(f);
    setDownloadUrl(null);
    setError('');
    setNotes([]);
    try {
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
      setWorkbookRef(wb);
      setSheetNames(wb.SheetNames);
      setSelectedSheet(wb.SheetNames.length > 1 ? ALL_SHEETS : wb.SheetNames[0]);
    } catch (err) {
      console.error(err);
      setWorkbookRef(null);
      setSheetNames([]);
      setError('This spreadsheet could not be read. It may be corrupted or password-protected.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1, multiple: false,
  });

  const handleConvert = async () => {
    if (!file || !workbookRef) return;
    setError('');
    setNotes([]);
    setProgress(0);
    setIsProcessing(true);
    try {
      const names = selectedSheet === ALL_SHEETS ? workbookRef.SheetNames : [selectedSheet];
      const parts = names.map(n => sheetHtml(workbookRef, n)).filter(p => p.html);
      if (!parts.length) { setError('The selected sheet is empty.'); return; }
      const cols = Math.max(...parts.map(p => p.cols));
      const html = parts.map((p, i) => `<section${i ? ' class="next"' : ''}>${p.html}</section>`).join('');
      const css = `
        body { font-size: ${cols > 12 ? 7 : cols > 8 ? 8 : 9}pt; }
        section.next { break-before: page; }
        h2 { font-size: 13pt; margin: 0 0 8px; }
        table { border-collapse: collapse; }
        td, th { border: 1px solid #c8ccd4; padding: 3px 6px; vertical-align: top; }
        thead td { background: #2563EB; color: #fff; font-weight: bold; }
        tbody tr:nth-child(even) td { background: #f0f4ff; }
        td[data-t="n"] { text-align: right; white-space: nowrap; }`;
      const { bytes, warnings } = await htmlToPdf(html, {
        css, margin: 28,
        pageSize: cols > 6 ? A4_LANDSCAPE : A4,
        title: file.name.replace(/\.[^/.]+$/, ''),
        onProgress: f => setProgress(Math.round(f * 100)),
      });
      setNotes(warnings);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Failed to convert Excel file.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Excel to PDF"
      description="Convert Excel spreadsheets (.xlsx) to a formatted PDF table. Landscape layout for wide sheets."
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
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload Excel File</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop .xlsx or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <BarChart2 size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>{sheetNames.length} sheet(s) detected</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setSheetNames([]); setWorkbookRef(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
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
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '20px' }}>Your spreadsheet has been exported as PDF.</p>
                  <a href={downloadUrl} download={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${file?.name.replace(/\.[^/.]+$/, '')}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {sheetNames.length > 1 && (
                  <div>
                    <label className="field-label">Select Sheet</label>
                    <select
                      value={selectedSheet}
                      onChange={(e) => setSelectedSheet(e.target.value)}
                      style={{ width: '100%', minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px' }}
                    >
                      <option value={ALL_SHEETS}>All sheets ({sheetNames.length})</option>
                      {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                )}
                {isProcessing && <ProgressBar progress={progress} color="var(--accent)" />}
                <button
                  onClick={handleConvert}
                  disabled={!file || !workbookRef || isProcessing}
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

export default ExcelToPdf;
