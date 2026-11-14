/* ── Theme (appearance) ──────────────────────────────────────────────────────
   Single source of truth for appearance: 'light' | 'dark' | 'system'.
   Persisted in localStorage under `zenith_theme` (and backward-compatible `zenith_dark`).
   applyTheme() sets the <html data-theme="dark"|"light"> attribute
   and broadcasts a change so every mounted view stays in sync without prop-drilling. */

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_KEY = 'zenith_theme';
const LEGACY_KEY = 'zenith_dark';
const EVENT = 'zenith-theme-changed';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy === '0') return 'light';
    if (legacy === '1') return 'dark';
  } catch {
    // fallback if localStorage is restricted
  }
  return 'dark';
}

/** Check OS dark mode preference */
export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
}

/** Resolve 'system' to the concrete 'dark' or 'light' */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return getSystemTheme();
  return theme;
}

/** The browser/OS status bar follows the app's own theme, not just the system's. */
function syncThemeColor(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    m.removeAttribute('media');
    m.setAttribute('content', resolved === 'dark' ? '#030303' : '#F5F5F7');
  });
}

export const effectiveTheme = (): ResolvedTheme => {
  return resolveTheme(getTheme());
};

/** Re-apply the stored theme to the DOM without a broadcast. */
export function syncThemeToDom(): void {
  if (typeof document === 'undefined') return;
  const eff = effectiveTheme();
  document.documentElement.setAttribute('data-theme', eff);
  document.documentElement.classList.toggle('dark', eff === 'dark');
  document.documentElement.classList.toggle('light', eff === 'light');
  try {
    localStorage.setItem(LEGACY_KEY, eff === 'dark' ? '1' : '0');
  } catch {
    // ignore
  }
  syncThemeColor(eff);
}

/** Apply a theme now: update DOM + storage, then notify listeners. */
export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(LEGACY_KEY, resolveTheme(theme) === 'dark' ? '1' : '0');
  } catch {
    // ignore
  }
  syncThemeToDom();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: theme }));
  }
}

/** Legacy hook: safe no-op so theme persists across all pages including login */
export function lockLightTheme(): () => void {
  return () => {};
}

export const THEME_EVENT = EVENT;

// Register live system theme change listener
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handleSystemChange = () => {
    if (getTheme() === 'system') {
      syncThemeToDom();
      window.dispatchEvent(new CustomEvent<Theme>(EVENT, { detail: 'system' }));
    }
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handleSystemChange);
  } else if (typeof (mq as unknown as { addListener?: (fn: () => void) => void }).addListener === 'function') {
    (mq as unknown as { addListener: (fn: () => void) => void }).addListener(handleSystemChange);
  }
}
