import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Shield, CheckCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PDFDocument, PDFName, PDFRef, PDFRawStream } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

const RemoveMetadata = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [metaInfo, setMetaInfo] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return;
    const f = accepted[0];
    setFile(f); setDownloadUrl(null);
    try {
      // updateMetadata:false — otherwise pdf-lib stamps its own Producer/ModDate on load.
      const pdfDoc = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      const xmp = pdfDoc.catalog.lookup(PDFName.of('Metadata'));
      setMetaInfo({
        Title: pdfDoc.getTitle() ?? '—',
        Author: pdfDoc.getAuthor() ?? '—',
        Subject: pdfDoc.getSubject() ?? '—',
        Creator: pdfDoc.getCreator() ?? '—',
        Producer: pdfDoc.getProducer() ?? '—',
        'Creation Date': pdfDoc.getCreationDate()?.toISOString() ?? '—',
        'Modified Date': pdfDoc.getModificationDate()?.toISOString() ?? '—',
        Keywords: pdfDoc.getKeywords() || '—',
        'XMP metadata': xmp instanceof PDFRawStream ? `present (${(xmp.contents.length / 1024).toFixed(1)} KB)` : 'none',
      });
    } catch { /* unreadable metadata — the preview just stays empty */ }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleStrip = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
      const ctx = pdfDoc.context;
      // 1. The whole Info dictionary (title, author, software, dates) — not just blanked fields.
      const info = ctx.trailerInfo.Info;
      if (info instanceof PDFRef) ctx.delete(info);
      ctx.trailerInfo.Info = undefined;
      // 2. XMP metadata (author, tool, edit history) on the catalog and on every page,
      //    plus application-private PieceInfo data.
      const drop = (dict: { lookup: (k: PDFName) => unknown; get: (k: PDFName) => unknown; delete: (k: PDFName) => unknown }, key: string) => {
        const ref = dict.get(PDFName.of(key));
        if (ref instanceof PDFRef) ctx.delete(ref);
        dict.delete(PDFName.of(key));
      };
      drop(pdfDoc.catalog, 'Metadata');
      drop(pdfDoc.catalog, 'PieceInfo');
      for (const page of pdfDoc.getPages()) { drop(page.node, 'Metadata'); drop(page.node, 'PieceInfo'); }
      const bytes = await pdfDoc.save({ updateFieldAppearances: false });
      setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
    } catch (err) { console.error(err); setError('Could not clean this PDF. It may be damaged or password-protected.'); }
    finally { setIsProcessing(false); }
  };

  return (
    <ToolWorkspaceLayout title="Remove Metadata" description="Strip author, title, creation date, and other hidden metadata from your PDF.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, minWidth: 0, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--hairline)', background: 'var(--card-bg)' }}>
          <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '32px', textAlign: 'center', background: 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
              <h3 style={{ fontSize: '20px', marginBottom: '6px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Metadata will be detected and stripped</p>
            </>) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <FileText size={32} color="var(--accent)" />
                <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{file.name}</div></div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setDownloadUrl(null); setMetaInfo({}); }} className="btn-secondary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px', flexShrink: 0 }}>Change</button>
              </div>
            )}
          </div>
          {Object.keys(metaInfo).length > 0 && (
            <div style={{ background: 'var(--surface-sunken)', borderRadius: '24px', padding: '16px 20px' }}>
              <p style={{ fontSize: '12px', lineHeight: '16px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '12px', color: 'var(--ink-faint)' }}>Detected Metadata</p>
              {Object.entries(metaInfo).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', lineHeight: '20px', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{k}</span>
                  <span style={{ color: v === '—' ? 'var(--ink-faint)' : 'var(--accent)', minWidth: 0, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Shield size={18} color="var(--accent)" /> Sanitize</h3>
          {downloadUrl ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', textAlign: 'center' }}>
                <CheckCircle size={48} color="var(--good)" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ marginBottom: '8px' }}>Metadata Removed!</h4>
                <a href={downloadUrl} download={`clean_${file?.name}`} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%' }}>Download Clean PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`clean_${file?.name}`} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '20px' }}>Removes the title, author, subject, keywords, creator, producer and dates, plus hidden XMP metadata and editing-history data. Page content is preserved exactly.</p>
              <button onClick={handleStrip} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Stripping…' : 'Remove Metadata'} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RemoveMetadata;
