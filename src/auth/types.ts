/**
 * Authentication Types and Credentials Interfaces
 *
 * References:
 * - src/contracts/auth.ts
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §1, §4
 */

export type { AuthUser, AuthState } from '../contracts/auth';

/** Email and password sign-in credentials */
export interface EmailSignInCredentials {
  email: string;
  password: string;
}

/** Email and password sign-up credentials */
export interface EmailSignUpCredentials {
  email: string;
  password: string;
  displayName: string;
}

/** Password reset input */
export interface ResetPasswordInput {
  email: string;
}
