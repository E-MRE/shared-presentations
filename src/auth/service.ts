/**
 * Firebase Authentication Service Implementation
 *
 * Implements real Firebase Auth flows: Google OAuth, email/password signup with
 * verification email, reload/token refresh, password reset, sign-out, and admin resolution.
 * Strictly adheres to the Membership invariant:
 * A member is signed in AND (Google provider OR verified email).
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1, §4
 * - src/contracts/auth.ts
 * - src/contracts/errors.ts
 */

import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  updateProfile,
  GoogleAuthProvider,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { auth as defaultAuth, db as defaultDb } from '../firebase';
import type { AuthUser, EmailSignInCredentials, EmailSignUpCredentials } from './types';
import { AppErrorCode, type AppError } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import { checkIsAdmin, clearAdminCache } from './admin';
import { closeAllListeners } from './listenerManager';

/** Maps a Firebase User to our canonical AuthUser domain model */
export function mapFirebaseUserToAuthUser(user: User, isAdmin = false): AuthUser {
  const isGoogle = user.providerData.some((p) => p.providerId === 'google.com');
  const isEmailVerified = Boolean(user.emailVerified);
  const isMember = isGoogle || isEmailVerified;

  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Kullanıcı',
    photoURL: user.photoURL || undefined,
    isEmailVerified,
    isGoogle,
    isMember,
    isAdmin,
  };
}

/** Translates Firebase Auth error codes to user-facing Turkish AppError */
export function mapAuthError(error: unknown): AppError {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = String((error as { code: unknown }).code);
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return {
          code: AppErrorCode.UNAUTHENTICATED,
          message: 'E-posta adresi veya şifre hatalı.',
          details: error,
        };
      case 'auth/email-already-in-use':
        return {
          code: AppErrorCode.ALREADY_EXISTS,
          message: 'Bu e-posta adresiyle kayıtlı bir hesap zaten bulunmaktadır.',
          details: error,
        };
      case 'auth/weak-password':
        return {
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Şifreniz en az 6 karakter olmalıdır.',
          details: error,
        };
      case 'auth/invalid-email':
        return {
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Lütfen geçerli bir e-posta adresi giriniz.',
          details: error,
        };
      case 'auth/too-many-requests':
        return {
          code: AppErrorCode.QUOTA_EXCEEDED,
          message: 'Çok fazla başarısız deneme yapıldı. Lütfen bir süre sonra tekrar deneyiniz.',
          details: error,
        };
      case 'auth/popup-closed-by-user':
        return {
          code: AppErrorCode.UNKNOWN,
          message: 'Giriş penceresi tamamlanmadan kapatıldı.',
          details: error,
        };
      case 'auth/network-request-failed':
        return {
          code: AppErrorCode.NETWORK_ERROR,
          message: 'Ağ bağlantısı hatası. Lütfen internet bağlantınızı kontrol ediniz.',
          details: error,
        };
      default:
        break;
    }
  }

  const message = error instanceof Error ? error.message : 'Kimlik doğrulama işlemi sırasında bir hata oluştu.';
  return {
    code: AppErrorCode.UNKNOWN,
    message,
    details: error,
  };
}

export class FirebaseAuthService {
  constructor(
    private auth: Auth = defaultAuth,
    private db: Firestore = defaultDb
  ) {}

