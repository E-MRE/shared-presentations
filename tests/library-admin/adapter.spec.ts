import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../../src/contracts/auth';
import { closeAllListeners, getActiveListenerCount } from '../../src/auth/listenerManager';
const transport = vi.hoisted(() => ({ queries: [] as unknown[][], getDocs: vi.fn(), onSnapshot: vi.fn(), unsub: vi.fn(), next: null as null | ((snapshot: { size: number }) => void), error: null as null | ((error: unknown) => void) }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  documentId: () => '__name__', orderBy: (...args: unknown[]) => ['orderBy',...args], where: (...args: unknown[]) => ['where',...args], limit: (n: number) => ['limit',n], startAfter: (...args: unknown[]) => ['startAfter',...args],
  query: (...args: unknown[]) => { transport.queries.push(args); return args; }, getDocs: transport.getDocs, onSnapshot: transport.onSnapshot,
  Timestamp: class { constructor(public seconds: number,public nanoseconds: number) {} toDate() { return new Date(this.seconds*1000+Math.floor(this.nanoseconds/1e6)); } },
}));
import { Timestamp } from 'firebase/firestore';
import { createFirestoreAdminAdapter } from '../../src/features/admin/adapter';
import { mergeDecks } from '../../src/features/library/useDeckPages';
function state(role: string): AuthState {
  if (role === 'loading' || role === 'unauthenticated') return { status: role, user: null, isAdmin: false, isMember: false };
  const user = { uid: role === 'admin2' ? 'second' : 'first', email: 'fixture@example.test', displayName: 'Fixture', isEmailVerified: role !== 'unverified', isGoogle: false, isMember: role !== 'unverified', isAdmin: role.startsWith('admin') };
  return role === 'unverified' ? { status: 'unverified', user, isAdmin: false, isMember: false } : { status: 'authenticated', user, isAdmin: user.isAdmin, isMember: true };
}
let auth: AuthState;
const adapter = () => createFirestoreAdminAdapter({ getAuthState: () => auth });
const doc = (id: string, nanos: number) => ({ id, data: () => ({ updatedAt: new Timestamp(100,nanos), createdAt: new Timestamp(10,0), title: id, status: 'pending' }) });
beforeEach(() => {
  auth=state('admin'); transport.queries=[]; vi.clearAllMocks(); transport.next=null; transport.error=null;
  transport.getDocs.mockResolvedValue({ docs: [doc('c',900001),doc('b',900001),doc('a',900000)] });
  transport.onSnapshot.mockImplementation((_query,next,error) => { transport.next=next; transport.error=error; return transport.unsub; });
});
afterEach(() => closeAllListeners());
describe('production Firestore admin adapter with mocked SDK transport', () => {
  it('gates queries/listeners for loading, visitor, unverified and nonadmin with zero transport', async () => {
    for (const role of ['loading','unauthenticated','unverified','member']) { auth=state(role); expect((await adapter().getAllDecks({})).ok).toBe(false); const error=vi.fn(); adapter().subscribePendingCount(vi.fn(),error)(); expect(error).toHaveBeenCalledOnce(); }
    expect(transport.getDocs).not.toHaveBeenCalled(); expect(transport.onSnapshot).not.toHaveBeenCalled(); expect(transport.queries).toEqual([]);
  });
  it('paginates every status with deterministic descending doc ID and exact nanosecond cursor', async () => {
    const a=adapter(); const first=await a.getAllDecks({pageSize:2}); expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected page');
    expect(first.value.items.map(d => d.id)).toEqual(['c','b']); expect(first.value.nextCursor).toEqual({docId:'b',sortValue:'100:900001'});
    expect(transport.queries[0]).toEqual(['presentations',['orderBy','updatedAt','desc'],['orderBy','__name__','desc'],['limit',3]]);
    // These docs share the same millisecond. A millisecond-only cursor would skip a.
    transport.getDocs.mockResolvedValueOnce({ docs: [doc('a',900000)] });
    const second=await a.getAllDecks({pageSize:2,cursor:first.value.nextCursor!});
    expect(transport.queries[1]).toContainEqual(['startAfter',new Timestamp(100,900001),'b']);
    expect(second.ok && second.value.items.map(d => d.id)).toEqual(['a']); expect(second.ok && second.value.hasMore).toBe(false);
    const before=transport.getDocs.mock.calls.length;
    for (const sortValue of [100,'bad','100:1000000000']) expect((await a.getAllDecks({cursor:{docId:'a',sortValue}})).ok).toBe(false);
    expect(transport.getDocs).toHaveBeenCalledTimes(before);
  });
  it('retains exact backend chronology when frozen Deck.Date loses nanosecond precision', async () => {
    transport.getDocs.mockResolvedValueOnce({docs:[doc('a',900002),doc('z',900001),doc('y',900000)]});
    const result=await adapter().getAllDecks({pageSize:2}); if (!result.ok) throw new Error('expected page');
    expect(result.value.items[0].updatedAt.getTime()).toBe(result.value.items[1].updatedAt.getTime());
    expect(mergeDecks([],result.value.items,'updated').map(deck=>deck.id)).toEqual(['a','z']);
    expect(mergeDecks(result.value.items,[result.value.items[1]],'updated').map(deck=>deck.id)).toEqual(['a','z']);
  });
  it('discards result after role/UID changes and maps query errors into Turkish results', async () => {
    let resolve!: (value: unknown) => void; transport.getDocs.mockImplementationOnce(() => new Promise(r => {resolve=r;}));
    const pending=adapter().getAllDecks({}); auth=state('admin2'); resolve({docs:[]}); expect((await pending).ok).toBe(false);
    transport.getDocs.mockRejectedValueOnce({code:'permission-denied'}); expect((await adapter().getAllDecks({})).error?.message).toContain('erişimi');
  });
  it('counts the full pending set and closes on permission failure, UID/role loss and registry cleanup', () => {
    const next=vi.fn(), error=vi.fn(); const stop=adapter().subscribePendingCount(next,error);
    expect(getActiveListenerCount()).toBe(1); expect(transport.queries[0]).toEqual(['presentations',['where','status','==','pending']]);
    transport.next!({size:53}); transport.next!({size:52}); expect(next.mock.calls).toEqual([[53],[52]]);
    transport.error!({code:'permission-denied'}); expect(error).toHaveBeenCalledOnce(); expect(transport.unsub).toHaveBeenCalledOnce(); expect(getActiveListenerCount()).toBe(0);
    transport.next!({size:9}); expect(next).toHaveBeenCalledTimes(2); stop(); expect(transport.unsub).toHaveBeenCalledOnce();
    const stop2=adapter().subscribePendingCount(next,error); auth=state('member'); transport.next!({size:4}); expect(next).toHaveBeenCalledTimes(2); stop2();
    auth=state('admin'); adapter().subscribePendingCount(next,error); closeAllListeners(); transport.next!({size:3}); expect(next).toHaveBeenCalledTimes(2); expect(getActiveListenerCount()).toBe(0);
  });
  it('handles synchronous subscribe throw without leaving a listener', () => {
    transport.onSnapshot.mockImplementationOnce(() => {throw new Error('offline');}); const error=vi.fn(); adapter().subscribePendingCount(vi.fn(),error)(); expect(error).toHaveBeenCalledOnce(); expect(getActiveListenerCount()).toBe(0);
  });
});
