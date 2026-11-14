import { useCallback } from 'react';

/* Imperative toast — one at a time, from any component, no provider needed.

   • One toast on screen: a new message replaces the current one (and restarts
     its timer) instead of stacking, so rapid actions never pile up.
   • Text is set with textContent, never innerHTML — messages include file and
     tool names, which are user-controlled.
   • Leading emoji in a message are dropped; the tinted icon disc carries the tone.
   • Sits just above the phone tab island when it is on screen; tap to dismiss.
   Styles: `.toast*` in index.css. */

type ToastType = 'success' | 'error' | 'info';

const ICONS: Record<ToastType, string> = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error:   '<path d="M12 8v5"/><path d="M12 16.5h.01"/>',
  info:    '<path d="M12 11v5"/><path d="M12 7.5h.01"/>',
};

// Messages that read as failures get the error tone even when the caller didn't say so
const LOOKS_LIKE_ERROR = /\b(fail|failed|error|couldn[’']?t|could not|didn[’']?t|invalid|expired|declined|rejected)\b/i;

let hideTimer: number | undefined;
let removeTimer: number | undefined;

function ensureToast(): { root: HTMLDivElement; icon: HTMLSpanElement; text: HTMLSpanElement } {
  let root = document.getElementById('app-toast') as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = 'app-toast';
    root.className = 'toast';
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'toast-text';
    root.append(icon, text);
    root.addEventListener('click', () => dismiss(root!));
    document.body.appendChild(root);
  }
  return { root, icon: root.querySelector('.toast-icon') as HTMLSpanElement, text: root.querySelector('.toast-text') as HTMLSpanElement };
}

function dismiss(root: HTMLElement) {
  window.clearTimeout(hideTimer);
  root.classList.remove('toast-show');
  window.clearTimeout(removeTimer);
  removeTimer = window.setTimeout(() => root.remove(), 260);
}

export function showToastMessage(message: string, type?: ToastType) {
  const tone: ToastType = type ?? (LOOKS_LIKE_ERROR.test(message) ? 'error' : 'success');
  const clean = message.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '').trim();

  const { root, icon, text } = ensureToast();
  window.clearTimeout(hideTimer);
  window.clearTimeout(removeTimer);

  root.dataset.tone = tone;
  root.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  root.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
  icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[tone]}</svg>`;
  text.textContent = clean;

  // Clear the phone tab island when it's showing
  root.classList.toggle('toast-above-island', !!document.querySelector('.tab-island'));

  // Replaying the entrance on replace gives a small "bump" instead of a new card
  root.classList.remove('toast-show');
  void root.offsetWidth;
  root.classList.add('toast-show');

  hideTimer = window.setTimeout(() => dismiss(root), tone === 'error' ? 4500 : 2600);
}

export function useToast() {
  const showToast = useCallback((message: string, type?: ToastType) => showToastMessage(message, type), []);
  return { showToast };
}
