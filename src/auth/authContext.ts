/**
 * AuthContext Definition
 *
 * References:
 * - src/contracts/auth.ts
 */

import { createContext } from 'react';
import type { AuthState, AuthUser, EmailSignInCredentials, EmailSignUpCredentials } from './types';
import type { Result } from '../contracts/services';

export interface AuthContextValue {
  state: AuthState;
  signInWithGoogle: () => Promise<Result<AuthUser>>;
  signInWithEmail: (credentials: EmailSignInCredentials) => Promise<Result<AuthUser>>;
  signUpWithEmail: (credentials: EmailSignUpCredentials) => Promise<Result<AuthUser>>;
  sendVerificationEmail: () => Promise<Result<void>>;
  reloadUser: () => Promise<Result<AuthUser>>;
  sendPasswordReset: (email: string) => Promise<Result<void>>;
  signOut: () => Promise<Result<void>>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
