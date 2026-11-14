import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Zap, Code, BrainCircuit, Briefcase, UploadCloud, FileText, X, Key, Send, Copy, Download, CheckCheck, Clock, Hash, Trash2, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ToolWorkspaceLayout from '../../../components/tools/ToolWorkspaceLayout';
import MarkdownRenderer from '../../../components/tools/MarkdownRenderer';
import { toolsData } from '../../../data/toolsData';
import { callAI, hasAnyKey, getProviderName, extractPdfText, AI_TOOL_PROMPTS } from '../../../utils/aiService';

interface UniversalToolProps { toolId: string; }

interface CategoryInfo {
  icon: React.ElementType; color: string; badge: string; heading: string; body: string; cta?: string;
}

const COMPLEX_TOOL_IDS = new Set([
  'pdf-to-powerpoint',
  'cad-to-pdf',
  'convert-pdf-other', 'convert-to-pdf',
]);

const AI_TOOL_IDS = new Set([
  'ai-study-summary', 'ai-compare-documents', 'auto-naming',
  'ai-citation-generator',
]);

// Tools that need a full conversational chat UI
const CHAT_TOOL_IDS = new Set([
  'ask-questions-from-pdf',
  'ai-explain-document',
  'ai-smart-search',
  'ai-research-assistant',
  'ai-study-assistant',
]);

const CATEGORY_INFO: Record<string, CategoryInfo> = {
  developer: {
    icon: Code, color: 'var(--cat-vitals)', badge: 'Developer Tool',
    heading: 'Developer API / SDK',
    body: 'This tool is designed for programmatic access. Use the O-Zenith API or CLI to automate PDF processing in your own applications.',
    cta: 'View API Docs',
  },
  business_cloud: {
    icon: Briefcase, color: 'var(--cat-mind)', badge: 'Business Plan',
    heading: 'Business & enterprise feature',
    body: 'This tool requires a O-Zenith Business account for team workflows, audit trails, and compliance management.',
    cta: 'View Plans',
  },
  complex: {
    icon: Zap, color: 'var(--cat-body)', badge: 'Advanced Conversion',
    heading: 'Requires server-side processing',
    body: 'This format conversion requires server-side libraries not available in the browser. Available in O-Zenith Pro with cloud processing.',
    cta: 'Join Waitlist',
  },
};

