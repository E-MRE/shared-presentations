import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Socket } from 'node:net';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, applyActionCode, confirmPasswordReset, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, Bytes, type Firestore } from 'firebase/firestore';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { FirebaseAuthService } from '../../src/auth/service';
import { PROJECT_ID, hasEmulator, emuHost, emuPort } from '../emulator-config';

describe.skipIf(!hasEmulator || !process.env.FIREBASE_AUTH_EMULATOR_HOST)('Real Auth tokens with Firestore emulator', () => {
  let app: FirebaseApp, auth: Auth, db: Firestore, testEnv: RulesTestEnvironment, service: FirebaseAuthService;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const email = 'acceptance@example.invalid';
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(authHost ?? '')) throw new Error('Auth must use loopback.');
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: {
      host: emuHost, port: emuPort, rules: readFileSync('firestore.rules', 'utf8'),
    } });
    await testEnv.clearFirestore();
    const cleared = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
    expect(cleared.ok).toBe(true);
    app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' }, 'auth-acceptance');
    auth = getAuth(app); connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    db = getFirestore(app); connectFirestoreEmulator(db, emuHost, emuPort);
    service = new FirebaseAuthService(auth, db);
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'presentations', 'token-gate'), { status: 'published', ownerUid: 'other' });
      await setDoc(doc(context.firestore(), 'presentations', 'token-gate', 'chunks', '0'), { index: 0, data: Bytes.fromUint8Array(new Uint8Array([1])) });
    });
  }, 30_000);
  afterAll(async () => {
    if (auth) await auth.signOut();
    if (app) await deleteApp(app);
    if (testEnv) await testEnv.cleanup();
  });
  async function actionCode(type: string) {
    const response = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
    const body = await response.json() as { oobCodes: Array<{ email: string; requestType: string; oobCode: string }> };
    const entry = body.oobCodes.filter(code => code.email === email && code.requestType === type).at(-1);
    if (!entry) throw new Error('Expected emulator action missing.');
    return entry.oobCode;
  }
  it.skipIf(process.env.REQUIRE_BACKEND_EMULATORS !== 'true')('blocks a live SDK hostname before opening a socket', () => {
    expect(() => new Socket().connect({ host: 'firestore.googleapis.com', port: 443 }))
      .toThrow('Backend network blocked: firestore.googleapis.com');
  });
  it('signup, resend, verification/token refresh, membership, reset and signout use only local SDK endpoints', async () => {
    await assertFails(getDoc(doc(db, 'presentations', 'token-gate')));
    const started = Date.now();
    const signup = await service.signUpWithEmail({ email, password: 'local-test-password', displayName: 'Acceptance' });
    expect(signup.ok).toBe(true);
    if (!signup.ok) throw new Error('Emulator signup failed.');
    expect(signup.value.isMember).toBe(false);
    expect(signup.value.verificationDispatch?.sent).toBe(true);
    expect(signup.value.verificationDispatch?.retryAt).toBeGreaterThanOrEqual(started + 60_000);
    const profile = await getDoc(doc(db, 'users', signup.value.uid));
    expect(profile.exists()).toBe(true);
    expect(profile.data()?.pendingCount).toBe(0);
    expect(profile.data()).not.toHaveProperty('pendingDeckId');
    await assertFails(getDoc(doc(db, 'presentations', 'token-gate')));
    await assertFails(getDoc(doc(db, 'presentations', 'token-gate', 'chunks', '0')));
    expect((await service.sendVerificationEmail()).ok).toBe(true);
    await applyActionCode(auth, await actionCode('VERIFY_EMAIL'));
    const reloaded = await service.reloadUser();
    expect(reloaded.ok && reloaded.value.isMember).toBe(true);
    await auth.currentUser!.getIdToken(true);
    await assertSucceeds(getDoc(doc(db, 'presentations', 'token-gate')));
    await assertSucceeds(getDoc(doc(db, 'presentations', 'token-gate', 'chunks', '0')));
    expect((await service.sendPasswordReset(email)).ok).toBe(true);
    const reset = await actionCode('PASSWORD_RESET');
    await confirmPasswordReset(auth, reset, 'new-local-password');
    await expect(confirmPasswordReset(auth, reset, 'another-local-password')).rejects.toMatchObject({ code: 'auth/invalid-action-code' });
    expect((await service.signOut()).ok).toBe(true);
    expect((await service.signInWithEmail({ email, password: 'local-test-password' })).ok).toBe(false);
    expect((await service.signInWithEmail({ email, password: 'new-local-password' })).ok).toBe(true);
    expect((await service.signOut()).ok).toBe(true);
    await assertFails(getDoc(doc(db, 'presentations', 'token-gate')));
  }, 30_000);
});
