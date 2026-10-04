import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemePreference } from './context';
export const THEME_STORAGE_KEY = 'vektor-theme';
const query = '(prefers-color-scheme: light)';
function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* Keep the in-memory choice usable when storage is restricted. */ }
  return 'system';
}
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
function systemSnapshot(): Theme {
  return window.matchMedia(query).matches ? 'light' : 'dark';
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, updatePreference] = useState<ThemePreference>(readPreference);
  const system = useSyncExternalStore<Theme>(subscribe, systemSnapshot, () => 'dark');
  const theme = preference === 'system' ? system : preference;
  const setPreference = useCallback((next: ThemePreference) => {
    updatePreference(next);
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* Persistence failure must not undo the user's selection. */ }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      try { if (event.storageArea && event.storageArea !== window.localStorage) return; } catch { /* Storage can also be denied during an external update. */ }
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        updatePreference(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const toggle = useCallback(() => setPreference(theme === 'light' ? 'dark' : 'light'), [setPreference, theme]);
  const value = useMemo(() => ({ theme, preference, setPreference, toggle }), [theme, preference, setPreference, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
