/* Saved Chat conversations, kept on this device (localStorage). Each holds its
   messages and the text of the files attached to it, so reopening a
   conversation carries on where it left off. */

export interface StoredMessage { id: string; role: 'user' | 'assistant'; content: string; ts: number }
export interface StoredDoc { id: string; name: string; text: string }
export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  docs: StoredDoc[];
  activeDocId: string | null;
  messages: StoredMessage[];
  pinned?: boolean;
  /** Set by Rename; otherwise the title follows the conversation. */
  customTitle?: string;
}

/** Legacy single store from before chats were kept per account. */
export const CHATS_STORAGE_KEY = 'zenith_chats';
export const CHATS_EVENT = 'zenith-chats-changed';

function currentUid(): string {
  try {
    const s = JSON.parse(localStorage.getItem('zenith_session') || 'null');
    return s?.id ? String(s.id) : 'guest';
  } catch { return 'guest'; }
}
/** Each account has its own chats, like its API keys and plan. */
const keyFor = (uid = currentUid()) => `${CHATS_STORAGE_KEY}__${uid}`;

const isConversation = (c: unknown): c is Conversation => {
  const x = c as Conversation | null;
  return !!x && typeof x.id === 'string' && Array.isArray(x.messages) && Array.isArray(x.docs) && typeof x.updatedAt === 'number';
};

/** Raw stored list, or null when what's stored can't be read (never overwrite that). */
function readRaw(): Conversation[] | null {
  const key = keyFor();
  let raw = localStorage.getItem(key);
  // One-time move of the legacy shared store into the first account that opens Chat
  if (raw === null && currentUid() !== 'guest') {
    const legacy = localStorage.getItem(CHATS_STORAGE_KEY);
    if (legacy !== null) {
      try { localStorage.setItem(key, legacy); localStorage.removeItem(CHATS_STORAGE_KEY); raw = legacy; } catch { /* keep legacy */ }
    }
  }
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('not a list');
    return parsed.filter(isConversation); // a damaged entry is skipped, not fatal
  } catch {
    // Keep the unreadable value aside so a later save can't destroy it
    try { localStorage.setItem(`${key}__unreadable_${Date.now()}`, raw); localStorage.removeItem(key); } catch { /* leave as is */ }
    return null;
  }
}

export function loadChats(): Conversation[] {
  return (readRaw() ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getChat = (id: string): Conversation | null => loadChats().find(c => c.id === id) ?? null;

/** Fired when a save didn't fit in storage; the UI tells the user. */
export const CHATS_FULL_EVENT = 'zenith-chats-full';

function write(chats: Conversation[]): boolean {
  try {
    localStorage.setItem(keyFor(), JSON.stringify(chats));
    window.dispatchEvent(new Event(CHATS_EVENT));
    return true;
  } catch {
    // Storage full: nothing is thrown away behind the user's back
    window.dispatchEvent(new Event(CHATS_FULL_EVENT));
    return false;
  }
}

/** A title from the conversation: the first question, else the first file. */
export function titleFor(c: Pick<Conversation, 'messages' | 'docs'>): string {
  const q = c.messages.find(m => m.role === 'user' && typeof m.content === 'string')?.content.replace(/\s+/g, ' ').trim();
  if (!q) return c.docs[0]?.name || 'New chat';
  if (q.length <= 42) return q;
  // Cut at 42, on a word boundary when one is close
  const cut = q.slice(0, 42);
  const space = cut.lastIndexOf(' ');
  return (space >= 30 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

/** Pinned first, then most recently active. */
export const sortChats = (chats: Conversation[]) =>
  [...chats].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt);

export function saveChat(c: Conversation): boolean {
  const all = loadChats();
  const prev = all.find(x => x.id === c.id);
  // Pin and rename are set from the list; a save from the conversation keeps them
  const pinned = c.pinned ?? prev?.pinned;
  const customTitle = c.customTitle ?? prev?.customTitle;
  const createdAt = prev?.createdAt ?? c.createdAt;
  return write([{ ...c, createdAt, pinned, customTitle, title: customTitle || titleFor(c) }, ...all.filter(x => x.id !== c.id)]);
}

function patch(id: string, change: (c: Conversation) => Conversation) {
  const all = loadChats();
  if (all.some(c => c.id === id)) write(all.map(c => (c.id === id ? change(c) : c)));
}
export const setPinned = (id: string, pinned: boolean) => patch(id, c => ({ ...c, pinned }));
/** An empty name keeps the current title. */
export const renameChat = (id: string, name: string) => patch(id, c => {
  const customTitle = name.trim().slice(0, 60);
  return customTitle ? { ...c, customTitle, title: customTitle } : c;
});

export function deleteChats(ids: string[]): void {
  const drop = new Set(ids);
  const all = loadChats();
  if (all.some(c => drop.has(c.id))) write(all.filter(c => !drop.has(c.id)));
}

export const newChatId = () => (crypto.randomUUID?.() ?? `c${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
