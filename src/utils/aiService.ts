/* ── O-Zenith AI Service ─────────────────────────────────────────────────────
   Reads API keys from localStorage and routes to the correct provider.
   All calls happen entirely in the browser — keys never leave the device.
   ──────────────────────────────────────────────────────────────────────── */

import { getApiKey, type Provider } from './apiKeys';

const PRIORITY: Provider[] = ['openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'deepseek'];

export function getActiveProvider(): { provider: Provider; key: string } | null {
  const preferred = (localStorage.getItem('zenith_active_provider') || '') as Provider;
  if (preferred && PRIORITY.includes(preferred)) {
    const key = getApiKey(preferred).trim();
    if (key) return { provider: preferred, key };
  }
  for (const p of PRIORITY) {
    const key = getApiKey(p).trim();
    if (key) return { provider: p, key };
  }
  return null;
}

export function setActiveProvider(p: Provider) {
  localStorage.setItem('zenith_active_provider', p);
  window.dispatchEvent(new Event('zenith-provider-changed'));
}

export function hasAnyKey(): boolean {
  return !!getActiveProvider();
}

export function getProviderName(): string {
  const active = getActiveProvider();
  if (!active) return '';
  const labels: Record<Provider, string> = {
    openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini',
    groq: 'Groq', openrouter: 'O-Zenith AI Gateway', deepseek: 'DeepSeek',
  };
  return labels[active.provider];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const REQUEST_TIMEOUT_MS = 45000;

/** Wraps fetch with a hard timeout so a hung provider can never leave the UI stuck "thinking" forever. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('The AI provider took too long to respond. Please try again.', { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function callAI(
  messages: ChatMessage[],
  options: { systemPrompt?: string; maxTokens?: number } = {}
): Promise<string> {
  const active = getActiveProvider();
  if (!active) throw new Error('NO_KEY');

  const { provider, key } = active;
  const { systemPrompt, maxTokens = 1500 } = options;

  /* ── Anthropic ── */
  if (provider === 'anthropic') {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        // Current Haiku-tier model (fast and inexpensive — users bring their own key).
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        system: systemPrompt || 'You are a helpful assistant.',
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Anthropic error ${res.status}`);
    }
    const data = await res.json() as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (data.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing it or a different document.');
    // Join every text block — the first block isn't guaranteed to be text.
    const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    if (!text) throw new Error('Claude returned an empty response. Please try again.');
    return text;
  }

  /* ── Gemini ── */
  if (provider === 'gemini') {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens },
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const res = await fetchWithTimeout(
      // "flash-latest" tracks Google's current Flash model (1.5 has been retired). The key goes
      // in a header, not the URL, so it can't leak into history, logs or error reports.
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Gemini error ${res.status}`);
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
    if (!text) throw new Error(data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason === 'SAFETY'
      ? 'Gemini blocked this request. Try rephrasing it or a different document.'
      : 'Gemini returned an empty response. Please try again.');
    return text;
  }

  /* ── OpenAI-compatible: OpenAI · Groq · OpenRouter · DeepSeek ── */
  const BASE_URLS: Record<string, string> = {
    openai:     'https://api.openai.com/v1/chat/completions',
    groq:       'https://api.groq.com/openai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    deepseek:   'https://api.deepseek.com/chat/completions',
  };
  const DEFAULT_MODELS: Record<string, string> = {
    openai:     'gpt-4o-mini',
    groq:       'llama-3.3-70b-versatile',
    openrouter: 'openai/gpt-4o-mini',
    deepseek:   'deepseek-chat',
  };

  const allMessages = [
    ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
    ...messages,
  ];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'O-Zenith';
  }

  const res = await fetchWithTimeout(BASE_URLS[provider], {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: DEFAULT_MODELS[provider], messages: allMessages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `${provider} error ${res.status}`);
  }
  const data = await res.json();
  const text = (data as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content;
  if (!text) throw new Error('The AI provider returned an empty response. Please try again.');
  return text;
}

/* ── PDF text extraction helper (shared across AI tools) ── */

