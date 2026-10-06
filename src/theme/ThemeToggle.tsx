import { useMenuDismiss } from '../components/useMenuDismiss';
import { useTheme } from './context';
import './theme.css';
export function ThemeToggle() {
  const menu = useMenuDismiss();
  const { theme, preference, toggle, setPreference } = useTheme();
  return <details ref={menu} className="vektor-theme-controls"><summary aria-label="Tema seçenekleri"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/></svg></summary><div className="theme-menu-panel">
    <button type="button" className="btn btn-ghost" onClick={toggle} aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg>
      <span>{theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>
    </button>
    <button type="button" className="btn btn-ghost" aria-pressed={preference === 'system'} onClick={() => setPreference('system')}>Sistem teması</button>
  </div></details>;
}
