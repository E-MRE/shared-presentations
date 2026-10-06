import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = 'demo-shared-presentations';
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^127\.0\.0\.1:\d+$|^localhost:\d+$|^\[::1\]:\d+$/.test(process.env[key] ?? '')) {
    throw new Error(`${key} must point to a local emulator; backend acceptance cannot run without both emulators.`);
  }
}
if (process.env.GCLOUD_PROJECT !== projectId) throw new Error('Backend acceptance requires the isolated demo project.');
const evidence = resolve(process.env.EVIDENCE_DIR ?? 'test-results/backend');
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'emulator-targets.json'), JSON.stringify({
  projectId, firestore: process.env.FIRESTORE_EMULATOR_HOST,
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, liveProject: false,
}, null, 2));
const output = resolve(evidence, 'vitest.json');
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run', 'tests/auth', 'tests/data', 'tests/rules',
  '--maxWorkers=1', '--reporter=default', '--reporter=json', `--outputFile=${output}`,
], { stdio: 'inherit', env: { ...process.env, REQUIRE_BACKEND_EMULATORS: 'true' } });
if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
const report = JSON.parse(readFileSync(output, 'utf8'));
const skipped = report.testResults.flatMap(file => file.assertionResults)
  .filter(test => test.status !== 'passed');
if (!report.numPassedTests || skipped.length) {
  console.error(`FAIL backend acceptance: ${skipped.length} skipped, pending or failed tests; skip is not success.`);
  process.exitCode = 1;
} else {
  console.log(`PASS backend acceptance: ${report.numPassedTests} tests, zero skips, demo project and local Auth/Firestore endpoints.`);
}
