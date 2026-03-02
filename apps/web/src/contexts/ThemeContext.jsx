import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { ThemeContext } from './theme-context';

const STORAGE_KEY = 'diless-theme-preference';
const DEFAULT_THEME = 'system';
const THEME_ORDER = ['system', 'light', 'dark'];

function getInitialThemePreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (THEME_ORDER.includes(stored)) return stored;
  } catch {
    // Ignore storage failures
  }

  return DEFAULT_THEME;
}

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(themePreference) {
  return themePreference === 'system' ? getSystemTheme() : themePreference;
}

function applyThemeAttributes(themePreference, resolvedTheme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = themePreference;
  root.dataset.resolvedTheme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState(getInitialThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getInitialThemePreference()));

  useLayoutEffect(() => {
    const nextResolvedTheme = resolveTheme(themePreference);
    setResolvedTheme((current) => (current === nextResolvedTheme ? current : nextResolvedTheme));
    applyThemeAttributes(themePreference, nextResolvedTheme);
  }, [themePreference]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, themePreference);
    } catch {
      // Ignore storage failures
    }
  }, [themePreference]);

  useEffect(() => {
    if (themePreference !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateResolvedTheme = () => {
      const nextResolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      setResolvedTheme(nextResolvedTheme);
      applyThemeAttributes('system', nextResolvedTheme);
    };

    updateResolvedTheme();

    const listener = () => updateResolvedTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themePreference]);

  const cycleTheme = useCallback(() => {
    setThemePreference((current) => {
      const currentIndex = THEME_ORDER.indexOf(current);
      const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
      return THEME_ORDER[nextIndex];
    });
  }, []);

  const value = useMemo(() => ({
    themePreference,
    resolvedTheme,
    setThemePreference,
    cycleTheme,
  }), [cycleTheme, resolvedTheme, themePreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
