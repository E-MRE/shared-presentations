import { vi } from 'vitest';
import { Socket } from 'node:net';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Inspect actual SDK socket destinations without recording headers or tokens.
// Fail before opening any non-loopback connection, including accidental live SDK use.
const connect = Socket.prototype.connect;
Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' && first !== null ? first as { host?: string; port?: number; path?: string } : undefined;
  if (typeof first === 'string' || options?.path) return Reflect.apply(connect, this, args);
  const host = options?.host ?? (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`Backend network blocked: ${host}`);
  appendFileSync(resolve(process.env.EVIDENCE_DIR ?? 'test-results/backend', 'socket-targets.jsonl'),
    JSON.stringify({ host, port: options?.port ?? first }) + '\n');
  return Reflect.apply(connect, this, args);
} as Socket['connect'];

// Services import default SDK singletons. Bind those to the demo emulators too,
// so a forgotten dependency injection cannot contact the real project.
vi.mock('../src/firebase', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getAuth, connectAuthEmulator } = await import('firebase/auth');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const { PROJECT_ID, emuHost, emuPort } = await import('./emulator-config');
  const firebaseConfig = { projectId: PROJECT_ID, apiKey: 'demo-key', authDomain: `${PROJECT_ID}.firebaseapp.com` };
  const app = initializeApp(firebaseConfig, 'backend-defaults');
  const db = getFirestore(app);
  const auth = getAuth(app);
  connectFirestoreEmulator(db, emuHost, emuPort);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  return { app, db, auth, firebaseConfig };
});
