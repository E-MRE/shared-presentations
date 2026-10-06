/**
 * Comprehensive Firestore Security Rules Test Suite
 *
 * Verifies all security contracts, access controls, quota transitions,
 * manifest integrity, and negative controls against the real Firestore emulator.
 *
 * References:
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §4, §5
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Bytes,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'shared-presentations';
const hasEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const emulatorHostEnv = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [emuHost, emuPortStr] = emulatorHostEnv.split(':');
const emuPort = parseInt(emuPortStr, 10);

describe.skipIf(!hasEmulator)('Firestore Security Rules Suite', () => {
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
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // --- Fixture Helpers ---

  function createValidDeckData(id: string, ownerUid: string, overrides: Record<string, unknown> = {}) {
    const c0 = 500;
    const c1 = 500;
    const total = c0 + c1;

    return {
      ownerUid,
      ownerName: 'Alice Test',
      ownerPhotoURL: 'https://example.com/avatar.jpg',
      title: 'Valid Presentation Title',
      description: 'Valid presentation description that complies with limits.',
      links: [{ label: 'GitHub', url: 'https://github.com/example/repo' }],
      kind: 'html',
      fileName: 'deck.html',
      status: 'pending',
      rejectNote: '',
      cover: Bytes.fromUint8Array(new Uint8Array([1, 2, 3, 4])),
      coverSource: 'auto',
      sizes: {
        encoded: total,
        unpacked: 2500,
        fileCount: 1,
      },
      chunkCount: 2,
      chunks: [
        { index: 0, size: c0 },
        { index: 1, size: c1 },
      ],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      publishedAt: null,
      reviewedBy: null,
      reviewedAt: null,
      manifestVersion: 1,
      quotaMarker: id,
      ...overrides,
    };
  }

  async function seedUser(uid: string, pendingCount = 0, pendingDeckId?: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const userRef = doc(db, 'users', uid);
      const data: Record<string, unknown> = {
        displayName: `${uid} Name`,
        email: `${uid}@example.com`,
        createdAt: Timestamp.now(),
        pendingCount,
      };
      if (pendingDeckId) {
        data.pendingDeckId = pendingDeckId;
      }
      await setDoc(userRef, data);
    });
  }

  async function seedAdmin(uid: string) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'admins', uid), { active: true });
    });
  }

  async function seedDeck(deckId: string, ownerUid: string, overrides: Record<string, unknown> = {}) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const deckData = createValidDeckData(deckId, ownerUid, overrides);
      await setDoc(doc(db, 'presentations', deckId), deckData);

      // Seed chunks matching manifest
      const chunks = (deckData.chunks as Array<{ index: number; size: number }>) || [];
      for (const ch of chunks) {
        const chunkRef = doc(db, 'presentations', deckId, 'chunks', String(ch.index));
        const dummyBytes = new Uint8Array(ch.size).fill(7);
        await setDoc(chunkRef, {
          index: ch.index,
          data: Bytes.fromUint8Array(dummyBytes),
        });
      }
    });
  }

  // =========================================================================
  // 1. READ PERMISSIONS: Anonymous vs Member vs Admin
  // =========================================================================

  describe('1. Read Permissions', () => {
    it('unverified users cannot read published metadata or chunks', async () => {
      await seedDeck('published-private', 'alice', { status: 'published', publishedAt: Timestamp.now() });
      const db = testEnv.authenticatedContext('unverified', { email: 'test@example.com', email_verified: false }).firestore();
      await assertFails(getDoc(doc(db, 'presentations', 'published-private')));
      await assertFails(getDoc(doc(db, 'presentations', 'published-private', 'chunks', '0')));
    });

    it('inactive or malformed admin markers grant no private read access', async () => {
      await seedDeck('private-admin-test', 'alice');
      for (const active of [false, 'true']) {
        await testEnv.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'admins', 'revoked'), { active }));
        const db = testEnv.authenticatedContext('revoked', { email: 'revoked@example.com', email_verified: true }).firestore();
        await assertFails(getDoc(doc(db, 'presentations', 'private-admin-test')));
        await assertFails(getDoc(doc(db, 'presentations', 'private-admin-test', 'chunks', '0')));
      }
    });

    it('anonymous user cannot read published or pending decks', async () => {
      await seedDeck('pub-deck', 'alice', { status: 'published', publishedAt: Timestamp.now() });
      await seedDeck('pend-deck', 'alice', { status: 'pending' });

      const anonDb = testEnv.unauthenticatedContext().firestore();

      // Published deck: DENIED
      await assertFails(getDoc(doc(anonDb, 'presentations', 'pub-deck')));

      // Non-published deck: DENIED
      await assertFails(getDoc(doc(anonDb, 'presentations', 'pend-deck')));
    });

    it('member reads another member\'s pending deck → DENIED', async () => {
      await seedDeck('alice-pend', 'alice', { status: 'pending' });

      const bobDb = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
        email_verified: true,
      }).firestore();

      await assertFails(getDoc(doc(bobDb, 'presentations', 'alice-pend')));
    });

    it('member reads another member\'s deck chunks → DENIED', async () => {
      await seedDeck('alice-pend', 'alice', { status: 'pending' });

      const bobDb = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
        email_verified: true,
      }).firestore();

      await assertFails(getDoc(doc(bobDb, 'presentations', 'alice-pend', 'chunks', '0')));
    });

    it('member reads their own pending deck and chunks → ALLOWED', async () => {
      await seedDeck('alice-pend', 'alice', { status: 'pending' });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      await assertSucceeds(getDoc(doc(aliceDb, 'presentations', 'alice-pend')));
      await assertSucceeds(getDoc(doc(aliceDb, 'presentations', 'alice-pend', 'chunks', '0')));
    });

    it('admin reads any pending deck and its chunks → ALLOWED', async () => {
      await seedAdmin('admin-eve');
      await seedDeck('alice-pend', 'alice', { status: 'pending' });

      const adminDb = testEnv.authenticatedContext('admin-eve', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      await assertSucceeds(getDoc(doc(adminDb, 'presentations', 'alice-pend')));
      await assertSucceeds(getDoc(doc(adminDb, 'presentations', 'alice-pend', 'chunks', '0')));
    });

    it('user profile documents are not listable by members → DENIED', async () => {
      await seedUser('alice', 0);
      await seedUser('bob', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // List users: DENIED
      await assertFails(getDocs(collection(aliceDb, 'users')));

      // Get own profile: ALLOWED
      await assertSucceeds(getDoc(doc(aliceDb, 'users', 'alice')));

      // Get other member's profile: DENIED
      await assertFails(getDoc(doc(aliceDb, 'users', 'bob')));
    });
  });

  // =========================================================================
  // 2. CREATE VALIDATION & FIELD ENFORCEMENT
  // =========================================================================

  describe('2. Create Validation and Schema Invariants', () => {
    it('member creates a deck and tries to set status: published directly → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const deckData = createValidDeckData('deck-1', 'alice', {
        status: 'published',
        publishedAt: Timestamp.now(),
      });
      batch.set(doc(aliceDb, 'presentations', 'deck-1'), deckData);
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-1',
      });

      await assertFails(batch.commit());
    });

    it('member writes a non-whitelisted field → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const deckData = createValidDeckData('deck-1', 'alice', {
        unwhitelistedField: 'attackPayload',
      });
      batch.set(doc(aliceDb, 'presentations', 'deck-1'), deckData);
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-1',
      });

      await assertFails(batch.commit());
    });

    it('member writes a field of the wrong type → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Title is number instead of string
      const batch1 = writeBatch(aliceDb);
      const deckData1 = createValidDeckData('deck-1', 'alice', {
        title: 12345,
      });
      batch1.set(doc(aliceDb, 'presentations', 'deck-1'), deckData1);
      batch1.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-1',
      });
      await assertFails(batch1.commit());

      // sizes.encoded is string instead of int
      const batch2 = writeBatch(aliceDb);
      const deckData2 = createValidDeckData('deck-2', 'alice', {
        sizes: { encoded: 'huge', unpacked: 100, fileCount: 1 },
      });
      batch2.set(doc(aliceDb, 'presentations', 'deck-2'), deckData2);
      batch2.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-2',
      });
      await assertFails(batch2.commit());
    });

    it('member creates an admins/{uid} doc → DENIED', async () => {
      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      await assertFails(setDoc(doc(aliceDb, 'admins', 'alice'), { role: 'admin' }));
      await assertFails(setDoc(doc(aliceDb, 'admins', 'any-id'), { role: 'admin' }));
    });

    it('links with non-https scheme or more than 10 links → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Non-https link
      const batch1 = writeBatch(aliceDb);
      const deckData1 = createValidDeckData('deck-http', 'alice', {
        links: [{ label: 'Insecure', url: 'http://insecure.example.com' }],
      });
      batch1.set(doc(aliceDb, 'presentations', 'deck-http'), deckData1);
      batch1.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-http',
      });
      await assertFails(batch1.commit());

      // 11 links (> 10)
      const batch2 = writeBatch(aliceDb);
      const elevenLinks = Array.from({ length: 11 }, (_, i) => ({
        label: `Link ${i}`,
        url: `https://example.com/${i}`,
      }));
      const deckData2 = createValidDeckData('deck-11links', 'alice', {
        links: elevenLinks,
      });
      batch2.set(doc(aliceDb, 'presentations', 'deck-11links'), deckData2);
      batch2.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-11links',
      });
      await assertFails(batch2.commit());
    });

    it('cover exceeding 150,000 bytes hard cap → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const hugeCover = new Uint8Array(150001); // 1 byte over hard cap
      const deckData = createValidDeckData('deck-cover', 'alice', {
        cover: Bytes.fromUint8Array(hugeCover),
      });
      batch.set(doc(aliceDb, 'presentations', 'deck-cover'), deckData);
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-cover',
      });
      await assertFails(batch.commit());
    });
  });

  // =========================================================================
  // 3. QUOTA TRANSACTION BINDING & MANIFEST INTEGRITY
  // =========================================================================

  describe('3. Quota Transaction Binding and Manifest Integrity', () => {
    it('member increments users/{self}.pendingCount outside bound transaction → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Alice tries to unilaterally update her pendingCount to 2 without creating a bound presentation
      await assertFails(
        updateDoc(doc(aliceDb, 'users', 'alice'), {
          pendingCount: 2,
          pendingDeckId: 'some-fake-deck',
        })
      );
    });

    it('member creates valid pending deck + chunks + counter increment (+1) in atomic batch → ALLOWED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const deckData = createValidDeckData('deck-valid', 'alice');
      batch.set(doc(aliceDb, 'presentations', 'deck-valid'), deckData);

      // Write chunk 0 (500 bytes)
      const ch0 = new Uint8Array(500).fill(1);
      batch.set(doc(aliceDb, 'presentations', 'deck-valid', 'chunks', '0'), {
        index: 0,
        data: Bytes.fromUint8Array(ch0),
      });

      // Write chunk 1 (500 bytes)
      const ch1 = new Uint8Array(500).fill(2);
      batch.set(doc(aliceDb, 'presentations', 'deck-valid', 'chunks', '1'), {
        index: 1,
        data: Bytes.fromUint8Array(ch1),
      });

      // Bound counter increment
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-valid',
      });

      await assertSucceeds(batch.commit());
    });

    it('member forges a manifest byte total that disagrees with real chunk bytes → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      // Manifest states chunks are [500, 500], sum = 1000
      const deckData = createValidDeckData('deck-forged', 'alice');
      batch.set(doc(aliceDb, 'presentations', 'deck-forged'), deckData);

      // Attacker writes chunk 0 with 600 bytes instead of 500 stated in manifest
      const forgedChunk0 = new Uint8Array(600).fill(1);
      batch.set(doc(aliceDb, 'presentations', 'deck-forged', 'chunks', '0'), {
        index: 0,
        data: Bytes.fromUint8Array(forgedChunk0),
      });

      const chunk1 = new Uint8Array(500).fill(2);
      batch.set(doc(aliceDb, 'presentations', 'deck-forged', 'chunks', '1'), {
        index: 1,
        data: Bytes.fromUint8Array(chunk1),
      });

      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-forged',
      });

      // DENIED because chunk size doesn't match deckAfter.chunks[0].size
      await assertFails(batch.commit());
    });

    it('manifest chunk sizes sum does not equal sizes.encoded → DENIED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      // chunks sum to 900, but sizes.encoded is 1000
      const deckData = createValidDeckData('deck-mismatch', 'alice', {
        sizes: { encoded: 1000, unpacked: 2000, fileCount: 1 },
        chunks: [
          { index: 0, size: 450 },
          { index: 1, size: 450 },
        ],
      });
      batch.set(doc(aliceDb, 'presentations', 'deck-mismatch'), deckData);
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-mismatch',
      });

      await assertFails(batch.commit());
    });

    it('creating several decks with a single counter increment → REJECTED', async () => {
      await seedUser('alice', 0);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const deckA = createValidDeckData('deck-A', 'alice');
      const deckB = createValidDeckData('deck-B', 'alice');

      batch.set(doc(aliceDb, 'presentations', 'deck-A'), deckA);
      batch.set(doc(aliceDb, 'presentations', 'deck-B'), deckB);

      // Single increment bound only to deck-A
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-A',
      });

      // REJECTED because deck-B requires userAfter.pendingDeckId == 'deck-B'
      await assertFails(batch.commit());
    });

    it('concurrent double-increment / 6th pending deck exceeding quota (5) → DENIED', async () => {
      // Alice already has 5 pending decks
      await seedUser('alice', 5);

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      const deck6 = createValidDeckData('deck-6', 'alice');
      batch.set(doc(aliceDb, 'presentations', 'deck-6'), deck6);
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 6,
        pendingDeckId: 'deck-6',
      });

      // Exceeds quota (pendingCount <= 5): DENIED
      await assertFails(batch.commit());
    });
  });

  // =========================================================================
  // 4. UPDATE MUTATIONS: Immutability, Pending Edit, Published Return
  // =========================================================================

  describe('4. Update Permissions and Immutability', () => {
    it('member tries to change ownerUid → DENIED', async () => {
      await seedUser('alice', 1);
      await seedDeck('deck-own', 'alice', { status: 'pending' });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Attempt to spoof ownerUid to 'bob'
      await assertFails(
        updateDoc(doc(aliceDb, 'presentations', 'deck-own'), {
          ownerUid: 'bob',
        })
      );
    });

    it('member updates their own pending deck (pending → pending) without changing counter → ALLOWED', async () => {
      await seedUser('alice', 1);
      await seedDeck('deck-pend', 'alice', { status: 'pending' });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Update title while keeping status pending; user pendingCount unchanged
      await assertSucceeds(
        updateDoc(doc(aliceDb, 'presentations', 'deck-pend'), {
          title: 'Updated Presentation Title',
          updatedAt: Timestamp.now(),
        })
      );
    });

    it('member edits a published deck back to pending → requires new pending slot (+1) → ALLOWED', async () => {
      await seedUser('alice', 0);
      await seedDeck('deck-pub', 'alice', {
        status: 'published',
        publishedAt: Timestamp.now(),
      });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      // Status forces back to pending on edit
      batch.update(doc(aliceDb, 'presentations', 'deck-pub'), {
        title: 'New Revision Title',
        status: 'pending',
        publishedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: Timestamp.now(),
      });
      // Slot increment (+1)
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 1,
        pendingDeckId: 'deck-pub',
      });

      await assertSucceeds(batch.commit());
    });
  });

  // =========================================================================
  // 5. ADMIN REVIEW ACTIONS & COUNTER DECREMENT
  // =========================================================================

  describe('5. Admin Review Actions', () => {
    it('admin approves pending deck (published) and decrements owner pendingCount → ALLOWED', async () => {
      await seedAdmin('admin-eve');
      await seedUser('alice', 1);
      await seedDeck('deck-review', 'alice', { status: 'pending' });

      const adminDb = testEnv.authenticatedContext('admin-eve', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(adminDb);
      batch.update(doc(adminDb, 'presentations', 'deck-review'), {
        status: 'published',
        publishedAt: Timestamp.now(),
        reviewedBy: 'admin-eve',
        reviewedAt: Timestamp.now(),
      });
      batch.update(doc(adminDb, 'users', 'alice'), {
        pendingCount: 0,
        pendingDeckId: 'deck-review',
      });

      await assertSucceeds(batch.commit());
    });

    it('admin rejects pending deck with required rejectNote and decrements pendingCount → ALLOWED', async () => {
      await seedAdmin('admin-eve');
      await seedUser('alice', 1);
      await seedDeck('deck-rej', 'alice', { status: 'pending' });

      const adminDb = testEnv.authenticatedContext('admin-eve', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(adminDb);
      batch.update(doc(adminDb, 'presentations', 'deck-rej'), {
        status: 'rejected',
        rejectNote: 'Needs title fix and better contrast in slides.',
        reviewedBy: 'admin-eve',
        reviewedAt: Timestamp.now(),
      });
      batch.update(doc(adminDb, 'users', 'alice'), {
        pendingCount: 0,
        pendingDeckId: 'deck-rej',
      });

      await assertSucceeds(batch.commit());
    });

    it('admin rejects without rejectNote → DENIED', async () => {
      await seedAdmin('admin-eve');
      await seedUser('alice', 1);
      await seedDeck('deck-rej2', 'alice', { status: 'pending' });

      const adminDb = testEnv.authenticatedContext('admin-eve', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(adminDb);
      batch.update(doc(adminDb, 'presentations', 'deck-rej2'), {
        status: 'rejected',
        rejectNote: '', // Empty reject note violates rejectNote.size() > 0
        reviewedBy: 'admin-eve',
        reviewedAt: Timestamp.now(),
      });
      batch.update(doc(adminDb, 'users', 'alice'), {
        pendingCount: 0,
        pendingDeckId: 'deck-rej2',
      });

      await assertFails(batch.commit());
    });
  });

  // =========================================================================
  // 6. DELETION & CLEANUP
  // =========================================================================

  describe('6. Deletion and Cleanup Invariants', () => {
    it('non-admin deletes a published deck → DENIED', async () => {
      await seedUser('alice', 0);
      await seedDeck('pub-deck', 'alice', {
        status: 'published',
        publishedAt: Timestamp.now(),
      });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      // Owner cannot delete published deck
      await assertFails(deleteDoc(doc(aliceDb, 'presentations', 'pub-deck')));

      const bobDb = testEnv.authenticatedContext('bob', {
        email: 'bob@example.com',
        email_verified: true,
      }).firestore();

      // Another member cannot delete published deck
      await assertFails(deleteDoc(doc(bobDb, 'presentations', 'pub-deck')));
    });

    it('owner deletes their own pending deck and decrements counter → ALLOWED', async () => {
      await seedUser('alice', 1);
      await seedDeck('alice-pend-del', 'alice', { status: 'pending' });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      // Delete presentation
      batch.delete(doc(aliceDb, 'presentations', 'alice-pend-del'));
      // Delete chunks
      batch.delete(doc(aliceDb, 'presentations', 'alice-pend-del', 'chunks', '0'));
      batch.delete(doc(aliceDb, 'presentations', 'alice-pend-del', 'chunks', '1'));
      // Decrement pending counter
      batch.update(doc(aliceDb, 'users', 'alice'), {
        pendingCount: 0,
        pendingDeckId: 'alice-pend-del',
      });

      await assertSucceeds(batch.commit());
    });

    it('admin deletes a published deck and its chunks → ALLOWED', async () => {
      await seedAdmin('admin-eve');
      await seedDeck('pub-del', 'alice', {
        status: 'published',
        publishedAt: Timestamp.now(),
      });

      const adminDb = testEnv.authenticatedContext('admin-eve', {
        email: 'admin@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(adminDb);
      batch.delete(doc(adminDb, 'presentations', 'pub-del'));
      batch.delete(doc(adminDb, 'presentations', 'pub-del', 'chunks', '0'));
      batch.delete(doc(adminDb, 'presentations', 'pub-del', 'chunks', '1'));

      await assertSucceeds(batch.commit());
    });

    it('replacement tail chunk cleanup on update → ALLOWED', async () => {
      await seedUser('alice', 1);
      // Seed deck with 3 chunks
      const chSize = 300;
      await seedDeck('tail-clean', 'alice', {
        status: 'pending',
        chunkCount: 3,
        sizes: { encoded: 900, unpacked: 2000, fileCount: 1 },
        chunks: [
          { index: 0, size: chSize },
          { index: 1, size: chSize },
          { index: 2, size: chSize },
        ],
      });

      const aliceDb = testEnv.authenticatedContext('alice', {
        email: 'alice@example.com',
        email_verified: true,
      }).firestore();

      const batch = writeBatch(aliceDb);
      // Update deck to 2 chunks
      batch.update(doc(aliceDb, 'presentations', 'tail-clean'), {
        chunkCount: 2,
        sizes: { encoded: 600, unpacked: 2000, fileCount: 1 },
        chunks: [
          { index: 0, size: chSize },
          { index: 1, size: chSize },
        ],
        updatedAt: Timestamp.now(),
      });
      // Delete old tail chunk 2
      batch.delete(doc(aliceDb, 'presentations', 'tail-clean', 'chunks', '2'));

      await assertSucceeds(batch.commit());
    });
  });
});