/** Files bigger than this aren't read at all: only the first few thousand characters are ever used. */
const MAX_READ_BYTES = { pdf: 150 * 1024 * 1024, docx: 40 * 1024 * 1024, text: 2 * 1024 * 1024 };
const tooLarge = (mb: number) => new Error(`This file is too large to read here (over ${mb} MB). Try a smaller file.`);

export async function extractPdfText(file: File, maxChars = 10000): Promise<string> {
  if (file.size > MAX_READ_BYTES.pdf) throw tooLarge(MAX_READ_BYTES.pdf / 1048576);
  // pdf.js loads only when a PDF is read, keeping it out of the app's first download
  const [pdfjsLib] = await Promise.all([import('pdfjs-dist'), import('./pdfWorker')]);
  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: ab }).promise;
  let text = '';
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += (content.items as { str: string }[]).map(item => item.str).join(' ') + '\n';
      page.cleanup();
      if (text.length >= maxChars) break;
    }
  } finally {
    void pdf.destroy(); // frees the worker's copy of the document
  }
  text = text.trim();
  // A scanned PDF has pages but no text layer — sending "" to the AI just produces nonsense.
  if (!text) throw new Error('This PDF has no selectable text (it looks scanned). Run OCR PDF on it first, then try again.');
  return text.slice(0, maxChars);
}

/* ── Per-tool system prompts for AI category tools ── */
export const AI_TOOL_PROMPTS: Record<string, string> = {
  'ai-summarize-pdf':
    'You are a professional document analyst. Summarize this document with: **Executive Summary**, **Key Points** (numbered list), **Main Themes**, and **Conclusions**. Use markdown.',
  'ai-translate-pdf':
    'Translate the provided document content accurately. Preserve structure and formatting. Output only the translated text.',
  'ai-extract-key-points':
    'Extract the most important key points from this document as a clear numbered list. Group related points under headings if needed.',
  'pdf-notes-generator':
    'Turn this document (a syllabus, chapter or lecture notes) into a study guide: **Overview**, then each topic as a heading with key concepts, definitions and examples as bullets, then **Likely exam questions** and a short **Revision checklist**. Use markdown.',
  'ai-study-summary':
    'Write a concise exam-prep summary of this chapter: the 5–10 most important ideas as bullets, key terms with one-line definitions, and any formulas or dates worth memorising. Use markdown.',
  'ai-generate-notes':
    'Generate comprehensive, well-structured study notes from this document. Use headings, sub-headings, and bullet points.',
  'ai-explain-document':
    'Explain this document in simple, plain language. Break down complex terms and concepts. Assume the reader has no prior knowledge.',
  'ai-rewrite-content':
    'Rewrite the provided content to be clearer, more concise, and professionally polished. Maintain the original meaning.',
  'ai-simplify-language':
    'Rewrite this document using simple, everyday language (Grade 8 reading level). Replace jargon with plain words.',
  'ai-legal-document-analysis':
    'You are an expert legal analyst. Analyze this document and identify: key obligations, rights, risks, important clauses, and any potential concerns. Use clear headings.',
  'ai-resume-scanner':
    'Analyze this resume. Provide: Overall score (1–10), strengths, areas for improvement, ATS compatibility notes, and specific suggestions to improve it.',
  'ai-contract-review':
    'Review this contract. Identify: key terms, obligations of each party, risk areas, unusual clauses, missing standard clauses, and recommendations.',
  'ai-invoice-reader':
    'Extract structured data from this invoice: vendor name, invoice number, date, due date, line items (description, qty, unit price, total), subtotal, tax, and grand total.',
  'ai-data-extraction':
    'Extract all tables, forms, and structured data from this document. Format as clean markdown tables where applicable.',
  'ai-smart-search':
    'Search this document for the requested concept or term. Return all relevant passages, their context, and a summary of findings.',
  'ask-questions-from-pdf':
    'Answer the user\'s question based strictly on the document content. If the answer isn\'t in the document, say so clearly.',
  'ai-flashcards':
    'Generate study flashcards from this document. Format each as: **Q:** [question] → **A:** [answer]. Create at least 10 flashcards covering the key concepts.',
  'ai-study-assistant':
    'You are a personal AI tutor. Help the student understand this document. Answer their questions, explain concepts, quiz them if requested, and provide learning insights.',
};

