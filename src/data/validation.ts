/**
 * Data Validation Functions
 *
 * Client-side validation enforcing single source of truth limits from
 * src/contracts/limits.ts. The browser inspects archive contents while rules
 * also bound the declared sizes and file count.
 *
 * References:
 * - src/contracts/limits.ts
 * - docs/ARCHITECTURE.md §7
 * - docs/PLAN.md §5, §7
 */

import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LINKS_COUNT,
  MAX_LINK_LABEL_LENGTH,
  MAX_LINK_URL_LENGTH,
  MAX_COVER_BYTES,
  MIN_CHUNKS_COUNT,
  MAX_CHUNKS_COUNT,
  MAX_CHUNK_BYTES,
  MAX_HTML_ENCODED_BYTES,
  MAX_PPTX_BYTES,
  MAX_HTML_UNPACKED_BYTES,
  MAX_HTML_FILE_COUNT,
} from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import type { DeckLink, DeckSizes, DeckKind, ChunkManifestEntry } from '../contracts/models';
import type { PreparedChunk } from '../contracts/content';
import type { CreateDeckInput, UpdateDeckInput } from '../contracts/services';

import { DECK_CATEGORIES, MAX_TAGS, MAX_TAG_LENGTH } from '../contracts/catalog';

export function validateCatalog(input: { category?: string; tags?: string[] }): Result<void> {
  if (input.category !== undefined && input.category !== '' && !DECK_CATEGORIES.includes(input.category)) return err({ code: AppErrorCode.INVALID_ARGUMENT, message: 'Listeden geçerli bir kategori seçin.' });
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS || new Set(input.tags).size !== input.tags.length || input.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > MAX_TAG_LENGTH))) return err({ code: AppErrorCode.INVALID_ARGUMENT, message: `En fazla ${MAX_TAGS} farklı etiket ekleyin; her etiket 1–${MAX_TAG_LENGTH} karakter olmalı.` });
  return ok(undefined);
}

const HTTPS_REGEX = /^https:\/\/.+/;

/** Validates deck title */
export function validateTitle(title: string): Result<void> {
  if (typeof title !== 'string' || title.trim().length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Sunum başlığı boş bırakılamaz.',
    });
  }
  if (title.length > MAX_TITLE_LENGTH) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Sunum başlığı en fazla ${MAX_TITLE_LENGTH} karakter olabilir.`,
    });
  }
  return ok(undefined);
}

/** Validates deck description */
export function validateDescription(description: string): Result<void> {
  if (typeof description !== 'string') {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Açıklama metin formatında olmalıdır.',
    });
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Açıklama en fazla ${MAX_DESCRIPTION_LENGTH} karakter olabilir.`,
    });
  }
  return ok(undefined);
}

/** Validates single external link */
export function validateLink(link: DeckLink): Result<void> {
  if (!link || typeof link !== 'object') {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz bağlantı nesnesi.',
    });
  }
  if (!link.label || typeof link.label !== 'string' || link.label.trim().length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Bağlantı etiketi boş bırakılamaz.',
    });
  }
  if (link.label.length > MAX_LINK_LABEL_LENGTH) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Bağlantı etiketi en fazla ${MAX_LINK_LABEL_LENGTH} karakter olabilir.`,
    });
  }
  if (!link.url || typeof link.url !== 'string' || !HTTPS_REGEX.test(link.url)) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Bağlantı adresi geçerli bir HTTPS adresi olmalıdır.',
    });
  }
  if (link.url.length > MAX_LINK_URL_LENGTH) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Bağlantı adresi en fazla ${MAX_LINK_URL_LENGTH} karakter olabilir.`,
    });
  }
  return ok(undefined);
}

/** Validates list of external links */
export function validateLinks(links: DeckLink[]): Result<void> {
  if (!Array.isArray(links)) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Bağlantılar dizi formatında olmalıdır.',
    });
  }
  if (links.length > MAX_LINKS_COUNT) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `En fazla ${MAX_LINKS_COUNT} adet bağlantı eklenebilir.`,
    });
  }
  for (const link of links) {
    const res = validateLink(link);
    if (!res.ok) return res;
  }
  return ok(undefined);
}

