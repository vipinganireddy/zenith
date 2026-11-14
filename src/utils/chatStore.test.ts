// Self-check for saved Chat conversations.
//   node --test src/utils/chatStore.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
(globalThis as { window?: unknown }).window = { dispatchEvent: () => true };

const { saveChat, loadChats, getChat, deleteChats, titleFor } = await import('./chatStore.ts');

const chat = (id: string, updatedAt: number, question?: string) => ({
  id, title: '', createdAt: 1, updatedAt, activeDocId: null,
  docs: [{ id: 'd', name: 'report.pdf', text: 'x' }],
  messages: question ? [{ id: 'm', role: 'user' as const, content: question, ts: 1 }] : [],
});

test('conversations are saved, titled and listed newest first', () => {
  store.clear();
  saveChat(chat('a', 10, 'What is the total?'));
  saveChat(chat('b', 20));
  assert.deepEqual(loadChats().map(c => c.id), ['b', 'a']);
  assert.equal(getChat('a')?.title, 'What is the total?');
  assert.equal(getChat('b')?.title, 'report.pdf');      // no question yet: the file names it
});

test('saving again updates in place; delete removes only the chosen ones', () => {
  store.clear();
  saveChat(chat('a', 10, 'one')); saveChat(chat('b', 20)); saveChat(chat('a', 30, 'one'));
  assert.equal(loadChats().length, 2);
  deleteChats(['a']);
  assert.deepEqual(loadChats().map(c => c.id), ['b']);
});

test('titles: whitespace collapsed, long ones cut near 42 on a word, files-only uses the file', () => {
  const ask = (content: string) => titleFor({ docs: [], messages: [{ id: 'm', role: 'user', content, ts: 1 }] });
  assert.equal(ask('  what   is\n this? '), 'what is this?');
  const long = ask('Please summarise every payment term and late fee in this supplier contract');
  assert.equal(long, 'Please summarise every payment term and…');
  assert.ok(ask('x'.repeat(100)).length === 43);            // no space nearby: hard cut + …
  assert.equal(titleFor({ docs: [{ id: 'd', name: 'lease.pdf', text: '' }], messages: [] }), 'lease.pdf');
  assert.equal(titleFor({ docs: [], messages: [] }), 'New chat');
});

test('pin and rename stick, even when the conversation saves again', async () => {
  const { setPinned, renameChat } = await import('./chatStore.ts');
  store.clear();
  saveChat(chat('a', 10, 'first question'));
  setPinned('a', true); renameChat('a', 'Tax return');
  saveChat(chat('a', 20, 'first question'));
  assert.equal(getChat('a')?.title, 'Tax return');
  assert.equal(getChat('a')?.pinned, true);
  renameChat('a', '  ');                                 // an empty name keeps the old title
  assert.equal(getChat('a')?.title, 'Tax return');
});

test('a damaged entry is skipped, not allowed to wipe the rest', () => {
  store.clear();
  saveChat(chat('a', 10, 'keep me'));
  const key = [...store.keys()].find(k => k.startsWith('zenith_chats__'))!;
  store.set(key, JSON.stringify([...JSON.parse(store.get(key)!), null, { id: 5 }]));
  saveChat(chat('b', 20));
  assert.deepEqual(loadChats().map(c => c.id), ['b', 'a']);
});

test('unreadable storage is set aside, never overwritten', () => {
  store.clear();
  saveChat(chat('a', 10));
  const key = [...store.keys()].find(k => k.startsWith('zenith_chats__'))!;
  store.set(key, '{"broken":');
  saveChat(chat('b', 20));
  const backup = [...store.keys()].find(k => k.includes('__unreadable_'));
  assert.equal(backup && store.get(backup), '{"broken":');
});

test('chats belong to the signed-in account', () => {
  store.clear();
  store.set('zenith_session', JSON.stringify({ id: 'u1' }));
  saveChat(chat('mine', 10));
  store.set('zenith_session', JSON.stringify({ id: 'u2' }));
  assert.deepEqual(loadChats(), []);
  store.set('zenith_session', JSON.stringify({ id: 'u1' }));
  assert.deepEqual(loadChats().map(c => c.id), ['mine']);
  store.delete('zenith_session');
});

test('a save that does not fit reports failure and keeps what was stored', () => {
  store.clear();
  saveChat(chat('a', 10));
  const ls = (globalThis as unknown as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage;
  const real = ls.setItem;
  ls.setItem = () => { throw new Error('QuotaExceededError'); };
  try { assert.equal(saveChat(chat('b', 20)), false); } finally { ls.setItem = real; }
  assert.deepEqual(loadChats().map(c => c.id), ['a']);
  assert.equal(getChat('a')?.docs[0].text, 'x');
});
