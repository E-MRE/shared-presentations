import { describe, it, expect, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { ApplicationAuthStore, type ApplicationAuthDependencies } from '../../src/App';
import { ok, err } from '../../src/contracts/services';
import { AppErrorCode } from '../../src/contracts/errors';
import { mapFirebaseUserToAuthUser } from '../../src/auth/service';
import { closeAllListeners, getActiveListenerCount } from '../../src/auth/listenerManager';
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function user(uid = 'fixture-member', verified = true, google = false): User {
  return { uid, email: 'fixture@example.invalid', displayName: 'Test Üyesi', emailVerified: verified, providerData: [{ providerId: google ? 'google.com' : 'password' }], getIdTokenResult: vi.fn(async () => ({ signInProvider: google ? 'google.com' : 'password', claims: { email_verified: verified } })) } as unknown as User;
}
function setup() {
  let current: User | null = null, observer: (user: User | null) => void = () => {};
  const stops = vi.fn(), roleStops = vi.fn();
  const dependencies: ApplicationAuthDependencies = {
    currentUser: () => current, observe: callback => { observer = callback; return stops; }, resolveAdmin: vi.fn(async () => false), watchAdmin: () => roleStops,
    service: { signInWithGoogle: vi.fn(async () => ok(mapFirebaseUserToAuthUser(current!))), signInWithEmail: vi.fn(async () => ok(mapFirebaseUserToAuthUser(current!))), signUpWithEmail: vi.fn(async () => ok(mapFirebaseUserToAuthUser(current!))), sendVerificationEmail: vi.fn(async () => ok(undefined)), reloadUser: vi.fn(async () => ok(mapFirebaseUserToAuthUser(current!))), sendPasswordReset: vi.fn(async () => ok(undefined)), signOut: vi.fn(async () => { current = null; observer(null); return ok(undefined); }) },
  };
  const store = new ApplicationAuthStore(dependencies), stop = store.start();
  return { store, dependencies, stop, roleStops, set(value: User | null, notify = true) { current = value; if (notify) observer(value); } };
}
describe('application auth boundary with real Firebase User token API shape', () => {
  it('requires refreshed token claims, not providerData or stale emailVerified, and avoids admin reads for unverified', async () => {
    const t = setup(), u = user('fixture-member', false, true);
    u.getIdTokenResult = vi.fn(async () => ({ signInProvider: 'password', claims: { email_verified: false } })) as User['getIdTokenResult'];
    t.set(u); await pause(); expect(t.store.getSnapshot().status).toBe('unverified'); expect(t.dependencies.resolveAdmin).not.toHaveBeenCalled(); expect(u.getIdTokenResult).toHaveBeenCalledWith(true); expect(t.store.getMember()).toBeNull(); t.stop();
  });
  it('commits admin membership before service getter callbacks and hides replaced UID before observer delivery', async () => {
    const t = setup(); t.dependencies.resolveAdmin = vi.fn(async () => true);
    const seen: unknown[] = []; const unsubscribe = t.store.subscribe(() => seen.push(t.store.getMember()?.isAdmin));
    t.set(user()); await pause(); expect(t.store.getMember()?.isAdmin).toBe(true); expect(seen.at(-1)).toBe(true);
    t.set(user('replacement'), false); expect(t.store.getMember()).toBeNull(); unsubscribe(); t.stop();
  });
  it('drops delayed admin resolution after signout and account replacement', async () => {
    const t = setup(), old = deferred<boolean>(); t.dependencies.resolveAdmin = vi.fn(uid => uid === 'old' ? old.promise : Promise.resolve(false));
    t.set(user('old')); await pause(); await t.store.actions.signOut(); old.resolve(true); await pause(); expect(t.store.getSnapshot().status).toBe('unauthenticated');
    const late = deferred<boolean>(); t.dependencies.resolveAdmin = vi.fn(uid => uid === 'old' ? late.promise : Promise.resolve(false));
    t.set(user('old')); await pause(); t.set(user('new')); await pause(); late.resolve(true); await pause(); expect(t.store.getMember()?.uid).toBe('new'); expect(t.store.getMember()?.isAdmin).toBe(false); t.stop();
  });
  it('drops delayed reload after signout/replacement, refreshes token on successful verification', async () => {
    const t = setup(), u = user('old', false); t.set(u); await pause();
    const late = deferred<ReturnType<typeof ok<ReturnType<typeof mapFirebaseUserToAuthUser>>>>(); t.dependencies.service.reloadUser = vi.fn(() => late.promise);
    const result = t.store.actions.reloadUser(); t.set(user('new')); await pause(); late.resolve(ok(mapFirebaseUserToAuthUser(u))); expect((await result).ok).toBe(false); expect(t.store.getMember()?.uid).toBe('new');
    t.dependencies.service.reloadUser = vi.fn(async () => ok(mapFirebaseUserToAuthUser(t.dependencies.currentUser()!)));
    await t.store.actions.reloadUser(); expect(t.dependencies.currentUser()?.getIdTokenResult).toHaveBeenLastCalledWith(true); t.stop();
  });
  it('quarantines cancelled delayed login and synchronously locks duplicate calls', async () => {
    const t = setup(), late = deferred<ReturnType<typeof ok<ReturnType<typeof mapFirebaseUserToAuthUser>>>>();
    t.dependencies.service.signInWithGoogle = vi.fn(() => late.promise);
    const login = t.store.actions.signInWithGoogle(); expect((await t.store.actions.signInWithGoogle()).ok).toBe(false);
    await t.store.actions.signOut(); const u = user('late'); t.set(u); await pause(); expect(t.store.getMember()).toBeNull(); late.resolve(ok(mapFirebaseUserToAuthUser(u))); expect((await login).ok).toBe(false); expect(t.store.getSnapshot().status).toBe('unauthenticated'); expect(t.dependencies.service.signOut).toHaveBeenCalledTimes(2); t.stop();
  });
  it('disposes and reopens role observation through the frozen registry', async () => {
    closeAllListeners(); const t = setup(); t.set(user()); await pause();
    const stop = t.store.connectRole(); expect(getActiveListenerCount()).toBe(1); closeAllListeners(); expect(t.roleStops).toHaveBeenCalled(); expect(getActiveListenerCount()).toBe(0);
    const again = t.store.connectRole(); expect(getActiveListenerCount()).toBe(1); stop(); again(); t.stop(); expect(getActiveListenerCount()).toBe(0);
  });
  it('preserves reload errors after route state restoration and token failure', async () => {
    const t = setup(), u = user('fixture', false); t.set(u); await pause();
    t.dependencies.service.reloadUser = vi.fn(async () => err({ code: AppErrorCode.NETWORK_ERROR, message: 'Doğrulama kontrol edilemedi.' }));
    expect((await t.store.actions.reloadUser()).ok).toBe(false); expect(t.store.getSnapshot().status).toBe('unverified'); expect(t.store.getError()).toContain('kontrol edilemedi');
    u.getIdTokenResult = vi.fn(async () => { throw { code: 'auth/network-request-failed' }; });
    await t.store.actions.reloadUser(); expect(t.store.getSnapshot().status).toBe('unauthenticated'); expect(t.store.getError()).toContain('Ağ bağlantısı'); t.stop();
  });
});