/** Validates thumbnail cover binary payload */
export function validateCover(cover: Uint8Array): Result<void> {
  if (!(cover instanceof Uint8Array)) {
    return err({
      code: AppErrorCode.INVALID_COVER,
      message: 'Kapak görseli geçerli bir ikili veri (Uint8Array) olmalıdır.',
    });
  }
  if (cover.byteLength === 0) {
    return err({
      code: AppErrorCode.INVALID_COVER,
      message: 'Kapak görseli boş olamaz.',
    });
  }
  if (cover.byteLength > MAX_COVER_BYTES) {
    return err({
      code: AppErrorCode.INVALID_COVER,
      message: `Kapak görseli boyutu ${MAX_COVER_BYTES} bayt (~150 KB) sınırını aşıyor.`,
    });
  }
  return ok(undefined);
}

/** Validates storage sizes and HTML archive bounds. */
export function validateSizes(sizes: DeckSizes, kind: DeckKind): Result<void> {
  if (!sizes || typeof sizes !== 'object') {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Boyut metrikleri eksik.',
    });
  }

  // Encoded limits
  if (typeof sizes.encoded !== 'number' || sizes.encoded <= 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Kodlanmış paket boyutu sıfırdan büyük olmalıdır.',
    });
  }

  if (kind === 'html' && sizes.encoded > MAX_HTML_ENCODED_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Sıkıştırılmış HTML sunum boyutu 5 MB (${MAX_HTML_ENCODED_BYTES} bayt) sınırını aşıyor.`,
    });
  }

  if (kind === 'pptx' && sizes.encoded > MAX_PPTX_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `PPTX sunum boyutu 8 MB (${MAX_PPTX_BYTES} bayt) sınırını aşıyor.`,
    });
  }

  // Archive limits: validate actual browser preparation and declared metadata.
  if (kind === 'html') {
    if (typeof sizes.unpacked !== 'number' || sizes.unpacked < 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Açılmış paket boyutu geçerli bir sayı olmalıdır.',
      });
    }
    if (sizes.unpacked > MAX_HTML_UNPACKED_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `Açılmış sunum paketi boyutu 25 MB (${MAX_HTML_UNPACKED_BYTES} bayt) sınırını aşıyor.`,
      });
    }

    if (typeof sizes.fileCount !== 'number' || sizes.fileCount < 1) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Sunum paketi en az 1 dosya içermelidir.',
      });
    }
    if (sizes.fileCount > MAX_HTML_FILE_COUNT) {
      return err({
        code: AppErrorCode.FILE_COUNT_EXCEEDED,
        message: `Sunum paketi en fazla ${MAX_HTML_FILE_COUNT} dosya içerebilir. Paketinizde ${sizes.fileCount} dosya bulundu.`,
      });
    }
  }

  return ok(undefined);
}

/** Validates chunks and manifest integrity */
export function validateManifest(
  chunkCount: number,
  manifest: ChunkManifestEntry[],
  chunks: PreparedChunk[],
  encodedSize: number
): Result<void> {
  if (!Number.isInteger(chunkCount) || chunkCount < MIN_CHUNKS_COUNT || chunkCount > MAX_CHUNKS_COUNT) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Parça sayısı ${MIN_CHUNKS_COUNT} ile ${MAX_CHUNKS_COUNT} arasında olmalıdır.`,
    });
  }

  if (!Array.isArray(manifest) || manifest.length !== chunkCount) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Manifest parça listesi uzunluğu (${manifest?.length}) parça sayısı (${chunkCount}) ile eşleşmiyor.`,
    });
  }

  if (!Array.isArray(chunks) || chunks.length !== chunkCount) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Hazırlanan parça sayısı (${chunks?.length}) parça sayısı (${chunkCount}) ile eşleşmiyor.`,
    });
  }

  let totalSize = 0;
  for (let i = 0; i < chunkCount; i++) {
    const entry = manifest[i];
    const chunk = chunks[i];

    if (!entry || entry.index !== i) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Manifest parça indeksi (${entry?.index}) beklenen indeks (${i}) ile uyuşmuyor.`,
      });
    }

    if (!chunk || chunk.index !== i) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Parça verisi indeksi (${chunk?.index}) beklenen indeks (${i}) ile uyuşmuyor.`,
      });
    }

    if (!Number.isInteger(entry.size) || entry.size <= 0 || entry.size > MAX_CHUNK_BYTES) {
      return err({
        code: AppErrorCode.CHUNK_TOO_LARGE,
        message: `Parça ${i} boyutu (${entry.size} bayt) 900 KB (${MAX_CHUNK_BYTES} bayt) sınırını aşıyor.`,
      });
    }

    if (chunk.data.byteLength !== entry.size) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Parça ${i} ikili boyutu (${chunk.data.byteLength} bayt) manifest boyutu (${entry.size} bayt) ile uyuşmuyor.`,
      });
    }

    totalSize += entry.size;
  }

  if (totalSize !== encodedSize) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Parça boyutları toplamı (${totalSize} bayt) bildirilen kodlanmış boyut (${encodedSize} bayt) ile eşleşmiyor.`,
    });
  }

  return ok(undefined);
}

