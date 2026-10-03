/**
 * Admin Role Resolution and Caching
 *
 * Verifies admin authority strictly via existence of the Console-only
 * Firestore document `admins/{uid}`. No admin email or UID is hardcoded.
 * Client writes to `admins/{uid}` are denied by rules.
 *
 * References:
 * - docs/ARCHITECTURE.md §2.2
 * - docs/BRIEF.md §0.5, §5
 */

import { doc, getDoc, type Firestore } from 'firebase/firestore';

/** In-memory cache for resolved admin statuses by UID */
const adminCache = new Map<string, { isAdmin: boolean; timestamp: number }>();

/** Cache TTL in milliseconds (default: 5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Checks whether the user with the given UID has an active admin document.
 * Returns false cleanly if the document is absent, if permission is denied,
 * or if the network fails. Never throws.
 */
export async function checkIsAdmin(
  db: Firestore,
  uid: string,
  forceRefresh = false
): Promise<boolean> {
  if (!uid) return false;

  const now = Date.now();
  const cached = adminCache.get(uid);

  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.isAdmin;
  }

  try {
    const adminRef = doc(db, 'admins', uid);
    const snap = await getDoc(adminRef);

    // Rule: allow get: if isMember() && isOwner(uid) && isAdmin();
    // Non-admins will receive a permission-denied error, which is caught below.
    const isAdmin = snap.exists() && snap.data()?.active !== false;
    adminCache.set(uid, { isAdmin, timestamp: now });
    return isAdmin;
  } catch {
    // Expected path for non-admin users where security rules reject the read
    adminCache.set(uid, { isAdmin: false, timestamp: now });
    return false;
  }
}

/** Clears the admin status cache (e.g. on sign-out or account switch) */
export function clearAdminCache(uid?: string): void {
  if (uid) {
    adminCache.delete(uid);
  } else {
    adminCache.clear();
  }
}
