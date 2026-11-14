import { useState, useCallback, type CSSProperties } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, X, Download, Copy, CheckCheck, Key, Languages } from 'lucide-react';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import { callAI, hasAnyKey, extractPdfText } from '../../../utils/aiService';
import SaveToDriveButton from '../../../components/tools/SaveToDriveButton';
import { useTextObjectUrl } from '../../../hooks/useTextObjectUrl';

const LANGUAGES = [
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'zh', name: 'Chinese (Simplified)', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
];

type Phase = 'upload' | 'translating' | 'done';

const ACTION_BTN: CSSProperties = { height: '44px', minHeight: '44px', padding: '0 16px', borderRadius: '999px', fontSize: '14px' };

const AITranslatePDF = () => {
  const navigate = useNavigate();
  const [file, setFile]           = useState<File | null>(null);
  const [phase, setPhase]         = useState<Phase>('upload');
  const [targetLang, setTargetLang] = useState('es');
  const [translation, setTranslation] = useState('');
  const [copied, setCopied]       = useState(false);
  const [error, setError]         = useState('');

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) { setFile(accepted[0]); setError(''); }
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
  });

  const langObj = LANGUAGES.find(l => l.code === targetLang)!;
  const translationUrl = useTextObjectUrl(translation || null);

  const translate = async () => {
    if (!file || !hasAnyKey()) return;
    setPhase('translating');
    setError('');
    try {
      const text = await extractPdfText(file);
      const result = await callAI([{
        role: 'user',
        content: `Translate the following document text into ${langObj.name}.
Preserve the paragraph structure as closely as possible.
Do NOT add explanations — output ONLY the translated text.

---
${text.slice(0, 14000)}`,
      }], {
        systemPrompt: `You are a professional translator. Translate text accurately into ${langObj.name} while preserving structure and meaning. Output only the translation.`,
        maxTokens: 4000,
      });
      setTranslation(result);
      setPhase('done');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('upload');
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(translation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTxt = () => {
    const blob = new Blob([translation], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `translation-${langObj.code}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null); setTranslation(''); setError(''); setPhase('upload');
  };

  return (
    <ToolWorkspaceLayout title="AI PDF Translator" description="Upload a PDF and translate its content into any language instantly.">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px', gap: '20px', overflow: 'auto', minWidth: 0 }}>

        {/* ── Upload ── */}
        {phase === 'upload' && (
          <div style={{ width: '100%', maxWidth: '560px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div {...getRootProps()} style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`, borderRadius: '24px', padding: '40px', textAlign: 'center', background: isDragActive ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface-sunken)', cursor: 'pointer', transition: 'all 0.2s' }}>
              <input {...getInputProps()} />
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={28} color="var(--accent)" />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden' }}>
                    <p style={{ fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); setFile(null); }} aria-label="Remove file" style={{ width: '44px', height: '44px', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                </div>
              ) : (
                <>
                  <UploadCloud size={36} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                  <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>Drop a PDF here to translate</p>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>or click to browse</p>
                </>
              )}
            </div>

            {/* Language selector */}
            <div style={{ background: 'var(--surface)', borderRadius: '24px', padding: '20px', boxShadow: 'var(--shadow-raised)' }}>
              <label style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <Languages size={15} /> Translate to
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', gap: '8px' }}>
                {LANGUAGES.map(lang => (
                  <button key={lang.code} onClick={() => setTargetLang(lang.code)} aria-pressed={targetLang === lang.code}
                    style={{ minHeight: '48px', padding: '0 12px', borderRadius: '16px', border: 'none', boxShadow: targetLang === lang.code ? 'inset 0 0 0 2px var(--accent)' : 'none', background: targetLang === lang.code ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-sunken)', color: 'var(--ink)', cursor: 'pointer', fontSize: '14px', fontWeight: targetLang === lang.code ? 700 : 500, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s' }}>
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', borderRadius: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px' }}>{error}</div>}

            {!hasAnyKey() ? (
              <div style={{ padding: '16px', background: 'var(--warn-bg)', borderRadius: '16px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-main)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Key size={14} color="var(--accent)" /> No API key — AI features disabled.</p>
                <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} className="btn-primary" style={{ width: '100%' }}>Add API Key →</button>
              </div>
            ) : (
              <button onClick={translate} disabled={!file}
                className="btn-primary" style={{ width: '100%' }}>
                {langObj.flag} Translate to {langObj.name}
              </button>
            )}
          </div>
        )}

        {/* ── Translating ── */}
        {phase === 'translating' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                style={{ width: '60px', height: '60px', borderRadius: '50%', border: '4px solid var(--surface-high)', borderTopColor: 'var(--accent)' }} />
              <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>Translating to {langObj.name}…</p>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Processing document content</p>
            </div>
          </div>
        )}

        {/* ── Result ── */}
        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>{langObj.flag}</span>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '16px' }}>Translation: {langObj.name}</p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{file?.name}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={copy}
                  className="btn-secondary" style={ACTION_BTN}>
                  {copied ? <><CheckCheck size={14} color="var(--accent)" /> Copied</> : <><Copy size={14} /> Copy</>}
                </button>
                <button onClick={downloadTxt}
                  className="btn-primary" style={ACTION_BTN}>
                  <Download size={14} /> Download .txt
                </button>
                <button onClick={reset}
                  className="btn-secondary" style={ACTION_BTN}>
                  New
                </button>
              </div>
            </div>

            {/* Translation content */}
            <div style={{ flex: 1, background: 'var(--surface-sunken)', borderRadius: '24px', padding: '28px', overflowY: 'auto', minHeight: '320px', lineHeight: 1.75, color: 'var(--text-main)', fontSize: '16px', whiteSpace: 'pre-wrap' }}>
              {translation}
            </div>
            <div style={{ marginTop: '16px', maxWidth: '280px' }}>
              <SaveToDriveButton downloadUrl={translationUrl} fileName={`translation-${langObj.code}.txt`} />
            </div>
          </motion.div>
        )}
      </div>
    </ToolWorkspaceLayout>
  );
};

export default AITranslatePDF;