/* ── Streaming ───────────────────────────────────────────────────────────────
   Same providers and models as callAI, but the reply arrives token by token, so
   Chat shows text as soon as the model starts answering instead of waiting for
   the whole response. `onDelta` gets each new piece; the full text is returned. */

/** Read a server-sent-events body, yielding each `data:` payload. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) yield line.slice(5).trimStart();
    }
  }
  if (buf.startsWith('data:')) yield buf.slice(5).trimStart();
}

/** Pull the text delta out of one SSE payload, for each provider's format. */
export function sseDelta(provider: Provider, payload: string): string {
  if (!payload || payload === '[DONE]') return '';
  try {
    const d = JSON.parse(payload);
    if (provider === 'anthropic') return d.type === 'content_block_delta' && d.delta?.type === 'text_delta' ? d.delta.text ?? '' : '';
    if (provider === 'gemini') return (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('');
    return d.choices?.[0]?.delta?.content ?? '';
  } catch { return ''; }
}

export async function callAIStream(
  messages: ChatMessage[],
  onDelta: (piece: string, soFar: string) => void,
  options: { systemPrompt?: string; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const active = getActiveProvider();
  if (!active) throw new Error('NO_KEY');
  const { provider, key } = active;
  const { systemPrompt, maxTokens = 1500, signal } = options;

  let url: string; let headers: Record<string, string>; let body: unknown;
  if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages';
    headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
    body = { model: 'claude-haiku-4-5', max_tokens: maxTokens, system: systemPrompt || 'You are a helpful assistant.', messages, stream: true };
  } else if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse';
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    body = {
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    };
  } else {
    const URLS: Record<string, string> = {
      openai: 'https://api.openai.com/v1/chat/completions', groq: 'https://api.groq.com/openai/v1/chat/completions',
      openrouter: 'https://openrouter.ai/api/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions',
    };
    const MODELS: Record<string, string> = { openai: 'gpt-4o-mini', groq: 'llama-3.3-70b-versatile', openrouter: 'openai/gpt-4o-mini', deepseek: 'deepseek-chat' };
    url = URLS[provider];
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    if (provider === 'openrouter') { headers['HTTP-Referer'] = window.location.origin; headers['X-Title'] = 'O-Zenith'; }
    body = { model: MODELS[provider], messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...messages], max_tokens: maxTokens, stream: true };
  }

  // No overall timeout (a long answer streams for a while) — but give up if the
  // first byte takes too long.
  const ctrl = new AbortController();
  signal?.addEventListener('abort', () => ctrl.abort());
  const firstByte = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(firstByte);
    if (e instanceof Error && e.name === 'AbortError') throw new Error(signal?.aborted ? 'Stopped.' : 'The AI provider took too long to respond. Please try again.', { cause: e });
    throw e;
  }
  clearTimeout(firstByte);
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: { message?: string } })?.error?.message || `${provider} error ${res.status}`);
  }
  let text = '';
  for await (const payload of readSSE(res.body)) {
    const piece = sseDelta(provider, payload);
    if (piece) { text += piece; onDelta(piece, text); }
  }
  if (!text) throw new Error('The AI provider returned an empty response. Please try again.');
  return text;
}

/* ── Text from any file Chat can read ── */
export const CHAT_ACCEPT = '.pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.rtf,text/plain,text/markdown,text/csv,text/html';

export async function extractFileText(file: File, maxChars = 12000): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return extractPdfText(file, maxChars);
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    if (file.size > MAX_READ_BYTES.docx) throw tooLarge(MAX_READ_BYTES.docx / 1048576);
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!value.trim()) throw new Error('This Word file has no text to read.');
    return value.trim().slice(0, maxChars);
  }
  // Plain text: read only the start, however big the file
  let text = await file.slice(0, MAX_READ_BYTES.text).text();
  if (name.endsWith('.html') || name.endsWith('.htm')) text = new DOMParser().parseFromString(text, 'text/html').body.textContent ?? '';
  if (name.endsWith('.rtf')) text = text.replace(/\\par[d]?/g, '\n').replace(/\{\\\*[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '');
  text = text.trim();
  if (!text) throw new Error('This file has no text to read.');
  return text.slice(0, maxChars);
}
