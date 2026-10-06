/* eslint-disable react-refresh/only-export-components -- The typed external store is also the deterministic test seam. */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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
import { clearDeckPageCache } from './features/library/useDeckPages';
import { RouteScroll } from './routing/RouteScroll';
import { NavigationGuard } from './features/editor/useUnsavedChanges';
import { VerificationActions } from './auth/VerificationActions';
import { AuthenticationDialog } from './auth/AuthenticationDialog';
import { StateIllustration } from './components/StatePanel';
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
  private verification = new Map<string, AuthUser['verificationDispatch']>();
  constructor(private dependencies: ApplicationAuthDependencies) {}
  getSnapshot = () => this.state;
  getError = () => this.lastError;
  getMember = (): AuthUser | null => this.state.status === 'authenticated' && this.dependencies.currentUser()?.uid === this.state.user.uid && !this.cancelledLogin ? this.state.user : null;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(next: AuthState) {
    if (this.state.user?.uid !== next.user?.uid || this.state.status !== next.status || this.state.isAdmin !== next.isAdmin) { closeAllListeners(); clearDeckPageCache(); }
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
      const base = { ...mapped, verificationDispatch: this.verification.get(user.uid), isGoogle: google, isEmailVerified: token.claims.email_verified === true, isMember: member, isAdmin: false };
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
      if (result.ok && result.value.verificationDispatch) {
        this.verification.set(result.value.uid, result.value.verificationDispatch);
        if (this.state.status === 'unverified' && this.state.user.uid === result.value.uid) this.publish({ ...this.state, user: { ...this.state.user, verificationDispatch: result.value.verificationDispatch } });
      }
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
      const retryAt = this.verification.get(user.uid)?.retryAt ?? 0;
      if (retryAt > Date.now()) return err({ code: AppErrorCode.QUOTA_EXCEEDED, message: 'Yeni gönderim için bir dakika bekleyin.' });
      const result = await this.dependencies.service.sendVerificationEmail(user);
      if (!this.current(user, generation)) return stale();
      if (result.ok) {
        const dispatch = { sent: true, retryAt: Date.now() + 60_000, message: 'Gönderim isteği kabul edildi. Gelen kutunuzu ve spam klasörünüzü kontrol edin.' };
        this.verification.set(user.uid, dispatch);
        if (this.state.status === 'unverified') this.publish({ ...this.state, user: { ...this.state.user, verificationDispatch: dispatch } });
      }
      return result;
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
      clearAdminCache(); this.verification.clear(); this.publish(visitor);
      try { const result = await this.dependencies.service.signOut(); if (!result.ok) { this.lastError = result.error.message; this.publish({ ...visitor }); } return result; } catch (error) { this.lastError = mapAuthError(error).message; this.publish({ ...visitor }); return err(mapAuthError(error)); }
    },
  };
}
export interface ApplicationDependencies { auth: ApplicationAuthStore; service: PresentationDataService; adapter: AdminReadAdapter; }
export function createProductionDependencies(): ApplicationDependencies {
  const store = new ApplicationAuthStore({
    service: new FirebaseAuthService(auth, db), currentUser: () => auth.currentUser,
    observe: callback => onAuthStateChanged(auth, callback), resolveAdmin: uid => checkIsAdmin(db, uid, true),
    watchAdmin: (uid, callback) => onSnapshot(doc(db, 'admins', uid), snapshot => callback(snapshot.exists() && (snapshot.data()?.active === undefined || snapshot.data()?.active === true)), () => callback(false)),
  });
  return { auth: store, service: new FirestorePresentationDataService({ auth, db, getCurrentUser: store.getMember }), adapter: createFirestoreAdminAdapter({ db, getAuthState: store.getSnapshot }) };
}
export function App({ dependencies }: { dependencies?: ApplicationDependencies }) {
  const [runtime] = useState(() => dependencies ?? createProductionDependencies());
  const state = useSyncExternalStore(runtime.auth.subscribe, runtime.auth.getSnapshot, runtime.auth.getSnapshot);
  useEffect(() => runtime.auth.start(), [runtime]);
  return <NavigationGuard><AuthContext.Provider value={{ ...runtime.auth.actions, state }}><RouteScroll/><RouteLifetime runtime={runtime} state={state}/></AuthContext.Provider></NavigationGuard>;
}
function RouteLifetime({ runtime, state }: { runtime: ApplicationDependencies; state: AuthState }) {
  useLayoutEffect(() => { const stop = runtime.auth.connectRole(); return () => { stop(); closeAllListeners(); }; }, [runtime, state.status, state.user?.uid, state.isAdmin]);
  const count = usePendingCount(state, runtime.adapter);
  const [dialog, setDialog] = useState<'login' | 'signup' | 'reset' | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const alive = useRef(true), lock = useRef(false);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
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
  async function finishLogin(operation: () => Promise<Result<AuthUser>>) { const result = await operation(); if (result.ok && alive.current) setDialog(null); return result; }
  const dialogActions = { ...runtime.auth.actions,
    signInWithGoogle: () => finishLogin(runtime.auth.actions.signInWithGoogle),
    signInWithEmail: (credentials: Parameters<AuthContextValue['signInWithEmail']>[0]) => finishLogin(() => runtime.auth.actions.signInWithEmail(credentials)),
    signUpWithEmail: (credentials: Parameters<AuthContextValue['signUpWithEmail']>[0]) => finishLogin(() => runtime.auth.actions.signUpWithEmail(credentials)),
  };
  const location = useLocation();
  const member = state.status === 'authenticated' && state.isMember && state.user.isMember;
  const viewer = member && /^\/s\/[^/]+$/.test(location.pathname);
  const gates = <section className="welcome-gate">
    <div className="welcome-copy"><span className="welcome-eyebrow">EKİBİN BİLGİ ALANI</span>
    <h1>{state.status === 'loading' ? 'Oturum kontrol ediliyor…' : state.status === 'unverified' ? 'E-posta adresinizi doğrulayın' : <>İyi fikirler<br/><span>paylaşılmayı hak eder.</span></>}</h1>
    <p>{state.status === 'unverified' ? `${state.user.email} adresine gelen bağlantıyı açın. Sonra buradan doğrulamayı kontrol edin.` : 'Sunumlarını bir araya getir. Ekibinin deneyiminden öğren, kendi bildiklerinle ilham ver.'}</p>
    {state.status === 'unauthenticated' && <div className="welcome-actions"><button className="btn btn-primary" onClick={() => setDialog('login')}>Giriş Yap</button><button className="btn btn-secondary" onClick={() => setDialog('signup')}>Hesap oluştur</button></div>}
    {state.status === 'unverified' && <>{!error && <p className="auth-feedback" role={state.user.verificationDispatch?.sent === false ? 'alert' : 'status'}>{state.user.verificationDispatch?.message || 'İleti görünmüyorsa spam klasörünü kontrol edin veya yeni bir gönderim isteyin.'}</p>}<VerificationActions busy={busy} retryAt={state.user.verificationDispatch?.retryAt} resend={() => void action(runtime.auth.actions.sendVerificationEmail, '')} reload={() => void action(runtime.auth.actions.reloadUser, 'Doğrulama henüz görünmüyor. E-postadaki bağlantıyı açtıktan sonra tekrar kontrol edin.')}/></>}
    {state.status === 'unverified' && message && <p role="status" className="auth-feedback">{message}</p>}
    {state.status === 'unauthenticated' && <div className="welcome-details"><span>HTML & PowerPoint</span><span>Yalnızca ekip üyeleri</span><span>Tek bir arşiv</span></div>}</div><div className="welcome-visual"><StateIllustration kind={state.status === 'unverified' ? 'mail' : state.status === 'loading' ? 'loading' : 'empty'}/><span>Bir sunum. Yeni bir bakış açısı.</span></div>
  </section>;
  const contents = member ? <ApplicationRouter auth={state} service={runtime.service} adapter={runtime.adapter}/> : gates;
  return <>
    {viewer ? contents : <AppLayout auth={state} onSignIn={undefined} onSignOut={() => { setDialog(null); void action(runtime.auth.actions.signOut, ''); }} pendingCount={count.count ?? undefined} actions={<ThemeToggle/>} footer={<span className="footer-meta" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>Vektör · Ekip sunum arşivi</span>}>{contents}{count.error && <div role="alert" className="main-content">{count.error} <button className="btn btn-secondary" onClick={count.retry}>Sayacı yeniden dene</button></div>}{(error || runtime.auth.getError()) && <p role="alert" className="main-content">{error || runtime.auth.getError()}</p>}</AppLayout>}
    {dialog && (state.status === 'unauthenticated' || state.status === 'loading') && <AuthenticationDialog key={dialog} mode={dialog} close={() => setDialog(null)} change={setDialog} actions={dialogActions}/>}
  </>;
}
