import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const run = spawnSync(process.execPath, ['node_modules/firebase-tools/lib/bin/firebase.js',
    'emulators:exec', '--project', 'demo-shared-presentations', '--only', 'auth,firestore',
    'node scripts/run-manifest-prototype.mjs'], {
    stdio: 'inherit', env: { ...process.env, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' },
  });
  process.exit(run.status ?? 1);
}
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[name] ?? '')) throw Error(`${name}: local emulator required`);
}
if (process.env.GCLOUD_PROJECT !== 'demo-shared-presentations') throw Error('Demo project required');
const evidence = resolve(process.env.EVIDENCE_DIR ?? 'test-results/manifest-prototype');
mkdirSync(evidence, { recursive: true });
writeFileSync(resolve(evidence, 'emulator-targets.json'), JSON.stringify({
  projectId: process.env.GCLOUD_PROJECT, budgetProjectId: 'demo-shared-presentations-budget', firestore: process.env.FIRESTORE_EMULATOR_HOST,
  auth: process.env.FIREBASE_AUTH_EMULATOR_HOST, liveProject: false,
}, null, 2));
const reportFile = resolve(evidence, 'vitest.json');
const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run',
  'tests/prototypes', '--maxWorkers=1',
  '--reporter=default', '--reporter=json', `--outputFile=${reportFile}`], {
  stdio: 'inherit', env: { ...process.env, REQUIRE_BACKEND_EMULATORS: 'true' },
});
const origin = `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-shared-presentations-budget:ruleCoverage`;
for (const [suffix, file] of [['', 'coverage.json'], ['.html', 'coverage.html']]) {
  const response = await fetch(origin + suffix);
  if (!response.ok) throw Error(`Coverage HTTP ${response.status}`);
  writeFileSync(resolve(evidence, file), await response.text());
}
const summary = spawnSync(process.execPath, ['scripts/summarize-rule-coverage.mjs',
  resolve(evidence, 'coverage.json'), resolve(evidence, 'coverage-summary.json')], { stdio: 'inherit' });
const costs = JSON.parse(readFileSync(resolve(evidence, 'coverage-summary.json'), 'utf8'));
if (costs.functions.budgetSegment.recorded <= 1000) throw Error('Aggregate budget control did not record over 1000 evaluations');
for (const mode of ['tags', 'links', 'other', 'stored']) {
  const summarize = spawnSync(process.execPath, ['scripts/summarize-rule-coverage.mjs',
    resolve(evidence, `parent-${mode}-coverage.json`), resolve(evidence, `parent-${mode}-summary.json`)], { stdio: 'inherit' });
  if (summarize.status) throw Error(`Parent ${mode} coverage summary failed`);
}
const report = JSON.parse(readFileSync(reportFile, 'utf8'));
const incomplete = report.testResults.flatMap(file => file.assertionResults).filter(test => test.status !== 'passed');
if (run.status || summary.status || incomplete.length || !report.numPassedTests) process.exitCode = 1;
else console.log(`PASS architecture acceptance: ${report.numPassedTests} tests, zero skips, production v2 rules in demo emulators; no deploy.`);
