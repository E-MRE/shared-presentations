import type { Deck, DeckLink } from '../../contracts/models';
import { MANIFEST_VERSION, MAX_CHUNK_BYTES, MAX_CHUNKS_COUNT, MAX_DESCRIPTION_LENGTH, MAX_HTML_ENCODED_BYTES, MAX_HTML_FILE_COUNT, MAX_HTML_UNPACKED_BYTES, MAX_LINKS_COUNT, MAX_PPTX_BYTES } from '../../contracts/limits';
import { validateTitle, validateDescription, validateLink } from '../../data/validation';

export type FieldErrors = Record<string, string>;
export function metadataErrors(title: string, description: string, links: DeckLink[]): FieldErrors {
  const errors: FieldErrors = {};
  const t = validateTitle(title.trim()); if (!t.ok) errors.title = t.error.message;
  const d = validateDescription(description); if (!d.ok) errors.description = d.error.message;
  if (description.length > MAX_DESCRIPTION_LENGTH) errors.description = `Açıklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir.`;
  if (links.length > MAX_LINKS_COUNT) errors.links = `En fazla ${MAX_LINKS_COUNT} bağlantı ekleyebilirsiniz.`;
  links.forEach((link, index) => {
    const clean = { label: link.label.trim(), url: link.url.trim() };
    const result = validateLink(clean);
    if (!result.ok) errors[`link-${index}-${result.error.message.includes('etiketi') ? 'label' : 'url'}`] = result.error.message;
    try {
      const url = new URL(clean.url);
      if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || /[\s\\]/.test(clean.url)) throw new Error('Invalid URL');
    } catch { errors[`link-${index}-url`] = 'Kimlik bilgisi içermeyen geçerli, tam bir HTTPS adresi girin.'; }
  });
  return errors;
}

/** Refuse malformed allocation metadata before asking the service for content. */
export function validOriginalMetadata(deck: Deck): boolean {
  if (deck.manifestVersion !== MANIFEST_VERSION || !['html', 'pptx'].includes(deck.kind) || !deck.sizes || !Number.isInteger(deck.chunkCount) || deck.chunkCount < 1 || deck.chunkCount > MAX_CHUNKS_COUNT || !Array.isArray(deck.chunks) || deck.chunks.length !== deck.chunkCount) return false;
  const { encoded, unpacked, fileCount } = deck.sizes;
  if (![encoded, unpacked, fileCount].every(n => Number.isInteger(n) && n > 0)) return false;
  if (deck.kind === 'html' ? encoded > MAX_HTML_ENCODED_BYTES || unpacked > MAX_HTML_UNPACKED_BYTES || fileCount > MAX_HTML_FILE_COUNT : encoded > MAX_PPTX_BYTES || unpacked !== encoded || fileCount !== 1) return false;
  return deck.chunks.every((entry, index) => entry && entry.index === index && Number.isInteger(entry.size) && entry.size > 0 && entry.size <= MAX_CHUNK_BYTES) && deck.chunks.reduce((sum, entry) => sum + entry.size, 0) === encoded;
}
export function validDeckId(id: string | undefined): id is string {
  return !!id && id.length <= 1500 && id !== '.' && id !== '..' && !/[\/\u0000-\u001f\u007f]/.test(id);
}