const DEFAULT_INFO: CategoryInfo = {
  icon: Settings, color: 'var(--accent)', badge: 'Coming Soon',
  heading: 'Feature in progress',
  body: "This tool's full client-side implementation is coming shortly. All processing in O-Zenith runs entirely in your browser.",
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadTime(text: string): string {
  const words = countWords(text);
  const mins = Math.ceil(words / 200);
  return mins <= 1 ? '< 1 min read' : `~${mins} min read`;
}

// ── Chat system prompts per tool ─────────────────────────────────────────────
const CHAT_SYSTEM_PROMPTS: Record<string, string> = {
  'ask-questions-from-pdf': 'You are a precise Q&A assistant. Answer questions based strictly on the provided document content. If the answer is not in the document, say so clearly. Be direct and accurate.',
  'ai-explain-document': 'You are an expert at breaking down complex documents into clear, simple explanations. Explain concepts, jargon, and sections of the document in plain language the user can understand. Use examples where helpful.',
  'ai-smart-search': 'You are a semantic search assistant. Help the user find specific information, concepts, and insights in the provided document. When the user searches for a topic, locate and quote the most relevant passages.',
  'ai-research-assistant': 'You are a research assistant helping analyze academic and professional documents. Help the user understand methodology, findings, arguments, and implications. Suggest follow-up questions and connections.',
  'ai-study-assistant': 'You are a friendly study tutor. Help the user learn and understand the document content through conversation, explanations, practice questions, and mnemonics. Adapt to the user\'s level and pace.',
};

// ── Suggested starter questions per tool ─────────────────────────────────────
const CHAT_SUGGESTIONS: Record<string, string[]> = {
  'ask-questions-from-pdf': ['What does the document say about...?', 'Who are the main people mentioned?', 'What dates or numbers are mentioned?', 'Find information about a specific topic'],
  'ai-explain-document': ['Explain the introduction', 'What does [term] mean in this context?', 'Break down the most complex part', 'Explain this to me like I\'m 12'],
  'ai-smart-search': ['Find mentions of [topic]', 'Where does it discuss pricing?', 'Search for risk factors', 'Find all action items'],
  'ai-research-assistant': ['What is the research methodology?', 'What are the key findings?', 'What are the limitations?', 'How does this relate to other research?'],
  'ai-study-assistant': ['Quiz me on the main concepts', 'Help me make flashcards', 'What should I focus on for the exam?', 'Explain this concept differently'],
};

interface ChatMessage { role: 'user' | 'assistant'; content: string; id: string; }

/* ── Chat Interface ── */
const ChatPdfTool = ({ toolId, title, description, systemPrompt }: {
  toolId: string; title: string; description: string; systemPrompt: string;
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const hasKey = hasAnyKey();
  const provider = getProviderName();
  const suggestions = CHAT_SUGGESTIONS[toolId] || CHAT_SUGGESTIONS['ask-questions-from-pdf'];

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadPdf = async (f: File) => {
    setFile(f);
    setPdfText('');
    setPdfLoading(true);
    setError('');
    try {
      const text = await extractPdfText(f);
      setPdfText(text);
    } catch (e) {
      setError(e instanceof Error && /OCR/.test(e.message) ? e.message : 'Could not read the PDF. Make sure it is not encrypted.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadPdf(f);
    e.target.value = '';
  };

  const clearChat = () => {
    setMessages([]);
    setError('');
    setInput('');
  };

  const sendMessage = async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading || !hasKey) return;
    if (!file && !pdfText) return;

    setInput('');
    setError('');
    const userMsg: ChatMessage = { role: 'user', content: msg, id: crypto.randomUUID() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Build the system prompt with PDF context
      const fullSystem = pdfText
        ? `${systemPrompt}\n\n--- DOCUMENT: "${file?.name}" ---\n${pdfText.slice(0, 20000)}`
        : systemPrompt;

      // Send full conversation history
      const history = updatedMessages.map(m => ({ role: m.role, content: m.content }));
      const response = await callAI(history, { systemPrompt: fullSystem, maxTokens: 2000 });

      const aiMsg: ChatMessage = { role: 'assistant', content: response, id: crypto.randomUUID() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages(prev => prev.slice(0, -1)); // remove user msg on failure
      setInput(msg); // restore input
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const copyMessage = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const canSend = !!input.trim() && !loading && hasKey && (!!pdfText || pdfLoading);

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: '560px' }}>
      {/* ── Left Panel: Document ── */}
      <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--hairline)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel-bg)' }}>
        <div>
          <p className="field-label">Document</p>
          <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />

          {pdfLoading ? (
            <div style={{ borderRadius: '16px', padding: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)' }}>
              <div style={{ width: '14px', height: '14px', border: '2px solid var(--hairline)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Reading PDF…</span>
            </div>
          ) : file ? (
            <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: '16px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                <FileText size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)' }}>{file.name}</span>
                <button aria-label="Remove file" onClick={() => { setFile(null); setPdfText(''); clearChat(); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', margin: '-14px -12px -14px 0' }}>
                  <X size={13} />
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '22px' }}>
                {(file.size / 1024).toFixed(0)} KB · Ready to chat
              </p>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ width: '100%', minHeight: '44px', padding: '20px 10px', border: '1.5px dashed color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: '16px', background: 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px', boxSizing: 'border-box' as const }}
            >
              <UploadCloud size={22} />
              <span style={{ fontWeight: 600 }}>Upload PDF</span>
              <span style={{ fontSize: '12px' }}>to start chatting</span>
            </button>
          )}
        </div>

        {/* Chat controls */}
        {messages.length > 0 && (
          <div>
            <p className="field-label">Chat</p>
            <button
              onClick={clearChat}
              style={{ width: '100%', minHeight: '44px', padding: '9px 12px', border: 'none', borderRadius: '12px', background: 'var(--surface-high)', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Trash2 size={12} /> Clear chat
            </button>
          </div>
        )}

        {/* Stats */}
        {messages.length > 0 && (
          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Messages</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{messages.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Exchanges</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{Math.floor(messages.length / 2)}</span>
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          {!hasKey ? (
            <div style={{ background: 'var(--warn-bg)', borderRadius: '16px', padding: '12px' }}>
              <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '10px' }}>
                <Key size={13} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: '16px', minWidth: 0 }}>No API key — add one to enable AI chat.</p>
              </div>
              <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} style={{ width: '100%', minHeight: '44px', padding: '7px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                Add API Key →
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Using {provider}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Right Panel: Chat ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Chat header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <BrainCircuit size={16} color="var(--accent)" />
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{title}</span>
          {file && <span style={{ marginLeft: 'auto', minWidth: 0, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', lineHeight: '16px', color: 'var(--text-muted)', background: 'var(--surface-high)', padding: '4px 12px', borderRadius: '12px' }}>📄 {file.name}</span>}
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Empty state */}
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '20px 0' }}>
              <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                <BrainCircuit size={40} style={{ color: 'var(--accent)', opacity: 0.2, marginBottom: '12px' }} />
                <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                  {file ? `Ready to chat about "${file.name}"` : description}
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                  {!file ? 'Upload a PDF on the left to get started.' : 'Ask me anything about this document.'}
                </p>
              </div>

              {/* Suggestion chips */}
              {file && hasKey && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '520px' }}>
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      style={{ minHeight: '44px', padding: '8px 16px', background: 'var(--surface-sunken)', border: 'none', borderRadius: '12px', fontSize: '14px', lineHeight: '20px', color: 'var(--ink)', cursor: 'pointer', fontWeight: 500, textAlign: 'left' }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '4px' }}>
              {/* Sender label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: msg.role === 'user' ? 0 : '2px', paddingRight: msg.role === 'user' ? '2px' : 0 }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <BrainCircuit size={12} color="var(--on-accent)" />
                  </div>
                )}
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {msg.role === 'user' ? 'You' : 'AI'}
                </span>
                {msg.role === 'user' && (
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--surface-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={12} color="var(--text-secondary)" />
                  </div>
                )}
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '80%',
                padding: msg.role === 'user' ? '12px 16px' : '14px 16px',
                borderRadius: msg.role === 'user' ? '24px 24px 8px 24px' : '24px 24px 24px 8px',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--surface-sunken)',
                color: msg.role === 'user' ? 'var(--on-accent)' : 'var(--text-main)',
                minWidth: 0,
                fontSize: '14px',
                lineHeight: '20px',
                position: 'relative' as const,
              }}>
                {msg.role === 'user' ? (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                ) : (
                  <MarkdownRenderer content={msg.content} />
                )}

                {/* Copy button on AI messages */}
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => copyMessage(msg.id, msg.content)}
                    style={{ position: 'absolute' as const, top: 0, right: 0, width: '44px', height: '44px', padding: 0, background: 'transparent', border: 'none', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: copiedId === msg.id ? 'var(--success)' : 'var(--text-muted)', opacity: 0.8 }}
                    title="Copy response"
                    aria-label="Copy response"
                  >
                    {copiedId === msg.id ? <CheckCheck size={14} /> : <Copy size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
              <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '18px' }}>
                <BrainCircuit size={12} color="var(--on-accent)" />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>AI</span>
                <div style={{ padding: '12px 16px', background: 'var(--surface-sunken)', borderRadius: '24px 24px 24px 8px', display: 'flex', alignItems: 'center', gap: '4px', height: '20px' }}>
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.18, ease: 'easeInOut' }}
                      style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)', opacity: 0.7 }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '12px 16px', background: 'var(--danger-bg)', borderRadius: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ flex: 1, minWidth: 0 }}><strong>Error:</strong> {error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', margin: '-12px -12px -12px 0', flexShrink: 0 }}><X size={16} /></button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ── Input Bar ── */}
        <div style={{ borderTop: '1px solid var(--hairline)', padding: '16px 20px', background: 'var(--surface)', flexShrink: 0 }}>
          {!file && (
            <div style={{ marginBottom: '10px', padding: '8px 12px', background: 'var(--surface-high)', borderRadius: '12px', fontSize: '12px', lineHeight: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UploadCloud size={13} /> Upload a PDF on the left before chatting
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 0, boxShadow: input.trim() ? 'inset 0 0 0 1.5px var(--accent)' : 'none', borderRadius: '16px', background: 'var(--surface-sunken)', overflow: 'hidden', transition: 'box-shadow 0.15s' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={file ? `Ask anything about "${file.name}"… (Enter to send, Shift+Enter for new line)` : 'Upload a PDF first…'}
                disabled={!file || !hasKey}
                rows={1}
                style={{
                  width: '100%', padding: '12px 16px', border: 'none', outline: 'none', resize: 'none',
                  background: 'transparent', fontSize: '16px', color: 'var(--text-main)',
                  lineHeight: '24px', maxHeight: '120px', overflowY: 'auto',
                  fontFamily: 'inherit', boxSizing: 'border-box' as const,
                  opacity: (!file || !hasKey) ? 0.5 : 1,
                }}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 120) + 'px';
                }}
              />
            </div>
            <button
              onClick={() => sendMessage()}
              disabled={!canSend}
              aria-label="Send message"
              style={{
                width: '48px', height: '48px', borderRadius: '16px', border: 'none', flexShrink: 0,
                background: canSend ? 'var(--accent)' : 'var(--surface-high)',
                color: canSend ? 'var(--on-accent)' : 'var(--ink-faint)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
            >
              {loading ? (
                <div style={{ width: '16px', height: '16px', border: '2px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              ) : (
                <Send size={16} />
              )}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
            Press <kbd style={{ background: 'var(--surface-high)', borderRadius: '8px', padding: '1px 6px', fontSize: '12px' }}>Enter</kbd> to send · <kbd style={{ background: 'var(--surface-high)', borderRadius: '8px', padding: '1px 6px', fontSize: '12px' }}>Shift+Enter</kbd> for new line
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

/* ── Functional AI Tool UI ── */
const AIPdfTool = ({ toolId, title, description, systemPrompt }: {
  toolId: string; title: string; description: string; systemPrompt: string;
}) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [userNote, setUserNote] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const hasKey = hasAnyKey();
  const provider = getProviderName();

  const needsPdf = !['ai-rewrite-content'].includes(toolId);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setResult(''); setError(''); }
    e.target.value = '';
  };

  const run = async () => {
    if (needsPdf && !file) return;
    setLoading(true);
    setResult('');
    setError('');
    try {
      let content = '';
      if (file) {
        const text = await extractPdfText(file);
        content = `Document: "${file.name}"\n\n${text}`;
      }
      if (userNote.trim()) content += `\n\nUser instruction: ${userNote.trim()}`;
      const res = await callAI([{ role: 'user', content }], { systemPrompt, maxTokens: 2500 });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_output.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: '560px' }}>
      {/* Left: upload + controls */}
      <div style={{ width: '260px', flexShrink: 0, borderRight: '1px solid var(--hairline)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--panel-bg)' }}>
        {needsPdf && (
          <div>
            <p className="field-label">Document</p>
            <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFile} />
            {file ? (
              <div style={{ background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: '16px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <FileText size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span style={{ fontSize: '14px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-main)', fontWeight: 500 }}>{file.name}</span>
                  <button aria-label="Remove file" onClick={() => setFile(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', margin: '-14px -12px -14px 0' }}>
                    <X size={13} />
                  </button>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '23px' }}>
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', minHeight: '44px', padding: '18px 12px', border: '1.5px dashed color-mix(in srgb, var(--accent) 30%, transparent)', borderRadius: '16px', background: 'var(--surface-sunken)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px', boxSizing: 'border-box' as const }}
              >
                <UploadCloud size={24} color="var(--text-muted)" />
                <span>Click to upload PDF</span>
              </button>
            )}
          </div>
        )}

        <div>
          <p className="field-label">Instructions <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>
          <textarea
            value={userNote}
            onChange={e => setUserNote(e.target.value)}
            placeholder={`e.g. "Focus on chapter 2" or "In Spanish"`}
            rows={3}
            style={{ width: '100%', padding: '12px 16px', borderRadius: '16px', border: 'none', background: 'var(--surface)', color: 'var(--text-main)', fontSize: '16px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const, lineHeight: '24px' }}
          />
        </div>

        <button
          onClick={run}
          disabled={loading || (needsPdf && !file) || !hasKey}
          className="btn-primary"
          style={{ width: '100%' }}
        >
          {loading ? (
            <><div style={{ width: '14px', height: '14px', border: '2px solid color-mix(in srgb, var(--on-accent) 30%, transparent)', borderTopColor: 'var(--on-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Analyzing…</>
          ) : (
            <><Send size={14} /> Run {title}</>
          )}
        </button>

        {!hasKey && (
          <div style={{ background: 'var(--warn-bg)', borderRadius: '16px', padding: '12px' }}>
            <div style={{ display: 'flex', gap: '7px', alignItems: 'flex-start', marginBottom: '10px' }}>
              <Key size={13} color="var(--warn)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <p style={{ fontSize: '12px', color: 'var(--text-main)', lineHeight: '16px', minWidth: 0 }}>No API key — AI features disabled.</p>
            </div>
            <button onClick={() => navigate('/dashboard/profile?tab=api-keys')} style={{ width: '100%', minHeight: '44px', padding: '7px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
              Add API Key →
            </button>
          </div>
        )}

        {hasKey && (
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Using {provider}</span>
          </div>
        )}
      </div>

      {/* Right: output */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Output header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
            <BrainCircuit size={16} color="var(--accent)" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>AI Output</span>
            {result && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Hash size={10} /> {countWords(result).toLocaleString()} words
                <Clock size={10} style={{ marginLeft: '6px' }} /> {estimateReadTime(result)}
              </span>
            )}
          </div>
          {result && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={copyResult}
                style={{ minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'none', background: 'var(--surface-high)', color: copied ? 'var(--success)' : 'var(--text-main)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={downloadResult}
                style={{ minHeight: '44px', padding: '0 14px', borderRadius: '12px', border: 'none', background: 'var(--surface-high)', color: 'var(--text-main)', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={13} /> .txt
              </button>
            </div>
          )}
        </div>

        {/* Output body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {loading && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: 'var(--text-secondary)' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid var(--hairline)', borderTopColor: 'var(--accent)' }}
              />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px', color: 'var(--text-main)' }}>Analyzing with {provider}…</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Reading your document and generating results</p>
              </div>
            </div>
          )}

          {error && !loading && (
            <div style={{ background: 'var(--danger-bg)', borderRadius: '16px', padding: '16px', color: 'var(--danger)', fontSize: '14px', lineHeight: '20px' }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <AnimatePresence>
            {result && !loading && (
              <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <MarkdownRenderer content={result} />
              </motion.div>
            )}
          </AnimatePresence>

          {!result && !loading && !error && (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
              <BrainCircuit size={44} style={{ marginBottom: '16px', opacity: 0.15 }} />
              <p style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-secondary)' }}>{description}</p>
              <p style={{ fontSize: '14px' }}>{needsPdf ? 'Upload a PDF and click Run to get started.' : 'Add instructions and click Run.'}</p>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

/* ── Main UniversalTool component ── */
const UniversalTool = ({ toolId }: UniversalToolProps) => {
  const navigate = useNavigate();

  // Google Drive → redirect straight to the Profile integration tab
  useEffect(() => {
    if (toolId === 'google-drive-integration') {
      navigate('/dashboard/profile?tab=connected', { replace: true });
    }
  }, [toolId, navigate]);

  if (toolId === 'google-drive-integration') return null;

  const toolData = toolsData.find(t => t.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === toolId);
  const title = toolData?.name || 'Tool Workspace';
  const description = toolData?.desc || 'Process your files securely.';
  const category = toolData?.category ?? 'other';

  const resolvedCategory = (() => {
    if (AI_TOOL_IDS.has(toolId)) return 'ai';
    if (COMPLEX_TOOL_IDS.has(toolId)) return 'complex';
    if (category === 'business') return 'business_cloud';
    return category;
  })();

  if (CHAT_TOOL_IDS.has(toolId)) {
    const systemPrompt = CHAT_SYSTEM_PROMPTS[toolId] ||
      `You are a helpful AI assistant for discussing PDF documents. ${description}`;
    return (
      <ToolWorkspaceLayout title={title} description={description}>
        <ChatPdfTool toolId={toolId} title={title} description={description} systemPrompt={systemPrompt} />
      </ToolWorkspaceLayout>
    );
  }

  if (resolvedCategory === 'ai') {
    const systemPrompt = AI_TOOL_PROMPTS[toolId] ||
      `You are a helpful AI assistant. Perform the task described as "${title}" on the provided document content. ${description}`;
    return (
      <ToolWorkspaceLayout title={title} description={description}>
        <AIPdfTool toolId={toolId} title={title} description={description} systemPrompt={systemPrompt} />
      </ToolWorkspaceLayout>
    );
  }

  const info = CATEGORY_INFO[resolvedCategory] ?? DEFAULT_INFO;
  const Icon = info.icon;

  return (
    <ToolWorkspaceLayout title={title} description={description}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ maxWidth: '480px', width: '100%', textAlign: 'center', background: 'var(--surface)', borderRadius: '24px', padding: '40px 24px', boxShadow: 'var(--shadow-raised)', boxSizing: 'border-box' }}
        >
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <Icon size={36} />
          </div>
          <span style={{ display: 'inline-block', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', fontSize: '12px', lineHeight: '16px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', padding: '4px 12px', borderRadius: '12px', marginBottom: '12px' }}>
            {info.badge}
          </span>
          <h2 style={{ fontSize: '24px', lineHeight: '32px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-main)' }}>{info.heading}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '20px', marginBottom: '24px' }}>{info.body}</p>
          {info.cta && (
            <button
              onClick={() => resolvedCategory === 'business_cloud' ? navigate('/dashboard/subscription') : undefined}
              className="btn-primary"
              style={{ width: '100%' }}
            >
              {info.cta}
            </button>
          )}
        </motion.div>
      </div>
    </ToolWorkspaceLayout>
  );
};

export default UniversalTool;
