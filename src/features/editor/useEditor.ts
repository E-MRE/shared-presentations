import { useLayoutEffect, useRef, useState } from 'react';
import type { CoverDescriptor, PipelineResult } from '../../content';
import type { Deck, DeckLink } from '../../contracts/models';
import type { CreateDeckInput, UpdateDeckInput } from '../../contracts/services';
import { AppErrorCode } from '../../contracts/errors';
import { MAX_SOURCE_COVER_BYTES } from '../../content/cover';
import { validateCreateDeckInput, validateUpdateDeckInput, validateSizes } from '../../data/validation';
import { readPresentationFiles, EditorInputError, type SelectedInput } from './input';
import { metadataErrors, validOriginalMetadata, type FieldErrors } from './validation';
import type { EditorContent, EditorService } from './types';

class PayloadError extends Error {}

export function useEditor({ deck, service, content, onComplete }: { deck?: Deck; service: EditorService; content: EditorContent; onComplete?: (deck: Deck) => void }) {
  const [title, setTitle] = useState(deck?.title ?? '');
  const titleRef = useRef(title);
  const touched = useRef(!!deck);
  const [description, setDescription] = useState(deck?.description ?? '');
  const [links, setLinks] = useState<DeckLink[]>(deck?.links.map(link => ({ ...link })) ?? []);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState('');
  const [fileError, setFileError] = useState('');
  const [coverError, setCoverError] = useState('');
  const [phase, setPhase] = useState('');
  const [prepared, setPrepared] = useState<PipelineResult>();
  const [selected, setSelected] = useState<SelectedInput>();
  const [cover, setCover] = useState<CoverDescriptor>();
  const [preview, setPreview] = useState<{ html?: string; kind: 'html' | 'pptx' }>();
  const [previewError, setPreviewError] = useState('');
  const [saved, setSaved] = useState(false);
  const alive = useRef(true), generation = useRef(0), lock = useRef(false);
  const previewGeneration = useRef(0);
  const lastFiles = useRef<{ files: File[]; directory: boolean } | undefined>(undefined);
  const coverRef = useRef<CoverDescriptor | undefined>(undefined);
  useLayoutEffect(() => { const operations = generation, previews = previewGeneration; alive.current = true; return () => { alive.current = false; operations.current++; previews.current++; }; }, []);
  function begin(label: string) { if (lock.current || saved || !alive.current) return null; lock.current = true; setPhase(label); return ++generation.current; }
  function current(token: number) { return alive.current && generation.current === token; }
  function finish(token: number) { if (current(token)) { lock.current = false; setPhase(''); } }
  function changeTitle(value: string) { touched.current = true; titleRef.current = value; setTitle(value); }
  function assignCover(value: CoverDescriptor | undefined) { coverRef.current = value; setCover(value); }
  async function prepareInput(value: SelectedInput, token: number) {
    if (value.candidates.length > 1 && !value.entry) return;
    setPhase('Sunum paketleniyor ve kapak hazırlanıyor…');
    const result = await content.prepare(value.input, { entrySelection: value.entry || undefined });
    if (!current(token)) return;
    if (!result.ok) throw new PayloadError(result.error.message);
    if (deck && result.value.kind !== deck.kind) throw new PayloadError('Dosya değişimi aynı biçimde olmalıdır.');
    const sizes = validateSizes(result.value.sizes, result.value.kind);
    if (!sizes.ok) throw new PayloadError(sizes.error.message);
    setPrepared(result.value);
    if (!touched.current && !titleRef.current.trim()) { titleRef.current = result.value.title; setTitle(result.value.title); }
    // A deliberately uploaded cover survives replacement. Otherwise choose the new pipeline cover.
    if (coverRef.current?.source !== 'upload') assignCover(result.value.selectedCover);
  }
  async function selectFiles(files: File[], directory = false) {
    const token = begin('Dosyalar okunuyor…'); if (token === null) return;
    lastFiles.current = { files, directory }; setFileError(''); setMessage(''); setPrepared(undefined); setSelected(undefined); setPreview(undefined); previewGeneration.current++;
    try {
      const value = await readPresentationFiles(files, directory, () => current(token));
      if (!current(token)) return;
      if (deck && (value.input.kind === 'pptx' ? 'pptx' : 'html') !== deck.kind) throw new PayloadError(`Bu sunum için yalnızca ${deck.kind === 'html' ? 'HTML / ZIP / klasör' : 'PPTX'} seçebilirsiniz.`);
      setSelected(value); await prepareInput(value, token);
    } catch (error) { if (current(token)) setFileError(error instanceof PayloadError || error instanceof EditorInputError ? error.message : 'Dosyalar hazırlanamadı. Yeniden deneyin.'); }
    finally { finish(token); }
  }
  async function chooseEntry(entry: string) {
    if (!selected || !selected.candidates.includes(entry)) return;
    const token = begin('Giriş dosyası hazırlanıyor…'); if (token === null) return;
    const value = { ...selected, entry }; setSelected(value); setPrepared(undefined); setPreview(undefined); setFileError(''); previewGeneration.current++;
    try { await prepareInput(value, token); } catch (error) { if (current(token)) setFileError(error instanceof PayloadError || error instanceof EditorInputError ? error.message : 'Sunum hazırlanamadı.'); } finally { finish(token); }
  }
  async function retryFile() { if (selected && (!selected.candidates.length || selected.entry)) { const token = begin('Sunum yeniden hazırlanıyor…'); if (token === null) return; setFileError(''); try { await prepareInput(selected, token); } catch (error) { if (current(token)) setFileError(error instanceof PayloadError || error instanceof EditorInputError ? error.message : 'Sunum hazırlanamadı.'); } finally { finish(token); } } else if (lastFiles.current) await selectFiles(lastFiles.current.files, lastFiles.current.directory); }
  async function chooseCover(file: File) {
    const token = begin('Kapak görseli işleniyor…'); if (token === null) return; setCoverError('');
    try {
      if (file.size > MAX_SOURCE_COVER_BYTES) throw new PayloadError('Kapak kaynak dosyası en fazla 10 MB olabilir.');
      const result = await content.processCover(file);
      if (!current(token)) return;
      if (!result.ok) throw new PayloadError(result.error.message);
      assignCover(result.value);
    } catch (error) { if (current(token)) setCoverError(error instanceof PayloadError || error instanceof EditorInputError ? error.message : 'Kapak işlenemedi. Önceki kapak korundu.'); } finally { finish(token); }
  }
  async function resetCover(source: 'default' | 'auto' | 'original') {
    if (source === 'original') { if (!lock.current) { assignCover(undefined); setCoverError(''); } return; }
    if (source === 'auto' && prepared?.autoCover) { if (!lock.current) { assignCover(prepared.autoCover); setCoverError(''); } return; }
    const token = begin('Varsayılan kapak hazırlanıyor…'); if (token === null) return;
    try {
      const result = prepared ? { ok: true as const, value: prepared.defaultCover } : await content.defaultCover(titleRef.current || 'Sunum');
      if (!current(token)) return;
      if (!result.ok) throw new PayloadError(result.error.message);
      assignCover(result.value); setCoverError('');
    } catch { if (current(token)) setCoverError('Varsayılan kapak hazırlanamadı. Yeniden deneyin.'); } finally { finish(token); }
  }
  async function openPreview() {
    const token = begin('Önizleme hazırlanıyor…'); if (token === null) return;
    const previewToken = ++previewGeneration.current; setPreviewError('');
    try {
      if (prepared?.kind === 'pptx' || (!prepared && deck?.kind === 'pptx')) { setPreview({ kind: 'pptx' }); return; }
      let result;
      if (prepared) result = content.reconstruct(prepared.chunks, prepared.manifest, prepared.kind, prepared.sizes);
      else if (deck) {
        if (!validOriginalMetadata(deck)) throw new PayloadError('Sunum manifesti veya boyutları geçersiz.');
        const chunks = await service.getAllChunks(deck.id, deck.chunkCount);
        if (!current(token) || previewGeneration.current !== previewToken) return;
        if (!chunks.ok) throw new PayloadError(chunks.error.message);
        result = content.reconstruct(chunks.value, deck.chunks, deck.kind, deck.sizes);
      } else return;
      if (!current(token) || previewGeneration.current !== previewToken) return;
      if (!result.ok || !result.value.html) throw new PayloadError(result.ok ? 'HTML önizlemesi bulunamadı.' : result.error.message);
      setPreview({ kind: 'html', html: result.value.html });
    } catch (error) { if (current(token) && previewGeneration.current === previewToken) setPreviewError(error instanceof PayloadError ? error.message : 'Önizleme yüklenemedi. Yeniden deneyin.'); }
    finally { finish(token); }
  }
  function closePreview() { previewGeneration.current++; setPreview(undefined); setPreviewError(''); }
  function clearReplacement() { if (lock.current) return; setPrepared(undefined); setSelected(undefined); lastFiles.current = undefined; setFileError(''); closePreview(); assignCover(undefined); }
  function clearError(key: string) { setErrors(previous => { const next = { ...previous }; delete next[key]; return next; }); }
  function validateField(key: string) { const value = metadataErrors(title, description, links)[key]; setErrors(previous => { const next = { ...previous }; if (value) next[key] = value; else delete next[key]; return next; }); }
  function validateFields() { const next = metadataErrors(title, description, links); setErrors(next); return next; }
  async function submit(): Promise<'invalid' | 'sent' | 'ignored'> {
    if (lock.current || saved || !alive.current) return 'ignored';
    const next = validateFields();
    if (!deck && !prepared) next.file = 'Önce bir sunum dosyası hazırlayın.';
    if (fileError || (selected && !prepared)) next.file = 'Seçilen dosya henüz hazır değil. Giriş dosyasını seçin veya hazırlamayı yeniden deneyin.';
    if (Object.keys(next).length) { setErrors({ ...next }); return 'invalid'; }
    const token = begin('Sunum onaya gönderiliyor…'); if (token === null) return 'ignored'; setMessage('');
    try {
      const metadata = { title: title.trim(), description, links: links.map(link => ({ label: link.label.trim(), url: link.url.trim() })) };
      let result;
      if (deck) {
        const input: UpdateDeckInput = { id: deck.id, ...metadata };
        if (cover) { input.cover = cover.bytes; input.coverSource = cover.source; }
        if (prepared) {
          if (prepared.kind !== deck.kind) throw new PayloadError('Dosya değişimi aynı biçimde olmalıdır.');
          const sizes = validateSizes(prepared.sizes, deck.kind); if (!sizes.ok) throw new PayloadError(sizes.error.message);
          input.replacementContent = { fileName: prepared.fileName, sizes: prepared.sizes, chunkCount: prepared.chunks.length, chunks: prepared.chunks, manifest: prepared.manifest };
        }
        const valid = validateUpdateDeckInput(input); if (!valid.ok) throw new PayloadError(valid.error.message);
        result = await service.updateDeck(input);
      } else {
        const ready = prepared!; const chosen = cover ?? ready.selectedCover;
        const input: CreateDeckInput = { ...metadata, kind: ready.kind, fileName: ready.fileName, cover: chosen.bytes, coverSource: chosen.source, sizes: ready.sizes, chunkCount: ready.chunks.length, chunks: ready.chunks, manifest: ready.manifest };
        const valid = validateCreateDeckInput(input); if (!valid.ok) throw new PayloadError(valid.error.message);
        result = await service.createDeck(input);
      }
      if (!current(token)) return 'sent';
      if (!result.ok) {
        setMessage(result.error.code === AppErrorCode.QUOTA_EXCEEDED ? 'En fazla 5 sunum onay bekleyebilir. Bir sunumun incelemesi tamamlandıktan sonra yeniden deneyin.' : result.error.code === AppErrorCode.PERMISSION_DENIED ? 'İşlem için izniniz yok. Oturumunuzu kontrol edip yeniden deneyin.' : 'Sunum kaydedilemedi. Bağlantınızı kontrol edip yeniden deneyin.');
      } else { setSaved(true); setMessage('Sunum onaya gönderildi.'); onComplete?.(result.value); }
    } catch (error) { if (current(token)) setMessage(error instanceof PayloadError ? error.message : 'Sunum kaydedilemedi. Yeniden deneyin.'); }
    finally { finish(token); }
    return 'sent';
  }
  return { title, changeTitle, description, setDescription, links, setLinks, errors, validateFields, validateField, clearError, message, fileError, coverError, phase, prepared, selected, cover, preview, previewError, saved, selectFiles, chooseEntry, retryFile, chooseCover, resetCover, openPreview, closePreview, clearReplacement, submit };
}
