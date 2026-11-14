import { useState, useCallback , type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Lock, CheckCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { PDFDocument } from 'pdf-lib';
import { runQpdf } from '../../../utils/qpdf';

// Real PDF permissions via qpdf (AES-256 with an owner password and no open
// password): the file opens normally, and compliant readers enforce the flags.

const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const eyeBtn: CSSProperties = { position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 };

const RestrictPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [restrictions, setRestrictions] = useState({ printing: true, copying: true, editing: true });
  const [error, setError] = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length) { setFile(accepted[0]); setDownloadUrl(null); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleApply = async () => {
    if (!file || !ownerPassword) return;
    setError('');
    setIsProcessing(true);
    try {
      const input = new Uint8Array(await file.arrayBuffer());
      try { await PDFDocument.load(input); } catch (e) {
        setError(e instanceof Error && /encrypt/i.test(e.message)
          ? 'This PDF is already protected. Unlock it first, then set permissions.'
          : 'This file could not be read as a PDF. It may be damaged — try Repair PDF first.');
        return;
      }
      const result = await runQpdf(input, (i, o) => [i, '--encrypt', '', ownerPassword, '256',
        `--print=${restrictions.printing ? 'none' : 'full'}`,
        `--extract=${restrictions.copying ? 'n' : 'y'}`,
        `--modify=${restrictions.editing ? 'none' : 'all'}`,
        '--', o]);
      if (!result.output) { setError('Could not apply permissions to this PDF.'); return; }
      setDownloadUrl(URL.createObjectURL(new Blob([result.output as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Failed.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Permission Control" description="Restrict printing, copying, and editing by setting an owner password on your PDF.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}><UploadCloud size={32} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Set permission restrictions</p>
            </>) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Lock size={48} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <div style={{ fontWeight: 600 }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Lock size={18} color="var(--accent)" /> Restrictions</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <a href={downloadUrl} download={`restricted_${file?.name?.replace(/\.pdf$/i, '')}.pdf`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>Download Protected File</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`restricted_${file?.name?.replace(/\.pdf$/i, '')}.pdf`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(['printing', 'copying', 'editing'] as const).map(r => (
                <label key={r} style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', cursor: 'pointer', fontSize: '14px' }}>
                  <input type="checkbox" checked={restrictions[r]} onChange={e => setRestrictions(p => ({ ...p, [r]: e.target.checked }))} />
                  Restrict {r}
                </label>
              ))}
              <div>
                <label style={labelStyle}>Owner Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} placeholder="Set password to unlock" style={{ ...fieldStyle, paddingRight: '48px' }} />
                  <button aria-label="Show or hide password" onClick={() => setShowPw(p => !p)} style={eyeBtn}>{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>
                Anyone can open the PDF; standard readers (Acrobat, Chrome, Edge, Preview) block the restricted actions unless the owner password is entered. To stop people opening it at all, use Protect PDF.
              </p>
              <button onClick={handleApply} disabled={!file || !ownerPassword || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Applying…' : 'Apply Restrictions'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RestrictPdf;
