/**
 * Firebase Client Initialization and Emulator Wiring
 *
 * Config contains only public client credentials for the 'shared-presentations' project.
 * No secrets are stored here.
 *
 * References:
 * - docs/PLAN.md §5
 * - docs/BRIEF.md §0, §3
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';

export const firebaseConfig = {
  apiKey: 'AIzaSyBhinVcRLhkPr8aMNEDCVnQHDP2xDyKpBs',
  authDomain: 'shared-presentations.firebaseapp.com',
  projectId: 'shared-presentations',
  storageBucket: 'shared-presentations.firebasestorage.app',
  messagingSenderId: '204729641645',
  appId: '1:204729641645:web:c3f91079cb84ca7f837424',
} as const;

// Singleton FirebaseApp initialization
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firebase Services
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);

// Emulator wiring
let emulatorsConnected = false;

export function setupEmulators(
  firestoreHost = 'localhost',
  firestorePort = 8080,
  authUrl = 'http://localhost:9099'
): void {
  if (emulatorsConnected) return;

  try {
    connectFirestoreEmulator(db, firestoreHost, firestorePort);
    connectAuthEmulator(auth, authUrl, { disableWarnings: true });
    emulatorsConnected = true;
  } catch (error) {
    // In hot-reload environments, emulators may already be bound
    console.warn('[firebase] Emulator connection warning:', error);
  }
}

// Auto-wire emulators if explicit environment variable is set
const isBrowser = typeof window !== 'undefined';
const useEmulators =
  isBrowser &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
  (import.meta.env.VITE_USE_EMULATORS === 'true' || import.meta.env.DEV);

if (useEmulators) {
  setupEmulators();
}
