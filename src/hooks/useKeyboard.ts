import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

/* On-screen keyboard state for phones.

   Native apps: @capacitor/keyboard (resize: 'body' in capacitor.config.ts)
   reports show/hide and the keyboard's height; `--vvh` becomes the space
   above it, and the web view itself stays full-screen so the app background
   fills the keyboard's rounded corners.
   Web: a focused text field on a touch phone counts as open, and `--vvh`
   follows the visual viewport (the area above the keyboard).

   While open, DashboardLayout hides the tab island (it belongs at the bottom
   of the screen, under the keyboard) and Chat collapses its header. */

const isTextField = (el: Element | null) =>
  !!el && (el.tagName === 'TEXTAREA'
    || (el as HTMLElement).isContentEditable
    || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'color', 'reset', 'image'].includes((el as HTMLInputElement).type)));

let open = false;
let nativeOpen = false;
let keyboardHeight = 0;   // native: reported by @capacitor/keyboard
const listeners = new Set<() => void>();
let started = false;
const native = Capacitor.isNativePlatform();

function set(next: boolean) {
  const vv = window.visualViewport;
  const visible = native ? window.innerHeight - (next ? keyboardHeight : 0) : (vv?.height ?? window.innerHeight);
  document.documentElement.style.setProperty('--vvh', `${Math.round(visible)}px`);
  // The keyboard's height: fixed bottom sheets lift by it, since the window
  // they're fixed to doesn't shrink when the keyboard opens
  document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - visible))}px`);
  if (next && native && window.scrollY) window.scrollTo(0, 0);
  if (next === open) return;
  open = next;
  document.documentElement.toggleAttribute('data-keyboard', open);
  listeners.forEach(l => l());
}

function updateWeb() {
  if (native) { set(nativeOpen); return; }
  set(isTextField(document.activeElement) && window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches);
  if (open && window.scrollY) window.scrollTo(0, 0);
}

function start() {
  if (started) return;
  started = true;
  if (native) {
    void import('@capacitor/keyboard').then(({ Keyboard }) => {
      Keyboard.addListener('keyboardWillShow', info => { nativeOpen = true; keyboardHeight = info.keyboardHeight; set(true); });
      Keyboard.addListener('keyboardDidShow', info => { keyboardHeight = info.keyboardHeight; set(true); });
      Keyboard.addListener('keyboardWillHide', () => { nativeOpen = false; set(false); });
    });
    window.addEventListener('resize', () => set(nativeOpen));
  } else {
    document.addEventListener('focusin', () => requestAnimationFrame(updateWeb));
    document.addEventListener('focusout', () => setTimeout(updateWeb, 50));
    window.visualViewport?.addEventListener('resize', updateWeb);
    window.addEventListener('resize', updateWeb);
  }
  updateWeb();
}

export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    cb => { start(); listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => open,
    () => false,
  );
}
