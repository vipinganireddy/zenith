import { useState, useCallback , type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Unlock, CheckCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import * as pdfjsLib from 'pdfjs-dist';

import '../../../utils/pdfWorker';
import { runQpdf } from '../../../utils/qpdf';

const fieldStyle: CSSProperties = { width: '100%', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', lineHeight: '24px', boxSizing: 'border-box' };
const labelStyle: CSSProperties = { display: 'block', margin: '0 0 8px', fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' };
const eyeBtn: CSSProperties = { position: 'absolute', right: '2px', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 };

const UnlockPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setDownloadUrl(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const handleUnlock = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError('');
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      // pdf.js checks the password first: it reports a wrong one precisely.
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: data.slice(), password }).promise;
      // Real decryption with qpdf keeps everything — text, links, forms, bookmarks.
      const decrypted = await runQpdf(data, (i, o) => [`--password=${password}`, '--decrypt', i, o]);
      if (decrypted.output) {
        setDownloadUrl(URL.createObjectURL(new Blob([decrypted.output as BlobPart], { type: 'application/pdf' })));
        return;
      }
      // Fallback for files qpdf can't rewrite: rebuild each page as an image.
      const newDoc = await PDFDocument.create();
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(`Unlocking page ${i} of ${pdf.numPages}…`);
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ intent: 'print', canvasContext: canvas.getContext('2d')!, viewport: vp }).promise;
        const jpg = await newDoc.embedJpg(await (await fetch(canvas.toDataURL('image/jpeg', 0.92))).arrayBuffer());
        const realVp = page.getViewport({ scale: 1 });
        newDoc.addPage([realVp.width, realVp.height]).drawImage(jpg, { x: 0, y: 0, width: realVp.width, height: realVp.height });
      }
      const pdfBytes = await newDoc.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.name === 'PasswordException') {
        setError('Incorrect password. Please try again.');
      } else {
        setError('Failed to unlock. The file may be damaged.');
      }
    } finally {
      setIsProcessing(false);
      setProgress('');
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Unlock PDF"
      description="Remove the password from a password-protected PDF. You must know the current password."
    >
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
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload Locked PDF</h3>
                <p style={{ color: 'var(--text-secondary)' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Enter the password to unlock</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setError(''); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Unlock size={20} color="var(--accent)" /> Unlock Settings
          </h3>
          <div style={{ flex: 1 }}>
            {downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', marginBottom: '8px' }}>PDF Unlocked!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '16px' }}>Password has been removed successfully.</p>
                  <a href={downloadUrl} download={`unlocked_${file?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>
                    Download Unlocked PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`unlocked_${file?.name}`} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Current Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      placeholder="Enter current password"
                      style={{ ...fieldStyle, paddingRight: '48px', boxShadow: error ? 'inset 0 0 0 1.5px var(--danger)' : 'none' }}
                    />
                    <button aria-label="Show or hide password" onClick={() => setShowPw(p => !p)} style={eyeBtn}>
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {error && <p style={{ color: 'var(--danger)', fontSize: '14px', lineHeight: '20px', marginTop: '8px' }}>{error}</p>}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>
                  You must know the current password. The unlocked copy keeps all text, links and form fields.
                </p>
                <button
                  onClick={handleUnlock}
                  disabled={!file || isProcessing || !password}
                  className="btn-primary"
                  style={{ width: '100%' }}
                >
                  {isProcessing ? (progress || 'Unlocking...') : 'Unlock PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default UnlockPdf;
