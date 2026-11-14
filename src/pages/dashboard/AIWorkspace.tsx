import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Paperclip, Bot, FileText, X, Key, Loader2, AlertCircle,
  ArrowRight, Sparkles, ChevronDown, ChevronRight, Pencil, Trash2, Menu, Sparkle
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  callAIStream, hasAnyKey, getActiveProvider, setActiveProvider,
  extractFileText, CHAT_ACCEPT, type ChatMessage
} from '../../utils/aiService';
import { type Provider, getApiKey } from '../../utils/apiKeys';
import { matchesAccept } from '../../utils/acceptMatch';
import FilesPicker from '../../components/tools/FilesPicker';
import { useIsMobile } from '../../hooks/useIsMobile';
import MarkdownRenderer from '../../components/tools/MarkdownRenderer';
import {
  loadChats, getChat, saveChat, deleteChats, renameChat, newChatId,
  CHATS_EVENT, type Conversation
} from '../../utils/chatStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface DocItem {
  id: string;
  name: string;
  text: string;
}

const STARTER_PROMPTS = [
  {
    title: 'Summarize this PDF',
    caption: 'Generate an executive summary with key takeaways',
    prompt: 'Please provide a comprehensive executive summary of this document, highlighting the key takeaways and main conclusions.',
  },
  {
    title: 'Extract tables & key metrics',
    caption: 'Isolate tables and numerical data into structured lists',
    prompt: 'Extract all tables, key statistics, and quantitative metrics from this document into clean structured markdown tables.',
  },
  {
    title: 'Explain complex clauses simply',
    caption: 'Break down legal and technical terms into plain English',
    prompt: 'Break down the most complex clauses, legal terms, or technical concepts in this document and explain them simply in plain English.',
  },
  {
    title: 'Compare & find discrepancies',
    caption: 'Spot conflicts and differences across attached files',
    prompt: 'Analyze this document for potential contradictions, missing provisions, risk factors, or internal inconsistencies.',
  },
];

const MODEL_CONFIGS: { id: Provider; name: string; modelLabel: string; company: string }[] = [
  { id: 'gemini', name: 'Gemini 1.5 Pro', modelLabel: 'gemini-1.5-pro', company: 'Google' },
  { id: 'openai', name: 'GPT-4o', modelLabel: 'gpt-4o', company: 'OpenAI' },
  { id: 'anthropic', name: 'Claude 3.5 Sonnet', modelLabel: 'claude-3-5-sonnet', company: 'Anthropic' },
  { id: 'deepseek', name: 'DeepSeek V3', modelLabel: 'deepseek-chat', company: 'DeepSeek' },
  { id: 'groq', name: 'Llama 3.3 70B', modelLabel: 'llama-3.3-70b', company: 'Groq' },
];

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* Coach avatar: Disc used for the assistant */
const CoachDisc = memo(() => (
  <span
    aria-hidden
    className="w-10 h-10 shrink-0 aspect-square rounded-xl flex items-center justify-center bg-[#0297DE]/15 border border-[#0297DE]/35 text-[#38BDF8] shadow-[0_0_12px_rgba(2,151,222,0.35)]"
  >
    <Bot size={18} />
  </span>
));

/* Memoized Message Bubble */
const MessageBubble = memo(({ msg }: { msg: Message }) => {
  const mine = msg.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
        flexDirection: mine ? 'row-reverse' : 'row',
        marginBottom: '20px',
        width: '100%',
        maxWidth: '820px',
        margin: '0 auto 20px',
      }}
    >
      {!mine && <CoachDisc />}
      <div
        style={{
          minWidth: 0,
          maxWidth: mine ? '82%' : '80%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: mine ? 'flex-end' : 'flex-start',
        }}
      >
        <div className={mine ? 'chat-bubble-user-pod' : 'chat-bubble-ai-pod'}>
          {mine ? msg.content : <MarkdownRenderer content={msg.content} />}
        </div>
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.40)',
            margin: '4px 8px 0',
          }}
        >
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </motion.div>
  );
});

