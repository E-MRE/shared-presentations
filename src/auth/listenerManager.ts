/**
 * Firestore Listener Lifecycle and Invariant Enforcement
 *
 * Invariant: No Firestore listener may be opened before membership is established.
 * Listeners must be closed on sign-out and on route changes.
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1, §4
 */

import { AppErrorCode, type AppError } from '../contracts/errors';

type Unsubscribe = () => void;

/** Registry of currently open Firestore listener subscriptions */
const activeListeners = new Set<Unsubscribe>();

/**
 * Registers an active Firestore listener.
 * Throws AppError if caller is not a confirmed member, ensuring no
 * data listener can remain open in an unverified or signed-out state.
 */
export function registerListener(unsub: Unsubscribe, isMember: boolean): Unsubscribe {
  if (!isMember) {
    // Immediately terminate the listener if one was opened
    try {
      unsub();
    } catch {
      // Ignore unsubscribe error on unverified close
    }

    const err: AppError = {
      code: AppErrorCode.PERMISSION_DENIED,
      message: 'Üyelik doğrulanmadan veri dinleyicisi açılamaz.',
    };
    throw err;
  }

  activeListeners.add(unsub);

  return () => {
    activeListeners.delete(unsub);
    try {
      unsub();
    } catch {
      // Ignore errors on idempotent unsubscribe
    }
  };
}

/**
 * Closes all active Firestore listeners across the application.
 * Must be invoked on user sign-out and route changes.
 */
export function closeAllListeners(): void {
  for (const unsub of activeListeners) {
    try {
      unsub();
    } catch {
      // Ignore errors during mass cleanup
    }
  }
  activeListeners.clear();
}

/** Returns the count of registered active listeners (useful for lifecycle assertions) */
export function getActiveListenerCount(): number {
  return activeListeners.size;
}
