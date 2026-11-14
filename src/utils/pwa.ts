/* Installable-app plumbing: service worker registration, the "Install app"
   prompt, and the "Update available" flow. Exposed as a tiny store so React
   components can subscribe with useSyncExternalStore. */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** Android/desktop Chrome & Edge: the browser's own install dialog is available. */
  canPrompt: boolean;
  /** Running as an installed app (home-screen icon, no browser chrome). */
  standalone: boolean;
  /** iPhone/iPad Safari: installing is manual (Share → Add to Home Screen). */
  ios: boolean;
  /** A new version has been downloaded and is waiting to take over. */
  updateReady: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS reports as a Mac

/** Launched from a home-screen icon (installed PWA). */
export const isStandaloneLaunch = () => isStandalone();

/** True inside the Capacitor iOS/Android wrapper (files are bundled; no SW, no install prompt). */
export const isNativeApp = () => !!(window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

let state: PwaState = { canPrompt: false, standalone: false, ios: false, updateReady: false };
const set = (patch: Partial<PwaState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

export const pwaStore = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => state,
};

/** Opens the browser's install dialog (Android / desktop). Resolves true if installed. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  set({ canPrompt: false });
  return outcome === 'accepted';
}

/** Activates the waiting version; the page reloads once it has taken control. */
export function applyUpdate() {
  if (!waiting) { window.location.reload(); return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage('SKIP_WAITING');
}

export function initPwa() {
  set({ standalone: isStandalone(), ios: isIOS() && !isNativeApp() });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => set({ standalone: isStandalone() }));

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // we show our own button instead of the mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => { deferred = null; set({ canPrompt: false, standalone: true }); });

  // Development serves modules unbundled — a service worker there only gets in the way.
  if (!import.meta.env.PROD || isNativeApp() || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const track = (sw: ServiceWorker | null) => {
        if (!sw) return;
        const check = () => {
          // "installed" with an existing controller = an update, not the first install.
          if (sw.state === 'installed' && navigator.serviceWorker.controller) { waiting = sw; set({ updateReady: true }); }
        };
        sw.addEventListener('statechange', check);
        check();
      };
      track(reg.waiting);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // Long-lived installed apps rarely reload: look for a new version hourly.
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch { /* offline support is a bonus; the app works without it */ }
  });
}
