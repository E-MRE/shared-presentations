import type { AuthState } from '../../src/contracts/auth';
import type { Deck, DeckChunk } from '../../src/contracts/models';
import type { CreateDeckInput, UpdateDeckInput } from '../../src/contracts/services';
import { ok, err } from '../../src/contracts/services';
import { AppErrorCode } from '../../src/contracts/errors';
import { generateDefaultCover, prepareChunks, preparePresentation, processCoverOverride, reconstructPresentation, type PipelineResult } from '../../src/content';
import type { EditorContent, EditorService } from '../../src/features/editor';
export const flags = { error: '', throws: '', hold: '', foreign: false, malformed: false, badPrepared: '', captureFailure: false, pending: 0 };
export const metrics = { reads: [] as string[], chunks: [] as string[], prep: 0, covers: 0, mutations: [] as Array<{ method: string; keys: string[]; title: string; description: string; links: unknown; coverSource?: string; coverBytes?: number; replacementKeys?: string[]; fileName?: string; kind?: string; sizes?: unknown; html?: string; helper?: boolean; status?: string }>, completions: [] as string[], completionStatuses: [] as string[], closes: 0, settled: 0, preparedSettled: 0, coverSettled: 0, urls: [] as string[], revoked: [] as string[] };
export const inputs: Array<CreateDeckInput | UpdateDeckInput> = [];
const held = new Map<string, Array<() => void>>();
async function boundary(kind: string) { if (flags.hold === kind) await new Promise<void>(resolve => { const queue = held.get(kind) ?? []; queue.push(resolve); held.set(kind, queue); }); if (flags.throws === kind) throw new Error('Injected transport failure'); }
export function release(kind: string) { const queue = held.get(kind) ?? []; held.delete(kind); queue.forEach(resolve => resolve()); }
export function authState(role: string): AuthState {
  if (role === 'loading' || role === 'unauthenticated') return { status: role, user: null, isAdmin: false, isMember: false };
  const user = { uid: role === 'member2' ? 'member2' : 'member', email: 'member@example.test', displayName: 'Ekip Üyesi', isMember: role !== 'unverified', isAdmin: role === 'admin', isEmailVerified: role !== 'unverified', isGoogle: false };
  return role === 'unverified' ? { status: 'unverified', user, isAdmin: false, isMember: false } : { status: 'authenticated', user, isAdmin: user.isAdmin, isMember: true };
}
const originalHtml = '<!doctype html><html><head><title>Mevcut Sunum</title></head><body><h1 id="original-title">Mevcut içerik</h1><script>try { parent.document.body.dataset.escaped = "yes" } catch { document.body.dataset.isolated = "yes" }</script></body></html>';
const chunking = prepareChunks(new TextEncoder().encode(originalHtml), 'html');
if (!chunking.ok) throw new Error('Original fixture preparation failed');
let storedChunks: DeckChunk[] = chunking.value.chunks;
let storedDeck: Deck | undefined;
export async function originalDeck(id = 'own'): Promise<Deck> {
  const cover = await generateDefaultCover('Mevcut Sunum'); if (!cover.ok) throw new Error('Cover failed');
  return { id, ownerUid: flags.foreign ? 'foreign' : 'member', ownerName: 'Ekip Üyesi', title: 'Mevcut Sunum', description: 'Başlangıç açıklaması', links: [{ label: 'Kaynak', url: 'https://example.test/guide' }], kind: id === 'pptx' ? 'pptx' : 'html', fileName: id === 'pptx' ? 'sunum.pptx' : 'original.html', status: id === 'pending' ? 'pending' : id === 'rejected' ? 'rejected' : id === 'unpublished' ? 'unpublished' : 'published', rejectNote: id === 'rejected' ? 'Kaynakları ekleyin.' : '', cover: cover.value.bytes, coverSource: 'default', sizes: { encoded: chunking.value.encodedData.length, unpacked: new TextEncoder().encode(originalHtml).length, fileCount: 1 }, chunkCount: flags.malformed ? 999 : 1, chunks: chunking.value.manifest, manifestVersion: 1, createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-02'), publishedAt: new Date('2026-10-02'), reviewedAt: null, reviewedBy: null, quotaMarker: 'fixture' };
}
export function fixtureService(): EditorService {
  const service: EditorService = {
    async getDeck(id) { metrics.reads.push(id); await boundary('read'); if (flags.error === 'read') return err({ code: AppErrorCode.NETWORK_ERROR, message: 'Read failed' }); if (id === 'missing') return err({ code: AppErrorCode.NOT_FOUND, message: 'Missing' }); if (id === 'permission') return err({ code: AppErrorCode.PERMISSION_DENIED, message: 'Denied' }); return ok(storedDeck?.id === id ? storedDeck : await originalDeck(id)); },
    async getAllChunks(id) { metrics.chunks.push(id); await boundary('chunks'); return flags.error === 'chunks' ? err({ code: AppErrorCode.NETWORK_ERROR, message: 'İçerik okunamadı. Yeniden deneyin.' }) : ok(storedChunks); },
    async createDeck(input) { record('create', input); await boundary('mutation'); if (flags.error === 'mutation') return err({ code: AppErrorCode.NETWORK_ERROR, message: 'Save failed' }); if (flags.error === 'permission') return err({ code: AppErrorCode.PERMISSION_DENIED, message: 'Denied' }); if (flags.pending >= 5) return err({ code: AppErrorCode.QUOTA_EXCEEDED, message: 'Quota' }); flags.pending++; const original = await originalDeck(); storedChunks = input.chunks; storedDeck = { ...original, ...input, id: `created-${flags.pending}`, status: 'pending', chunks: input.manifest }; return ok(storedDeck); },
    async updateDeck(input) { record('update', input); await boundary('mutation'); if (flags.error === 'mutation') return err({ code: AppErrorCode.NETWORK_ERROR, message: 'Save failed' }); if (flags.error === 'permission') return err({ code: AppErrorCode.PERMISSION_DENIED, message: 'Denied' }); const original = await originalDeck(input.id); if (original.status !== 'pending') { if (flags.pending >= 5) return err({ code: AppErrorCode.QUOTA_EXCEEDED, message: 'Quota' }); flags.pending++; } if (input.replacementContent) storedChunks = input.replacementContent.chunks; storedDeck = { ...original, ...input, ...(input.replacementContent ? { ...input.replacementContent, chunks: input.replacementContent.manifest } : {}), status: 'pending' }; return ok(storedDeck); },
  };
  return { ...service, async createDeck(input) { try { return await service.createDeck(input); } finally { metrics.settled++; } }, async updateDeck(input) { try { return await service.updateDeck(input); } finally { metrics.settled++; } } };
}
function record(method: string, input: CreateDeckInput | UpdateDeckInput) {
  inputs.push(input);
  const replacement = 'replacementContent' in input ? input.replacementContent : undefined;
  const payload = 'kind' in input ? input : replacement;
  const reconstructed = payload ? reconstructPresentation(payload.chunks, payload.manifest, 'kind' in input ? input.kind : payload.fileName.endsWith('.pptx') ? 'pptx' : 'html', payload.sizes) : undefined;
  metrics.mutations.push({ method, keys: Object.keys(input).sort(), title: input.title, description: input.description, links: input.links, coverSource: input.coverSource, coverBytes: input.cover?.length, replacementKeys: replacement ? Object.keys(replacement).sort() : undefined, fileName: payload?.fileName, kind: 'kind' in input ? input.kind : undefined, sizes: payload?.sizes, html: reconstructed?.ok ? reconstructed.value.html : undefined, helper: reconstructed?.ok ? reconstructed.value.html?.includes('VEKTOR_COVER_CAPTURE') : undefined });
}
export function fixtureContent(): EditorContent {
  return { async prepare(input, options) { metrics.prep++; try { await boundary('prep'); if (flags.error === 'prep') return err({ code: AppErrorCode.INVALID_ARGUMENT, message: 'Sunum hazırlanamadı. Yeniden deneyin.' }); const result = await preparePresentation(input, flags.captureFailure ? { ...options, captureTimeoutMs: 1 } : options); if (result.ok && flags.badPrepared) { const value: PipelineResult = { ...result.value, sizes: { ...result.value.sizes } }; if (flags.badPrepared === 'encoded') value.sizes.encoded = 6 * 1024 * 1024; if (flags.badPrepared === 'files') value.sizes.fileCount = 301; if (flags.badPrepared === 'manifest') value.manifest = [{ index: 9, size: 1 }]; return ok(value); } return result; } finally { metrics.preparedSettled++; } }, async processCover(input) { metrics.covers++; try { await boundary('cover'); if (flags.error === 'cover') return err({ code: AppErrorCode.INVALID_COVER, message: 'Kapak işlenemedi. Yeniden deneyin.' }); return await processCoverOverride(input); } finally { metrics.coverSettled++; } }, reconstruct: reconstructPresentation, defaultCover: generateDefaultCover };
}
export function reset() { storedDeck = undefined; storedChunks = chunking.ok ? chunking.value.chunks : []; Object.assign(flags, { error: '', throws: '', hold: '', foreign: false, malformed: false, badPrepared: '', captureFailure: false, pending: 0 }); }
