import { useCallback, useSyncExternalStore } from 'react';

/**
 * Returns true when the viewport is at or below `breakpoint` px wide.
 * Tracks live via matchMedia so the layout re-renders on rotate/resize.
 * Use this to switch inline-style-driven components between the mobile and
 * desktop layouts (CSS media queries can't reach inline styles).
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
