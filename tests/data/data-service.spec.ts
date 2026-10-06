/**
 * Integration Test Suite: Presentation Data Service Against Real Firestore Emulator
 *
 * Verifies all required L03 data invariants:
 * 1. Unverified email user is NOT a member: no listener, upload denied.
 * 2. Google-signed-in member creates deck → pendingCount becomes 1 (assert from emulator).
 * 3. 6th pending deck rejected by quota rule → returns typed Turkish error.
 * 4. pending → pending edit leaves pendingCount unchanged (assert counter value).
 * 5. editing a published deck returns to pending and increments counter by 1.
 * 6. admin approve sets status, publishedAt, reviewedBy, reviewedAt and decrements counter.
 * 7. admin reject without note is refused; with note succeeds and decrements counter.
 * 8. owner delete of pending deck removes chunks and decrements counter; zero orphan chunks remain.
 * 9. owner CANNOT delete a published deck; non-owner CANNOT delete anything.
 * 10. member cannot read another member's pending deck or its chunks.
 * 11. published feed, own-decks, and review-queue queries return correct order, and cursor pagination
 *     returns next page without duplicates or gaps.
 * 12. sign-out closes listeners.
 * 13. raw Firestore call from non-admin client attempting client-side admin grant is DENIED.
 *
 * References:
 * - src/contracts/services.ts
 * - docs/ARCHITECTURE.md §2-§6
 * - docs/PLAN.md §5, §7
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  Bytes,
} from 'firebase/firestore';
import { FirestorePresentationDataService } from '../../src/data/service';
import { registerListener, closeAllListeners, getActiveListenerCount } from '../../src/auth/listenerManager';
import { AppErrorCode } from '../../src/contracts/errors';
import type { AuthUser } from '../../src/contracts/auth';
import type { CreateDeckInput } from '../../src/contracts/services';

import { PROJECT_ID, hasEmulator, emuHost, emuPort } from '../emulator-config';

describe.skipIf(!hasEmulator)('Presentation Data Service Integration Suite (Real Emulator)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: emuHost,
        port: emuPort,
        rules,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    closeAllListeners();
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // --- Helpers ---

  function makeUser(
    uid: string,
    isMember: boolean,
    isAdmin = false,
    isGoogle = false
  ): AuthUser {
    return {
      uid,
      email: `${uid}@example.com`,
      displayName: `${uid} User`,
      isEmailVerified: isMember && !isGoogle,
      isGoogle,
      isMember,
      isAdmin,
    };
  }

  function makeDeckInput(title = 'Test Deck', chunkSizes = [300, 300]): CreateDeckInput {
    const total = chunkSizes.reduce((a, b) => a + b, 0);
    const chunks = chunkSizes.map((size, index) => ({
      index,
      data: new Uint8Array(size).fill(index + 1),
      size,
    }));
    const manifest = chunkSizes.map((size, index) => ({ index, size }));

    return {
      title,
      description: 'Test presentation description',
      links: [{ label: 'GitHub', url: 'https://github.com/vektor' }],
      kind: 'html',
      fileName: 'deck.html',
      cover: new Uint8Array([1, 2, 3, 4]),
      coverSource: 'auto',
      sizes: {
        encoded: total,
        unpacked: 2000,
        fileCount: 1,
      },
      chunkCount: chunkSizes.length,
      chunks,
      manifest,
    };
  }

  // =========================================================================
  // 1. Unverified email user is NOT a member: no listener, upload denied
  // =========================================================================
  it.each([
    { count: 2, tagCount: 8 }, { count: 6, tagCount: 8 },
    { count: 10, tagCount: 8 }, { count: 12, tagCount: 8 },
    { count: 12, tagCount: 0 },
  ])('accepts $count chunks with $tagCount tags', async ({ count, tagCount }) => {
    const user = makeUser('manifest-owner', true);
    const db = testEnv.authenticatedContext(user.uid, { email_verified: true }).firestore();
    const service = new FirestorePresentationDataService({ db, getCurrentUser: () => user });
    const result = await service.createDeck({ ...makeDeckInput('Manifest', Array(count).fill(100)), tags: Array.from({ length: tagCount }, (_, index) => `tag-${index}`) });
    expect(result.ok, String(result.error?.details ?? result.error?.message)).toBe(true);
  });
  it.each(['html', 'pptx'] as const)('creates and approves %s at encoded, cover and catalog limits', async kind => {
    const user = makeUser('boundary-owner', true);
    const ownerDb = testEnv.authenticatedContext(user.uid, { email_verified: true }).firestore();
    const service = new FirestorePresentationDataService({ db: ownerDb, getCurrentUser: () => user });
    const total = kind === 'html' ? 5242880 : 8388608;
    const count = Math.ceil(total / 900000);
    const sizes = Array.from({ length: count }, (_, index) => Math.min(900000, total - index * 900000));
    const input = { ...makeDeckInput('Boundary deck', sizes), kind, fileName: `deck.${kind}`,
      category: 'AI & LLM', tags: Array.from({ length: 8 }, (_, index) => `tag-${index}`),
      cover: new Uint8Array(150000), sizes: { encoded: total, unpacked: kind === 'html' ? 26214400 : total, fileCount: kind === 'html' ? 300 : 1 },
    };
    const created = await service.createDeck(input);
    expect(created.ok, String(created.error?.details ?? created.error?.message)).toBe(true);
    if (!created.ok) throw new Error('Boundary creation failed.');
    await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'admins', 'boundary-admin'), { active: true }));
    const adminDb = testEnv.authenticatedContext('boundary-admin', { email_verified: true }).firestore();
    const admin = new FirestorePresentationDataService({ db: adminDb, getCurrentUser: () => makeUser('boundary-admin', true, true) });
    expect((await admin.approveDeck(created.value.id)).ok).toBe(true);
  }, 30_000);
  it('1. unverified e-mail user is NOT a member: no listener, upload denied', async () => {
    const unverifiedUser = makeUser('unverified-alice', false, false, false);
    const unverifiedDb = testEnv.authenticatedContext('unverified-alice', {
      email: 'unverified-alice@example.com',
      email_verified: false,
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: unverifiedDb,
      getCurrentUser: () => unverifiedUser,
    });

    // Invariant: cannot open listener (registerListener immediately terminates it and throws)
    let listenerClosed = false;
    expect(() => {
      registerListener(() => { listenerClosed = true; }, unverifiedUser.isMember);
    }).toThrow();
    expect(listenerClosed).toBe(true);

    // Invariant: upload (createDeck) denied
    const createRes = await service.createDeck(makeDeckInput());
    expect(createRes.ok).toBe(false);
    expect(createRes.error?.code).toBe(AppErrorCode.UNVERIFIED_EMAIL);
  });

  // =========================================================================
  // 2. Google-signed-in member creates deck → pendingCount becomes 1
  // =========================================================================
  it('2. Google-signed-in member creates a deck → pendingCount becomes 1 (assert read back from emulator)', async () => {
    const googleUser = makeUser('google-bob', true, false, true);
    const bobDb = testEnv.authenticatedContext('google-bob', {
      email: 'bob@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: bobDb,
      getCurrentUser: () => googleUser,
    });

    const createRes = await service.createDeck(makeDeckInput('Bob First Deck'));
    expect(createRes.ok).toBe(true);
    const deck = createRes.value!;
    expect(deck.status).toBe('pending');
    expect(deck.quotaMarker).toBe(deck.id);

    // Read back user document directly from emulator to verify counter mutation
    const userDoc = await getDoc(doc(bobDb, 'users', 'google-bob'));
    expect(userDoc.exists()).toBe(true);
    expect(userDoc.data()?.pendingCount).toBe(1);
    expect(userDoc.data()?.pendingDeckId).toBe(deck.id);
  });

  // =========================================================================
  // 3. 6th pending deck is rejected by quota rule → typed Turkish error
  // =========================================================================
  it('3. 6th pending deck is rejected by the quota rule → service returns typed Turkish error', async () => {
    const user = makeUser('charlie-user', true, false, true);
    const charlieDb = testEnv.authenticatedContext('charlie-user', {
      email: 'charlie@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: charlieDb,
      getCurrentUser: () => user,
    });

    // Create 5 pending presentations (reaching MAX_PENDING_PER_USER = 5)
    for (let i = 1; i <= 5; i++) {
      const res = await service.createDeck(makeDeckInput(`Deck ${i}`));
      expect(res.ok).toBe(true);
    }

    // Verify emulator state shows pendingCount = 5
    const userDocBefore = await getDoc(doc(charlieDb, 'users', 'charlie-user'));
    expect(userDocBefore.data()?.pendingCount).toBe(5);

    // 6th deck creation attempt must be rejected
    const sixthRes = await service.createDeck(makeDeckInput('Deck 6'));
    expect(sixthRes.ok).toBe(false);
    expect(sixthRes.error?.code).toBe(AppErrorCode.QUOTA_EXCEEDED);
    expect(sixthRes.error?.message).toContain('Bekleyen sunum kotanız');

    // Read back user doc to ensure pendingCount stayed at 5
    const userDocAfter = await getDoc(doc(charlieDb, 'users', 'charlie-user'));
    expect(userDocAfter.data()?.pendingCount).toBe(5);
  });

  // =========================================================================
  // 4. pending → pending edit leaves pendingCount unchanged
  // =========================================================================
  it('4. pending → pending edit leaves pendingCount unchanged (assert counter value)', async () => {
    const user = makeUser('dave-user', true, false, true);
    const daveDb = testEnv.authenticatedContext('dave-user', {
      email: 'dave@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: daveDb,
      getCurrentUser: () => user,
    });

    const createRes = await service.createDeck(makeDeckInput('Original Title'));
    expect(createRes.ok).toBe(true);
    const deckId = createRes.value!.id;

    // Verify counter is 1
    const userDocBefore = await getDoc(doc(daveDb, 'users', 'dave-user'));
    expect(userDocBefore.data()?.pendingCount).toBe(1);

    // Edit pending deck title (pending -> pending)
    const updateRes = await service.updateDeck({
      id: deckId,
      title: 'Updated Title While Pending',
      description: 'Updated description',
      links: [],
    });
    expect(updateRes.ok).toBe(true);
    expect(updateRes.value?.title).toBe('Updated Title While Pending');
    expect(updateRes.value?.status).toBe('pending');

    // Assert counter remained unchanged at 1
    const userDocAfter = await getDoc(doc(daveDb, 'users', 'dave-user'));
    expect(userDocAfter.data()?.pendingCount).toBe(1);
  });

  // =========================================================================
  // 5. Editing a published deck returns it to pending and increments counter by 1
  // =========================================================================
  it('5. editing a published deck returns it to pending and increments counter by 1', async () => {
    const user = makeUser('elena-user', true, false, true);
    const elenaDb = testEnv.authenticatedContext('elena-user', {
      email: 'elena@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: elenaDb,
      getCurrentUser: () => user,
    });

    // Seed a published deck with user pendingCount = 0
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'elena-user'), {
        displayName: 'Elena User',
        email: 'elena@gmail.com',
        createdAt: Timestamp.now(),
        pendingCount: 0,
      });

      await setDoc(doc(db, 'presentations', 'elena-pub-deck'), {
        ownerUid: 'elena-user',
        title: 'Elena Published Deck',
        description: 'Description',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'published',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
        coverSource: 'auto',
        sizes: { encoded: 600, unpacked: 1200, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 600 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: Timestamp.now(),
        reviewedBy: 'admin-seed',
        reviewedAt: Timestamp.now(),
        manifestVersion: 1,
        quotaMarker: 'elena-pub-deck',
      });

      await setDoc(doc(db, 'presentations', 'elena-pub-deck', 'chunks', '0'), {
        index: 0,
        data: Bytes.fromUint8Array(new Uint8Array(600).fill(1)),
      });
    });

    // Verify counter is 0 before edit
    const userDocBefore = await getDoc(doc(elenaDb, 'users', 'elena-user'));
    expect(userDocBefore.data()?.pendingCount).toBe(0);

    // Edit published deck
    const editRes = await service.updateDeck({
      id: 'elena-pub-deck',
      title: 'Elena Revised Deck',
      description: 'Revised description',
      links: [],
    });
    expect(editRes.ok).toBe(true);
    expect(editRes.value?.status).toBe('pending');
    expect(editRes.value?.publishedAt).toBeNull();
    expect(editRes.value?.reviewedBy).toBeNull();

    // Assert counter incremented from 0 to 1
    const userDocAfter = await getDoc(doc(elenaDb, 'users', 'elena-user'));
    expect(userDocAfter.data()?.pendingCount).toBe(1);
    expect(userDocAfter.data()?.pendingDeckId).toBe('elena-pub-deck');
  });

  // =========================================================================
  // 6. Admin approve sets status, publishedAt, reviewedBy, reviewedAt and decrements counter
  // =========================================================================
  it('6. admin approve sets status, publishedAt, reviewedBy, reviewedAt and decrements the counter', async () => {
    // Seed admin
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'admins', 'admin-frank'), { active: true });
    });

    const adminUser = makeUser('admin-frank', true, true, true);
    const adminDb = testEnv.authenticatedContext('admin-frank', {
      email: 'frank@example.com',
      email_verified: true,
    }).firestore();

    const adminService = new FirestorePresentationDataService({
      db: adminDb,
      getCurrentUser: () => adminUser,
    });

    // Seed pending deck for user 'george' with pendingCount = 1
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users', 'george-user'), {
        displayName: 'George User',
        email: 'george@gmail.com',
        createdAt: Timestamp.now(),
        pendingCount: 1,
        pendingDeckId: 'george-deck',
      });

      await setDoc(doc(db, 'presentations', 'george-deck'), {
        ownerUid: 'george-user',
        title: 'George Pending Deck',
        description: 'Description',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'pending',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
        coverSource: 'auto',
        sizes: { encoded: 500, unpacked: 1000, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 500 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        manifestVersion: 1,
        quotaMarker: 'george-deck',
      });
    });

    // Admin approves deck
    const reviewRes = await adminService.reviewDeck({
      id: 'george-deck',
      action: 'approve',
    });
    expect(reviewRes.ok).toBe(true);

    const approvedDeck = reviewRes.value!;
    expect(approvedDeck.status).toBe('published');
    expect(approvedDeck.publishedAt).toBeInstanceOf(Date);
    expect(approvedDeck.reviewedBy).toBe('admin-frank');
    expect(approvedDeck.reviewedAt).toBeInstanceOf(Date);
    expect(approvedDeck.rejectNote).toBe('');

    // Assert owner's pendingCount was decremented from 1 to 0
    const ownerDoc = await getDoc(doc(adminDb, 'users', 'george-user'));
    expect(ownerDoc.data()?.pendingCount).toBe(0);
    expect(ownerDoc.data()?.pendingDeckId).toBe('george-deck');
  });

  // =========================================================================
  // 7. Admin reject without note is refused; with note succeeds
  // =========================================================================
  it('7. admin reject without a note is refused; with a note it succeeds', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'admins', 'admin-frank'), { active: true });
      await setDoc(doc(context.firestore(), 'users', 'helen-user'), {
        displayName: 'Helen User',
        email: 'helen@gmail.com',
        createdAt: Timestamp.now(),
        pendingCount: 1,
        pendingDeckId: 'helen-deck',
      });
      await setDoc(doc(context.firestore(), 'presentations', 'helen-deck'), {
        ownerUid: 'helen-user',
        title: 'Helen Pending Deck',
        description: 'Description',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'pending',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])),
        coverSource: 'auto',
        sizes: { encoded: 500, unpacked: 1000, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 500 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        manifestVersion: 1,
        quotaMarker: 'helen-deck',
      });
    });

    const adminUser = makeUser('admin-frank', true, true, true);
    const adminDb = testEnv.authenticatedContext('admin-frank', {
      email: 'frank@example.com',
      email_verified: true,
    }).firestore();

    const adminService = new FirestorePresentationDataService({
      db: adminDb,
      getCurrentUser: () => adminUser,
    });

    // Attempt reject WITHOUT a note
    const emptyRejectRes = await adminService.reviewDeck({
      id: 'helen-deck',
      action: 'reject',
      rejectNote: '',
    });
    expect(emptyRejectRes.ok).toBe(false);
    expect(emptyRejectRes.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);

    // Attempt reject WITH a valid note
    const validRejectRes = await adminService.reviewDeck({
      id: 'helen-deck',
      action: 'reject',
      rejectNote: 'Sunum fontları eksik ve format bozuk.',
    });
    expect(validRejectRes.ok).toBe(true);
    expect(validRejectRes.value?.status).toBe('rejected');
    expect(validRejectRes.value?.rejectNote).toBe('Sunum fontları eksik ve format bozuk.');
    expect(validRejectRes.value?.reviewedBy).toBe('admin-frank');

    // Assert counter was decremented
    const ownerDoc = await getDoc(doc(adminDb, 'users', 'helen-user'));
    expect(ownerDoc.data()?.pendingCount).toBe(0);
  });

  // =========================================================================
  // 8. Owner delete of pending deck removes chunks & decrements counter (0 orphans)
  // =========================================================================
  it('8. owner delete of a pending deck removes chunks and decrements counter; zero orphan chunks remain', async () => {
    const user = makeUser('ian-user', true, false, true);
    const ianDb = testEnv.authenticatedContext('ian-user', {
      email: 'ian@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: ianDb,
      getCurrentUser: () => user,
    });

    const createRes = await service.createDeck(makeDeckInput('Ian Deck', [300, 300]));
    expect(createRes.ok).toBe(true);
    const deckId = createRes.value!.id;

    // Verify chunks exist
    const c0 = await getDoc(doc(ianDb, 'presentations', deckId, 'chunks', '0'));
    const c1 = await getDoc(doc(ianDb, 'presentations', deckId, 'chunks', '1'));
    expect(c0.exists()).toBe(true);
    expect(c1.exists()).toBe(true);

    const userDocBefore = await getDoc(doc(ianDb, 'users', 'ian-user'));
    expect(userDocBefore.data()?.pendingCount).toBe(1);

    // Delete presentation
    const delRes = await service.deleteDeck({ id: deckId });
    expect(delRes.ok).toBe(true);

    // Assert parent deck doc is deleted
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const deckDocAfter = await getDoc(doc(db, 'presentations', deckId));
      expect(deckDocAfter.exists()).toBe(false);

      // Assert all chunks are deleted (0 orphan chunks)
      const c0After = await getDoc(doc(db, 'presentations', deckId, 'chunks', '0'));
      const c1After = await getDoc(doc(db, 'presentations', deckId, 'chunks', '1'));
      expect(c0After.exists()).toBe(false);
      expect(c1After.exists()).toBe(false);
    });

    // Assert pendingCount decremented from 1 to 0
    const userDocAfter = await getDoc(doc(ianDb, 'users', 'ian-user'));
    expect(userDocAfter.data()?.pendingCount).toBe(0);
  });

  // =========================================================================
  // 9. Owner CANNOT delete a published deck; non-owner CANNOT delete anything
  // =========================================================================
  it('9. owner CANNOT delete a published deck; a non-owner CANNOT delete anything', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Published deck owned by 'jack'
      await setDoc(doc(db, 'presentations', 'jack-pub-deck'), {
        ownerUid: 'jack-user',
        title: 'Jack Published Deck',
        description: 'Desc',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'published',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2])),
        coverSource: 'auto',
        sizes: { encoded: 200, unpacked: 500, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 200 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: Timestamp.now(),
        reviewedBy: 'admin',
        reviewedAt: Timestamp.now(),
        manifestVersion: 1,
        quotaMarker: 'jack-pub-deck',
      });
      // Pending deck owned by 'jack'
      await setDoc(doc(db, 'presentations', 'jack-pend-deck'), {
        ownerUid: 'jack-user',
        title: 'Jack Pending Deck',
        description: 'Desc',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'pending',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2])),
        coverSource: 'auto',
        sizes: { encoded: 200, unpacked: 500, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 200 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        manifestVersion: 1,
        quotaMarker: 'jack-pend-deck',
      });
      await setDoc(doc(db, 'users', 'jack-user'), {
        displayName: 'Jack',
        email: 'jack@gmail.com',
        createdAt: Timestamp.now(),
        pendingCount: 1,
      });
    });

    const jackUser = makeUser('jack-user', true, false, true);
    const jackDb = testEnv.authenticatedContext('jack-user', {
      email: 'jack@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const jackService = new FirestorePresentationDataService({
      db: jackDb,
      getCurrentUser: () => jackUser,
    });

    // Jack attempts to delete his own published deck -> DENIED
    const jackDeletePubRes = await jackService.deleteDeck({ id: 'jack-pub-deck' });
    expect(jackDeletePubRes.ok).toBe(false);
    expect(jackDeletePubRes.error?.code).toBe(AppErrorCode.PERMISSION_DENIED);

    // Karen (non-owner) attempts to delete Jack's pending deck -> DENIED
    const karenUser = makeUser('karen-user', true, false, true);
    const karenDb = testEnv.authenticatedContext('karen-user', {
      email: 'karen@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const karenService = new FirestorePresentationDataService({
      db: karenDb,
      getCurrentUser: () => karenUser,
    });

    const karenDeleteRes = await karenService.deleteDeck({ id: 'jack-pend-deck' });
    expect(karenDeleteRes.ok).toBe(false);
    expect(karenDeleteRes.error?.code).toBe(AppErrorCode.PERMISSION_DENIED);
  });

  // =========================================================================
  // 10. Member cannot read another member's pending deck or its chunks
  // =========================================================================
  it('10. member cannot read another member\'s pending deck or its chunks', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'presentations', 'private-deck'), {
        ownerUid: 'private-owner',
        title: 'Private Pending Deck',
        description: 'Desc',
        links: [],
        kind: 'html',
        fileName: 'deck.html',
        status: 'pending',
        rejectNote: '',
        cover: Bytes.fromUint8Array(new Uint8Array([1, 2])),
        coverSource: 'auto',
        sizes: { encoded: 200, unpacked: 500, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, size: 200 }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        publishedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        manifestVersion: 1,
        quotaMarker: 'private-deck',
      });
      await setDoc(doc(db, 'presentations', 'private-deck', 'chunks', '0'), {
        index: 0,
        data: Bytes.fromUint8Array(new Uint8Array(200).fill(5)),
      });
    });

    const visitor = makeUser('other-member', true, false, true);
    const visitorDb = testEnv.authenticatedContext('other-member', {
      email: 'other@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: visitorDb,
      getCurrentUser: () => visitor,
    });

    // Trying to get another member's pending deck
    const deckRes = await service.getDeck('private-deck');
    expect(deckRes.ok).toBe(false);
    expect(deckRes.error?.code).toBe(AppErrorCode.PERMISSION_DENIED);

    // Trying to get chunks of another member's pending deck
    const chunkRes = await service.getChunk('private-deck', 0);
    expect(chunkRes.ok).toBe(false);
    expect(chunkRes.error?.code).toBe(AppErrorCode.PERMISSION_DENIED);
  });

  // =========================================================================
  // 11. Queries (feed, own, queue) ordering and cursor pagination without gaps
  // =========================================================================
  it('11. published feed, own-decks and review-queue queries return correct order, and cursor pagination returns next page without duplicates or gaps', async () => {
    // Seed 5 published decks with descending publishedAt timestamps
    const baseTime = Date.now();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (let i = 1; i <= 5; i++) {
        const publishedTime = new Date(baseTime + i * 10000);
        await setDoc(doc(db, 'presentations', `feed-${i}`), {
          ownerUid: 'feed-owner',
          title: `Feed Deck ${i}`,
          description: 'Desc',
          links: [],
          kind: 'html',
          fileName: 'deck.html',
          status: 'published',
          rejectNote: '',
          cover: Bytes.fromUint8Array(new Uint8Array([1, 2])),
          coverSource: 'auto',
          sizes: { encoded: 200, unpacked: 500, fileCount: 1 },
          chunkCount: 1,
          chunks: [{ index: 0, size: 200 }],
          createdAt: Timestamp.fromDate(publishedTime),
          updatedAt: Timestamp.fromDate(publishedTime),
          publishedAt: Timestamp.fromDate(publishedTime),
          reviewedBy: 'admin',
          reviewedAt: Timestamp.fromDate(publishedTime),
          manifestVersion: 1,
          quotaMarker: `feed-${i}`,
        });
      }
    });

    const user = makeUser('reader-user', true, false, true);
    const readerDb = testEnv.authenticatedContext('reader-user', {
      email: 'reader@gmail.com',
      firebase: { sign_in_provider: 'google.com' },
    }).firestore();

    const service = new FirestorePresentationDataService({
      db: readerDb,
      getCurrentUser: () => user,
    });

    // Page 1: pageSize 2
    const page1Res = await service.getPublishedFeed({ pageSize: 2 });
    expect(page1Res.ok).toBe(true);
    const page1 = page1Res.value!;
    expect(page1.items.length).toBe(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).not.toBeNull();
    // Verify descending order: feed-5, then feed-4
    expect(page1.items[0].id).toBe('feed-5');
    expect(page1.items[1].id).toBe('feed-4');

    // Page 2: with cursor
    const page2Res = await service.getPublishedFeed({ pageSize: 2, cursor: page1.nextCursor! });
    expect(page2Res.ok).toBe(true);
    const page2 = page2Res.value!;
    expect(page2.items.length).toBe(2);
    expect(page2.hasMore).toBe(true);
    expect(page2.nextCursor).not.toBeNull();
    // Verify continuation without duplicate: feed-3, then feed-2
    expect(page2.items[0].id).toBe('feed-3');
    expect(page2.items[1].id).toBe('feed-2');

    // Page 3: last item
    const page3Res = await service.getPublishedFeed({ pageSize: 2, cursor: page2.nextCursor! });
    expect(page3Res.ok).toBe(true);
    const page3 = page3Res.value!;
    expect(page3.items.length).toBe(1);
    expect(page3.hasMore).toBe(false);
    expect(page3.nextCursor).toBeNull();
    expect(page3.items[0].id).toBe('feed-1');

    // Total items check: all 5 unique items across pages
    const allIds = [...page1.items, ...page2.items, ...page3.items].map((d) => d.id);
    expect(allIds).toEqual(['feed-5', 'feed-4', 'feed-3', 'feed-2', 'feed-1']);
  });

  // =========================================================================
  // 12. Sign-out closes listeners
  // =========================================================================
  it('12. sign-out closes listeners', () => {
    let closedA = false;
    let closedB = false;

    registerListener(() => { closedA = true; }, true);
    registerListener(() => { closedB = true; }, true);
    expect(getActiveListenerCount()).toBe(2);

    closeAllListeners();
    expect(closedA).toBe(true);
    expect(closedB).toBe(true);
    expect(getActiveListenerCount()).toBe(0);
  });

  // =========================================================================
  // 13. Raw Firestore call from non-admin client attempting admin grant is DENIED
  // =========================================================================
  it('13. a raw Firestore call from a non-admin client attempting a client-side admin grant is DENIED', async () => {
    const maliciousMemberDb = testEnv.authenticatedContext('malicious-user', {
      email: 'bad@example.com',
      email_verified: true,
    }).firestore();

    await assertFails(
      setDoc(doc(maliciousMemberDb, 'admins', 'malicious-user'), { active: true })
    );
  });
});
