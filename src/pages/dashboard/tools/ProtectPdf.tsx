import { useState, useCallback , type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Lock, CheckCircle, ArrowRight, Eye, EyeOff, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { runQpdf } from '../../../utils/qpdf';
import { PDFDocument } from 'pdf-lib';

/** Random owner password: the user password opens the file with full rights, and nobody can loosen settings without re-encrypting. */
const randomOwnerPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');

const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const eyeBtn: CSSProperties = { position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 };

const ProtectPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

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

  const handleProtect = async () => {
    if (!file || !password) return;

    setError('');
    setIsProcessing(true);
    try {
      const input = new Uint8Array(await file.arrayBuffer());
      try {
        await PDFDocument.load(input); // throws EncryptedPDFError for an already-locked file
      } catch (e) {
        setError(e instanceof Error && /encrypt/i.test(e.message)
          ? 'This PDF is already password-protected. Unlock it first, then protect it again.'
          : 'This file could not be read as a PDF. It may be damaged — try Repair PDF first.');
        return;
      }
      // Real PDF encryption (AES-256, the strongest the PDF standard offers) via qpdf.
      const result = await runQpdf(input, (i, o) => [i, '--encrypt', password, randomOwnerPassword(), '256', '--', o]);
      if (!result.output) { setError('Could not protect this PDF. It may be damaged — try Repair PDF first.'); return; }
      setDownloadUrl(URL.createObjectURL(new Blob([result.output as BlobPart], { type: 'application/pdf' })));
    } catch (err) {
      console.error(err);
      setError('Could not protect this PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const outputName = file ? `protected_${file.name.replace(/\.[^.]+$/, '')}.pdf` : 'protected.pdf';

  return (
    <ToolWorkspaceLayout
      title="Protect PDF"
      description="Encrypt your PDF with a password (AES-256). Every PDF reader will ask for it before showing the document."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '40px', textAlign: 'center',
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
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF to Protect</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ready to password-protect</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={20} color="var(--accent)" /> Security Settings
          </h3>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>PDF Protected!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>
                    Encrypted with AES-256. Any PDF reader will ask for the password.
                  </p>
                  <a href={downloadUrl} download={outputName} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>
                    Download Protected File
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={outputName} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', background: 'var(--warn-bg)', padding: '16px', borderRadius: '16px', alignItems: 'flex-start' }}>
                  <Info size={16} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: '20px', minWidth: 0 }}>
                    Your PDF is encrypted with AES-256 — the contents can't be read without the password. Keep it safe: a lost password can't be recovered.
                  </p>
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password"
                      style={{ ...fieldStyle, paddingRight: '48px' }} />
                    <button aria-label="Show or hide password" onClick={() => setShowPw(p => !p)} style={eyeBtn}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Confirm Password</label>
                  <input type={showPw ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password"
                    style={{ ...fieldStyle, boxShadow: confirm && confirm !== password ? 'inset 0 0 0 1.5px var(--danger)' : 'none' }} />
                  {confirm && confirm !== password && <p style={{ color: 'var(--danger)', fontSize: '14px', lineHeight: '20px', marginTop: '8px' }}>Passwords do not match</p>}
                </div>
                <button onClick={handleProtect} disabled={!file || isProcessing || !password || password !== confirm}
                  className="btn-primary" style={{ width: '100%' }}>
                  {isProcessing ? 'Protecting...' : 'Protect PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default ProtectPdf;
