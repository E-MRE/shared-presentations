import { useTheme } from './context';
import './theme.css';
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç';
  return <button type="button" className="btn btn-ghost theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></> : <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>}
    </svg>
  </button>;
}
