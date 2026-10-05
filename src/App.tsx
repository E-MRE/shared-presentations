/* eslint-disable react-refresh/only-export-components -- The typed external store is also the deterministic test seam. */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { FirebaseAuthService, mapFirebaseUserToAuthUser, mapAuthError } from './auth/service';
import { AuthContext, type AuthContextValue } from './auth/authContext';
import { checkIsAdmin, clearAdminCache } from './auth/admin';
import { closeAllListeners, registerListener } from './auth/listenerManager';
import type { AuthState, AuthUser } from './contracts/auth';
import { AppErrorCode } from './contracts/errors';
import { err, ok, type Result, type PresentationDataService } from './contracts/services';
import { FirestorePresentationDataService } from './data/service';
import { createFirestoreAdminAdapter, type AdminReadAdapter } from './features/admin/adapter';
import { usePendingCount } from './features/admin/usePendingCount';
import { Modal } from './components';
import { AppLayout } from './layout';
import { ThemeToggle } from './theme';
import { ApplicationRouter } from './routing/Router';

const visitor: AuthState = { status: 'unauthenticated', user: null, isAdmin: false, isMember: false };
const loading: AuthState = { status: 'loading', user: null, isAdmin: false, isMember: false };
const stale = () => err({ code: AppErrorCode.UNAUTHENTICATED, message: 'Oturum değişti. Yeniden deneyin.' });
export interface ApplicationAuthDependencies {
  service: Pick<FirebaseAuthService, 'signInWithGoogle' | 'signInWithEmail' | 'signUpWithEmail' | 'sendVerificationEmail' | 'reloadUser' | 'sendPasswordReset' | 'signOut'>;
  currentUser: () => User | null;
  observe: (callback: (user: User | null) => void) => () => void;
  resolveAdmin: (uid: string) => Promise<boolean>;
  watchAdmin?: (uid: string, callback: (admin: boolean) => void) => () => void;
}
/** State is committed before notifying React or any feature service getter. */
export class ApplicationAuthStore {
  private state: AuthState = loading;
  private listeners = new Set<() => void>();
  private generation = 0;
  private action = 0;
  private locked = false;
  private cancelledLogin = false;
  private loginPending = false;
  private lastError = "";
  constructor(private dependencies: ApplicationAuthDependencies) {}
  getSnapshot = () => this.state;
  getError = () => this.lastError;
  getMember = (): AuthUser | null => this.state.status === 'authenticated' && this.dependencies.currentUser()?.uid === this.state.user.uid && !this.cancelledLogin ? this.state.user : null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: AuthState) {
    if (this.state.user?.uid !== next.user?.uid || this.state.status !== next.status || this.state.isAdmin !== next.isAdmin) closeAllListeners();
    this.state = next;
    this.listeners.forEach(listener => listener());
  }
  private current(user: User, generation: number) { return generation === this.generation && this.dependencies.currentUser() === user && !this.cancelledLogin; }
  private async resolve(user: User, generation: number): Promise<Result<AuthUser>> {
    try {
      const token = await user.getIdTokenResult(true);
      if (!this.current(user, generation)) return stale();
      const google = token.signInProvider === 'google.com';
      const member = google || token.claims.email_verified === true;
      const mapped = mapFirebaseUserToAuthUser(user);
      const base = { ...mapped, isGoogle: google, isEmailVerified: token.claims.email_verified === true, isMember: member, isAdmin: false };
      if (!member) {
        this.publish({ status: 'unverified', user: base, isAdmin: false, isMember: false });
        return ok(base);
      }
      const admin = await this.dependencies.resolveAdmin(user.uid);
      if (!this.current(user, generation)) return stale();
      const confirmed = { ...base, isAdmin: admin };
      this.publish({ status: 'authenticated', user: confirmed, isAdmin: admin, isMember: true });
      return ok(confirmed);
    } catch (error) {
      if (this.current(user, generation)) { this.lastError = mapAuthError(error).message; this.publish({ ...visitor }); }
      return err(mapAuthError(error));
    }
  }
  connectRole = () => {
    const user = this.dependencies.currentUser(), generation = this.generation;
    if (!user || !this.getMember() || !this.dependencies.watchAdmin) return () => {};
    return registerListener(this.dependencies.watchAdmin(user.uid, role => {
      if (!this.current(user, generation) || this.state.status !== 'authenticated' || this.state.isAdmin === role) return;
      this.publish({ ...this.state, user: { ...this.state.user, isAdmin: role }, isAdmin: role });
    }), true);
  };
  start = () => {
    const stop = this.dependencies.observe(user => {
      const generation = ++this.generation;
      clearAdminCache(); this.lastError = "";
      if (!user || this.cancelledLogin) { this.publish(visitor); return; }
      this.publish(loading);
      void this.resolve(user, generation);
    });
    return () => { ++this.generation; ++this.action; stop(); closeAllListeners(); };
  };
  private async run<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    if (this.locked) return err({ code: AppErrorCode.INVALID_ARGUMENT, message: 'Bir işlem zaten devam ediyor.' });
    this.locked = true;
    const action = ++this.action;
    try {
      const result = await operation();
      return action === this.action ? result : stale();
    } catch (error) { return err(mapAuthError(error)); }
    finally { this.locked = false; }
  }
  private async login(operation: () => Promise<Result<AuthUser>>) {
    return this.run(async () => {
      this.loginPending = true;
      const action = this.action;
      const result = await operation();
      this.loginPending = false;
      if (action !== this.action && this.cancelledLogin) {
        // Quarantine the cancelled transport before any later login may begin.
        if (result.ok && this.dependencies.currentUser()?.uid === result.value.uid) await this.dependencies.service.signOut();
        this.cancelledLogin = false;
        return stale();
      }
      if (result.ok && this.dependencies.currentUser()?.uid !== result.value.uid) return stale();
      return result;
    });
  }
  actions: Omit<AuthContextValue, 'state'> = {
    signInWithGoogle: () => this.login(() => this.dependencies.service.signInWithGoogle()),
    signInWithEmail: credentials => this.login(() => this.dependencies.service.signInWithEmail(credentials)),
    signUpWithEmail: credentials => this.login(() => this.dependencies.service.signUpWithEmail(credentials)),
    sendPasswordReset: email => this.run(() => this.dependencies.service.sendPasswordReset(email)),
    sendVerificationEmail: () => this.run(async () => {
      const user = this.dependencies.currentUser(), generation = this.generation;
      if (!user) return stale();
      const result = await this.dependencies.service.sendVerificationEmail(user);
      return this.current(user, generation) ? result : stale();
    }),
    reloadUser: () => this.run(async () => {
      const user = this.dependencies.currentUser(), generation = this.generation;
      if (!user) return stale();
      this.publish(loading);
      const result = await this.dependencies.service.reloadUser(user);
      if (!this.current(user, generation)) return stale();
      if (!result.ok) { this.lastError = result.error.message; await this.resolve(user, generation); return result; }
      return this.resolve(user, generation);
    }),
    signOut: async () => {
      ++this.action; ++this.generation;
      this.cancelledLogin = this.loginPending;
      clearAdminCache(); this.publish(visitor);
      try { const result = await this.dependencies.service.signOut(); if (!result.ok) { this.lastError = result.error.message; this.publish({ ...visitor }); } return result; } catch (error) { this.lastError = mapAuthError(error).message; this.publish({ ...visitor }); return err(mapAuthError(error)); }
    },
  };
}
export interface ApplicationDependencies { auth: ApplicationAuthStore; service: PresentationDataService; adapter: AdminReadAdapter; }
export function createProductionDependencies(): ApplicationDependencies {
  const store = new ApplicationAuthStore({
    service: new FirebaseAuthService(auth, db), currentUser: () => auth.currentUser,
    observe: callback => onAuthStateChanged(auth, callback), resolveAdmin: uid => checkIsAdmin(db, uid, true),
    watchAdmin: (uid, callback) => onSnapshot(doc(db, 'admins', uid), snapshot => callback(snapshot.exists() && snapshot.data()?.active !== false), () => callback(false)),
  });
  return { auth: store, service: new FirestorePresentationDataService({ auth, db, getCurrentUser: store.getMember }), adapter: createFirestoreAdminAdapter({ db, getAuthState: store.getSnapshot }) };
}
export function App({ dependencies }: { dependencies?: ApplicationDependencies }) {
  const [runtime] = useState(() => dependencies ?? createProductionDependencies());
  const state = useSyncExternalStore(runtime.auth.subscribe, runtime.auth.getSnapshot, runtime.auth.getSnapshot);
  useEffect(() => runtime.auth.start(), [runtime]);
  const location = useLocation();
  const session = `${location.pathname}:${state.status}:${state.user?.uid ?? ''}:${state.isAdmin}`;
  return <AuthContext.Provider value={{ ...runtime.auth.actions, state }}><RouteLifetime key={session} runtime={runtime} state={state}/></AuthContext.Provider>;
}
function RouteLifetime({ runtime, state }: { runtime: ApplicationDependencies; state: AuthState }) {
  useLayoutEffect(() => { const stop = runtime.auth.connectRole(); return () => { stop(); closeAllListeners(); }; }, [runtime]);
  const count = usePendingCount(state, runtime.adapter);
  const [dialog, setDialog] = useState<'login' | 'signup' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useLayoutEffect(() => () => { alive.current = false; }, []);
  async function action(operation: () => Promise<Result<unknown>>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await operation();
      if (!alive.current) return;
      if (result.ok) setMessage(success); else setError(result.error.message);
    } catch { if (alive.current) setError('İşlem tamamlanamadı. Yeniden deneyin.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const location = useLocation();
  const member = state.status === 'authenticated' && state.isMember && state.user.isMember;
  const viewer = member && /^\/s\/[^/]+$/.test(location.pathname);
  const gates = <section className="main-content" style={{ maxWidth: 640, margin: '48px auto', padding: 24 }}>
    <h1>{state.status === 'loading' ? 'Oturum kontrol ediliyor…' : state.status === 'unverified' ? 'E-posta adresinizi doğrulayın' : 'Ekibin sunumları burada'}</h1>
    <p>{state.status === 'unverified' ? 'Doğrulama bağlantısını açtıktan sonra oturumunuzu yenileyin. İlk doğrulama iletisinin teslimi kontrol edilmelidir.' : 'Sunum arşivini görmek ve ekiple paylaşmak için giriş yapın.'}</p>
    {state.status === 'unauthenticated' && <button className="btn btn-primary" onClick={() => setDialog('login')}>Giriş Yap</button>}
    {state.status === 'unverified' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}><button className="btn btn-primary" disabled={busy} onClick={() => void action(runtime.auth.actions.sendVerificationEmail, 'Doğrulama e-postası gönderildi.')}>Doğrulama e-postasını yeniden gönder</button><button className="btn btn-secondary" disabled={busy} onClick={() => void action(runtime.auth.actions.reloadUser, 'Oturum yenilendi.')}>Doğruladım, yeniden kontrol et</button></div>}
  </section>;
  const contents = member ? <ApplicationRouter auth={state} service={runtime.service} adapter={runtime.adapter}/> : gates;
  return <>
    {viewer ? contents : <AppLayout auth={state} onSignIn={() => setDialog('login')} onSignOut={() => void action(runtime.auth.actions.signOut, 'Çıkış yapıldı.')} pendingCount={count.count ?? undefined} actions={<ThemeToggle/>} footer={<span className="footer-meta" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>Vektör · Ekip sunum arşivi</span>}>{contents}{runtime.auth.getError() && <p role="alert" className="main-content">{runtime.auth.getError()}</p>}{count.error && <div role="alert" className="main-content">{count.error} <button className="btn btn-secondary" onClick={count.retry}>Sayacı yeniden dene</button></div>}{error && <p role="alert" className="main-content">{error}</p>}{message && <p role="status" className="main-content">{message}</p>}</AppLayout>}
    <AuthenticationDialog mode={dialog} close={() => setDialog(null)} change={setDialog} actions={runtime.auth.actions}/>
  </>;
}
function AuthenticationDialog({ mode, close, change, actions }: { mode: 'login' | 'signup' | 'reset' | null; close: () => void; change: (mode: 'login' | 'signup' | 'reset') => void; actions: Omit<AuthContextValue, 'state'> }) {
  const email = useRef<HTMLInputElement>(null), lock = useRef(false), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  useLayoutEffect(() => () => { alive.current = false; }, []);
  async function run(operation: () => Promise<Result<unknown>>, success: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await operation(); if (!alive.current) return; if (result.ok) setMessage(success); else setError(result.error.message); }
    catch { if (alive.current) setError('İşlem tamamlanamadı. Yeniden deneyin.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const address = String(data.get('email') ?? '');
    void run(() => mode === 'reset' ? actions.sendPasswordReset(address) : mode === 'signup' ? actions.signUpWithEmail({ email: address, password: String(data.get('password')), displayName: String(data.get('name')) }) : actions.signInWithEmail({ email: address, password: String(data.get('password')) }), mode === 'reset' ? 'Şifre sıfırlama isteği tamamlandı. E-posta kutunuzu kontrol edin.' : mode === 'signup' ? 'Hesabınız oluşturuldu. E-posta doğrulamasını kontrol edin.' : 'Oturum kontrol ediliyor…');
  }
  return <Modal open={!!mode} title={mode === 'signup' ? 'Hesap oluştur' : mode === 'reset' ? 'Şifrenizi sıfırlayın' : 'Vektör’e giriş yapın'} onClose={() => { if (!busy) close(); }} initialFocus={email}>
    <form onSubmit={submit}>
      {mode === 'signup' && <div className="form-group"><label className="form-label" htmlFor="auth-name">Ad soyad</label><input className="form-input" id="auth-name" name="name" autoComplete="name" required disabled={busy}/></div>}
      <div className="form-group"><label className="form-label" htmlFor="auth-email">E-posta</label><input ref={email} className="form-input" id="auth-email" name="email" type="email" autoComplete="email" required disabled={busy}/></div>
      {mode !== 'reset' && <div className="form-group"><label className="form-label" htmlFor="auth-password">Şifre</label><input className="form-input" id="auth-password" name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={6} required disabled={busy}/></div>}
      {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'İşleniyor…' : mode === 'signup' ? 'Hesap oluştur' : mode === 'reset' ? 'Sıfırlama bağlantısı gönder' : 'E-posta ile giriş yap'}</button>
    </form>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
      {mode === 'login' && <><button className="btn btn-secondary" disabled={busy} onClick={() => void run(actions.signInWithGoogle, 'Oturum kontrol ediliyor…')}>Google ile giriş yap</button><button className="btn btn-ghost" disabled={busy} onClick={() => { setError(''); setMessage(''); change('signup'); }}>Hesap oluştur</button><button className="btn btn-ghost" disabled={busy} onClick={() => { setError(''); setMessage(''); change('reset'); }}>Şifremi unuttum</button></>}
      {mode !== 'login' && <button className="btn btn-ghost" disabled={busy} onClick={() => { setError(''); setMessage(''); change('login'); }}>Girişe dön</button>}
    </div>
  </Modal>;
}
