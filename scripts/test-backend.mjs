import { spawnSync } from 'node:child_process';

// A demo project has no live Firebase resources to fall back to.
const result = spawnSync(process.execPath, [
  'node_modules/firebase-tools/lib/bin/firebase.js', 'emulators:exec',
  '--project', 'demo-shared-presentations', '--only', 'auth,firestore',
  'node scripts/run-backend-tests.mjs',
], { stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' } });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
