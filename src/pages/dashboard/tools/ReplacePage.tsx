import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, RefreshCcw, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const DropBox = ({ label, file, rp }: { label: string; file: File | null; rp: ReturnType<typeof useDropzone> }) => (
  <div {...rp.getRootProps()} style={{ border: `2px dashed ${rp.isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '16px', padding: '24px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: '1 1 140px', minWidth: 0 }}>
    <input {...rp.getInputProps()} />
    <UploadCloud size={24} color="var(--accent)" style={{ margin: '0 auto 8px' }} />
    <p style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, marginBottom: '4px' }}>{label}</p>
    {file ? <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--accent)', fontWeight: 700, overflowWrap: 'anywhere' }}>{file.name}</p> : <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tap or click to choose, or drop</p>}
  </div>
);

const ReplacePage = () => {
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [pageToReplace, setPageToReplace] = useState(1);
  const [replaceWithPage, setReplaceWithPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const dropMain = useDropzone({ onDrop: (f: File[]) => { if (f[0]) { setMainFile(f[0]); setDownloadUrl(null); } }, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });
  const dropReplace = useDropzone({ onDrop: (f: File[]) => { if (f[0]) { setReplaceFile(f[0]); setDownloadUrl(null); } }, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleReplace = async () => {
    if (!mainFile || !replaceFile) return;
    setError('');
    setIsProcessing(true);
    try {
      const [abMain, abReplace] = await Promise.all([mainFile.arrayBuffer(), replaceFile.arrayBuffer()]);
      const [mainDoc, replaceDoc] = await Promise.all([PDFDocument.load(abMain, { ignoreEncryption: true }), PDFDocument.load(abReplace, { ignoreEncryption: true })]);
      if (pageToReplace > mainDoc.getPageCount()) throw new RangeError(`Main PDF has only ${mainDoc.getPageCount()} page(s).`);
      if (replaceWithPage > replaceDoc.getPageCount()) throw new RangeError(`Replacement PDF has only ${replaceDoc.getPageCount()} page(s).`);
      const [newPage] = await mainDoc.copyPages(replaceDoc, [replaceWithPage - 1]);
      const idx = pageToReplace - 1;
      mainDoc.removePage(idx);
      mainDoc.insertPage(idx, newPage);
      const bytes = await mainDoc.save();
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError(err instanceof RangeError ? err.message : 'Failed to replace page.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Replace Page" description="Swap a page in your PDF with a page from another PDF.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', background: 'var(--card-bg)', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <DropBox label="Main PDF" file={mainFile} rp={dropMain} />
            <DropBox label="Replacement PDF" file={replaceFile} rp={dropReplace} />
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label className="field-label">Replace page # (in main)</label>
              <input type="number" min={1} value={pageToReplace} onChange={e => setPageToReplace(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '8px 12px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
            </div>
            <RefreshCcw size={20} color="var(--accent)" aria-hidden="true" style={{ marginTop: '18px', flexShrink: 0 }} />
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <label className="field-label">With page # (from replacement)</label>
              <input type="number" min={1} value={replaceWithPage} onChange={e => setReplaceWithPage(Math.max(1, Number(e.target.value)))} style={{ width: '100%', padding: '8px 12px', borderRadius: '16px', border: 'none', fontSize: '16px', boxSizing: 'border-box', background: 'var(--surface-sunken)', minHeight: '48px' }} />
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><RefreshCcw size={18} color="var(--accent)" /> Replace</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
                <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`replaced_${mainFile?.name}`} style={{ display: 'flex', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', alignItems: 'center', justifyContent: 'center', minHeight: '56px', fontSize: '16px', boxSizing: 'border-box', width: '100%' }}>Download PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`replaced_${mainFile?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--card-bg)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>Upload the main PDF and the PDF containing the replacement page. Specify which page numbers to swap.</p>
              <button onClick={handleReplace} disabled={!mainFile || !replaceFile || isProcessing}
                style={{ width: '100%', padding: '0 24px', borderRadius: '24px', fontWeight: 700, border: 'none', background: mainFile && replaceFile ? 'var(--accent)' : 'var(--surface-high)', color: mainFile && replaceFile ? 'var(--on-accent)' : 'var(--ink-faint)', cursor: !mainFile || !replaceFile ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '56px', fontSize: '16px' }}>
                {isProcessing ? 'Replacing…' : 'Replace Page'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ReplacePage;
