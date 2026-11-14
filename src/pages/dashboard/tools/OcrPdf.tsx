import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, ScanLine, CheckCircle, ArrowRight, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createWorker } from 'tesseract.js';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import ProgressBar from '../../../components/tools/ProgressBar';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import * as pdfjsLib from 'pdfjs-dist';

import '../../../utils/pdfWorker';
import { PDFDocument } from 'pdf-lib';

// Tesseract language codes. Models download on first use (a few MB each, cached by the browser).
const LANGUAGES: [string, string][] = [
  ['eng', 'English'], ['hin', 'Hindi'], ['tam', 'Tamil'], ['tel', 'Telugu'], ['ben', 'Bengali'],
  ['mar', 'Marathi'], ['guj', 'Gujarati'], ['kan', 'Kannada'], ['mal', 'Malayalam'],
  ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ara', 'Arabic'], ['chi_sim', 'Chinese (Simplified)'],
];
const OCR_SCALE = 2; // render at 144 DPI

const OcrPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrText, setOcrText] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [done, setDone] = useState(false);
  const [ocrBlobUrl, setOcrBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('eng');
  const [output, setOutput] = useState<'pdf' | 'txt'>('pdf');
  const [skipText, setSkipText] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const isPdf = file?.type === 'application/pdf';

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setFile(acceptedFiles[0]);
    setOcrText('');
    setDone(false);
    setProgress(0);
    setStatusMsg('');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tif', '.tiff'],
    },
    maxFiles: 1, multiple: false,
  });

  const handleOcr = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    setOcrText('');
    setProgress(0);
    setDone(false);

    try {
      const worker = await createWorker(lang, 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100));
          setStatusMsg(m.status || '');
        },
      });

      let fullText = '';
      // Searchable PDF: each OCR'd page keeps the scan as its image, with an
      // invisible, selectable text layer on top — Tesseract builds the page.
      const out = await PDFDocument.create();
      let ocrPages = 0, keptPages = 0;
      const addOcrPage = async (bytes: ArrayLike<number>) => {
        const src = await PDFDocument.load(new Uint8Array(bytes));
        const [pg] = await out.copyPages(src, [0]);
        out.addPage(pg);
      };

      if (isPdf) {
        const ab = await file.arrayBuffer();
        const original = output === 'pdf' ? await PDFDocument.load(ab.slice(0), { ignoreEncryption: true }) : null;
        const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: new Uint8Array(ab.slice(0)) }).promise; // parsed once, not per page
        await worker.setParameters({ user_defined_dpi: String(72 * OCR_SCALE) });
        for (let i = 1; i <= pdf.numPages; i++) {
          setStatusMsg(`Page ${i} of ${pdf.numPages}…`);
          setProgress(0);
          const page = await pdf.getPage(i);
          const existing = (await page.getTextContent()).items.some(t => 'str' in t && t.str.trim());
          if (skipText && existing) {
            // Already searchable: keep the original page untouched (sharper, smaller, faster).
            fullText += `--- Page ${i} ---\n${(await page.getTextContent()).items.map(t => ('str' in t ? t.str : '')).join(' ')}\n\n`;
            if (original) { const [pg] = await out.copyPages(original, [i - 1]); out.addPage(pg); }
            keptPages++;
            continue;
          }
          const vp = page.getViewport({ scale: OCR_SCALE });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ intent: 'print', canvasContext: ctx, viewport: vp }).promise;
          const { data } = await worker.recognize(canvas, {}, { text: true, pdf: output === 'pdf' });
          if (output === 'pdf' && data.pdf) await addOcrPage(data.pdf);
          fullText += `--- Page ${i} ---\n${data.text}\n\n`;
          setOcrText(fullText);
          canvas.width = canvas.height = 0;
          ocrPages++;
        }
      } else {
        setStatusMsg('Recognizing text…');
        // Size the page as if the image were printed ~8.3 in wide (A4).
        const bmp = await createImageBitmap(file);
        await worker.setParameters({ user_defined_dpi: String(Math.max(72, Math.round(bmp.width / 8.27))) });
        bmp.close();
        const { data } = await worker.recognize(file, {}, { text: true, pdf: output === 'pdf' });
        if (output === 'pdf' && data.pdf) await addOcrPage(data.pdf);
        fullText = data.text;
        ocrPages = 1;
      }
      setOcrText(fullText);

      await worker.terminate();
      if (output === 'pdf') {
        out.setTitle(file.name.replace(/\.[^.]+$/, ''));
        const bytes = await out.save();
        setPdfUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
        if (!ocrPages && keptPages) setStatusMsg('Every page already had text — nothing needed OCR.');
      }
      setDone(true);
      setProgress(100);
      setOcrBlobUrl(URL.createObjectURL(new Blob([fullText], { type: 'text/plain' })));
    } catch (err) {
      console.error(err);
      setError('OCR failed. Check your connection — the language model is downloaded on first use — and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTxt = () => {
    const blob = new Blob([ocrText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (file?.name.replace(/\.[^.]+$/, '') ?? 'ocr') + '_ocr.txt';
    a.click();
  };

  return (
    <ToolWorkspaceLayout
      title="OCR PDF / Image"
      description="Turn scanned PDFs and images into searchable PDFs or editable text — 14 languages, entirely in your browser."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)', overflowY: 'auto', minWidth: 0 }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: '32px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                  <UploadCloud size={32} />
                </div>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>Upload PDF or Image</h3>
                <p style={{ color: 'var(--text-secondary)' }}>PDF, JPG, PNG, WebP, TIFF supported</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <ScanLine size={40} color="var(--accent)" style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', maxWidth: '100%', overflowWrap: 'anywhere' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Ready for OCR</p>
                <button onClick={(e) => { e.stopPropagation(); setFile(null); setOcrText(''); setDone(false); }} className="btn-secondary" style={{ marginTop: '16px', height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>
                  Change file
                </button>
              </div>
            )}
          </div>

          {ocrText && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '14px', fontWeight: 600 }}>Extracted Text</p>
                <button onClick={downloadTxt} className="btn-primary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>
                  <Download size={14} /> Save as .txt
                </button>
              </div>
              <textarea readOnly value={ocrText} aria-label="Extracted text" style={{ width: '100%', height: '280px', padding: '16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '14px', lineHeight: '20px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScanLine size={20} color="var(--accent)" /> OCR Settings
          </h3>
          <div style={{ flex: 1 }}>
            {done ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', boxShadow: 'var(--shadow-raised)', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto' }} />
                  <h4 style={{ fontSize: '20px' }}>OCR Complete!</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{ocrText.length.toLocaleString()} characters recognised.{statusMsg.startsWith('Every') ? ` ${statusMsg}` : ''}</p>
                  {pdfUrl && (
                    <a href={pdfUrl} download={`${file?.name.replace(/\.[^.]+$/, '') ?? 'ocr'}_searchable.pdf`} className="btn-primary" style={{ textDecoration: 'none' }}>
                      <Download size={16} /> Download searchable PDF
                    </a>
                  )}
                  <button onClick={downloadTxt} className={pdfUrl ? 'btn-secondary' : 'btn-primary'} style={{ width: '100%' }}>
                    <Download size={16} /> Download text (.txt)
                  </button>
                  <SaveToDriveButton downloadUrl={pdfUrl ?? ocrBlobUrl} fileName={pdfUrl ? `${file?.name.replace(/\.[^.]+$/, '') ?? 'ocr'}_searchable.pdf` : `${file?.name.replace(/\.[^.]+$/, '') ?? 'ocr'}_ocr.txt`} />
                  <button onClick={() => { setDone(false); setOcrText(''); setOcrBlobUrl(null); setPdfUrl(null); }} className="btn-secondary" style={{ width: '100%' }}>
                    Run again
                  </button>
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Runs in your browser — your file is never uploaded. Only the language model is downloaded, the first time you use it.
                </p>
                <label style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>Document language
                  <select value={lang} onChange={e => setLang(e.target.value)} style={{ display: 'block', width: '100%', marginTop: '8px', minHeight: '48px', padding: '0 16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', color: 'var(--ink)', fontSize: '16px', letterSpacing: 0, textTransform: 'none', fontWeight: 400 }}>
                    {LANGUAGES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </label>
                <div className="segmented" role="tablist" aria-label="Output format">
                  {([['pdf', 'Searchable PDF'], ['txt', 'Text only']] as const).map(([id, label]) => (
                    <button key={id} role="tab" aria-selected={output === id} onClick={() => setOutput(id)}>{label}</button>
                  ))}
                </div>
                {isPdf && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '44px', fontSize: '14px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={skipText} onChange={e => setSkipText(e.target.checked)} /> Skip pages that already contain text
                  </label>
                )}
                {isProcessing && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '14px', marginBottom: '8px' }}>
                      <span style={{ textTransform: 'capitalize' }}>{statusMsg || 'Starting…'}</span>
                      <span>{progress}%</span>
                    </div>
                    <ProgressBar progress={progress} color="var(--accent)" />
                  </div>
                )}
                <button onClick={handleOcr} disabled={!file || isProcessing} className="btn-primary" style={{ width: '100%' }}>
                  {isProcessing ? 'Running OCR…' : 'Run OCR'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default OcrPdf;
