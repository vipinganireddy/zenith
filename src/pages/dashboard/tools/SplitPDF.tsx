import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import { UploadCloud, FileText, Scissors, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { zipSync } from 'fflate';
import { parsePageRanges } from '../../../utils/pageRanges';

type SplitMode = 'extract' | 'ranges' | 'every';
const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'every', label: 'Every page separately', hint: 'One file per page (ZIP).' },
  { id: 'extract', label: 'Extract into one PDF', hint: 'The selected pages, in one new document.' },
  { id: 'ranges', label: 'One PDF per range', hint: 'Each comma-separated part becomes its own file (ZIP).' },
];

const SplitPDF = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pageRange, setPageRange] = useState('');
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<SplitMode>('every'); // the common intent; 'extract' with every page pre-filled would just copy the file
  const [outName, setOutName] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const f = acceptedFiles[0];
      setFile(f);
      setDownloadUrl(null);
      setError('');
      setTotalPages(null);
      try {
        const pdfDoc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
        setTotalPages(pdfDoc.getPageCount());
        setPageRange(`1-${pdfDoc.getPageCount()}`);
      } catch (e) {
        console.error('Could not read page count', e);
        setError('This PDF could not be opened. It may be damaged — try Repair PDF first.');
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false
  });

  const handleSplit = async () => {
    if (!file || !totalPages) return;
    const base = file.name.replace(/\.pdf$/i, '');
    const { groups, pages, errors } = mode === 'every'
      ? parsePageRanges(pageRange || 'all', totalPages)
      : parsePageRanges(pageRange, totalPages);
    if (errors.length) { setError(errors.join(' ')); return; }

    setError('');
    setIsProcessing(true);
    try {
      const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const build = async (nums: number[]) => {
        const doc = await PDFDocument.create();
        (await doc.copyPages(source, nums.map(n => n - 1))).forEach(p => doc.addPage(p));
        return doc.save();
      };
      const label = (nums: number[]) => nums.length === 1 ? `page_${nums[0]}` : `pages_${nums[0]}-${nums[nums.length - 1]}`;

      if (mode === 'extract') {
        const bytes = await build(pages);
        setOutName(`${base}_${label(pages)}.pdf`);
        setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      } else {
        const parts = mode === 'every' ? pages.map(n => [n]) : groups;
        const files: Record<string, Uint8Array> = {};
        for (const nums of parts) files[`${base}_${label(nums)}.pdf`] = await build(nums);
        const zip = zipSync(files, { level: 0 }); // PDFs are already compressed
        setOutName(`${base}_split.zip`);
        setDownloadUrl(URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' })));
      }
    } catch (err) {
      console.error('Error splitting PDF:', err);
      setError('Failed to split the PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout 
      title="Split PDF" 
      description="Extract pages into a new PDF, or split a PDF into several files."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        
        {/* Left Panel: Upload Area */}
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
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Drop PDF to split</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Tap or click to choose a file, or drag it here</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px', overflowWrap: 'anywhere' }}>{file.name}</h3>
                {totalPages && <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{totalPages} Pages detected</p>}
                
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setTotalPages(null); }}
                  style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', padding: '0 16px', borderRadius: '16px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}
                >
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Action */}
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scissors size={20} color="var(--accent)" /> Split Settings
          </h3>

          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>{mode === 'extract' ? 'Pages Extracted!' : 'PDF Split!'}</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px' }}>{outName}</p>
                  
                  <a 
                    href={downloadUrl} 
                    download={outName}
                    style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box' }}
                  >
                    {mode === 'extract' ? 'Download PDF' : 'Download ZIP'}
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={outName} />
                  <button onClick={() => setDownloadUrl(null)} style={{ marginTop: '12px', width: '100%', minHeight: '44px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '14px', cursor: 'pointer' }}>
                    Split again with different settings
                  </button>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--card-bg)', padding: '24px', borderRadius: '24px' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {MODES.map(m => (
                    <label key={m.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px', minHeight: '44px', borderRadius: '16px', background: 'var(--surface-sunken)', boxShadow: mode === m.id ? 'inset 0 0 0 2px var(--accent)' : 'none', cursor: 'pointer' }}>
                      <input type="radio" name="split-mode" checked={mode === m.id} onChange={() => setMode(m.id)} style={{ marginTop: '3px' }} />
                      <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: '14px', lineHeight: '20px', fontWeight: 600 }}>{m.label}</span><span style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)' }}>{m.hint}</span></span>
                    </label>
                  ))}
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label className="field-label">
                    {mode === 'every' ? 'Pages to include' : 'Pages'}
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. 1-3, 5, 8-10"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    disabled={!file}
                    style={{ width: '100%', padding: '0 16px', borderRadius: '16px', border: 'none', outline: 'none', fontSize: '16px', background: 'var(--surface-sunken)', minHeight: '48px', boxSizing: 'border-box' }}
                  />
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Page numbers or ranges separated by commas — e.g. <code>1-3, 5, 8-</code> (<code>8-</code> = to the end).
                  </p>
                </div>

                <button 
                  onClick={handleSplit}
                  disabled={!file || !totalPages || isProcessing || !pageRange}
                  style={{
                    width: '100%',
                    minHeight: '56px',
                    padding: '0 24px',
                    borderRadius: '24px',
                    fontWeight: 700,
                    fontSize: '16px',
                    border: 'none',
                    background: !file || !pageRange ? 'var(--surface-high)' : 'var(--accent)',
                    color: !file || !pageRange ? 'var(--ink-faint)' : 'var(--on-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    cursor: !file || isProcessing || !pageRange ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isProcessing ? 'Splitting...' : 'Split PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </ToolWorkspaceLayout>
  );
};

export default SplitPDF;
