/**
 * Auth Module Public API
 *
 * References:
 * - src/contracts/auth.ts
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §1, §4
 */

export * from './types';
export * from './admin';
export * from './listenerManager';
export * from './service';
export * from './authContext';
export { AuthenticationDialog } from './AuthenticationDialog';
export { VerificationActions } from './VerificationActions';
export * from './useAuth';
