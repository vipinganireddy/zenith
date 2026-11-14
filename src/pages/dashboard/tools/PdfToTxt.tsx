import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Download, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import ErrorBanner from '../../../components/tools/ErrorBanner';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import * as pdfjsLib from 'pdfjs-dist';

import '../../../utils/pdfWorker';
import { pageTextLines, pdfToEpub } from '../../../utils/pdfToDocx';

export type TextExportFormat = 'txt' | 'rtf' | 'json' | 'xml' | 'epub';

const FORMAT_META: Record<TextExportFormat, { label: string; ext: string; mime: string; blurb: string }> = {
  txt:  { label: 'TXT',  ext: 'txt',  mime: 'text/plain',       blurb: 'plain text file' },
  rtf:  { label: 'RTF',  ext: 'rtf',  mime: 'application/rtf',  blurb: 'Rich Text file that opens in Word, Pages, and LibreOffice' },
  json: { label: 'JSON', ext: 'json', mime: 'application/json', blurb: 'structured JSON with per-page text — ready for scripts and APIs' },
  xml:  { label: 'XML',  ext: 'xml',  mime: 'application/xml',  blurb: 'structured XML document with one node per page' },
  epub: { label: 'EPUB', ext: 'epub', mime: 'application/epub+zip', blurb: 'reflowable EPUB 3 ebook with headings, images and a table of contents' },
};

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escRtf = (s: string) => s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')
  .replace(/[\u0080-\uffff]/g, ch => { const c = ch.charCodeAt(0); return `\\u${c > 32767 ? c - 65536 : c}?`; });

function buildTxt(pages: string[]): BlobPart {
  return pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n');
}

function buildRtf(pages: string[]): BlobPart {
  const body = pages
    // Blank lines separate paragraphs; single newlines are line breaks within one.
    .map((t, i) => `{\\b Page ${i + 1}}\\par ${t.split(/\n{2,}/).map(p => escRtf(p).replace(/\n/g, '\\line ')).join('\\par\\par ')}\\par\\par`)
    .join('\n');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24\n${body}}`;
}

function buildJson(pages: string[], fileName: string): BlobPart {
  return JSON.stringify({
    source: fileName,
    pageCount: pages.length,
    extractedAt: new Date().toISOString(),
    pages: pages.map((text, i) => ({ page: i + 1, text })),
  }, null, 2);
}

function buildXml(pages: string[], fileName: string): BlobPart {
  const body = pages.map((t, i) => `  <page number="${i + 1}">${escXml(t)}</page>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<document source="${escXml(fileName)}" pages="${pages.length}">\n${body}\n</document>`;
}

const PdfToTxt = ({ format = 'txt' }: { format?: TextExportFormat }) => {
  const meta = FORMAT_META[format];
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setExtractedText(null);
      setDownloadUrl(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1, multiple: false,
  });

  const baseName = file ? file.name.replace(/\.[^/.]+$/, '') : 'document';

  const handleExtract = async () => {
    if (!file) return;
    setError('');
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: arrayBuffer.slice(0) }).promise; // pdf.js detaches the buffer it is given
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        // Reading order with real line breaks (not one run-on line per page).
        pages.push((await pageTextLines(page)).join('\n').trim());
      }

      setExtractedText(pages.map((t, i) => `--- Page ${i + 1} ---\n${t}`).join('\n\n'));

      let part: BlobPart;
      switch (format) {
        case 'rtf':  part = buildRtf(pages); break;
        case 'json': part = buildJson(pages, file.name); break;
        case 'xml':  part = buildXml(pages, file.name); break;
        case 'epub': part = (await pdfToEpub(arrayBuffer.slice(0), baseName)).epub as BlobPart; break;
        default:     part = buildTxt(pages);
      }
      const blob = new Blob([part], { type: meta.mime });
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error(err);
      setError('Failed to extract text from the PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ToolWorkspaceLayout
      title={`PDF to ${meta.label}`}
      description={`Extract all readable text from your PDF and download it as a ${meta.blurb}.`}
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div style={{ display: 'flex', flex: 1, minHeight: '500px' }}>
        <div style={{ flex: 2, padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', borderRight: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          {extractedText ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <h3 style={{ fontSize: '16px', lineHeight: '24px', fontWeight: 600, minWidth: 0 }}>Extracted Text Preview</h3>
                  <button onClick={() => { setFile(null); setExtractedText(null); setDownloadUrl(null); }} style={{ background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    New file
                  </button>
                </div>
                <textarea
                  readOnly
                  value={extractedText}
                  style={{ flex: 1, minHeight: '350px', padding: '16px', borderRadius: '16px', border: 'none', background: 'var(--surface-sunken)', fontSize: '16px', fontFamily: 'monospace', lineHeight: '24px', resize: 'vertical', outline: 'none', color: 'var(--text-main)', minWidth: 0 }}
                />
              </motion.div>
            </AnimatePresence>
          ) : (
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
                  <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>Upload PDF</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>Drag & drop or click to browse</p>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <FileText size={48} color="var(--accent)" style={{ marginBottom: '16px' }} />
                  <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '8px' }}>{file.name}</h3>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '14px', lineHeight: '20px' }}>Ready for text extraction</p>
                  <button onClick={(e) => { e.stopPropagation(); setFile(null); }} style={{ marginTop: '24px', background: 'var(--surface-high)', color: 'var(--ink)', border: 'none', minHeight: '44px', padding: '0 16px', borderRadius: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    Choose different file
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '32px', background: 'var(--neutral-50)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '20px', lineHeight: '28px', marginBottom: '24px', fontWeight: 600 }}>Actions</h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {!extractedText ? (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>
                    Extracts all readable text page-by-page from your PDF, then packages it as a {meta.blurb}.
                  </p>
                  <button
                    onClick={handleExtract}
                    disabled={!file || isProcessing}
                    className="btn-primary" style={{ width: '100%' }}
                  >
                    {isProcessing ? 'Extracting...' : `Convert to ${meta.label}`} <ArrowRight size={18} />
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px' }}>
                    {extractedText.length.toLocaleString()} characters extracted.
                  </p>
                  <a
                    href={downloadUrl!}
                    download={`${baseName}.${meta.ext}`}
                    className="btn-primary" style={{ textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
                  >
                    <Download size={18} /> Download .{meta.ext} File
                  </a>
                  <SaveToDriveButton downloadUrl={downloadUrl} fileName={`${baseName}.${meta.ext}`} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default PdfToTxt;
