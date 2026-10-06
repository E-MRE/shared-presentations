import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, runTransaction, setDoc } from 'firebase/firestore';
import { PROJECT_ID, hasEmulator, emuHost, emuPort } from '../emulator-config';

// Separate demo project keeps coverage small and excludes large binary payloads.
describe.skipIf(!hasEmulator)('Expression budget scope controls', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: `${PROJECT_ID}-budget`, firestore: {
      host: emuHost, port: emuPort,
      rules: readFileSync(new URL('../fixtures/firestore-budget-scope.rules', import.meta.url), 'utf8'),
    } });
    await env.clearFirestore();
  });
  afterAll(async () => { if (env) await env.cleanup(); });
  it('one transaction of 12 individually costly writes passes', async () => {
    const db = env.authenticatedContext('owner', { email_verified: true }).firestore();
    await runTransaction(db, async tx => {
      for (let i = 0; i < 12; i++) tx.set(doc(db, 'withinBudget', String(i)), { value: 0 });
    });
  });
  it('one over-budget document fails with the actual 1000-expression diagnostic', async () => {
    const db = env.authenticatedContext('owner', { email_verified: true }).firestore();
    const error = await setDoc(doc(db, 'overBudget', 'one'), { value: 0 }).then(() => null, err => err);
    expect(error).not.toBeNull();
    expect(String(error)).toMatch(/maximum of 1000 expressions/i);
  });
});
