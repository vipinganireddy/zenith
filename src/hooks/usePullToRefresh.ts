import { useEffect, useRef, type RefObject } from 'react';

/* Pull to refresh for the app shell's scroll area (DashboardLayout <main>).

   Starts only when the page is scrolled to the very top and the finger isn't
   inside something that scrolls on its own (a chat thread, a list in a tool).
   The pull is damped, so it takes a deliberate, hard pull to pass the
   threshold; letting go short of it springs back without refreshing.

   Moves are applied straight to the DOM (no React render per frame), so the
   drag stays smooth. `content` follows the finger; `indicator` is the round
   spinner revealed above it. */

const THRESHOLD = 88;   // px of (damped) pull needed to refresh
const MAX = 128;        // the furthest the content travels
const HOLD = 56;        // where the content rests while refreshing

export function usePullToRefresh(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>,
  onRefresh: () => Promise<void> | void,
  enabled: boolean,
) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled) return;

    let startY = 0, startX = 0, pull = 0, tracking = false, decided = false, busy = false;

    const paint = (d: number, animate: boolean) => {
      const c = content.current, i = indicator.current;
      const t = animate ? 'transform 0.35s cubic-bezier(.2,.8,.2,1), opacity 0.35s' : 'none';
      if (c) { c.style.transition = t; c.style.transform = d ? `translateY(${d}px)` : ''; }
      if (i) {
        const p = Math.min(1, d / THRESHOLD);
        i.style.transition = t;
        i.style.opacity = String(p);
        i.style.transform = `translate(-50%, ${Math.min(d, MAX) / 2 - 20}px) rotate(${p * 270}deg) scale(${0.6 + 0.4 * p})`;
        i.dataset.ready = d >= THRESHOLD ? '1' : '';
      }
    };

    // Is the touch inside something that is itself scrolled down?
    const innerScrolled = (target: EventTarget | null) => {
      for (let n = target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight) return true;
      }
      return false;
    };

    // Drawing surfaces and anything that opts out handle their own drags
    const ownsDrag = (target: EventTarget | null) =>
      target instanceof Element && !!target.closest('canvas, [data-no-ptr], [style*="touch-action: none"]');

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1 || el.scrollTop > 0 || innerScrolled(e.target) || ownsDrag(e.target)) { tracking = false; return; }
      startY = e.touches[0].clientY; startX = e.touches[0].clientX;
      tracking = true; decided = false; pull = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dy = e.touches[0].clientY - startY, dx = e.touches[0].clientX - startX;
      if (!decided) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
        // Only a downward, mostly vertical drag from the top counts
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) { tracking = false; return; }
        decided = true;
      }
      // Pushed back above where it started: hand the gesture back to scrolling
      if (dy <= 0) { tracking = false; pull = 0; paint(0, true); return; }
      // Damped: the further you pull, the harder it gets
      pull = Math.min(MAX, dy * 0.45);
      if (e.cancelable) e.preventDefault();
      paint(pull, false);
    };

    const onEnd = async () => {
      if (!tracking) return;
      tracking = false;
      if (pull < THRESHOLD) { paint(0, true); pull = 0; return; }
      busy = true;
      paint(HOLD, true);
      indicator.current?.setAttribute('data-spinning', '1');
      try {
        await Promise.all([refreshRef.current(), new Promise(r => setTimeout(r, 650))]);
      } finally {
        indicator.current?.removeAttribute('data-spinning');
        paint(0, true);
        pull = 0;
        busy = false;
      }
    };

    // The system took the touch (a call, an edge swipe): spring back, never refresh
    const onCancel = () => { if (!tracking) return; tracking = false; pull = 0; paint(0, true); };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onCancel);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
      paint(0, false);
    };
  }, [scroller, content, indicator, enabled]);
}
