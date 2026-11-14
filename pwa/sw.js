/* O-Zenith service worker — offline support for the installed app.
   Built by the `serviceWorker` plugin in vite.config.ts, which replaces the two
   placeholders below with the build version and the app-shell file list.

   Strategy
   - App shell (index.html, entry JS/CSS, icons) is precached on install.
   - Page navigations: network first (so updates arrive), cached shell offline.
   - /assets/* are content-hashed and immutable: cache first, filled on use, so
     each tool works offline once it has been opened.
   - Fonts and the OCR / qpdf assets on CDNs: stale-while-revalidate.
   - Everything else (Google sign-in, Drive, AI APIs) goes straight to network.
   No user files ever pass through here — tools run on files in memory. */

const VERSION = '__SW_VERSION__';
const PRECACHE = __SW_PRECACHE__;
const SHELL = `ozenith-shell-${VERSION}`;
const RUNTIME = 'ozenith-runtime-v1';
const CDN = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|tessdata\.projectnaptha\.com)\//;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)));
});

// The page asks for activation when the user accepts the "Update available" prompt.
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('ozenith-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put('/index.html', response.clone());
    return response;
  } catch {
    return (await caches.match('/index.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(RUNTIME)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then(response => { if (response.ok || response.type === 'opaque') cache.put(request, response.clone()); return response; })
    .catch(() => hit);
  return hit || refresh;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/__qa')) return;
    if (request.mode === 'navigate') { event.respondWith(networkFirstShell(request)); return; }
    if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request)); return; }
    if (/\.(png|svg|webmanifest|woff2?|ttf|wasm)$/.test(url.pathname)) { event.respondWith(staleWhileRevalidate(request)); return; }
    return;
  }
  if (CDN.test(request.url)) event.respondWith(staleWhileRevalidate(request));
});
