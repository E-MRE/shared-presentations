import { collection, documentId, getDocs, limit, onSnapshot, orderBy, query, startAfter, Timestamp, where, type Firestore, type QueryConstraint } from 'firebase/firestore';
import type { AuthState } from '../../contracts/auth';
import { AppErrorCode, type AppError } from '../../contracts/errors';
import type { Deck } from '../../contracts/models';
import { err, ok, type PaginatedQueryInput, type PaginatedResult, type Result } from '../../contracts/services';
import { deckFromDoc } from '../../data/converters';
import { db as defaultDb } from '../../firebase';
import { registerListener } from '../../auth/listenerManager';
export interface AdminReadAdapter {
  getAllDecks(input: PaginatedQueryInput): Promise<Result<PaginatedResult<Deck>>>;
  subscribePendingCount(onCount: (count: number) => void, onError: (error: AppError) => void): () => void;
}
export interface FirestoreAdminAdapterOptions { getAuthState: () => AuthState; db?: Firestore; }
function authorizedUid(auth: AuthState): string | null {
  return auth.status === 'authenticated' && auth.isMember && auth.user.isMember && auth.isAdmin ? auth.user.uid : null;
}
const denied = (): AppError => ({ code: AppErrorCode.PERMISSION_DENIED, message: 'Bu işlem için yönetici yetkisi gerekiyor.' });
function readError(error: unknown): AppError {
  const permission = typeof error === 'object' && error !== null && 'code' in error && String(error.code).includes('permission-denied');
  return { code: permission ? AppErrorCode.PERMISSION_DENIED : AppErrorCode.NETWORK_ERROR, message: permission ? 'Yönetici erişimi doğrulanamadı. Yeniden deneyin.' : 'İnceleme verileri alınamadı. Bağlantınızı kontrol edip yeniden deneyin.' };
}
/** Feature-owned production reads. Mutations always use PresentationDataService. */
export function createFirestoreAdminAdapter({ getAuthState, db = defaultDb }: FirestoreAdminAdapterOptions): AdminReadAdapter {
  return {
    async getAllDecks(input) {
      const uid = authorizedUid(getAuthState());
      if (!uid) return err(denied());
      const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize || 12)));
      const constraints: QueryConstraint[] = [orderBy('updatedAt', 'desc'), orderBy(documentId(), 'desc')];
      if (input.cursor) {
        const token = typeof input.cursor.sortValue === 'string' ? /^(-?\d+):(\d{1,9})$/.exec(input.cursor.sortValue) : null;
        if (!token || !input.cursor.docId || !Number.isSafeInteger(Number(token[1])) || Number(token[2]) > 999999999) return err({ code: AppErrorCode.INVALID_ARGUMENT, message: 'Sayfa sınırı geçersiz. Listeyi yeniden yükleyin.' });
        try { constraints.push(startAfter(new Timestamp(Number(token[1]), Number(token[2])), input.cursor.docId)); }
        catch { return err({ code: AppErrorCode.INVALID_ARGUMENT, message: 'Sayfa sınırı geçersiz. Listeyi yeniden yükleyin.' }); }
      }
      constraints.push(limit(pageSize + 1));
      try {
        const snapshot = await getDocs(query(collection(db, 'presentations'), ...constraints));
        if (authorizedUid(getAuthState()) !== uid) return err(denied());
        const docs = snapshot.docs.slice(0, pageSize);
        const hasMore = snapshot.docs.length > pageSize;
        const items = docs.map(doc => deckFromDoc(doc.id, doc.data()));
        const last = docs.at(-1);
        const stamp = last?.data().updatedAt as Timestamp | undefined;
        // Preserve nanoseconds: milliseconds alone can skip documents at a page boundary.
        return ok({ items, hasMore, nextCursor: hasMore && last && stamp ? { docId: last.id, sortValue: `${stamp.seconds}:${stamp.nanoseconds}` } : null });
      } catch (error) { return err(readError(error)); }
    },
    subscribePendingCount(onCount, onError) {
      const uid = authorizedUid(getAuthState());
      if (!uid) { onError(denied()); return () => {}; }
      let active = true;
      let dispose = () => {};
      const close = () => { if (active) { active = false; dispose(); } };
      const current = () => {
        if (!active) return false;
        if (authorizedUid(getAuthState()) !== uid) { close(); return false; }
        return true;
      };
      try {
        // No limit: the count covers the full pending set, independently of queue pages.
        const unsub = onSnapshot(query(collection(db, 'presentations'), where('status', '==', 'pending')), snapshot => {
          if (current()) onCount(snapshot.size);
        }, error => {
          if (!current()) return;
          onError(readError(error)); close();
        });
        const registered = registerListener(() => { active = false; unsub(); }, true);
        dispose = registered;
        if (!active || authorizedUid(getAuthState()) !== uid) { active = false; registered(); }
        return close;
      } catch (error) { if (current()) onError(readError(error)); close(); return () => {}; }
    },
  };
}
