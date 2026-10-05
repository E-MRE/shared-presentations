import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LibraryPage, MyDecksPage } from '../../src/features/library';
import { AdminPage, PendingBadge, usePendingCount } from '../../src/features/admin';
import { AppLayout } from '../../src/layout';
import { ThemeProvider, ThemeToggle, useTheme } from '../../src/theme';
import { authState, emitCount, emitError, fixtureDependencies, flags, metrics, release, resetDecks } from './fixtures';
import '../../src/styles/index.css';
export interface HarnessController {
  auth(role: string): void; screen(value: string): void; mount(value: boolean): void; replace(): void;
  flags(value: Partial<typeof flags>): void; release(kind: 'reads' | 'mutations'): void;
  reset(mode?: string): void; count(value: number): void; countError(): void; theme(value: 'light' | 'dark'): void;
}
declare global { interface Window { library: HarnessController; libraryMetrics: typeof metrics; } }
function Harness() {
  const { setPreference } = useTheme();
  const [role,setRole] = useState('unauthenticated');
  const [screen,setScreen] = useState('library');
  const [mounted,setMounted] = useState(true);
  const [version,setVersion] = useState(0);
  const dependencies = useMemo(() => fixtureDependencies(), [version]);
  const auth = authState(role);
  // This test composition shows the typed hook -> frozen Header.pendingCount wiring.
  const count = usePendingCount(screen === 'admin' && mounted ? auth : authState('unauthenticated'), dependencies.adapter);
  window.library = { auth: value => flushSync(() => setRole(value)), screen: value => flushSync(() => setScreen(value)), mount: value => flushSync(() => setMounted(value)), replace: () => flushSync(() => setVersion(value => value+1)), flags: value => Object.assign(flags,value), release, reset: resetDecks, count: emitCount, countError: emitError, theme: value => flushSync(() => setPreference(value)) };
  window.libraryMetrics = metrics;
  return <AppLayout auth={screen === 'badge' && auth.status === 'authenticated' ? {...auth, isAdmin: false} : auth} pendingCount={count.count ?? undefined} onSignIn={() => setRole('member')} onSignOut={() => setRole('unauthenticated')} actions={<ThemeToggle/>}>{count.error && <div className="main-content" role="alert"><p>{count.error}</p><button className="btn btn-secondary" onClick={count.retry}>Sayımı yeniden dene</button></div>}{mounted && (screen === 'library' ? <LibraryPage auth={auth} service={dependencies.service}/> : screen === 'my' ? <MyDecksPage auth={auth} service={dependencies.service}/> : screen === 'badge' ? <PendingBadge auth={auth} adapter={dependencies.adapter}/> : <AdminPage auth={auth} {...dependencies} showPendingBadge={false}/>)}</AppLayout>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><ThemeProvider><Harness/></ThemeProvider></BrowserRouter>);
