/**
 * Firestore Presentation Data Service Implementation
 *
 * Implements PresentationDataService from src/contracts/services.ts.
 * Enforces two-way quota binding, atomic transactions, tail cleanup,
 * orphan cleanup, and cursor pagination across the three indexed queries.
 *
 * References:
 * - src/contracts/services.ts
 * - src/contracts/models.ts
 * - src/contracts/limits.ts
 * - docs/ARCHITECTURE.md §2-§6
 * - docs/PLAN.md §5, §7
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  deleteField,
  Bytes,
  type Firestore,
  type QueryConstraint,
  type DocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { db as defaultDb, auth as defaultAuth } from '../firebase';
import type {
  PresentationDataService,
  CreateDeckInput,
  UpdateDeckInput,
  ReviewDeckInput,
  DeleteDeckInput,
  PaginatedQueryInput,
  PaginatedResult,
  PaginationCursor,
  Result,
} from '../contracts/services';
import type { Deck, DeckChunk, DeckLink } from '../contracts/models';
import type { AuthUser } from '../contracts/auth';
import { AppErrorCode, type AppError } from '../contracts/errors';
import { ok, err } from '../contracts/services';
import { MAX_PENDING_PER_USER, MANIFEST_VERSION, MAX_LINKS_COUNT, MAX_CHUNKS_COUNT } from '../contracts/limits';
import { rebalanceChunks } from '../content/manifest';
import {
  validateCreateDeckInput,
  validateUpdateDeckInput,
  validateLink,
} from './validation';
import { deckFromDoc, deckChunkFromDoc } from './converters';
import { mapFirebaseUserToAuthUser } from '../auth/service';

export interface PresentationDataServiceOptions {
  db?: Firestore;
  auth?: Auth;
  getCurrentUser?: () => AuthUser | null;
}

/** Translates Firestore and transaction errors into typed Turkish AppError */
export function mapFirestoreError(error: unknown, fallbackMessage = 'Veri işlemi sırasında bir hata oluştu.'): AppError {
  if (typeof error === 'object' && error !== null) {
    // Already structured AppError
    if (
      'code' in error &&
      'message' in error &&
      Object.values(AppErrorCode).includes((error as AppError).code)
    ) {
      return error as AppError;
    }

    const code = String((error as { code?: unknown }).code || '');
    if (code.includes('permission-denied') || code === 'permission-denied') {
      return {
        code: AppErrorCode.PERMISSION_DENIED,
        message: 'Bu işlemi gerçekleştirmek için yetkiniz bulunmamaktadır veya güvenlik kuralları tarafından reddedildi.',
        details: error,
      };
    }
    if (code.includes('not-found') || code === 'not-found') {
      return {
        code: AppErrorCode.NOT_FOUND,
        message: 'İstenen kayıt bulunamadı.',
        details: error,
      };
    }
    if (code.includes('already-exists') || code === 'already-exists') {
      return {
        code: AppErrorCode.ALREADY_EXISTS,
        message: 'Bu kayıt zaten mevcut.',
        details: error,
      };
    }
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return {
    code: AppErrorCode.UNKNOWN,
    message,
    details: error,
  };
}

export class FirestorePresentationDataService implements PresentationDataService {
  private db: Firestore;
  private auth: Auth;
  private getCurrentUserOverride?: () => AuthUser | null;

  constructor(options: PresentationDataServiceOptions = {}) {
    this.db = options.db || defaultDb;
    this.auth = options.auth || defaultAuth;
    this.getCurrentUserOverride = options.getCurrentUser;
  }

  /** Resolves the calling user, either from override or current Firebase Auth */
  private getCallingUser(): AuthUser | null {
    if (this.getCurrentUserOverride) {
      return this.getCurrentUserOverride();
    }
    const current = this.auth.currentUser;
    if (!current) return null;
    return mapFirebaseUserToAuthUser(current);
  }

  /** Get single presentation metadata */
  async getDeck(id: string): Promise<Result<Deck>> {
    try {
      if (!id || typeof id !== 'string') {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Geçersiz sunum kimliği.',
        });
      }

      const deckRef = doc(this.db, 'presentations', id);
      const snap = await getDoc(deckRef);

      if (!snap.exists()) {
        return err({
          code: AppErrorCode.NOT_FOUND,
          message: 'Sunum bulunamadı.',
        });
      }

      return ok(await this.hydrateDeck(id, snap.data()));
    } catch (error) {
      return err(mapFirestoreError(error, 'Sunum bilgisi alınamadı.'));
    }
  }

  /** Resolve external links for v2 and edited legacy records; v1 inline links remain readable. */
  private async hydrateDeck(id: string, data: DocumentData): Promise<Deck> {
    const deck = deckFromDoc(id, data);
    if (data.linkCount === undefined) return deck;
    if (!Number.isInteger(data.linkCount) || data.linkCount < 0 || data.linkCount > MAX_LINKS_COUNT) {
      throw { code: AppErrorCode.INVALID_ARGUMENT, message: 'Sunum bağlantı sayısı geçersiz.' };
    }
    deck.links = await Promise.all(Array.from({ length: data.linkCount }, async (_, index) => {
      const snap = await getDoc(doc(this.db, 'presentations', id, 'links', String(index)));
      const link = snap.data();
      if (!link || link.index !== index || !validateLink(link as DeckLink).ok) {
        throw { code: AppErrorCode.NOT_FOUND, message: `Sunum bağlantısı (${index}) eksik veya geçersiz.` };
      }
      return { label: link.label, url: link.url } as DeckLink;
    }));
    return deck;
  }

  /** Get chunk payload for presentation viewer / download */
  async getChunk(deckId: string, index: number): Promise<Result<DeckChunk>> {
    try {
      if (!deckId || !Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS_COUNT) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Geçersiz sunum veya parça indeksi.',
        });
      }

      const chunkRef = doc(this.db, 'presentations', deckId, 'chunks', String(index));
      const snap = await getDoc(chunkRef);

      if (!snap.exists()) {
        return err({
          code: AppErrorCode.NOT_FOUND,
          message: `Sunum parçası (${index}) bulunamadı.`,
        });
      }

      return ok(deckChunkFromDoc(index, snap.data()));
    } catch (error) {
      return err(mapFirestoreError(error, 'Sunum parçası alınamadı.'));
    }
  }

  /** Get all chunks for a deck in order */
  async getAllChunks(deckId: string, chunkCount: number): Promise<Result<DeckChunk[]>> {
    try {
      if (!deckId || !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS_COUNT) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: 'Geçersiz parça sayısı veya sunum kimliği.',
        });
      }

      const promises: Promise<Result<DeckChunk>>[] = [];
      for (let i = 0; i < chunkCount; i++) {
        promises.push(this.getChunk(deckId, i));
      }

      const results = await Promise.all(promises);
      const chunks: DeckChunk[] = [];

      for (const res of results) {
        if (!res.ok) {
          return res;
        }
        chunks.push(res.value);
      }

      return ok(chunks);
    } catch (error) {
      return err(mapFirestoreError(error, 'Sunum parçaları yüklenirken hata oluştu.'));
    }
  }

  /** Query published feed ordered by publishedAt DESC */
  async getPublishedFeed(input: PaginatedQueryInput = {}): Promise<Result<PaginatedResult<Deck>>> {
    return this.executePaginatedQuery(
      [where('status', '==', 'published'), orderBy('publishedAt', 'desc')],
      input,
      'publishedAt'
    );
  }

  /** Query user's own decks ordered by updatedAt DESC */
  async getMyDecks(ownerUid: string, input: PaginatedQueryInput = {}): Promise<Result<PaginatedResult<Deck>>> {
    if (!ownerUid) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Kullanıcı kimliği belirtilmelidir.',
      });
    }

    return this.executePaginatedQuery(
      [where('ownerUid', '==', ownerUid), orderBy('updatedAt', 'desc')],
      input,
      'updatedAt'
    );
  }

  /** Query admin review queue ordered by createdAt ASC */
  async getReviewQueue(input: PaginatedQueryInput = {}): Promise<Result<PaginatedResult<Deck>>> {
    return this.executePaginatedQuery(
      [where('status', '==', 'pending'), orderBy('createdAt', 'asc')],
      input,
      'createdAt'
    );
  }

  /** Internal helper executing cursor-paginated Firestore queries */
  private async executePaginatedQuery(
    baseConstraints: QueryConstraint[],
    input: PaginatedQueryInput,
    sortField: string
  ): Promise<Result<PaginatedResult<Deck>>> {
    try {
      const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 12;
      const constraints = [...baseConstraints];

      // Cursor pagination: if a cursor is passed, resolve doc boundary
      if (input.cursor?.docId) {
        const cursorRef = doc(this.db, 'presentations', input.cursor.docId);
        const cursorSnap = await getDoc(cursorRef);
        if (cursorSnap.exists()) {
          constraints.push(startAfter(cursorSnap));
        }
      }

      // Fetch 1 extra document to detect hasMore
      constraints.push(limit(pageSize + 1));

      const q = query(collection(this.db, 'presentations'), ...constraints);
      const querySnap = await getDocs(q);

      const docs = querySnap.docs;
      const hasMore = docs.length > pageSize;
      const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

      const items = await Promise.all(pageDocs.map((d: DocumentSnapshot) => this.hydrateDeck(d.id, d.data()!)));

      let nextCursor: PaginationCursor | null = null;
      if (hasMore && pageDocs.length > 0) {
        const lastDoc = pageDocs[pageDocs.length - 1];
        const lastData = lastDoc.data();
        let sortValue: string | number | null = null;

        if (lastData && lastData[sortField]) {
          const val = lastData[sortField];
          if (typeof val === 'object' && 'toMillis' in val && typeof val.toMillis === 'function') {
            sortValue = val.toMillis();
          } else if (typeof val === 'string' || typeof val === 'number') {
            sortValue = val;
          }
        }

        nextCursor = {
          docId: lastDoc.id,
          sortValue,
        };
      }

      return ok({
        items,
        nextCursor,
        hasMore,
      });
    } catch (error) {
      return err(mapFirestoreError(error, 'Sorgu çalıştırılırken hata oluştu.'));
    }
  }

  /**
   * Create new presentation
   * Atomic transaction writing deck + all chunks + user pendingCount increment (+1).
   * Enforces two-way binding: user.pendingDeckId == deck.id && deck.quotaMarker == deck.id.
   */
  async createDeck(input: CreateDeckInput): Promise<Result<Deck>> {
    // 1. Client-side limits validation
    const valRes = validateCreateDeckInput(input);
    if (!valRes.ok) return valRes;

    // 2. Caller authentication and membership verification
    const caller = this.getCallingUser();
    if (!caller) {
      return err({
        code: AppErrorCode.UNAUTHENTICATED,
        message: 'Sunum yüklemek için oturum açmalısınız.',
      });
    }
    if (!caller.isMember) {
      return err({
        code: AppErrorCode.UNVERIFIED_EMAIL,
        message: 'Sunum yüklemek için e-posta adresinizi doğrulamanız veya Google ile giriş yapmanız gerekir.',
      });
    }

    const deckRef = doc(collection(this.db, 'presentations'));
    const deckId = deckRef.id;
    const userRef = doc(this.db, 'users', caller.uid);

    try {
      await runTransaction(this.db, async (tx) => {
        // Read user document
        const userSnap = await tx.get(userRef);
        const countBefore = userSnap.exists() ? (userSnap.data()?.pendingCount ?? 0) : 0;

        if (countBefore >= MAX_PENDING_PER_USER) {
          throw {
            code: AppErrorCode.QUOTA_EXCEEDED,
            message: `Bekleyen sunum kotanız (en fazla ${MAX_PENDING_PER_USER}) doldu. Yeni sunum yüklemeden önce mevcut sunumlarınızın onaylanmasını bekleyin.`,
          };
        }

        const newCount = countBefore + 1;

        // Two-way binding: user.pendingDeckId = deckId
        if (userSnap.exists()) {
          tx.update(userRef, {
            pendingCount: newCount,
            pendingDeckId: deckId,
          });
        } else {
          tx.set(userRef, {
            displayName: caller.displayName || 'Kullanıcı',
            email: caller.email,
            createdAt: serverTimestamp(),
            pendingCount: newCount,
            pendingDeckId: deckId,
          });
        }

        // Two-way binding: deck.quotaMarker = deckId, status = 'pending'
        const deckData = {
          ownerUid: caller.uid,
          ownerName: caller.displayName || 'Kullanıcı',
          ownerPhotoURL: caller.photoURL || null,
          title: input.title.trim(),
          description: input.description.trim(),
          linkCount: input.links.length,
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          kind: input.kind,
          fileName: input.fileName,
          status: 'pending',
          rejectNote: '',
          cover: Bytes.fromUint8Array(input.cover),
          coverSource: input.coverSource,
          sizes: {
            encoded: input.sizes.encoded,
            unpacked: input.sizes.unpacked,
            fileCount: input.sizes.fileCount,
          },
          chunkCount: input.chunkCount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          publishedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          manifestVersion: MANIFEST_VERSION,
          quotaMarker: deckId,
        };
        tx.set(deckRef, deckData);

        // Write all chunks matching manifest
        for (const chunk of rebalanceChunks(input.chunks, input.sizes.encoded, input.chunkCount)) {
          const chunkRef = doc(this.db, 'presentations', deckId, 'chunks', String(chunk.index));
          tx.set(chunkRef, {
            index: chunk.index,
            size: chunk.size,
            data: Bytes.fromUint8Array(chunk.data),
          });
        }
        input.links.forEach((link, index) => tx.set(doc(this.db, 'presentations', deckId, 'links', String(index)), { index, ...link }));
      });

      // Read back created deck snapshot to return full object
      const createdSnap = await getDoc(deckRef);
      return ok(await this.hydrateDeck(deckId, createdSnap.data()!));
    } catch (error) {
      // If error is permission-denied caused by quota rejection in rules
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = String((error as { code: unknown }).code);
        if (code.includes('permission-denied')) {
          return err({
            code: AppErrorCode.QUOTA_EXCEEDED,
            message: `Bekleyen sunum kotanız (en fazla ${MAX_PENDING_PER_USER}) doldu veya güvenlik kuralı tarafından reddedildi.`,
            details: error,
          });
        }
      }
      return err(mapFirestoreError(error, 'Sunum oluşturulurken hata oluştu.'));
    }
  }

  /**
   * Update presentation
   * Status forces to 'pending' (re-review).
   * If deck was already pending, counter remains unchanged.
   * If deck was published/rejected/unpublished, increments counter (+1).
   * If replacement chunks provided, performs tail cleanup (deleting old chunks >= new chunkCount).
   */
  async updateDeck(input: UpdateDeckInput): Promise<Result<Deck>> {
    const valRes = validateUpdateDeckInput(input);
    if (!valRes.ok) return valRes;

    const caller = this.getCallingUser();
    if (!caller) {
      return err({
        code: AppErrorCode.UNAUTHENTICATED,
        message: 'Sunum düzenlemek için oturum açmalısınız.',
      });
    }
    if (!caller.isMember) {
      return err({
        code: AppErrorCode.UNVERIFIED_EMAIL,
        message: 'Sunum düzenlemek için e-posta adresinizi doğrulamanız gerekir.',
      });
    }

    const deckRef = doc(this.db, 'presentations', input.id);
    const userRef = doc(this.db, 'users', caller.uid);

    try {
      await runTransaction(this.db, async (tx) => {
        const deckSnap = await tx.get(deckRef);
        if (!deckSnap.exists()) {
          throw {
            code: AppErrorCode.NOT_FOUND,
            message: 'Güncellenecek sunum bulunamadı.',
          };
        }

        const deckData = deckSnap.data();
        if (deckData.ownerUid !== caller.uid && !caller.isAdmin) {
          throw {
            code: AppErrorCode.PERMISSION_DENIED,
            message: 'Yalnızca kendi sunumlarınızı düzenleyebilirsiniz.',
          };
        }

        const wasPending = deckData.status === 'pending';

        // Check quota if transition is from non-pending -> pending
        if (!wasPending) {
          const userSnap = await tx.get(userRef);
          const countBefore = userSnap.exists() ? (userSnap.data()?.pendingCount ?? 0) : 0;
          if (countBefore >= MAX_PENDING_PER_USER) {
            throw {
              code: AppErrorCode.QUOTA_EXCEEDED,
              message: `Bekleyen sunum kotanız (en fazla ${MAX_PENDING_PER_USER}) doldu.`,
            };
          }

          tx.update(userRef, {
            pendingCount: countBefore + 1,
            pendingDeckId: input.id,
          });
        }

        const updates: Record<string, unknown> = {
          title: input.title.trim(),
          description: input.description.trim(),
          links: deleteField(),
          linkCount: input.links.length,
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          status: 'pending',
          rejectNote: '',
          publishedAt: null,
          reviewedBy: null,
          reviewedAt: null,
          updatedAt: serverTimestamp(),
          quotaMarker: input.id,
        };
        const oldLinkCount = deckData.linkCount ?? 0;
        input.links.forEach((link, index) => tx.set(doc(this.db, 'presentations', input.id, 'links', String(index)), { index, ...link }));
        for (let i = input.links.length; i < oldLinkCount; i++) tx.delete(doc(this.db, 'presentations', input.id, 'links', String(i)));

        if (input.cover) {
          updates.cover = Bytes.fromUint8Array(input.cover);
        }
        if (input.coverSource) {
          updates.coverSource = input.coverSource;
        }

        if (input.replacementContent) {
          const rc = input.replacementContent;
          updates.fileName = rc.fileName;
          updates.sizes = {
            encoded: rc.sizes.encoded,
            unpacked: rc.sizes.unpacked,
            fileCount: rc.sizes.fileCount,
          };
          updates.chunkCount = rc.chunkCount;
          updates.chunks = deleteField();
          updates.manifestVersion = MANIFEST_VERSION;
          updates.kind = rc.fileName.toLowerCase().endsWith('.pptx') ? 'pptx' : 'html';

          // Tail cleanup: delete old chunks at index >= new chunkCount
          const oldChunkCount = deckData.chunkCount || 0;
          for (let i = rc.chunkCount; i < oldChunkCount; i++) {
            const oldChunkRef = doc(this.db, 'presentations', input.id, 'chunks', String(i));
            tx.delete(oldChunkRef);
          }

          // Write new replacement chunks
          for (const ch of rebalanceChunks(rc.chunks, rc.sizes.encoded, rc.chunkCount)) {
            const chunkRef = doc(this.db, 'presentations', input.id, 'chunks', String(ch.index));
            tx.set(chunkRef, {
              index: ch.index,
              size: ch.size,
              data: Bytes.fromUint8Array(ch.data),
            });
          }
        }

        tx.update(deckRef, updates);
      });

      const updatedSnap = await getDoc(deckRef);
      return ok(await this.hydrateDeck(input.id, updatedSnap.data()!));
    } catch (error) {
      return err(mapFirestoreError(error, 'Sunum güncellenirken hata oluştu.'));
    }
  }

  /**
   * Review presentation (Admin only: approve, reject, unpublish, reapprove)
   * Approving/rejecting a pending deck decrements owner's pendingCount (-1).
   * Reject requires a non-empty rejectNote.
   */
  async reviewDeck(input: ReviewDeckInput): Promise<Result<Deck>> {
    if (!input.id) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Sunum kimliği belirtilmelidir.',
      });
    }

    const caller = this.getCallingUser();
    if (!caller) {
      return err({
        code: AppErrorCode.UNAUTHENTICATED,
        message: 'Bu işlemi gerçekleştirmek için oturum açmalısınız.',
      });
    }
    if (!caller.isAdmin) {
      return err({
        code: AppErrorCode.PERMISSION_DENIED,
        message: 'İnceleme işlemleri yalnızca yöneticiler tarafından yapılabilir.',
      });
    }

    if (input.action === 'reject' && (!input.rejectNote || input.rejectNote.trim().length === 0)) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Sunum reddedilirken açıklama (red gerekçesi) belirtilmesi zorunludur.',
      });
    }

    const deckRef = doc(this.db, 'presentations', input.id);

    try {
      await runTransaction(this.db, async (tx) => {
        const deckSnap = await tx.get(deckRef);
        if (!deckSnap.exists()) {
          throw {
            code: AppErrorCode.NOT_FOUND,
            message: 'İncelenecek sunum bulunamadı.',
          };
        }

        const deckData = deckSnap.data();
        const ownerUid = deckData.ownerUid;
        const wasPending = deckData.status === 'pending';

        const userRef = doc(this.db, 'users', ownerUid);
        const updates: Record<string, unknown> = {
          updatedAt: serverTimestamp(),
        };

        if (input.action === 'approve' || input.action === 'reapprove') {
          updates.status = 'published';
          updates.publishedAt = serverTimestamp();
          updates.reviewedBy = caller.uid;
          updates.reviewedAt = serverTimestamp();
          updates.rejectNote = '';

          if (wasPending) {
            const userSnap = await tx.get(userRef);
            const countBefore = userSnap.exists() ? (userSnap.data()?.pendingCount ?? 0) : 0;
            tx.update(userRef, {
              pendingCount: Math.max(0, countBefore - 1),
              pendingDeckId: input.id,
            });
          }
        } else if (input.action === 'reject') {
          updates.status = 'rejected';
          updates.rejectNote = input.rejectNote!.trim();
          updates.reviewedBy = caller.uid;
          updates.reviewedAt = serverTimestamp();
          updates.publishedAt = null;

          if (wasPending) {
            const userSnap = await tx.get(userRef);
            const countBefore = userSnap.exists() ? (userSnap.data()?.pendingCount ?? 0) : 0;
            tx.update(userRef, {
              pendingCount: Math.max(0, countBefore - 1),
              pendingDeckId: input.id,
            });
          }
        } else if (input.action === 'unpublish') {
          updates.status = 'unpublished';
          updates.reviewedBy = caller.uid;
          updates.reviewedAt = serverTimestamp();
          updates.publishedAt = null;
        }

        tx.update(deckRef, updates);
      });

      const updatedSnap = await getDoc(deckRef);
      return ok(await this.hydrateDeck(input.id, updatedSnap.data()!));
    } catch (error) {
      return err(mapFirestoreError(error, 'İnceleme işlemi sırasında hata oluştu.'));
    }
  }

  /**
   * Delete presentation
   * Published decks: Admin only.
   * Pending/rejected/unpublished decks: Owner or Admin.
   * If deck was pending, decrements owner pendingCount (-1).
   * Deletes all child chunk documents atomically; zero orphan chunks survive.
   */
  async deleteDeck(input: DeleteDeckInput): Promise<Result<void>> {
    if (!input.id) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Silinecek sunum kimliği belirtilmelidir.',
      });
    }

    const caller = this.getCallingUser();
    if (!caller) {
      return err({
        code: AppErrorCode.UNAUTHENTICATED,
        message: 'Bu işlemi gerçekleştirmek için oturum açmalısınız.',
      });
    }

    const deckRef = doc(this.db, 'presentations', input.id);

    try {
      await runTransaction(this.db, async (tx) => {
        const deckSnap = await tx.get(deckRef);
        if (!deckSnap.exists()) {
          throw {
            code: AppErrorCode.NOT_FOUND,
            message: 'Silinecek sunum bulunamadı.',
          };
        }

        const deckData = deckSnap.data();
        const isOwner = deckData.ownerUid === caller.uid;

        // Permissions check
        if (deckData.status === 'published' && !caller.isAdmin) {
          throw {
            code: AppErrorCode.PERMISSION_DENIED,
            message: 'Yayınlanmış sunumları yalnızca yöneticiler silebilir.',
          };
        }

        if (!isOwner && !caller.isAdmin) {
          throw {
            code: AppErrorCode.PERMISSION_DENIED,
            message: 'Bu sunumu silme yetkiniz bulunmamaktadır.',
          };
        }

        // If deck was pending, decrement owner's pendingCount
        if (deckData.status === 'pending') {
          const userRef = doc(this.db, 'users', deckData.ownerUid);
          const userSnap = await tx.get(userRef);
          const countBefore = userSnap.exists() ? (userSnap.data()?.pendingCount ?? 0) : 0;
          tx.update(userRef, {
            pendingCount: Math.max(0, countBefore - 1),
            pendingDeckId: input.id,
          });
        }

        // Delete all chunks
        const chunkCount = deckData.chunkCount || 0;
        for (let i = 0; i < chunkCount; i++) {
          const chunkRef = doc(this.db, 'presentations', input.id, 'chunks', String(i));
          tx.delete(chunkRef);
        }
        for (let i = 0; i < (deckData.linkCount ?? 0); i++) tx.delete(doc(this.db, 'presentations', input.id, 'links', String(i)));

        // Delete parent deck document
        tx.delete(deckRef);
      });

      return ok(undefined);
    } catch (error) {
      return err(mapFirestoreError(error, 'Sunum silinirken hata oluştu.'));
    }
  }
}

/** Default singleton presentation data service */
export const dataService = new FirestorePresentationDataService();