/** Validates complete CreateDeckInput payload */
export function validateCreateDeckInput(input: CreateDeckInput): Result<void> {
  const catalog = validateCatalog(input);
  if (!catalog.ok) return catalog;
  const titleRes = validateTitle(input.title);
  if (!titleRes.ok) return titleRes;

  const descRes = validateDescription(input.description);
  if (!descRes.ok) return descRes;

  const linksRes = validateLinks(input.links);
  if (!linksRes.ok) return linksRes;

  if (input.kind !== 'html' && input.kind !== 'pptx') {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Sunum türü "html" veya "pptx" olmalıdır.',
    });
  }

  if (!input.fileName || typeof input.fileName !== 'string' || input.fileName.length > 255) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Dosya adı 1 ile 255 karakter arasında olmalıdır.',
    });
  }

  const coverRes = validateCover(input.cover);
  if (!coverRes.ok) return coverRes;

  const sizesRes = validateSizes(input.sizes, input.kind);
  if (!sizesRes.ok) return sizesRes;

  const manifestRes = validateManifest(input.chunkCount, input.manifest, input.chunks, input.sizes.encoded);
  if (!manifestRes.ok) return manifestRes;

  return ok(undefined);
}

/** Validates complete UpdateDeckInput payload */
export function validateUpdateDeckInput(input: UpdateDeckInput): Result<void> {
  if (!input.id || typeof input.id !== 'string') {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Güncellenecek sunum ID\'si belirtilmelidir.',
    });
  }

  const catalog = validateCatalog(input);
  if (!catalog.ok) return catalog;
  const titleRes = validateTitle(input.title);
  if (!titleRes.ok) return titleRes;

  const descRes = validateDescription(input.description);
  if (!descRes.ok) return descRes;

  const linksRes = validateLinks(input.links);
  if (!linksRes.ok) return linksRes;

  if (input.cover) {
    const coverRes = validateCover(input.cover);
    if (!coverRes.ok) return coverRes;
  }

  if (input.replacementContent) {
    const rc = input.replacementContent;
    if (!rc.fileName || typeof rc.fileName !== 'string' || rc.fileName.length > 255) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Değiştirilen dosya adı 1 ile 255 karakter arasında olmalıdır.',
      });
    }

    // Default kind to html/pptx based on fileName extension if needed, or validate sizes
    const kind: DeckKind = rc.fileName.toLowerCase().endsWith('.pptx') ? 'pptx' : 'html';
    const sizesRes = validateSizes(rc.sizes, kind);
    if (!sizesRes.ok) return sizesRes;

    const manifestRes = validateManifest(rc.chunkCount, rc.manifest, rc.chunks, rc.sizes.encoded);
    if (!manifestRes.ok) return manifestRes;
  }

  return ok(undefined);
}
