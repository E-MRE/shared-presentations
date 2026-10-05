// Explicit deterministic composition harness. Production main never imports this file.
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import type { User } from 'firebase/auth';
import { App, ApplicationAuthStore, type ApplicationAuthDependencies } from '../../src/App';
import { ThemeProvider } from '../../src/theme';
import { ToastProvider } from '../../src/components';
import { fixtureService } from '../viewer/fixtures';
import type { Deck, DeckChunk } from '../../src/contracts/models';
import { ok, err, type PresentationDataService, type CreateDeckInput, type UpdateDeckInput, type ReviewDeckInput } from '../../src/contracts/services';
import { AppErrorCode } from '../../src/contracts/errors';
import { mapFirebaseUserToAuthUser } from '../../src/auth/service';
import { registerListener, getActiveListenerCount } from '../../src/auth/listenerManager';
import { validateCreateDeckInput, validateUpdateDeckInput } from '../../src/data/validation';
import '../../src/styles/index.css';
const metrics = { calls: [] as string[], creates: [] as CreateDeckInput[], updates: [] as UpdateDeckInput[], reviews: [] as ReviewDeckInput[], deletes: [] as { id: string }[], subscriptions: 0, disposals: 0, active: 0, roleSubscriptions: 0, roleDisposals: 0, unauthorized: 0, authCalls: [] as string[] };
const flags = { error: '', hold: '', mailFail: false, tokenFail: false, reloadFail: false, countFail: false };
const held: Array<() => void> = [];
async function hold(name: string) { if (flags.hold === name) await new Promise<void>(resolve => held.push(resolve)); }
let observer: (user: User | null) => void = () => {}, current: User | null = null, role = 'member';
function setAuth(value: string) {
  role = value;
  if (value === 'visitor') current = null;
  else current = { uid: value === 'other' ? 'other' : 'member', email: 'fixture@example.invalid', displayName: 'Deniz Kaya', emailVerified: value !== 'unverified', providerData: [{ providerId: value === 'google' ? 'google.com' : 'password' }], getIdTokenResult: async () => { if (flags.tokenFail) throw { code: 'auth/network-request-failed' }; return { signInProvider: value === 'google' ? 'google.com' : 'password', claims: { email_verified: role !== 'unverified' } }; } } as unknown as User;
  observer(current);
}
const failure = <T,>(message = 'İşlem tamamlanamadı. Yeniden deneyin.') => err<T>({ code: AppErrorCode.NETWORK_ERROR, message });
const authDependencies: ApplicationAuthDependencies = {
  currentUser: () => current, observe: callback => { observer = callback; setAuth(new URLSearchParams(location.search).get('role') ?? 'member'); return () => { observer = () => {}; }; },
  resolveAdmin: async () => { await hold('admin'); return role === 'admin'; }, watchAdmin: (_, callback) => { metrics.roleSubscriptions++; callback(role === 'admin'); let active = true; return () => { if (active) { active = false; metrics.roleDisposals++; } }; },
  service: {
    async signInWithGoogle() { metrics.authCalls.push('google'); await hold('login'); if (flags.error === 'auth') return failure(); setAuth('google'); return ok(mapFirebaseUserToAuthUser(current!)); },
    async signInWithEmail() { metrics.authCalls.push('email'); if (flags.error === 'auth') return failure('E-posta adresi veya şifre hatalı.'); setAuth('member'); return ok(mapFirebaseUserToAuthUser(current!)); },
    async signUpWithEmail() { metrics.authCalls.push('signup'); setAuth('unverified'); return ok(mapFirebaseUserToAuthUser(current!)); },
    async sendVerificationEmail() { metrics.authCalls.push('resend'); return flags.mailFail ? failure('Doğrulama e-postası gönderilemedi.') : ok(undefined); },
    async reloadUser(target = current) { metrics.authCalls.push('reload'); await hold('reload'); if (flags.reloadFail) return failure('Doğrulama kontrol edilemedi. Yeniden deneyin.'); if (current === target) role = 'member'; return ok(mapFirebaseUserToAuthUser(target!)); },
    async sendPasswordReset() { metrics.authCalls.push('reset'); return flags.mailFail ? failure('Sıfırlama e-postası gönderilemedi.') : ok(undefined); },
    async signOut() { metrics.authCalls.push('signout'); setAuth('visitor'); return ok(undefined); },
  },
};
const store = new ApplicationAuthStore(authDependencies), decks = new Map<string, Deck>(), chunks = new Map<string, DeckChunk[]>();
for (const [id, kind, status] of [['html', 'html', 'published'], ['pptx', 'pptx', 'published'], ['pending', 'html', 'pending'], ['foreign', 'html', 'pending']] as const) {
  const api = fixtureService({ kind, status, owner: id === 'foreign' ? 'other' : 'member' });
  const deck = await api.getDeck(id); if (!deck.ok) throw new Error('Seed failed');
  deck.value.title = id === 'pending' ? 'İncelenecek Sunum' : id === 'foreign' ? 'Başka Üyenin Sunumu' : kind === 'html' ? 'Güvenilir Sistem Tasarımı' : 'Ekip Mimari Notları';
  deck.value.links = deck.value.links.slice(0, 1); decks.set(id, deck.value);
  const data = await api.getAllChunks(id, deck.value.chunkCount); if (data.ok) chunks.set(id, data.value);
}
const listeners = new Set<{ count: (count: number) => void; error: () => void }>();
function counts() { listeners.forEach(listener => listener.count([...decks.values()].filter(deck => deck.status === 'pending').length)); }
async function boundary(method: string, admin = false) {
  if (!store.getMember() || (admin && !store.getMember()?.isAdmin)) { metrics.unauthorized++; throw new Error('Unauthorized fixture service invocation'); }
  metrics.calls.push(method); if (flags.hold === method) await new Promise<void>(resolve => held.push(resolve));
  return flags.error !== method;
}
const page = (items: Deck[]) => ok({ items: items.map(deck => ({ ...deck })), hasMore: false, nextCursor: null });
const service: PresentationDataService = {
  async getDeck(id) { if (!await boundary('deck')) return failure(); const deck = decks.get(id); return deck ? ok({ ...deck }) : err({ code: AppErrorCode.NOT_FOUND, message: 'Sunum bulunamadı.' }); },
  async getChunk(id, index) { await boundary('chunk'); return ok(chunks.get(id)![index]); },
  async getAllChunks(id) { if (!await boundary('chunks')) return failure(); return ok(chunks.get(id) ?? []); },
  async getPublishedFeed() { if (!await boundary('feed')) return failure(); return page([...decks.values()].filter(deck => deck.status === 'published')); },
  async getMyDecks(uid) { if (!await boundary('own')) return failure(); return page([...decks.values()].filter(deck => deck.ownerUid === uid)); },
  async getReviewQueue() { if (!await boundary('queue', true)) return failure(); return page([...decks.values()].filter(deck => deck.status === 'pending')); },
  async createDeck(input) {
    if (!await boundary('create')) return failure(); const valid = validateCreateDeckInput(input); if (!valid.ok) return valid;
    metrics.creates.push(input); const id = `created-${metrics.creates.length}`;
    const deck: Deck = { ...decks.get('html')!, id, title: input.title, description: input.description, links: input.links, fileName: input.fileName, cover: input.cover, coverSource: input.coverSource, sizes: input.sizes, kind: input.kind, chunkCount: input.chunkCount, chunks: input.manifest, ownerUid: store.getMember()!.uid, status: 'pending', publishedAt: null, rejectNote: '', quotaMarker: id };
    decks.set(id, deck); chunks.set(id, input.chunks); counts(); return ok({ ...deck });
  },
  async updateDeck(input) {
    if (!await boundary('update')) return failure(); const valid = validateUpdateDeckInput(input); if (!valid.ok) return valid;
    metrics.updates.push(input); const old = decks.get(input.id)!;
    const deck: Deck = { ...old, title: input.title, description: input.description, links: input.links, ...(input.cover ? { cover: input.cover, coverSource: input.coverSource! } : {}), status: 'pending', publishedAt: null, rejectNote: '' };
    if (input.replacementContent) { const replacement = input.replacementContent; Object.assign(deck, { fileName: replacement.fileName, sizes: replacement.sizes, chunkCount: replacement.chunkCount, chunks: replacement.manifest }); chunks.set(input.id, replacement.chunks); }
    decks.set(input.id, deck); counts(); return ok({ ...deck });
  },
  async reviewDeck(input) { if (!await boundary('review', true)) return failure(); metrics.reviews.push(input); const deck = decks.get(input.id)!; deck.status = input.action === 'reject' ? 'rejected' : input.action === 'unpublish' ? 'unpublished' : 'published'; deck.rejectNote = input.rejectNote ?? ''; deck.publishedAt = deck.status === 'published' ? new Date() : null; counts(); return ok({ ...deck }); },
  async deleteDeck(input) { if (!await boundary('delete')) return failure(); metrics.deletes.push(input); decks.delete(input.id); chunks.delete(input.id); counts(); return ok(undefined); },
};
const adapter = {
  async getAllDecks() { if (!await boundary('all', true)) return failure(); return page([...decks.values()]); },
  subscribePendingCount(count: (value: number) => void, error: (value: { code: AppErrorCode; message: string }) => void) {
    if (!store.getMember()?.isAdmin) { metrics.unauthorized++; throw new Error('Unauthorized subscription'); }
    metrics.subscriptions++; metrics.active++; const listener = { count, error: () => error({ code: AppErrorCode.NETWORK_ERROR, message: 'Sayaç alınamadı.' }) }; listeners.add(listener);
    if (flags.countFail) listener.error(); else count([...decks.values()].filter(deck => deck.status === 'pending').length);
    let active = true;
    return registerListener(() => { if (active) { active = false; metrics.disposals++; metrics.active--; listeners.delete(listener); } }, true);
  },
};
const api = { registryCount: getActiveListenerCount, auth: setAuth, navigate: (_: string) => {}, flags: (value: Partial<typeof flags>) => Object.assign(flags, value), metrics, store, release: () => held.splice(0).forEach(resolve => resolve()), countError: () => listeners.forEach(listener => listener.error()), long: () => decks.forEach(deck => { deck.title = 'UzunBaşlık'.repeat(12); deck.description = 'UzunAçıklama'.repeat(150); deck.ownerName = 'UzunYazar'.repeat(15); }), summaries: () => [...decks.values()].map(deck => ({ id: deck.id, status: deck.status, title: deck.title, rejectNote: deck.rejectNote })) };
declare global { interface Window { e2e: typeof api; prepaintTheme: string; } }
window.e2e = api;
function Harness() { const navigate = useNavigate(); useEffect(() => { api.navigate = path => navigate(path); }, [navigate]); return <App dependencies={{ auth: store, service, adapter }}/>; }
createRoot(document.getElementById('root')!).render(<BrowserRouter><ThemeProvider><ToastProvider><Harness/></ToastProvider></ThemeProvider></BrowserRouter>);
