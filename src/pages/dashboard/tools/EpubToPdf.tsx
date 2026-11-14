import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, BookOpen, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { unzipSync, strFromU8 } from 'fflate';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import ProgressBar from '../../../components/tools/ProgressBar';
import ConversionNotes from '../../../components/tools/ConversionNotes';
import { htmlToPdf } from '../../../utils/htmlToPdf';

// ── Helpers ───────────────────────────────────────────────────────────────────
type Zip = Record<string, Uint8Array>;

// Resolve a path that is relative to `baseDir` into a normalized zip key.
function resolvePath(baseDir: string, href: string): string {
  const clean = href.split('#')[0].split('?')[0];
  const parts = (baseDir ? baseDir.split('/') : []).concat(clean.split('/'));
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp',
};

function toDataUrl(bytes: Uint8Array, path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

// Parse the EPUB into ordered HTML chapters with inlined images.
function epubToHtml(buffer: ArrayBuffer): { html: string; title: string } {
  const zip: Zip = unzipSync(new Uint8Array(buffer));

  const containerKey = Object.keys(zip).find(k => k.endsWith('META-INF/container.xml'));
  if (!containerKey) throw new Error('Not a valid EPUB (missing container.xml).');
  const container = new DOMParser().parseFromString(strFromU8(zip[containerKey]), 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath || !zip[opfPath]) throw new Error('Could not locate the EPUB package file.');

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const opf = new DOMParser().parseFromString(strFromU8(zip[opfPath]), 'application/xml');

  const manifest: Record<string, string> = {};
  opf.querySelectorAll('manifest > item').forEach(item => {
    const id = item.getAttribute('id'); const href = item.getAttribute('href');
    if (id && href) manifest[id] = href;
  });

  const chapterPaths: string[] = [];
  opf.querySelectorAll('spine > itemref').forEach(ref => {
    const idref = ref.getAttribute('idref');
    if (idref && manifest[idref]) chapterPaths.push(resolvePath(opfDir, manifest[idref]));
  });
  if (chapterPaths.length === 0) throw new Error('EPUB has no readable content (empty spine).');

  const title = opf.querySelector('metadata title')?.textContent?.trim() || 'EPUB Document';

  let combined = '';
  for (const path of chapterPaths) {
    const bytes = zip[path];
    if (!bytes) continue;
    const chapterDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const doc = new DOMParser().parseFromString(strFromU8(bytes), 'application/xhtml+xml');
    const body = doc.querySelector('body');
    if (!body) continue;

    body.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      const imgKey = resolvePath(chapterDir, src);
      if (zip[imgKey]) img.setAttribute('src', toDataUrl(zip[imgKey], imgKey));
    });
    body.querySelectorAll('image').forEach(im => {
      const href = im.getAttribute('xlink:href') || im.getAttribute('href');
      if (!href || href.startsWith('data:')) return;
      const imgKey = resolvePath(chapterDir, href);
      if (zip[imgKey]) { im.setAttribute('href', toDataUrl(zip[imgKey], imgKey)); im.removeAttribute('xlink:href'); }
    });

    combined += `<section class="chapter">${body.innerHTML}</section>`;
  }

  const wrapper = `<div class="book">${combined}</div>`;
  return { html: wrapper, title };
}

// ── Component ───────────────────────────────────────────────────────────────────
const EpubToPdf = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setIsDone(false);
      setDownloadUrl(null);
      setError('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/epub+zip': ['.epub'] },
    maxFiles: 1, multiple: false,
  });

  const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'document';

  const handleConvert = async () => {
    if (!file) return;
    setError('');
    setNotes([]);
    setProgress(0);
    setIsProcessing(true);
    try {
      const { html, title } = epubToHtml(await file.arrayBuffer());
      const { bytes, warnings } = await htmlToPdf(html, {
        title,
        margin: 56,
        css: `
          .book { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; line-height: 1.6; color: #111; }
          .chapter + .chapter { break-before: page; }
          p { margin: 0 0 0.6em; text-align: justify; }
          h1, h2, h3 { line-height: 1.25; break-after: avoid; }`,
        onProgress: f => setProgress(Math.round(f * 100)),
      });
      setNotes(warnings);
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })));
      setIsDone(true);
    } catch (e) {
      console.error('EPUB to PDF failed:', e);
      const raw = e instanceof Error ? e.message : '';
      setError(/zip|invalid|corrupt/i.test(raw)
        ? 'This file is not a readable EPUB — it may be corrupted or DRM-protected.'
        : raw || 'Failed to convert this EPUB. The file may be DRM-protected or malformed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="EPUB to PDF"
      description="Convert EPUB ebooks into clean, printable PDF documents — entirely in your browser."
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        {/* Left: Upload */}
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
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload EPUB file</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <BookOpen size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>EPUB Ready</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setIsDone(false); setDownloadUrl(null); }}
                  style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Choose different file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Action */}
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={20} color="var(--accent)" /> Converter
          </h3>
          <div style={{ flex: 1 }}>
            {isDone && downloadUrl ? (
              <AnimatePresence>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                  <CheckCircle size={48} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                  <h4 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Conversion Complete!</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '14px', lineHeight: '20px' }}>Your PDF is ready for download.</p>
                  <a
                    href={downloadUrl}
                    download={`${baseName}.pdf`}
                    className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
                  >
                    Download PDF
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${baseName}.pdf`} />
                  <ConversionNotes notes={notes} />
                </motion.div>
              </AnimatePresence>
            ) : (
              <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '24px', lineHeight: '20px' }}>
                  We unpack the EPUB, stitch its chapters together in reading order with images inlined, and render a clean A4 PDF — all locally, nothing uploaded.
                </p>
                {isProcessing && <div style={{ marginBottom: '16px' }}><ProgressBar progress={progress} color="var(--accent)" /></div>}
                <button
                  onClick={handleConvert}
                  disabled={!file || isProcessing}
                  className="btn-primary" style={{ width: '100%' }}
                >
                  {isProcessing ? 'Converting…' : 'Convert to PDF'} <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default EpubToPdf;
