// Architecture acceptance against the production v2 rules, in an isolated demo project.
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Bytes, Timestamp, doc, getDoc, runTransaction, setDoc, type Firestore } from 'firebase/firestore';
import { PROJECT_ID, hasEmulator, emuHost, emuPort } from '../emulator-config';

describe.skipIf(!hasEmulator)('Manifest v2 isolated prototype', () => {
  let env: RulesTestEnvironment;
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: {
      host: emuHost, port: emuPort,
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    } });
  });
  beforeEach(async () => { await env.clearFirestore(); });
  afterAll(async () => { if (env) await env.cleanup(); });

  const member = (uid = 'owner') => env.authenticatedContext(uid, { email_verified: true }).firestore();
  function deck(count: number, encoded = count * 100 + 1, kind = 'html', linkCount = 1) {
    return {
      ownerUid: 'owner', title: 'Prototype', description: 'Isolated demo experiment',
      links: Array.from({ length: linkCount }, (_, i) => ({ label: `Link ${i}`, url: `https://example.com/${i}` })),
      category: 'AI & LLM', tags: Array.from({ length: 8 }, (_, i) => `tag-${i}`),
      kind, fileName: `deck.${kind}`, status: 'pending', rejectNote: '',
      cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3, 4])), coverSource: 'auto',
      sizes: { encoded, unpacked: kind === 'html' ? 26214400 : encoded, fileCount: kind === 'html' ? 300 : 1 },
      chunkCount: count, manifestVersion: 2, quotaMarker: 'deck',
      createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      publishedAt: null, reviewedAt: null, reviewedBy: null,
    };
  }
  type Deck = ReturnType<typeof deck>;
  type Fault = 'wrong-size' | 'wrong-index' | 'wrong-data' | 'foreign-field' | 'missing-quota';
  function parent(data: Deck) {
    const { links, ...fields } = data;
    return { ...fields, linkCount: links.length };
  }
  async function create(db: Firestore, data: Deck, fault?: Fault) {
    await runTransaction(db, async tx => {
      const userRef = doc(db, 'users', 'owner');
      const before = await tx.get(userRef);
      tx.set(doc(db, 'presentations', 'deck'), parent(data));
      data.links.forEach((link, index) => tx.set(doc(db, 'presentations', 'deck', 'links', String(index)), { index, ...link }));
      for (let i = 0; i < data.chunkCount; i++) {
        const size = Math.floor(data.sizes.encoded / data.chunkCount) + (i < data.sizes.encoded % data.chunkCount ? 1 : 0);
        const chunk = {
          index: fault === 'wrong-index' && i === 0 ? data.chunkCount : i,
          size: fault === 'wrong-size' && i === 0 ? size + 1 : size,
          data: Bytes.fromUint8Array(new Uint8Array(fault === 'wrong-data' && i === 0 ? size + 1 : size)),
          ...(fault === 'foreign-field' && i === 0 ? { extra: true } : {}),
        };
        tx.set(doc(db, 'presentations', 'deck', 'chunks', String(i)), chunk);
      }
      if (fault !== 'missing-quota') tx.set(userRef, before.exists() ? {
        ...before.data(), pendingCount: before.data()!.pendingCount + 1, pendingDeckId: 'deck',
      } : { displayName: 'Owner', email: 'owner@example.com', createdAt: Timestamp.now(), pendingCount: 1, pendingDeckId: 'deck' });
    });
  }
  async function verifyAndApprove(db: Firestore, data: Deck) {
    const parent = await getDoc(doc(db, 'presentations', 'deck'));
    expect(parent.data()).not.toHaveProperty('chunks');
    expect(parent.data()).not.toHaveProperty('links');
    let actualTotal = 0;
    for (let i = 0; i < data.chunkCount; i++) {
      const chunk = (await getDoc(doc(db, 'presentations', 'deck', 'chunks', String(i)))).data()!;
      expect(chunk.index).toBe(i);
      expect(chunk.data.toUint8Array().length).toBe(chunk.size);
      actualTotal += chunk.size;
    }
    expect(actualTotal).toBe(data.sizes.encoded);
    expect((await getDoc(doc(db, 'users', 'owner'))).data()?.pendingCount).toBe(1);
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'admins', 'admin'), { active: true }));
    const admin = member('admin');
    await runTransaction(admin, async tx => {
      const userRef = doc(admin, 'users', 'owner');
      const user = await tx.get(userRef);
      tx.update(doc(admin, 'presentations', 'deck'), {
        status: 'published', publishedAt: Timestamp.now(), reviewedAt: Timestamp.now(), reviewedBy: 'admin',
      });
      tx.update(userRef, { pendingCount: user.data()!.pendingCount - 1, pendingDeckId: 'deck' });
    });
    expect((await getDoc(doc(db, 'presentations', 'deck'))).data()?.status).toBe('published');
    expect((await getDoc(doc(db, 'users', 'owner'))).data()?.pendingCount).toBe(0);
    for (const reader of [env.unauthenticatedContext().firestore(), env.authenticatedContext('unverified', { email_verified: false }).firestore()]) {
      await assertFails(getDoc(doc(reader, 'presentations', 'deck')));
      await assertFails(getDoc(doc(reader, 'presentations', 'deck', 'chunks', '0')));
      await assertFails(getDoc(doc(reader, 'presentations', 'deck', 'links', '0')));
    }
    expect((await getDoc(doc(member('reader'), 'presentations', 'deck', 'chunks', '0'))).exists()).toBe(true);
  }
  it.each([1, 6, 12])('creates and approves %i chunks with 8 tags in single transactions', async count => {
    const db = member(); const data = deck(count);
    await create(db, data);
    await verifyAndApprove(db, data);
  }, 30_000);
  it.each([{ kind: 'html', encoded: 5242880, count: 6 }, { kind: 'pptx', encoded: 8388608, count: 10 }])(
    'creates and approves maximum $kind payload with 8 tags and maximum cover', async ({ kind, encoded, count }) => {
      const db = member(); const data = { ...deck(count, encoded, kind), cover: Bytes.fromUint8Array(new Uint8Array(150000)) };
      await create(db, data); await verifyAndApprove(db, data);
    }, 30_000);
  it('supports 12 chunks, 8 tags and 10 links together', async () => {
    const db = member(); const data = deck(12, 1201, 'html', 10);
    await create(db, data); await verifyAndApprove(db, data);
  }, 30_000);
  it.each(['wrong-size', 'wrong-index', 'wrong-data', 'foreign-field', 'missing-quota'] as Fault[])(
    'rejects %s and rolls back the complete transaction', async fault => {
      await assertFails(create(member(), deck(6), fault));
      await env.withSecurityRulesDisabled(async ctx => {
        expect((await getDoc(doc(ctx.firestore(), 'presentations', 'deck'))).exists()).toBe(false);
        expect((await getDoc(doc(ctx.firestore(), 'users', 'owner'))).exists()).toBe(false);
        expect((await getDoc(doc(ctx.firestore(), 'presentations', 'deck', 'chunks', '0'))).exists()).toBe(false);
      });
    });
  it.each([
    { chunkCount: 13 }, { chunkCount: 0 }, { chunkCount: 1.5 },
    { sizes: { encoded: 900001, unpacked: 1000, fileCount: 1 } },
    { sizes: { encoded: 1, unpacked: 26214401, fileCount: 1 } },
    { sizes: { encoded: 1, unpacked: 1000, fileCount: 301 } },
    { tags: Array.from({ length: 9 }, (_, i) => `tag-${i}`) },
    { chunks: [{ index: 0, size: 101 }] }, { manifestVersion: 1 },
  ])('rejects invalid parent schema %#', async patch => {
    // No child loop for malformed numeric counts; parent + quota is sufficient to test denial.
    const db = member();
    await assertFails(runTransaction(db, async tx => {
      tx.set(doc(db, 'presentations', 'deck'), { ...parent(deck(1)), ...patch });
      tx.set(doc(db, 'users', 'owner'), { displayName: 'Owner', email: 'owner@example.com',
        createdAt: Timestamp.now(), pendingCount: 1, pendingDeckId: 'deck' });
    }));
  });
  it('binds root ownership to the authenticated caller', async () => {
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'users', 'owner'), {
      displayName: 'Owner', email: 'owner@example.com', createdAt: Timestamp.now(), pendingCount: 0,
    }));
    await assertFails(create(member('intruder'), deck(1)));
  });
});
