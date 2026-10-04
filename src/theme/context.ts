import { createContext, useContext } from 'react';
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';
export interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
}
export const ThemeContext = createContext<ThemeContextValue | null>(null);
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme requires ThemeProvider');
  return value;
}
