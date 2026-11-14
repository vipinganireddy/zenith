import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Wrench, CheckCircle, ArrowRight, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import * as pdfjsLib from 'pdfjs-dist';
import '../../../utils/pdfWorker';
import { runQpdf } from '../../../utils/qpdf';

const RepairPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); setStatus(''); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleRepair = async () => {
    if (!file) return;
    setIsProcessing(true); setStatus(''); setError('');
    try {
      const input = new Uint8Array(await file.arrayBuffer());
      // 1. qpdf: rebuilds broken cross-reference tables, recovers objects from damaged
      //    streams and rewrites a clean file — the same engine many desktop tools use.
      setStatus('Rebuilding the file structure…');
      const fixed = await runQpdf(input, (i, o) => ['--object-streams=generate', i, o]);
      // A fixed file must also be readable by a real renderer.
      if (fixed.output) {
        try {
          const check = await pdfjsLib.getDocument({ isEvalSupported: false, data: fixed.output.slice() }).promise;
          await check.getPage(1);
          setDownloadUrl(URL.createObjectURL(new Blob([fixed.output as BlobPart], { type: 'application/pdf' })));
          setStatus(fixed.exitCode === 3 ? `Repaired — ${check.numPages} page(s) recovered (some damage was patched over).` : `Repaired — ${check.numPages} page(s) recovered.`);
          return;
        } catch { /* fall through to the lenient parser */ }
      }
      // 2. Fallback: pdf-lib's lenient parser.
      setStatus('Trying a second recovery method…');
      const pdfDoc = await PDFDocument.load(input, { ignoreEncryption: true, throwOnInvalidObject: false });
      const bytes = await pdfDoc.save({ useObjectStreams: false });
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      setStatus(`Recovered ${pdfDoc.getPageCount()} page(s).`);
    } catch (err) {
      setError(`Could not repair: ${err instanceof Error ? err.message : 'Unknown error'}. The file may be too severely corrupted.`);
    } finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Repair Broken PDF" description="Attempt to recover and re-save corrupted or damaged PDF files.">
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload Corrupted PDF</h3>
              <p style={{ color: 'var(--text-secondary)' }}>We'll attempt to recover it</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Wrench size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setStatus(''); setError(''); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>Change</button>
              </div>
            )}
          </div>
          {error && <div style={{ display: 'flex', gap: '8px', background: 'var(--danger-bg)', padding: '12px 16px', borderRadius: '16px', fontSize: '14px', lineHeight: '20px', color: 'var(--danger)' }}><AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />{error}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Wrench size={18} color="var(--accent)" /> Repair</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ marginBottom: '8px' }}>PDF Repaired!</h4>
                <a href={downloadUrl} download={`repaired_${file?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>Download Repaired PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`repaired_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>Loads the PDF in recovery mode (ignoring encryption and invalid objects), then re-saves it with a clean, standards-compliant structure.</p>
              {status && <p style={{ fontSize: '14px', lineHeight: '20px', color: 'var(--success)', fontWeight: 600 }}>{status}</p>}
              <button onClick={handleRepair} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Repairing…' : 'Repair PDF'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RepairPdf;