  /** Ensures user document exists in users/{uid} upon authentication */
  private async ensureUserProfile(user: User): Promise<void> {
    try {
      const userRef = doc(this.db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          displayName: user.displayName || user.email?.split('@')[0] || 'Kullanıcı',
          email: user.email || '',
          createdAt: serverTimestamp(),
          pendingCount: 0,
        });
      }
    } catch {
      // Non-critical: failure to auto-create user doc does not block auth flow
    }
  }

  /** Initiates Google OAuth popup sign-in */
  async signInWithGoogle(): Promise<Result<AuthUser>> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(this.auth, provider);

      const isAdmin = await checkIsAdmin(this.db, cred.user.uid);
      await this.ensureUserProfile(cred.user);

      return ok(mapFirebaseUserToAuthUser(cred.user, isAdmin));
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /** Signs in with email and password */
  async signInWithEmail(credentials: EmailSignInCredentials): Promise<Result<AuthUser>> {
    try {
      if (!credentials.email || !credentials.password) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'E-posta ve şifre alanları boş bırakılamaz.',
        });
      }

      const cred = await signInWithEmailAndPassword(
        this.auth,
        credentials.email.trim(),
        credentials.password
      );

      const isAdmin = await checkIsAdmin(this.db, cred.user.uid);
      await this.ensureUserProfile(cred.user);

      return ok(mapFirebaseUserToAuthUser(cred.user, isAdmin));
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /** Signs up with email and password, sends verification email, initializes user doc */
  async signUpWithEmail(credentials: EmailSignUpCredentials): Promise<Result<AuthUser>> {
    try {
      if (!credentials.email || !credentials.password || !credentials.displayName) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Ad soyad, e-posta ve şifre alanları zorunludur.',
        });
      }

      const cred = await createUserWithEmailAndPassword(
        this.auth,
        credentials.email.trim(),
        credentials.password
      );

      // Update Firebase Auth profile display name
      if (credentials.displayName.trim()) {
        try {
          await updateProfile(cred.user, {
            displayName: credentials.displayName.trim(),
          });
        } catch {
          // Non-fatal
        }
      }

      // Send verification email
      try {
        await sendEmailVerification(cred.user);
      } catch (mailErr) {
        console.warn('[auth] Verification email dispatch warning:', mailErr);
      }

      // Initialize users/{uid} document with pendingCount = 0
      try {
        const userRef = doc(this.db, 'users', cred.user.uid);
        await setDoc(userRef, {
          displayName: credentials.displayName.trim(),
          email: cred.user.email || credentials.email.trim(),
          createdAt: serverTimestamp(),
          pendingCount: 0,
        });
      } catch (dbErr) {
        console.warn('[auth] Initial user profile creation warning:', dbErr);
      }

      return ok(mapFirebaseUserToAuthUser(cred.user, false));
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /** Resends email verification to the currently signed-in user */
  async sendVerificationEmail(targetUser?: User | null): Promise<Result<void>> {
    try {
      const u = targetUser || this.auth.currentUser;
      if (!u) {
        return err({
          code: AppErrorCode.UNAUTHENTICATED,
          message: 'Oturum açmış kullanıcı bulunamadı.',
        });
      }

      await sendEmailVerification(u);
      return ok(undefined);
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /** Reloads user account data to check if email was verified */
  async reloadUser(targetUser?: User | null): Promise<Result<AuthUser>> {
    try {
      const u = targetUser || this.auth.currentUser;
      if (!u) {
        return err({
          code: AppErrorCode.UNAUTHENTICATED,
          message: 'Oturum açmış kullanıcı bulunamadı.',
        });
      }

      await u.reload();
      const isAdmin = await checkIsAdmin(this.db, u.uid);
      return ok(mapFirebaseUserToAuthUser(u, isAdmin));
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /** Sends a password reset email */
  async sendPasswordReset(email: string): Promise<Result<void>> {
    try {
      if (!email || !email.trim()) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Lütfen geçerli bir e-posta adresi belirtiniz.',
        });
      }

      await sendPasswordResetEmail(this.auth, email.trim());
      return ok(undefined);
    } catch (error) {
      return err(mapAuthError(error));
    }
  }

  /**
   * Signs the user out, closing all active Firestore listeners and
   * invalidating the admin cache.
   */
  async signOut(): Promise<Result<void>> {
    try {
      // 1. Invariant: close all open Firestore listeners on sign out
      closeAllListeners();

      // 2. Clear admin cache
      clearAdminCache();

      // 3. Firebase Auth sign out
      await firebaseSignOut(this.auth);

      return ok(undefined);
    } catch (error) {
      return err(mapAuthError(error));
    }
  }
}

/** Default singleton instance */
export const authService = new FirebaseAuthService();
