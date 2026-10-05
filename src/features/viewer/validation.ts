import type { Deck } from '../../contracts/models';
import { MANIFEST_VERSION, MAX_CHUNK_BYTES, MAX_CHUNKS_COUNT, MAX_HTML_FILE_COUNT, MAX_HTML_UNPACKED_BYTES, MAX_HTML_ENCODED_BYTES, MAX_PPTX_BYTES } from '../../contracts/limits';

/** Check metadata before allowing the service to allocate/read any chunks. */
export function validContentMetadata(deck: Deck): boolean {
  if (deck.manifestVersion !== MANIFEST_VERSION || !['html', 'pptx'].includes(deck.kind) ||
      !Number.isInteger(deck.chunkCount) || deck.chunkCount < 1 || deck.chunkCount > MAX_CHUNKS_COUNT ||
      !Array.isArray(deck.chunks) || deck.chunks.length !== deck.chunkCount || !deck.sizes) return false;
  const { encoded, unpacked, fileCount } = deck.sizes;
  if (!Number.isInteger(encoded) || encoded < 1 || !Number.isInteger(unpacked) || unpacked < 1 ||
      !Number.isInteger(fileCount) || fileCount < 1) return false;
  if (deck.kind === 'html' ? encoded > MAX_HTML_ENCODED_BYTES || unpacked > MAX_HTML_UNPACKED_BYTES || fileCount > MAX_HTML_FILE_COUNT
    : encoded > MAX_PPTX_BYTES || unpacked !== encoded || fileCount !== 1) return false;
  return deck.chunks.every((entry, index) => entry && entry.index === index && Number.isInteger(entry.size) && entry.size > 0 && entry.size <= MAX_CHUNK_BYTES) &&
    deck.chunks.reduce((total, entry) => total + entry.size, 0) === encoded;
}

/** Recheck URLs at the output boundary even when metadata came from a trusted service. */
export function safeResourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function safeDownloadName(value: string): string {
  const basename = value.split(/[\\/]/).at(-1) || 'sunum.pptx';
  const clean = basename.replace(/[\u0000-\u001f\u007f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^\.+/, '').trim().slice(0, 180);
  return /\.pptx$/i.test(clean) ? clean : `${clean || 'sunum'}.pptx`;
}
