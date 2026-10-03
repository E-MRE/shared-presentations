/**
 * Authentication Service & Lifecycle Integration Test Suite
 *
 * Verifies:
 * 1. Membership invariant: Google provider or verified email is member; unverified is NOT.
 * 2. Admin resolution: reads from admins/{uid} with caching; clean path when doc absent or non-admin.
 * 3. Raw client write to admins/{uid} is strictly denied by security rules.
 * 4. Listener lifecycle: cannot open listener if !isMember; all listeners closed on sign-out.
 *
 * References:
 * - src/contracts/auth.ts
 * - docs/ARCHITECTURE.md §2.2, §3
 * - docs/PLAN.md §5, §7
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { mapFirebaseUserToAuthUser } from '../../src/auth/service';
import { checkIsAdmin, clearAdminCache } from '../../src/auth/admin';
import {
  registerListener,
  closeAllListeners,
  getActiveListenerCount,
} from '../../src/auth/listenerManager';
import type { User } from 'firebase/auth';

const PROJECT_ID = 'shared-presentations';
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const emulatorHostEnv = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [emuHost, emuPortStr] = emulatorHostEnv.split(':');
const emuPort = parseInt(emuPortStr, 10);

describe('Authentication & Membership Invariants', () => {
  describe('Membership Logic Invariants', () => {
    it('unverified email user is NOT a member (isMember === false)', () => {
      const mockUser = {
        uid: 'user-unverified',
        email: 'unverified@example.com',
        displayName: 'Unverified User',
        emailVerified: false,
        providerData: [{ providerId: 'password' }],
      } as unknown as User;

      const authUser = mapFirebaseUserToAuthUser(mockUser, false);
      expect(authUser.isMember).toBe(false);
      expect(authUser.isEmailVerified).toBe(false);
      expect(authUser.isGoogle).toBe(false);
      expect(authUser.isAdmin).toBe(false);
    });

    it('verified email user IS a member (isMember === true)', () => {
      const mockUser = {
        uid: 'user-verified',
        email: 'verified@example.com',
        displayName: 'Verified User',
        emailVerified: true,
        providerData: [{ providerId: 'password' }],
      } as unknown as User;

      const authUser = mapFirebaseUserToAuthUser(mockUser, false);
      expect(authUser.isMember).toBe(true);
      expect(authUser.isEmailVerified).toBe(true);
      expect(authUser.isGoogle).toBe(false);
    });

    it('Google signed-in user IS a member regardless of emailVerified flag', () => {
      const mockUser = {
        uid: 'google-user',
        email: 'google@gmail.com',
        displayName: 'Google User',
        emailVerified: false, // provider is Google
        providerData: [{ providerId: 'google.com' }],
      } as unknown as User;

      const authUser = mapFirebaseUserToAuthUser(mockUser, false);
      expect(authUser.isMember).toBe(true);
      expect(authUser.isGoogle).toBe(true);
    });
  });

  describe('Listener Lifecycle Invariants', () => {
    beforeEach(() => {
      closeAllListeners();
    });

    it('throws error when non-member attempts to open a Firestore listener', () => {
      let listenerClosed = false;
      const fakeUnsubscribe = () => {
        listenerClosed = true;
      };

      // Non-member (isMember = false)
      expect(() => {
        registerListener(fakeUnsubscribe, false);
      }).toThrow();

      // The listener should have been immediately closed
      expect(listenerClosed).toBe(true);
      expect(getActiveListenerCount()).toBe(0);
    });

    it('registers listener when user is a confirmed member', () => {
      let listenerClosed = false;
      const fakeUnsubscribe = () => {
        listenerClosed = true;
      };

      const unsub = registerListener(fakeUnsubscribe, true);
      expect(getActiveListenerCount()).toBe(1);

      // Explicit unsubscribe closes it
      unsub();
      expect(listenerClosed).toBe(true);
      expect(getActiveListenerCount()).toBe(0);
    });

    it('sign-out closes all active listeners', () => {
      let closed1 = false;
      let closed2 = false;

      registerListener(() => { closed1 = true; }, true);
      registerListener(() => { closed2 = true; }, true);

      expect(getActiveListenerCount()).toBe(2);

      closeAllListeners();

      expect(closed1).toBe(true);
      expect(closed2).toBe(true);
      expect(getActiveListenerCount()).toBe(0);
    });
  });

  describe.skipIf(!hasEmulator)('Admin Resolution & Security Rules Invariants (Real Emulator)', () => {
    let testEnv: RulesTestEnvironment;

    beforeAll(async () => {
      const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          host: emuHost,
          port: emuPort,
          rules,
        },
      });
    });

    afterAll(async () => {
      if (testEnv) {
        await testEnv.cleanup();
      }
    });

    beforeEach(async () => {
      clearAdminCache();
      if (testEnv) {
        await testEnv.clearFirestore();
      }
    });

    it('a raw Firestore call from a non-admin client attempting a client-side admin grant is DENIED', async () => {
      const memberDb = testEnv.authenticatedContext('eve-attacker', {
        email: 'eve@example.com',
        email_verified: true,
      }).firestore();

      // Attacker tries to write admins/eve-attacker document directly
      await assertFails(
        setDoc(doc(memberDb, 'admins', 'eve-attacker'), { active: true })
      );
    });

    it('resolves isAdmin: true when Console admin doc exists in admins/{uid}', async () => {
      // Seed admin document with rules disabled (simulating Console write)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'admins', 'admin-alice'), { active: true });
      });

      const adminDb = testEnv.authenticatedContext('admin-alice', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const isAdmin = await checkIsAdmin(adminDb, 'admin-alice');
      expect(isAdmin).toBe(true);
    });

    it('resolves isAdmin: false cleanly without throwing when user is not an admin', async () => {
      const regularMemberDb = testEnv.authenticatedContext('bob-regular', {
        email: 'bob@example.com',
        email_verified: true,
      }).firestore();

      // Bob tries to check if he is an admin; rules deny get to non-admin
      // checkIsAdmin catches the error cleanly and returns false
      const isAdmin = await checkIsAdmin(regularMemberDb, 'bob-regular');
      expect(isAdmin).toBe(false);
    });

    it('caches admin verification to minimize read calls', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'admins', 'admin-cached'), { active: true });
      });

      const adminDb = testEnv.authenticatedContext('admin-cached', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const firstCheck = await checkIsAdmin(adminDb, 'admin-cached');
      expect(firstCheck).toBe(true);

      // Now delete the document behind the scenes
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'admins', 'admin-cached'), { active: false });
      });

      // Second check should use cache without throwing
      const cachedCheck = await checkIsAdmin(adminDb, 'admin-cached');
      expect(cachedCheck).toBe(true);

      // Force refresh clears cache and reflects new state
      const freshCheck = await checkIsAdmin(adminDb, 'admin-cached', true);
      expect(freshCheck).toBe(false);
    });
  });
});
