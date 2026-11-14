import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Eraser, CheckCircle, ArrowRight, Info } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { removeWatermarks, type WatermarkRemoval } from '../../../utils/pdfWatermark';

const COLOR = 'var(--accent)';

const RemoveWatermark = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [report, setReport] = useState<WatermarkRemoval | null>(null);
  const [error, setError] = useState('');

  const reset = (f: File | null) => {
    setFile(f); setReport(null); setError('');
    setDownloadUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
  };
  const onDrop = useCallback((accepted: File[]) => { if (accepted[0]) reset(accepted[0]); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false });

  const handleRemove = async () => {
    if (!file) return;
    setError(''); setIsProcessing(true);
    try {
      const doc = await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      const r = removeWatermarks(doc);
      setReport(r);
      if (r.blocks + r.xobjects + r.annotations > 0) {
        const bytes = await doc.save({ updateFieldAppearances: false });
        setDownloadUrl(URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })));
      }
    } catch (err) {
      console.error(err);
      setError(/encrypt/i.test(String(err)) ? 'This PDF is password-protected. Unlock it first, then remove the watermark.' : 'Could not read this PDF. It may be damaged.');
    } finally { setIsProcessing(false); }
  };

  const found = report ? report.blocks + report.xobjects + report.annotations : 0;
  const outName = `no-watermark_${file?.name ?? 'document.pdf'}`;

  return (
    <ToolWorkspaceLayout title="Remove Watermark" description="Remove watermarks added by Acrobat, Word, O-Zenith and other PDF tools — cleanly, without touching the rest of the page.">
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)', minWidth: 0 }}>
          <div {...getRootProps()} style={{ border: `1.5px dashed ${isDragActive ? COLOR : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '32px 24px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
            <input {...getInputProps()} />
            {!file ? (<>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}><UploadCloud size={28} /></div>
              <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '6px' }}>Upload PDF</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Watermarks are detected and removed in your browser</p>
            </>) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <FileText size={32} color={COLOR} />
                <div style={{ fontWeight: 600, fontSize: '16px', lineHeight: '24px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                <button onClick={e => { e.stopPropagation(); reset(null); }} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)', background: 'var(--surface-high)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', cursor: 'pointer', flexShrink: 0 }}>Change</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}><Eraser size={18} color={COLOR} /> Remove</h3>
          <div style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {report && found > 0 && (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={44} color="var(--success)" style={{ margin: '0 auto 10px' }} />
                <h4 style={{ fontSize: '16px', lineHeight: '24px', marginBottom: '6px' }}>Watermark removed</h4>
                <p style={{ fontSize: '12px', lineHeight: '16px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Cleaned {report.pagesChanged} page{report.pagesChanged === 1 ? '' : 's'}
                  {report.annotations > 0 && ` · ${report.annotations} watermark annotation${report.annotations === 1 ? '' : 's'}`}
                </p>
                <a href={downloadUrl!} download={outName} className="btn-primary" style={{ display: 'flex', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>Download PDF</a>
                <SaveToDriveButton downloadUrl={downloadUrl!} fileName={outName} />
              </div>
            )}
            {report && found === 0 && (
              <div style={{ display: 'flex', gap: '10px', fontSize: '12px', lineHeight: '16px', color: 'var(--text-main)', background: 'var(--warn-bg)', borderRadius: '16px', padding: '12px' }}>
                <Info size={18} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ minWidth: 0 }}>No removable watermark was found in this PDF. If you can still see one, it is part of the page content itself — inside a scanned image, or drawn as ordinary text — and can't be separated from the content without damaging it.</p>
              </div>
            )}
            {!report && (<>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '16px' }}>
                Removes watermarks that are stored as watermarks — the kind added by Adobe Acrobat, Microsoft Word, O-Zenith's Add Watermark and most PDF tools. Text, images and links stay exactly as they were.
              </p>
              <button onClick={handleRemove} disabled={!file || isProcessing}
                className="btn-primary" style={{ width: '100%' }}>
                {isProcessing ? 'Removing…' : 'Remove Watermark'} <ArrowRight size={16} />
              </button>
            </>)}
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default RemoveWatermark;