export const AIWorkspace = () => {
  const navigate = useNavigate();
  const { chatId } = useParams<{ chatId?: string }>();
  const isMobile = useIsMobile(1024);

  // Conversations list from chatStore
  const [allChats, setAllChats] = useState<Conversation[]>(() => loadChats());
  useEffect(() => {
    const refresh = () => setAllChats(loadChats());
    window.addEventListener(CHATS_EVENT, refresh);
    return () => window.removeEventListener(CHATS_EVENT, refresh);
  }, []);

  // Current active conversation state
  const currentChat = useMemo(() => {
    if (!chatId) return null;
    return allChats.find(c => c.id === chatId) || null;
  }, [chatId, allChats]);

  const [activeChatId, setActiveChatId] = useState<string>(() => chatId || newChatId());

  // Sync activeChatId when URL param changes
  useEffect(() => {
    if (chatId) {
      setActiveChatId(chatId);
    }
  }, [chatId]);

  // Documents & messages of active conversation
  const [docs, setDocs] = useState<DocItem[]>(() => currentChat?.docs ?? []);
  const [activeDocId, setActiveDocId] = useState<string | null>(() => currentChat?.activeDocId ?? (currentChat?.docs?.[0]?.id ?? null));
  const [messages, setMessages] = useState<Message[]>(() =>
    (currentChat?.messages ?? []).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: new Date(m.ts) }))
  );

  // Update docs & messages when navigating to an existing conversation
  useEffect(() => {
    if (chatId) {
      const c = getChat(chatId);
      if (c) {
        setDocs(c.docs ?? []);
        setActiveDocId(c.activeDocId ?? (c.docs?.[0]?.id ?? null));
        setMessages((c.messages ?? []).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: new Date(m.ts) })));
      }
    } else {
      // Clean slate on /dashboard/ai
      setDocs([]);
      setActiveDocId(null);
      setMessages([]);
      setActiveChatId(newChatId());
    }
  }, [chatId]);

  // UI state
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [keyBannerDismissed, setKeyBannerDismissed] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // API Key & Provider state
  const [hasKey, setHasKey] = useState(hasAnyKey);
  const [activeProviderId, setActiveProviderId] = useState<Provider>(() => {
    const act = getActiveProvider();
    return act?.provider || 'gemini';
  });

  const checkKeys = useCallback(() => {
    setHasKey(hasAnyKey());
    const act = getActiveProvider();
    if (act) setActiveProviderId(act.provider);
  }, []);

  useEffect(() => {
    window.addEventListener('focus', checkKeys);
    window.addEventListener('storage', checkKeys);
    window.addEventListener('zenith-provider-changed', checkKeys);
    return () => {
      window.removeEventListener('focus', checkKeys);
      window.removeEventListener('storage', checkKeys);
      window.removeEventListener('zenith-provider-changed', checkKeys);
    };
  }, [checkKeys]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const streamingId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  // Grouped conversations: Today vs Previous 7 Days vs Older
  const { todayChats, prev7DaysChats, olderChats } = useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const today: Conversation[] = [];
    const prev7: Conversation[] = [];
    const older: Conversation[] = [];

    allChats.forEach(c => {
      if (c.updatedAt >= oneDayAgo) today.push(c);
      else if (c.updatedAt >= sevenDaysAgo) prev7.push(c);
      else older.push(c);
    });

    return { todayChats: today, prev7DaysChats: prev7, olderChats: older };
  }, [allChats]);

  // Persist conversation to chatStore
  const persist = useCallback((msgs: Message[], curDocs: DocItem[], activeDoc: string | null, targetId: string) => {
    if (!msgs.length && !curDocs.length) {
      if (getChat(targetId)) deleteChats([targetId]);
      return;
    }
    const existing = getChat(targetId);
    saveChat({
      id: targetId,
      title: existing?.title || '',
      customTitle: existing?.customTitle,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      docs: curDocs,
      activeDocId: activeDoc,
      messages: msgs.map(m => ({ id: m.id, role: m.role, content: m.content, ts: m.timestamp.getTime() })),
    });
  }, []);

  // Save changes when messages or docs change
  const signature = `${messages.length}:${messages[messages.length - 1]?.content.length ?? 0}:${docs.length}:${activeDocId}`;
  const lastSaved = useRef(signature);
  useEffect(() => {
    if (streaming || signature === lastSaved.current) return;
    if (messages.length > 0 || docs.length > 0) {
      lastSaved.current = signature;
      persist(messages, docs, activeDocId, activeChatId);
    }
  }, [messages, docs, activeDocId, streaming, signature, activeChatId, persist]);

  // Auto-scroll messages
  useEffect(() => {
    const el = messagesRef.current;
    if (!el || !(messages.length || isThinking)) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom || !streamingId.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: streamingId.current ? 'auto' : 'smooth' });
    }
  }, [messages, isThinking]);

  const startNewChat = useCallback(() => {
    const newId = newChatId();
    setActiveChatId(newId);
    setDocs([]);
    setActiveDocId(null);
    setMessages([]);
    setInput('');
    if (chatId) {
      navigate('/dashboard/ai');
    }
    setMobileSidebarOpen(false);
  }, [chatId, navigate]);

  // Keyboard shortcut ⌘N / Ctrl+N for new chat
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        startNewChat();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startNewChat]);

  const handleSelectChat = (c: Conversation) => {
    setActiveChatId(c.id);
    navigate(`/dashboard/ai/${c.id}`);
    setMobileSidebarOpen(false);
  };

  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteChats([id]);
    if (id === activeChatId) {
      startNewChat();
    }
  };

  const handleRenameChat = (e: React.MouseEvent, c: Conversation) => {
    e.stopPropagation();
    setEditingChatId(c.id);
    setEditTitle(c.customTitle || c.title || '');
  };

  const submitRename = (id: string) => {
    if (editTitle.trim()) {
      renameChat(id, editTitle.trim());
    }
    setEditingChatId(null);
  };

  // Upload file handler
  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    if (!matchesAccept(file.name, file.type, CHAT_ACCEPT)) {
      setUploadError('Chat reads PDF, Word, text, Markdown, CSV, JSON and HTML files.');
      return;
    }
    setUploadingDoc(true);
    setUploadError('');

    try {
      const text = await extractFileText(file);
      const newDoc: DocItem = { id: newChatId(), name: file.name, text };
      const updatedDocs = [newDoc, ...docs];
      setDocs(updatedDocs);
      setActiveDocId(newDoc.id);

      const welcomeMsg: Message = {
        id: newChatId(),
        role: 'assistant',
        content: `I've read **${file.name}** (${Math.round(file.size / 1024)} KB, about ${text.split(/\s+/).length} words). Ask me anything about it, or choose one of the starter prompts below!`,
        timestamp: new Date(),
      };
      const updatedMessages = [...messages, welcomeMsg];
      setMessages(updatedMessages);

      // If we are currently on `/dashboard/ai`, push to `/dashboard/ai/:id`
      if (!chatId) {
        navigate(`/dashboard/ai/${activeChatId}`, { replace: true });
      }
      persist(updatedMessages, updatedDocs, newDoc.id, activeChatId);
    } catch (e) {
      setUploadError(e instanceof Error && /OCR|no text|too large/.test(e.message) ? e.message : 'Couldn’t read that file. Try another one.');
    } finally {
      setUploadingDoc(false);
    }
  }, [docs, messages, activeChatId, chatId, navigate, persist]);

  const removeDoc = (id: string) => {
    const rest = docs.filter(d => d.id !== id);
    setDocs(rest);
    if (activeDocId === id) setActiveDocId(rest[0]?.id ?? null);
  };

  // Send message handler
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isThinking) return;

    if (!hasAnyKey()) {
      setShowKeyModal(true);
      return;
    }

    const userMsg: Message = { id: newChatId(), role: 'user', content: text.trim(), timestamp: new Date() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setIsThinking(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }

    // Ensure URL has chat ID
    if (!chatId) {
      navigate(`/dashboard/ai/${activeChatId}`, { replace: true });
    }

    const activeDoc = docs.find(d => d.id === activeDocId) || docs[0] || null;

    let systemPrompt = 'You are O-ZENITH AI, an advanced document and productivity assistant. Answer questions accurately, concisely, and helpfully. Use markdown formatting with bolding, bullet points, and code blocks for clarity.';
    if (activeDoc && activeDoc.text.trim()) {
      systemPrompt = `You are O-ZENITH AI, an intelligent document assistant. The user has attached the document "${activeDoc.name}".

Document content (extracted text):
---
${activeDoc.text.slice(0, 18000)}
---

Answer questions about this document accurately and concisely. If information isn't in the document, say so clearly. Use clean markdown formatting.`;
    }

    const history: ChatMessage[] = nextMessages.slice(-8).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const replyId = newChatId();
    let pending = '';
    let frame = 0;
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const flush = () => {
      frame = 0;
      const content = pending;
      setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, content } : m)));
    };

    try {
      await callAIStream(
        history,
        (_piece, soFar) => {
          pending = soFar;
          if (!streamingId.current) {
            streamingId.current = replyId;
            setStreaming(true);
            setIsThinking(false);
            setMessages(prev => [...prev, { id: replyId, role: 'assistant', content: soFar, timestamp: new Date() }]);
            return;
          }
          if (!frame) frame = requestAnimationFrame(flush);
        },
        { systemPrompt, maxTokens: 1500, signal: ctrl.signal }
      );
      if (frame) cancelAnimationFrame(frame);
      flush();
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      const note = msg === 'NO_KEY'
        ? 'No AI key found. Add one in **Account → API keys**.'
        : `**The AI provider returned an error:** ${msg}\n\nCheck your key in Account → API keys and try again.`;
      if (streamingId.current) {
        setMessages(prev => prev.map(m => (m.id === replyId ? { ...m, content: (pending ? pending + '\n\n' : '') + note } : m)));
      } else {
        setMessages(prev => [...prev, { id: newChatId(), role: 'assistant', content: note, timestamp: new Date() }]);
      }
    } finally {
      if (!ctrl.signal.aborted) {
        abortRef.current = null;
        streamingId.current = null;
        setStreaming(false);
        setIsThinking(false);
      }
    }
  }, [isThinking, messages, docs, activeDocId, chatId, activeChatId, navigate]);

  // Seamless Deep-Link Handshake with Home Page AI Copilot
  useEffect(() => {
    const deepPrompt = sessionStorage.getItem('ozenith_copilot_prompt');
    if (deepPrompt) {
      sessionStorage.removeItem('ozenith_copilot_prompt');
      setInput(deepPrompt);
      if (hasAnyKey()) {
        const timer = setTimeout(() => {
          sendMessage(deepPrompt);
        }, 120);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          textareaRef.current?.focus();
        }, 120);
        return () => clearTimeout(timer);
      }
    }
  }, [sendMessage]);

  const activeModel = useMemo(() => {
    return MODEL_CONFIGS.find(m => m.id === activeProviderId) || MODEL_CONFIGS[0];
  }, [activeProviderId]);

  const selectModel = (provider: Provider) => {
    setActiveProvider(provider);
    setActiveProviderId(provider);
    setModelDropdownOpen(false);
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(160, Math.max(44, e.target.scrollHeight))}px`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const canSend = !!input.trim() && !isThinking;

  return (
    <div className="chatgpt-root h-[calc(100dvh-4.25rem)] w-full px-5 pb-5 pt-2 flex gap-5 overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={CHAT_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />
      <FilesPicker
        open={pickerOpen}
        accept={CHAT_ACCEPT}
        multiple={false}
        title="Choose a file"
        onClose={() => setPickerOpen(false)}
        onPick={(files) => {
          setPickerOpen(false);
          if (files[0]) handleUpload(files[0]);
        }}
        onPickFromDevice={() => {
          setPickerOpen(false);
          fileInputRef.current?.click();
        }}
      />

      {/* ═══════════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR (260px DESKTOP / COLLAPSIBLE DRAWER ON MOBILE)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <aside className={`chatgpt-sidebar w-[260px] shrink-0 h-full rounded-[24px] bg-[#070C18]/65 dark:bg-[#070C18]/65 light:bg-white/80 backdrop-blur-[40px] border border-white/[0.09] p-3.5 flex flex-col justify-between overflow-hidden ${mobileSidebarOpen ? 'is-open' : ''}`}>
        {/* Top Header: + New Chat Button with coral accent & ⌘N shortcut badge */}
        <div className="chatgpt-sidebar-header shrink-0 p-0 mb-3 border-none flex items-center gap-2">
          <button
            type="button"
            onClick={startNewChat}
            className="chatgpt-new-chat-btn flex-1 h-11 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] px-4 flex items-center justify-between text-xs font-medium text-white transition-all"
          >
            <span className="flex items-center">
              <span>New Chat</span>
            </span>
            <span className="text-[11px] opacity-40 px-1.5 py-0.5 rounded border border-white/10">
              ⌘N
            </span>
          </button>
          {isMobile && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="chatgpt-drawer-close w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-white/70 hover:text-white transition-all flex-shrink-0 lg:hidden"
              aria-label="Close sidebar"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Scrollable Conversation History */}
        <div className="chatgpt-history-scroll">
          {/* Uploaded Context Documents Section (if any attached to current chat) */}
          {docs.length > 0 && (
            <div className="mb-2">
              <div className="chatgpt-group-title flex items-center justify-between">
                <span>Context Documents</span>
                <span className="opacity-60">{docs.length}</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {docs.map(doc => (
                  <div
                    key={doc.id}
                    className="context-doc-chip"
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <FileText size={12} className="text-[#38BDF8]" style={{ flexShrink: 0, color: '#38BDF8' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDoc(doc.id)}
                      style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Remove document"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Group: Today */}
          {todayChats.length > 0 && (
            <div>
              <div className="chatgpt-group-title">Today</div>
              <div className="flex flex-col gap-0.5">
                {todayChats.map(c => {
                  const isActive = c.id === activeChatId;
                  const isEditing = editingChatId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectChat(c)}
                      className={`chatgpt-history-item ${isActive ? 'is-active' : ''}`}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(c.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          onBlur={() => submitRename(c.id)}
                          autoFocus
                          className="w-full bg-white/10 text-white text-xs px-1.5 py-0.5 rounded outline-none"
                        />
                      ) : (
                        <>
                          <span className="chatgpt-history-title">
                            {c.customTitle || c.title || 'New conversation'}
                          </span>
                          <div className="chatgpt-history-actions">
                            <button
                              type="button"
                              onClick={(e) => handleRenameChat(e, c)}
                              className="chatgpt-action-btn"
                              title="Rename"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteChat(e, c.id)}
                              className="chatgpt-action-btn hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group: Previous 7 Days */}
          {prev7DaysChats.length > 0 && (
            <div>
              <div className="chatgpt-group-title">Previous 7 Days</div>
              <div className="flex flex-col gap-0.5">
                {prev7DaysChats.map(c => {
                  const isActive = c.id === activeChatId;
                  const isEditing = editingChatId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectChat(c)}
                      className={`chatgpt-history-item ${isActive ? 'is-active' : ''}`}
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(c.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          onBlur={() => submitRename(c.id)}
                          autoFocus
                          className="w-full bg-white/10 text-white text-xs px-1.5 py-0.5 rounded outline-none"
                        />
                      ) : (
                        <>
                          <span className="chatgpt-history-title">
                            {c.customTitle || c.title || 'New conversation'}
                          </span>
                          <div className="chatgpt-history-actions">
                            <button
                              type="button"
                              onClick={(e) => handleRenameChat(e, c)}
                              className="chatgpt-action-btn"
                              title="Rename"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteChat(e, c.id)}
                              className="chatgpt-action-btn hover:text-red-400"
                              title="Delete"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group: Older */}
          {olderChats.length > 0 && (
            <div>
              <div className="chatgpt-group-title">Older</div>
              <div className="flex flex-col gap-0.5">
                {olderChats.map(c => {
                  const isActive = c.id === activeChatId;
                  return (
                    <div
                      key={c.id}
                      onClick={() => handleSelectChat(c)}
                      className={`chatgpt-history-item ${isActive ? 'is-active' : ''}`}
                    >
                      <span className="chatgpt-history-title">
                        {c.customTitle || c.title || 'New conversation'}
                      </span>
                      <div className="chatgpt-history-actions">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteChat(e, c.id)}
                          className="chatgpt-action-btn hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {allChats.length === 0 && (
            <div className="p-4 text-center">
              <p className="text-xs text-white/40 leading-relaxed">
                No past conversations.<br />Start typing below or attach a PDF!
              </p>
            </div>
          )}
        </div>

        {/* Bottom Sidebar Footer: API Key & Model Status Button */}
        <div className="chatgpt-sidebar-footer shrink-0 mt-auto pt-2 border-0 border-none">
          <Link
            to="/dashboard/profile?section=settings"
            className="chatgpt-key-status-btn w-full h-11 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] px-4 flex items-center justify-between text-xs text-white/80 transition-all border-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  hasKey
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                }`}
              />
              <span className="truncate">
                {hasKey ? 'O-Zenith AI Gateway Connected →' : 'No API Key - Add Key →'}
              </span>
            </div>
            <ArrowRight size={12} className="opacity-40 flex-shrink-0" />
          </Link>
        </div>
      </aside>

      {/* Mobile/Tablet Sidebar Backdrop */}
      {isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="chatgpt-mobile-backdrop fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          MAIN CHAT STAGE (FULL VIEWPORT, STREAMING CONVERSATION & FLOATING COMPOSER)
          ═══════════════════════════════════════════════════════════════════════════ */}
      <div className="chatgpt-stage flex-1 h-full min-w-0 flex flex-col justify-between overflow-hidden relative">
        {/* Stage Header: Model Selector Pill Dropdown */}
        <header className="chatgpt-stage-header h-11 shrink-0 flex items-center justify-between px-2 bg-transparent border-none border-0 shadow-none outline-none">
          <div className="flex items-center gap-2 sm:gap-3">
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="chatgpt-drawer-toggle"
                aria-label="Open sidebar"
              >
                <Menu size={16} />
              </button>
            )}

            {/* AI Model Selector Pill Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setModelDropdownOpen(v => !v)}
                className="chatgpt-model-pill h-9 px-3.5 rounded-full bg-[#070C18]/70 backdrop-blur-2xl border border-white/[0.12] hover:border-white/[0.25] text-xs font-medium text-white flex items-center gap-2"
              >
                <Sparkles size={13} className="text-[#38BDF8]" />
                <span>{activeModel.name}</span>
                <ChevronDown size={13} className="opacity-60" />
              </button>

              {modelDropdownOpen && (
                <div className="chatgpt-model-menu">
                  {MODEL_CONFIGS.map(m => {
                    const isSelected = m.id === activeProviderId;
                    const hasProviderKey = !!getApiKey(m.id).trim();
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectModel(m.id)}
                        className={`chatgpt-model-option ${isSelected ? 'is-active' : ''}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-xs text-white">{m.name}</span>
                          <span className="text-[10px] text-white/50">{m.company}</span>
                        </div>
                        {hasProviderKey ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Key Configured" />
                        ) : (
                          <span className="text-[10px] opacity-40">No key</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/dashboard/profile?section=settings"
              className="w-9 h-9 rounded-full bg-[#070C18]/70 backdrop-blur-2xl border border-white/[0.12] hover:border-white/[0.25] flex items-center justify-center text-white/75 hover:text-white transition-all"
              title="API Key Settings"
            >
              <Key size={14} />
            </Link>
          </div>
        </header>

        {/* Missing Key Dismissible Sleek Glass Banner */}
        {!hasKey && !keyBannerDismissed && (
          <div className="chatgpt-key-banner">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-[#0297DE] flex-shrink-0" />
              <span>
                No API key found. Add your free Gemini, Groq, OpenAI, or Anthropic key to activate AI responses.
              </span>
              <Link
                to="/dashboard/profile?section=settings"
                className="text-white underline font-semibold text-xs whitespace-nowrap ml-1 hover:text-[#38BDF8]"
              >
                Add Key →
              </Link>
            </div>
            <button
              type="button"
              onClick={() => setKeyBannerDismissed(true)}
              className="opacity-60 hover:opacity-100 text-white p-1"
              aria-label="Dismiss banner"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Conversation Stream Scroll Area */}
        <div ref={messagesRef} className="chatgpt-messages-container flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4">
          {messages.length === 0 ? (
            /* Welcome Centerpiece */
            <div className="chatgpt-welcome-wrapper w-full flex flex-col items-center justify-center my-auto">
              <div className="chatgpt-emblem-glow w-14 h-14 shrink-0 aspect-square rounded-2xl flex items-center justify-center">
                <Sparkle size={28} className="text-[#38BDF8] shrink-0 static" />
              </div>

              <h1 className="chatgpt-welcome-title tracking-[-0.025em]">
                Chat with your documents at the Speed of Thought.
              </h1>

              <p className="chatgpt-welcome-subtitle">
                Ask questions, summarize key sections, or extract structured data from your PDFs.
              </p>

              {/* 2x2 Starter Prompt Cards */}
              <div className="chatgpt-starter-grid max-w-2xl w-full grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-6 mx-auto">
                {STARTER_PROMPTS.map((card, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (!hasKey) {
                        setShowKeyModal(true);
                        return;
                      }
                      sendMessage(card.prompt);
                    }}
                    className="chatgpt-starter-card min-h-[84px] p-4 rounded-2xl flex items-center justify-between gap-3 shrink-0 bg-[#070C18]/60 backdrop-blur-[40px] border border-white/[0.1] hover:border-[#38BDF8]/40 hover:bg-[#070C18]/80 transition-all cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="chatgpt-starter-heading text-sm font-semibold text-slate-900 dark:text-white truncate m-0">
                        {card.title}
                      </div>
                      <div className="chatgpt-starter-caption text-xs opacity-60 text-slate-900 dark:text-white line-clamp-2 mt-1 m-0">
                        {card.caption}
                      </div>
                    </div>
                    <ChevronRight size={15} className="shrink-0 opacity-40 text-[#38BDF8]" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Active Messages Stream */
            <div className="w-full flex flex-col py-4">
              {messages.map(m => (
                <MessageBubble key={m.id} msg={m} />
              ))}
              {isThinking && (
                <div className="flex items-center gap-3 max-w-[820px] w-full mx-auto px-2 mb-4">
                  <CoachDisc />
                  <div className="chat-bubble-ai-pod flex items-center gap-2 py-3 px-4 text-xs text-white/70">
                    <Loader2 size={14} className="animate-spin text-[#38BDF8]" />
                    <span>Thinking with {activeModel.name}…</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating Bottom Composer */}
        <div className="chatgpt-composer-wrapper shrink-0 w-full max-w-3xl mx-auto px-4 pb-6 pt-2 bg-transparent border-0 shadow-none">
          {uploadError && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 px-3 py-1.5 rounded-lg flex items-center justify-between mb-2">
              <span>{uploadError}</span>
              <button onClick={() => setUploadError('')} className="p-0.5"><X size={12} /></button>
            </div>
          )}

          <div className="chatgpt-composer-box rounded-[24px] bg-[#070C18]/70 backdrop-blur-[40px] border border-white/[0.12] p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder={docs.length > 0 ? `Ask anything about ${docs[0].name}…` : "Ask anything or type a prompt…"}
              rows={1}
              className="chatgpt-composer-textarea text-[16px] sm:text-sm"
            />

            <div className="chatgpt-composer-bottom">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  disabled={uploadingDoc}
                  className="chatgpt-composer-attach-btn"
                >
                  {uploadingDoc ? (
                    <Loader2 size={13} className="animate-spin text-[#38BDF8]" />
                  ) : (
                    <Paperclip size={13} />
                  )}
                  <span>{uploadingDoc ? 'Reading…' : '+ Attach PDF'}</span>
                </button>

                {docs.length > 0 && (
                  <span className="text-[11px] text-[#38BDF8] bg-[#0297DE]/10 px-2 py-0.5 rounded-full border border-[#0297DE]/20">
                    {docs.length} file{docs.length > 1 ? 's' : ''} attached
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!canSend}
                className="chatgpt-send-button"
                aria-label="Send prompt"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#030511] border border-[#38BDF8]/30 shadow-2xl flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#0297DE]/20 border border-[#0297DE]/40 flex items-center justify-center text-[#38BDF8] mb-4 shadow-[0_0_20px_rgba(2,151,222,0.4)]">
              <Key size={22} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">AI Key Required to Chat</h3>
            <p className="text-xs text-white/60 mb-6 leading-relaxed">
              Add your free Gemini, Groq, OpenAI, or Anthropic API key in Settings. Your key never leaves your device and is stored locally in your browser.
            </p>
            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-semibold text-white/70 hover:bg-white/5"
              >
                Cancel
              </button>
              <Link
                to="/dashboard/profile?section=settings"
                onClick={() => setShowKeyModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-[#0297DE] hover:bg-[#0284C7] text-xs font-bold text-white shadow-[0_0_15px_rgba(2,151,222,0.4)] text-center no-underline"
              >
                Open Settings
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIWorkspace;
