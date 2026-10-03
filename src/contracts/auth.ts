/**
 * Authentication and Authorization State Contracts
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1, §4
 */

/** User identity representation across the application */
export interface AuthUser {
  /** Firebase Auth UID */
  uid: string;
  /** Primary email address */
  email: string;
  /** Display name if available */
  displayName: string;
  /** Profile photo URL if available */
  photoURL?: string;
  /** Whether the email has been verified via Firebase Auth */
  isEmailVerified: boolean;
  /** Whether the user signed in with Google OAuth */
  isGoogle: boolean;
  /**
   * Membership invariant:
   * A member is signed in AND (Google provider OR verified email).
   * Only members can read decks or upload.
   */
  isMember: boolean;
  /** Whether the user possesses the admin role (verified via admins/{uid}) */
  isAdmin: boolean;
}

/** Discriminated union of all application authentication states */
export type AuthState =
  | {
      status: 'loading';
      user: null;
      isAdmin: false;
      isMember: false;
    }
  | {
      status: 'unauthenticated';
      user: null;
      isAdmin: false;
      isMember: false;
    }
  | {
      status: 'unverified';
      user: AuthUser;
      isAdmin: false;
      isMember: false;
    }
  | {
      status: 'authenticated';
      user: AuthUser;
      isAdmin: boolean;
      isMember: true;
    };
