import { prepareChunks } from '../../src/content/chunks';
import { AppErrorCode } from '../../src/contracts/errors';
import type { AuthState, AuthUser } from '../../src/contracts/auth';
import type { Deck, DeckChunk } from '../../src/contracts/models';
import type { Result } from '../../src/contracts/services';
import type { ViewerReadService } from '../../src/features/viewer';

const user: AuthUser = { uid: 'member', email: 'member@example.invalid', displayName: 'Deniz Kaya', isEmailVerified: true, isGoogle: false, isMember: true, isAdmin: false };
export function authState(role: string): AuthState {
  if (role === 'loading' || role === 'unauthenticated') return { status: role, user: null, isMember: false, isAdmin: false };
  if (role === 'unverified') return { status: 'unverified', user: { ...user, isMember: false, isEmailVerified: false }, isMember: false, isAdmin: false };
  return { status: 'authenticated', user: { ...user, uid: role === 'other' ? 'other-user' : user.uid, isAdmin: role === 'admin' }, isMember: true, isAdmin: role === 'admin' };
}
// A self-contained uploaded deck fixture. Its own keyboard handler is not a viewer helper.
export const html = `<!doctype html><html lang="tr"><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;background:#12151b;color:#f3f4f6;font:16px system-ui;min-height:100vh;display:flex;align-items:center;padding:8%}.slide{max-width:800px}small{color:#60a5fa;letter-spacing:.15em}h1{font-size:clamp(24px,5vw,64px);letter-spacing:-.04em;line-height:1.05;margin:20px 0}p{line-height:1.6;color:#9ca3af}button,input{font:inherit;color:inherit;background:#181c23;border:1px solid #374151;padding:12px;border-radius:8px}#isolation{font-size:12px}#keys{color:#60a5fa}</style></head><body tabindex="0"><div class="slide"><small>VEKTÖR / MİMARİ</small><h1>Güvenilir sistemler,<br>ortak bir dil.</h1><p>Dağıtık sistemlerde hata sınırları, veri bütünlüğü ve ekiplerin birlikte aldığı mimari kararlar.</p><button id="deck-control">Sunuma odaklan</button> <input aria-label="Sunum notu" placeholder="Sunum notu"><p id="keys">Hazır</p><p id="isolation"></p></div><script>let keys=0;document.addEventListener('keydown',e=>{document.querySelector('#keys').textContent=e.key+':'+(++keys)});let parentDenied=false,cookieDenied=false;try{parent.document.body.dataset.compromised='yes'}catch{parentDenied=true}try{document.cookie='inside=1';document.cookie}catch{cookieDenied=true}document.querySelector('#isolation').textContent='parent:'+parentDenied+';cookie:'+cookieDenied;</script></body></html>`;
export const pptxBytes = new Uint8Array([80, 75, 3, 4, ...Array.from({ length: 4096 }, (_, index) => index % 251)]);
export interface Scenario {
  kind?: 'html' | 'pptx'; status?: Deck['status']; owner?: string; mode?: 'normal' | 'notfound' | 'denied' | 'readerror' | 'throw' | 'corrupt' | 'missing' | 'chunkerror' | 'retry';
  hold?: 'deck' | 'chunks'; invalid?: 'count' | 'size' | 'version' | 'order' | 'encoded' | 'unpacked' | 'files'; long?: boolean; cover?: number[]; fileName?: string;
}
export interface HarnessMetrics { decks: string[]; chunks: Array<{ id: string; count: number }>; settled: number; closes: number; urls: Array<{ url: string; type: string; size: number }>; revoked: string[]; fullscreenListeners: number; downloads: Array<{ href: string; name: string }>; }
export const metrics: HarnessMetrics = { decks: [], chunks: [], settled: 0, closes: 0, urls: [], revoked: [], fullscreenListeners: 0, downloads: [] };
const pending: Array<() => void> = [];
export function release() { pending.splice(0).forEach(resolve => resolve()); }
function wait(hold: boolean): Promise<void> { return hold ? new Promise(resolve => pending.push(resolve)) : Promise.resolve(); }
const fail = <T,>(code: AppErrorCode): Result<T> => ({ ok: false, error: { code, message: 'Fixture service error' } });
export function fixtureService(scenario: Scenario): ViewerReadService {
  const kind = scenario.kind ?? 'html';
  const raw = kind === 'html' ? new TextEncoder().encode(html) : pptxBytes;
  const prepared = prepareChunks(raw, kind);
  if (!prepared.ok) throw new Error(prepared.error.message);
  const payload = prepared.value;
  const deckFor = (id: string): Deck => {
    const deck: Deck = { id, ownerUid: scenario.owner ?? 'member', ownerName: scenario.long ? 'UzunYazarAdı'.repeat(20) : 'Deniz Kaya', title: scenario.long ? 'ÇokUzunSunumBaşlığı'.repeat(12) : 'Dağıtık Sistemlerde Güvenilir Tasarım', description: scenario.long ? '<img src=x onerror=window.untrusted=true> '+ 'UzunKelime'.repeat(120) : 'Hata sınırları, veri bütünlüğü ve ortak mimari kararlar. Ekibimizin teknik paylaşımından notlar ve kaynaklar.', links: [{ label: 'Mimari notları', url: 'https://example.invalid/notes' }, { label: 'Unsafe JS', url: 'javascript:alert(1)' }, { label: 'Unsafe HTTP', url: 'http://example.invalid/' }, { label: 'Credentials', url: 'https://user:pass@example.invalid/' }, { label: 'Malformed', url: '%%%bad' }], kind, fileName: scenario.fileName ?? (kind === 'pptx' ? 'mimari-kararlar.pptx' : 'mimari-kararlar.html'), status: scenario.status ?? 'published', rejectNote: '', cover: new Uint8Array(scenario.cover ?? []), coverSource: scenario.cover ? 'upload' : 'default', sizes: { encoded: payload.encodedData.length, unpacked: raw.length, fileCount: 1 }, chunkCount: payload.chunkCount, chunks: payload.manifest.map(entry => ({ ...entry })), createdAt: new Date('2026-10-02'), updatedAt: new Date('2026-10-04'), publishedAt: new Date('2026-10-04'), reviewedBy: null, reviewedAt: null, manifestVersion: 1, quotaMarker: '' };
    switch (scenario.invalid) {
      case 'count': deck.chunkCount = 100000; break;
      case 'size': deck.chunks[0].size = 900001; break;
      case 'version': deck.manifestVersion = 3; break;
      case 'order': deck.chunks[0].index = 1; break;
      case 'encoded': deck.sizes.encoded = Number.NaN; break;
      case 'unpacked': deck.sizes.unpacked = 30 * 1024 * 1024; break;
      case 'files': deck.sizes.fileCount = 301; break;
    }
    return deck;
  };
  let deckReads = 0;
  return {
    async getDeck(id) {
      metrics.decks.push(id); await wait(scenario.hold === 'deck'); metrics.settled++;
      if (scenario.mode === 'throw') throw new Error('Fixture thrown error');
      if (scenario.mode === 'retry' && deckReads++ === 0) return fail(AppErrorCode.NETWORK_ERROR);
      if (scenario.mode === 'notfound') return fail(AppErrorCode.NOT_FOUND);
      if (scenario.mode === 'denied') return fail(AppErrorCode.PERMISSION_DENIED);
      if (scenario.mode === 'readerror') return fail(AppErrorCode.NETWORK_ERROR);
      return { ok: true, value: deckFor(id) };
    },
    async getAllChunks(id, count) {
      metrics.chunks.push({ id, count }); await wait(scenario.hold === 'chunks'); metrics.settled++;
      if (scenario.mode === 'chunkerror') return fail(AppErrorCode.NETWORK_ERROR);
      let chunks: DeckChunk[] = payload.chunks.map(chunk => ({ index: chunk.index, data: new Uint8Array(chunk.data) }));
      if (scenario.mode === 'missing') chunks = [];
      if (scenario.mode === 'corrupt') chunks[0].data = new Uint8Array(chunks[0].data.length).fill(7);
      return { ok: true, value: chunks };
    },
  };
}
