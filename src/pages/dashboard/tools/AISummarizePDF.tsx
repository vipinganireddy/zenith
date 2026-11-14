import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, Sparkles, CheckCircle, Key, Copy, Download, CheckCheck, X, Hash, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import MarkdownRenderer from '../../../components/tools/MarkdownRenderer';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { useTextObjectUrl } from '../../../hooks/useTextObjectUrl';
import { callAI, hasAnyKey, getProviderName, extractPdfText } from '../../../utils/aiService';

function countWords(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }
function readTime(text: string) { const m = Math.ceil(countWords(text) / 200); return m <= 1 ? '< 1 min' : `~${m} min`; }

const AISummarizePDF = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const summaryUrl = useTextObjectUrl(summary);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) { setFile(acceptedFiles[0]); setSummary(null); setError(null); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const generateSummary = async () => {
    if (!file) return;
    setError(null);
    if (!hasAnyKey()) { setError('NO_KEY'); return; }
    setIsProcessing(true);
    setSummary(null);
    try {
      const text = await extractPdfText(file);
      const result = await callAI(
        [{ role: 'user', content: `Summarize this document titled "${file.name}":\n\n${text}` }],
        {
          systemPrompt: 'You are a professional document analyst. Provide a structured summary with: # Executive Summary, ## Key Points (numbered list), ## Main Themes, ## Conclusions. Use proper markdown formatting with headers and lists.',
          maxTokens: 2500,
        }
      );
      setSummary(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const copySummary = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSummary = () => {
    if (!summary || !file) return;
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary_${file.name.replace('.pdf', '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolWorkspaceLayout
      title="AI Summarize PDF"
      description="Extract text and let AI generate a comprehensive, structured summary of your document."
    >
      <div style={{ display: 'flex', flex: 1, minHeight: '520px' }}>

        {/* Left Panel: Upload */}
        <div style={{ width: '280px', flexShrink: 0, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderRight: '1px solid var(--hairline)', background: 'var(--panel-bg)' }}>
          <div
            {...getRootProps()}
            style={{
              border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
              borderRadius: '24px', padding: file ? '16px' : '28px', textAlign: 'center',
              background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)',
              cursor: 'pointer', transition: 'all 0.2s ease', flex: file ? 0 : 1,
              display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            }}
          >
            <input {...getInputProps()} />
            {!file ? (
              <>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <UploadCloud size={26} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>Upload PDF</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Drag & drop or click to browse</p>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', width: '100%' }}>
                <FileText size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textAlign: 'left' }}>
                  <p style={{ fontSize: '14px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', marginBottom: '2px' }}>{file.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setFile(null); setSummary(null); }} aria-label="Remove file" style={{ width: '44px', height: '44px', margin: '-12px -8px -12px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0', flexShrink: 0 }}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={e => { e.stopPropagation(); generateSummary(); }}
            disabled={!file || isProcessing}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            {isProcessing ? (
              <><div style={{ width: '14px', height: '14px', border: '2px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
            ) : (
              <><Sparkles size={15} /> Summarize with AI</>
            )}
          </button>

          {!hasAnyKey() ? (
            <div style={{ background: 'var(--warn-bg)', borderRadius: '16px', padding: '16px' }}>
              <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <Key size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: '3px' }} />
                <p style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: '20px' }}>No API key — AI features disabled.</p>
              </div>
              <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} className="btn-primary" style={{ width: '100%' }}>
                Add API Key →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--good)', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Using {getProviderName()}</span>
            </div>
          )}
        </div>

        {/* Right Panel: Output */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Output header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', flexShrink: 0, background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
              <Sparkles size={16} color="var(--accent)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>Summary</span>
              {summary && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={10} /> {countWords(summary).toLocaleString()} words
                  <Clock size={10} style={{ marginLeft: '4px' }} /> {readTime(summary)}
                </span>
              )}
            </div>
            {summary && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={copySummary} className="btn-secondary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px', color: copied ? 'var(--success)' : 'var(--ink)' }}>
                  {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={downloadSummary} className="btn-secondary" style={{ height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' }}>
                  <Download size={13} /> .txt
                </button>
              </div>
            )}
          </div>

          {/* Output body */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px', background: 'var(--card-bg)' }}>
            <AnimatePresence mode="wait">
              {error && error !== 'NO_KEY' && (
                <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ padding: '16px', background: 'var(--danger-bg)', borderRadius: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px' }}>
                  <strong>Error:</strong> {error}
                </motion.div>
              )}

              {isProcessing && (
                <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px' }}>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>Analyzing {file?.name}…</p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Extracting text and generating structured summary</p>
                  </div>
                </motion.div>
              )}

              {summary && !isProcessing && (
                <motion.div key="summary" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', color: 'var(--success)', fontWeight: 600, fontSize: '14px' }}>
                    <CheckCircle size={16} /> Analysis complete
                  </div>
                  <MarkdownRenderer content={summary} />
                  <div style={{ marginTop: '24px', maxWidth: '280px' }}>
                    <SaveToDriveButton downloadUrl={summaryUrl} fileName={`summary_${file?.name.replace(/\.pdf$/i, '') ?? 'document'}.txt`} />
                  </div>
                </motion.div>
              )}

              {!isProcessing && !summary && !error && (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                  <Sparkles size={44} style={{ marginBottom: '16px', opacity: 0.15 }} />
                  <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>Upload a PDF to get started</p>
                  <p style={{ fontSize: '14px' }}>AI will generate an Executive Summary, Key Points, Themes, and Conclusions.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </ToolWorkspaceLayout>
  );
};

export default AISummarizePDF;
