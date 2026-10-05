import type { AuthState } from '../../src/contracts/auth';
import type { Deck, DeckStatus } from '../../src/contracts/models';
import { AppErrorCode } from '../../src/contracts/errors';
import { err, ok, type PresentationDataService, type PaginatedQueryInput } from '../../src/contracts/services';
import type { AdminReadAdapter } from '../../src/features/admin';
export function authState(role: string): AuthState {
  if (role === 'loading' || role === 'unauthenticated') return { status: role, user: null, isAdmin: false, isMember: false };
  const user = { uid: role === 'member2' ? 'member2' : 'member', email: 'member@example.test', displayName: 'Ekip Üyesi', isEmailVerified: role !== 'unverified', isGoogle: false, isMember: role !== 'unverified', isAdmin: role === 'admin' };
  return role === 'unverified' ? { status: 'unverified', user, isAdmin: false, isMember: false } : { status: 'authenticated', user, isAdmin: role === 'admin', isMember: true };
}
export const metrics = { reads: [] as { kind: string; uid?: string; cursor?: string; service: number }[], mutations: [] as { action: string; id: string; note?: string; service: number }[], subscriptions: 0, disposals: 0, active: 0, chunks: 0 };
export const flags = { holdReads: false, holdMutations: false, error: '', throws: false };
const reads: (() => void)[] = [], mutations: (() => void)[] = [];
export function release(kind: 'reads' | 'mutations') { (kind === 'reads' ? reads : mutations).splice(0).forEach(resolve => resolve()); }
function wait(kind: 'reads' | 'mutations') { return new Promise<void>(resolve => (kind === 'reads' ? reads : mutations).push(resolve)); }
const listeners = new Set<{ count: (n: number) => void; error: () => void }>();
export function emitCount(count: number) { listeners.forEach(listener => listener.count(count)); }
export function emitError() { listeners.forEach(listener => listener.error()); }
export function deck(id: string, status: DeckStatus, n: number, ownerUid = 'member'): Deck {
  return { id, ownerUid, ownerName: n === 8 ? 'İpek Işık' : 'Ekip Üyesi', title: ({ 'p-old': 'İlk Bekleyen Sunum', 'p-new': 'Yeni Bekleyen Sunum', rejected: 'Geliştirilecek Fikir', unpublished: 'Arşivden Kaldırılan', published: 'Tasarım İlkeleri', 'pub-2': 'İşbirliği Atölyesi', 'pub-3': 'Veri Hikâyeleri', 'pub-4': 'Ürün Yolculuğu', 'other-p': 'Başka Üyenin Sunumu' } as Record<string, string>)[id] || id, description: n === 8 ? 'İletişim ve takım kültürü' : 'Ekibimizin ortak deneyimlerinden öğrenin. Açık fikirler ve yeni bakış açıları.', links: [], kind: n % 2 ? 'html' : 'pptx', fileName: 'deck.html', status, rejectNote: status === 'rejected' ? 'Kaynakları ve sonuçları ayrıntılandırın.' : '', cover: new Uint8Array(), coverSource: 'default', sizes: { encoded: 10, unpacked: 10, fileCount: 1 }, chunkCount: 1, chunks: [{ index: 0, size: 10 }], createdAt: new Date(2026, 0, n), updatedAt: new Date(2026, 0, n), publishedAt: status === 'published' ? new Date(2026, 0, n) : null, reviewedAt: null, reviewedBy: null, manifestVersion: 1, quotaMarker: id };
}
export let decks: Deck[] = [];
export function resetDecks(mode = '') {
  decks = mode === 'empty' ? [] : [deck('p-old', 'pending', 1), deck('p-new', 'pending', 2), deck('rejected', 'rejected', 3), deck('unpublished', 'unpublished', 4), deck('published', 'published', 5), deck('pub-2', 'published', 6), deck('pub-3', 'published', 7), deck('pub-4', 'published', 8), deck('other-p', 'pending', 9, 'other')];
  if (mode === 'long') decks.forEach(deck => { deck.title = (deck.title + ' — '+ 'UzunBaşlık'.repeat(12)).slice(0,120); deck.description = 'Açıklama'.repeat(130); deck.ownerName = 'UzunYazarAdı'.repeat(10); if (deck.status === 'rejected') deck.rejectNote = 'RetGerekçesi'.repeat(80); });
}
resetDecks();
let serial = 0;
export function fixtureDependencies() {
  const serviceId = ++serial;
  async function page(kind: string, input: PaginatedQueryInput, uid?: string) {
    metrics.reads.push({ kind, uid, cursor: input.cursor?.docId, service: serviceId });
    const filter = kind === 'feed' ? decks.filter(d => d.status === 'published') : kind === 'own' ? decks.filter(d => d.ownerUid === uid) : kind === 'pending' ? decks.filter(d => d.status === 'pending') : decks;
    const sorted = [...filter].sort((a,b) => kind === 'pending' ? a.createdAt.getTime() - b.createdAt.getTime() : (kind === 'feed' ? b.publishedAt!.getTime() - a.publishedAt!.getTime() : b.updatedAt.getTime() - a.updatedAt.getTime()));
    const offset = input.cursor ? Number(input.cursor.docId) : 0;
    // Return overlap on feed page two to exercise deduplication in production UI.
    const items = sorted.slice(kind === 'feed' && offset ? offset - 1 : offset, offset + 2).map(d => ({ ...d }));
    const result = ok({ items, hasMore: offset + 2 < sorted.length, nextCursor: offset + 2 < sorted.length ? { docId: String(offset + 2) } : null });
    if (flags.holdReads) await wait('reads');
    if (flags.throws) throw new Error('fixture throw');
    return flags.error === kind ? err({ code: AppErrorCode.NETWORK_ERROR, message: 'fixture service error' }) : result;
  }
  async function mutate(id: string, action: string, note?: string) {
    metrics.mutations.push({ id, action, note, service: serviceId });
    if (flags.holdMutations) await wait('mutations');
    if (flags.throws) throw new Error('fixture mutation throw');
    if (flags.error === 'mutation') return err<Deck>({ code: AppErrorCode.PERMISSION_DENIED, message: 'fixture denied' });
    const target = decks.find(d => d.id === id)!;
    if (action === 'delete') decks = decks.filter(d => d.id !== id);
    else { target.status = action === 'reject' ? 'rejected' : action === 'unpublish' ? 'unpublished' : 'published'; target.rejectNote = note || ''; target.publishedAt = target.status === 'published' ? new Date() : null; target.updatedAt = new Date(); }
    emitCount(decks.filter(d => d.status === 'pending').length);
    return ok(target);
  }
  const forbidden = async () => { metrics.chunks++; return err({ code: AppErrorCode.UNKNOWN, message: 'unexpected read' }); };
  const service: PresentationDataService = { getDeck: forbidden, getChunk: forbidden, getAllChunks: forbidden, getPublishedFeed: input => page('feed', input), getMyDecks: (uid,input) => page('own',input,uid), getReviewQueue: input => page('pending',input), createDeck: forbidden, updateDeck: forbidden, reviewDeck: input => mutate(input.id,input.action,input.rejectNote), deleteDeck: async input => { const result = await mutate(input.id,'delete'); return result.ok ? ok(undefined) : result; } };
  const adapter: AdminReadAdapter = {
    getAllDecks: input => page('all',input),
    subscribePendingCount(count,error) {
      metrics.subscriptions++; metrics.active++;
      const listener = { count, error: () => error({ code: AppErrorCode.PERMISSION_DENIED, message: 'fixture listener denied' }) };
      listeners.add(listener);
      if (flags.error === 'count') listener.error(); else count(decks.filter(d => d.status === 'pending').length);
      let active = true;
      return () => { if (active) { active = false; listeners.delete(listener); metrics.disposals++; metrics.active--; } };
    }
  };
  return { service, adapter };
}
