import { useEffect, useState } from 'react';
import { getTheme, applyTheme, effectiveTheme, THEME_EVENT, type Theme, type ResolvedTheme } from '../utils/theme';

/**
 * Reactive theme state. Returns the current theme ('light' | 'dark' | 'system')
 * and a setter that applies it globally, plus the resolved theme ('light' | 'dark').
 */
export function useTheme(): [Theme, (t: Theme) => void, ResolvedTheme] {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(effectiveTheme);

  useEffect(() => {
    const onChange = () => {
      setTheme(getTheme());
      setResolved(effectiveTheme());
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  return [theme, applyTheme, resolved];
}
