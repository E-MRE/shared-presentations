/**
 * Authentication React Context Provider
 *
 * Provides reactive AuthState matching src/contracts/auth.ts to the component tree.
 * Enforces membership invariants and listener lifecycle.
 *
 * References:
 * - src/contracts/auth.ts
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §1, §4
 */

import React, { useEffect, useState, useMemo, type ReactNode } from 'react';
import { onAuthStateChanged, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { auth as defaultAuth, db as defaultDb } from '../firebase';
import type { AuthState, EmailSignInCredentials, EmailSignUpCredentials } from './types';
import { AuthContext, type AuthContextValue } from './authContext';
import { FirebaseAuthService, mapFirebaseUserToAuthUser } from './service';
import { checkIsAdmin, clearAdminCache } from './admin';
import { closeAllListeners } from './listenerManager';

export interface AuthProviderProps {
  children: ReactNode;
  auth?: Auth;
  db?: Firestore;
  service?: FirebaseAuthService;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  auth = defaultAuth,
  db = defaultDb,
  service,
}) => {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    isAdmin: false,
    isMember: false,
  });

  const authService = useMemo(() => service || new FirebaseAuthService(auth, db), [service, auth, db]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        closeAllListeners();
        clearAdminCache();
        setState({
          status: 'unauthenticated',
          user: null,
          isAdmin: false,
          isMember: false,
        });
        return;
      }

      try {
        const isAdmin = await checkIsAdmin(db, firebaseUser.uid);
        const authUser = mapFirebaseUserToAuthUser(firebaseUser, isAdmin);

        if (authUser.isMember) {
          setState({
            status: 'authenticated',
            user: authUser,
            isAdmin,
            isMember: true,
          });
        } else {
          // Unverified email user is signed in but not a member
          // Invariant: no listeners may be open before membership
          closeAllListeners();
          setState({
            status: 'unverified',
            user: authUser,
            isAdmin: false,
            isMember: false,
          });
        }
      } catch (err) {
        console.error('[auth] Error resolving user state:', err);
        closeAllListeners();
        setState({
          status: 'unauthenticated',
          user: null,
          isAdmin: false,
          isMember: false,
        });
      }
    });

    return () => {
      unsubscribe();
      closeAllListeners();
    };
  }, [auth, db]);

  const handleSignInWithGoogle = async () => {
    return authService.signInWithGoogle();
  };

  const handleSignInWithEmail = async (creds: EmailSignInCredentials) => {
    return authService.signInWithEmail(creds);
  };

  const handleSignUpWithEmail = async (creds: EmailSignUpCredentials) => {
    return authService.signUpWithEmail(creds);
  };

  const handleSendVerificationEmail = async () => {
    return authService.sendVerificationEmail();
  };

  const handleReloadUser = async () => {
    const res = await authService.reloadUser();
    if (res.ok) {
      if (res.value.isMember) {
        setState({
          status: 'authenticated',
          user: res.value,
          isAdmin: res.value.isAdmin,
          isMember: true,
        });
      } else {
        setState({
          status: 'unverified',
          user: res.value,
          isAdmin: false,
          isMember: false,
        });
      }
    }
    return res;
  };

  const handleSendPasswordReset = async (email: string) => {
    return authService.sendPasswordReset(email);
  };

  const handleSignOut = async () => {
    const res = await authService.signOut();
    setState({
      status: 'unauthenticated',
      user: null,
      isAdmin: false,
      isMember: false,
    });
    return res;
  };

  const value: AuthContextValue = {
    state,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithEmail: handleSignInWithEmail,
    signUpWithEmail: handleSignUpWithEmail,
    sendVerificationEmail: handleSendVerificationEmail,
    reloadUser: handleReloadUser,
    sendPasswordReset: handleSendPasswordReset,
    signOut: handleSignOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
