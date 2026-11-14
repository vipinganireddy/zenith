import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { UploadCloud, FileText, ChevronUp, ChevronDown, CheckCircle, Download, X, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';

import '../../../utils/pdfWorker';

interface PDFFile {
  id: string;
  file: File;
  name: string;
  size: string;
  pages: number | null;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

async function getPageCount(file: File): Promise<number> {
  try {
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
    return pdf.numPages;
  } catch {
    return 0;
  }
}

const MergePDF = () => {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputName, setOutputName] = useState('merged_document');
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setDownloadUrl(null);
    setError('');
    const newItems = await Promise.all(acceptedFiles.map(async file => ({
      id: Math.random().toString(36).slice(2),
      file,
      name: file.name,
      size: formatBytes(file.size),
      pages: await getPageCount(file),
    })));
    setFiles(prev => [...prev, ...newItems]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] },
  });

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setDownloadUrl(null);
  };

  const moveFile = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= files.length) return;
    setFiles(prev => {
      const arr = [...prev];
      [arr[index], arr[next]] = [arr[next], arr[index]];
      return arr;
    });
  };

  const clearAll = () => { setFiles([]); setDownloadUrl(null); setError(''); };

  const totalPages = files.reduce((s, f) => s + (f.pages ?? 0), 0);

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);
    setError('');
    try {
      const merged = await PDFDocument.create();
      for (const pdfFile of files) {
        const ab = await pdfFile.file.arrayBuffer();
        const pdf = await PDFDocument.load(ab, { ignoreEncryption: true });
        const pages = await merged.copyPages(pdf, pdf.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      merged.setTitle(outputName);
      merged.setProducer('O-Zenith PDF');
      const bytes = await merged.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError('Failed to merge PDFs. Make sure all files are valid, unencrypted PDFs.');
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title="Merge PDF"
      description="Combine multiple PDFs into a single document. Drag to upload, use arrows to reorder."
    >
      <div style={{ display: 'flex', flex: 1, minHeight: '520px' }}>
        {/* Left: file list */}
        <div style={{ flex: 2, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'auto', minWidth: 0 }}>
          {/* Dropzone */}
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px',
              padding: '28px',
              textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <input {...getInputProps()} />
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <UploadCloud size={24} />
            </div>
            <p style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>Drop PDFs here</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>or tap to browse — add as many as you need</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <p style={{ fontSize: '14px', lineHeight: '20px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  {files.length} file{files.length !== 1 ? 's' : ''} · {totalPages} page{totalPages !== 1 ? 's' : ''} total
                </p>
                <button onClick={clearAll} style={{ fontSize: '14px', color: 'var(--danger)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, minHeight: '44px', padding: '0 12px' }}>
                  Clear all
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <AnimatePresence>
                  {files.map((file, index) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '16px', minWidth: 0 }}
                    >
                      {/* Order badge */}
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 14%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)' }}>{index + 1}</span>
                      </div>

                      <FileText size={18} color="var(--accent)" style={{ flexShrink: 0 }} />

                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <p style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}>{file.name}</p>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px', lineHeight: '16px' }}>
                          {file.size}
                          {file.pages !== null && file.pages > 0 && ` · ${file.pages} page${file.pages !== 1 ? 's' : ''}`}
                        </p>
                      </div>

                      {/* Move buttons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                        <button onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up`} style={{ padding: '3px', background: 'transparent', border: 'none', cursor: index === 0 ? 'not-allowed' : 'pointer', color: index === 0 ? 'var(--ink-faint)' : 'var(--text-secondary)', borderRadius: '8px', display: 'flex', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronUp size={16} />
                        </button>
                        <button onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down`} style={{ padding: '3px', background: 'transparent', border: 'none', cursor: index === files.length - 1 ? 'not-allowed' : 'pointer', color: index === files.length - 1 ? 'var(--ink-faint)' : 'var(--text-secondary)', borderRadius: '8px', display: 'flex', minWidth: '44px', minHeight: '44px', alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronDown size={16} />
                        </button>
                      </div>

                      <button onClick={() => removeFile(file.id)} aria-label={`Remove ${file.name}`} style={{ padding: '6px', background: 'var(--surface-high)', border: 'none', borderRadius: '16px', cursor: 'pointer', color: 'var(--danger)', display: 'flex', flexShrink: 0, minHeight: '44px', minWidth: '44px', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                        <X size={16} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {/* Right: settings + action */}
        <div style={{ width: '260px', flexShrink: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Merge Settings</h3>
          </div>

          {downloadUrl ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ background: 'var(--surface)', padding: '20px', borderRadius: '24px', textAlign: 'center', boxShadow: 'var(--shadow-raised)' }}>
              <CheckCircle size={40} color="var(--success)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px', color: 'var(--text-main)' }}>Merge complete!</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>{files.length} files combined</p>
              <a
                href={downloadUrl}
                download={`${outputName}.pdf`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--accent)', color: 'var(--on-accent)', padding: '0 24px', borderRadius: '24px', fontWeight: 700, textDecoration: 'none', fontSize: '16px', marginBottom: '8px', minHeight: '56px', boxSizing: 'border-box', width: '100%' }}
              >
                <Download size={16} /> Download PDF
              </a>
                <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${outputName}.pdf`} />
              <button onClick={() => { setDownloadUrl(null); setFiles([]); }} style={{ width: '100%', padding: '0 16px', background: 'var(--surface-high)', border: 'none', borderRadius: '16px', cursor: 'pointer', fontSize: '14px', color: 'var(--ink)', minHeight: '44px', minWidth: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                Merge new files
              </button>
            </motion.div>
          ) : (
            <>
              <div style={{ background: 'var(--card-bg)', padding: '16px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label className="field-label">Output filename</label>
                  <div style={{ display: 'flex', alignItems: 'center', borderRadius: '16px', overflow: 'hidden', background: 'var(--surface-sunken)' }}>
                    <input
                      value={outputName}
                      onChange={e => setOutputName(e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '0 12px', border: 'none', background: 'transparent', color: 'var(--text-main)', fontSize: '16px', outline: 'none', borderRadius: '16px', minHeight: '48px', boxSizing: 'border-box' }}
                    />
                    <span style={{ padding: '0 14px', color: 'var(--text-muted)', fontSize: '14px' }}>.pdf</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span>Files</span><span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{files.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--text-secondary)' }}>
                  <span>Total pages</span><span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{totalPages}</span>
                </div>
              </div>

              {error && <p style={{ fontSize: '12px', color: 'var(--danger)', lineHeight: '16px' }}>{error}</p>}

              <button
                onClick={handleMerge}
                disabled={files.length < 2 || isProcessing}
                style={{
                  width: '100%',
                  padding: '0 24px',
                  borderRadius: '24px',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '16px',
                  background: files.length < 2 ? 'var(--surface-high)' : 'var(--accent)',
                  color: files.length < 2 ? 'var(--ink-faint)' : 'var(--on-accent)',
                  cursor: files.length < 2 || isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '56px',
                }}
              >
                {isProcessing ? (
                  <><div style={{ width: '14px', height: '14px', border: '2px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Merging…</>
                ) : 'Merge PDFs'}
              </button>
              {files.length < 2 && <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>Add at least 2 PDF files to merge.</p>}
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ToolWorkspaceLayout>
  );
};

export default MergePDF;
