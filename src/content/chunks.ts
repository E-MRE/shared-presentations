/**
 * Chunking, Manifest Generation, Gzip Encoding, and Bounded Reconstruction
 *
 * References:
 * - src/contracts/limits.ts
 * - src/contracts/content.ts
 * - src/contracts/models.ts
 * - src/contracts/errors.ts
 * - src/contracts/services.ts
 */

import { gzipSync, Gunzip } from 'fflate';
import {
  MAX_CHUNK_BYTES,
  MAX_CHUNKS_COUNT,
  MIN_CHUNKS_COUNT,
  MAX_HTML_ENCODED_BYTES,
  MAX_HTML_UNPACKED_BYTES,
  MAX_PPTX_BYTES,
  MANIFEST_VERSION,
} from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import type { DeckKind, DeckSizes, ChunkManifestEntry, DeckChunk } from '../contracts/models';
import type { PreparedChunk } from '../contracts/content';
import type { ReconstructedPresentation } from './types';

/**
 * Result of preparing binary payload into chunks and manifest.
 */
export interface ChunkingResult {
  encodedData: Uint8Array;
  chunks: PreparedChunk[];
  manifest: ChunkManifestEntry[];
  chunkCount: number;
  manifestVersion: number;
}

/**
 * Encodes payload (gzip for HTML, identity for PPTX) and divides it into ordered chunks
 * of <= 900,000 bytes with a canonical manifest.
 * Strictly verifies uncompressed bounds before compression.
 */
export function prepareChunks(
  data: Uint8Array,
  kind: DeckKind,
): Result<ChunkingResult> {
  if (!data || data.length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'İçerik verisi boş olamaz.',
    });
  }

  let encodedData: Uint8Array;

  if (kind === 'html') {
    // 1. Strict uncompressed size verification BEFORE compression
    if (data.length > MAX_HTML_UNPACKED_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `Açılmış HTML boyutu sınırını aşıyor (maksimum 25 MB). Mevcut: ${data.length} bayt.`,
      });
    }

    try {
      encodedData = gzipSync(data, { level: 9, mtime: 0 });
    } catch (gzipErr) {
      return err({
        code: AppErrorCode.UNKNOWN,
        message: 'HTML içeriği gzip ile sıkıştırılırken hata oluştu.',
        details: gzipErr,
      });
    }

    // 2. Strict compressed size verification
    if (encodedData.length > MAX_HTML_ENCODED_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `Sıkıştırılmış HTML boyutu sınırını aşıyor (maksimum 5 MB). Mevcut: ${encodedData.length} bayt.`,
      });
    }
  } else if (kind === 'pptx') {
    // Identity encoding for PPTX
    if (data.length > MAX_PPTX_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `PPTX dosya boyutu sınırını aşıyor (maksimum 8 MB). Mevcut: ${data.length} bayt.`,
      });
    }

    encodedData = data;
  } else {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Bilinmeyen sunum türü: ${kind}`,
    });
  }

  // Divide encoded data into chunks <= MAX_CHUNK_BYTES (900,000 bytes)
  const chunks: PreparedChunk[] = [];
  const manifest: ChunkManifestEntry[] = [];
  const totalLength = encodedData.length;
  let offset = 0;
  let index = 0;

  while (offset < totalLength) {
    const chunkLength = Math.min(MAX_CHUNK_BYTES, totalLength - offset);
    const chunkData = encodedData.subarray(offset, offset + chunkLength);

    chunks.push({
      index,
      data: chunkData,
      size: chunkLength,
    });

    manifest.push({
      index,
      size: chunkLength,
    });

    offset += chunkLength;
    index++;
  }

  if (chunks.length < MIN_CHUNKS_COUNT || chunks.length > MAX_CHUNKS_COUNT) {
    return err({
      code: AppErrorCode.CHUNK_TOO_LARGE,
      message: `Oluşturulan parça sayısı izin verilen sınırların dışında (1..${MAX_CHUNKS_COUNT}): ${chunks.length}`,
    });
  }

  // Exact parity verification
  const sumSize = chunks.reduce((acc, c) => acc + c.size, 0);
  if (sumSize !== encodedData.length) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Manifest parça boyutu toplamı ile kodlanmış veri boyutu uyuşmuyor: manifest ${sumSize} != encoded ${encodedData.length}`,
    });
  }

  return ok({
    encodedData,
    chunks,
    manifest,
    chunkCount: chunks.length,
    manifestVersion: MANIFEST_VERSION,
  });
}

/**
 * Reconstructs and verifies presentation content from chunks and manifest.
 * Performs incremental bounded decompression for HTML decks to prevent decompression bombs.
 */
export function reconstructPresentation(
  chunks: Array<PreparedChunk | DeckChunk>,
  manifest: ChunkManifestEntry[],
  kind: DeckKind,
  expectedSizes?: DeckSizes,
): Result<ReconstructedPresentation> {
  if (!chunks || chunks.length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Yeniden oluşturma için parça listesi boş olamaz.',
    });
  }

  if (!manifest || manifest.length === 0) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: 'Manifest boş veya eksik.',
    });
  }

  if (chunks.length !== manifest.length) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Parça sayısı (${chunks.length}) ile manifest kayıt sayısı (${manifest.length}) uyuşmuyor.`,
    });
  }

  if (manifest.length < MIN_CHUNKS_COUNT || manifest.length > MAX_CHUNKS_COUNT) {
    return err({
      code: AppErrorCode.CHUNK_TOO_LARGE,
      message: `Parça sayısı izin verilen azami değeri aşıyor (maksimum ${MAX_CHUNKS_COUNT}): ${manifest.length}`,
    });
  }

  // Validate manifest ordering and finite integer sizes
  let expectedSum = 0;
  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i];
    if (!Number.isInteger(entry.index) || entry.index !== i) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Manifest sıralaması geçersiz: dizin ${i} beklenen, ancak ${entry.index} bulundu.`,
      });
    }
    if (
      !Number.isInteger(entry.size) ||
      entry.size <= 0 ||
      entry.size > MAX_CHUNK_BYTES
    ) {
      return err({
        code: AppErrorCode.CHUNK_TOO_LARGE,
        message: `Manifest parça boyutu geçersiz (${entry.size} bayt, parça ${i}).`,
      });
    }
    expectedSum += entry.size;
  }

  // Enforce aggregate encoded limits BEFORE stitching
  if (kind === 'html' && expectedSum > MAX_HTML_ENCODED_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Manifest toplam kodlanmış boyutu (${expectedSum} bayt) izin verilen azami HTML sınırını (${MAX_HTML_ENCODED_BYTES} bayt) aşıyor.`,
    });
  }

  if (kind === 'pptx' && expectedSum > MAX_PPTX_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `Manifest toplam boyutu (${expectedSum} bayt) izin verilen azami PPTX sınırını (${MAX_PPTX_BYTES} bayt) aşıyor.`,
    });
  }

  if (expectedSizes && expectedSizes.encoded !== expectedSum) {
    return err({
      code: AppErrorCode.MALFORMED_MANIFEST,
      message: `Kodlanmış veri boyutu (${expectedSum}) bildirilen boyut (${expectedSizes.encoded}) ile uyuşmuyor.`,
    });
  }

  // Sort chunks by index to ensure proper sequential stitching
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index);

  // Validate chunk payload against manifest
  for (let i = 0; i < sortedChunks.length; i++) {
    const chunk = sortedChunks[i];
    if (!Number.isInteger(chunk.index) || chunk.index !== i) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Eksik veya hatalı parça dizini: parça ${i} beklenirken ${chunk.index} bulundu.`,
      });
    }
    const manifestEntry = manifest[i];
    const dataSize = chunk.data.length;
    if (dataSize !== manifestEntry.size) {
      return err({
        code: AppErrorCode.MALFORMED_MANIFEST,
        message: `Parça ${i} gerçek boyutu (${dataSize}) ile manifest boyutu (${manifestEntry.size}) uyuşmuyor.`,
      });
    }
  }

  // Stitch chunks into single continuous buffer
  const stitched = new Uint8Array(expectedSum);
  let writeOffset = 0;
  for (const chunk of sortedChunks) {
    stitched.set(chunk.data, writeOffset);
    writeOffset += chunk.data.length;
  }

  if (kind === 'pptx') {
    return ok({
      kind: 'pptx',
      rawBytes: stitched,
      sizes: expectedSizes || {
        encoded: stitched.length,
        unpacked: stitched.length,
        fileCount: 1,
      },
      manifest,
    });
  }

  if (kind === 'html') {
    // Incremental streaming gunzip with immediate abort upon exceeding MAX_HTML_UNPACKED_BYTES
    const decompressedChunks: Uint8Array[] = [];
    let totalDecompressed = 0;
    let limitExceeded = false;
    let decompressError: Error | null = null;

    const gunzip = new Gunzip((chunk) => {
      if (chunk && chunk.length > 0) {
        totalDecompressed += chunk.length;
        if (totalDecompressed > MAX_HTML_UNPACKED_BYTES) {
          limitExceeded = true;
          return;
        }
        decompressedChunks.push(chunk);
      }
    });

    const FEED_CHUNK = 8192;
    for (let off = 0; off < stitched.length; off += FEED_CHUNK) {
      if (limitExceeded) break;
      const end = Math.min(off + FEED_CHUNK, stitched.length);
      const isFinal = end === stitched.length;
      try {
        gunzip.push(stitched.subarray(off, end), isFinal);
      } catch (gzErr) {
        decompressError = gzErr instanceof Error ? gzErr : new Error(String(gzErr));
        break;
      }
    }

    if (limitExceeded || totalDecompressed > MAX_HTML_UNPACKED_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `Açılmış HTML boyutu sınırını aşıyor (maksimum 25 MB).`,
      });
    }

    if (decompressError) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Gzip sıkıştırması açılamadı: bozuk veya geçersiz içerik.',
        details: decompressError,
      });
    }

    // Assemble decompressed buffer
    const decompressed = new Uint8Array(totalDecompressed);
    let dOff = 0;
    for (const c of decompressedChunks) {
      decompressed.set(c, dOff);
      dOff += c.length;
    }

    let html: string;
    try {
      html = new TextDecoder('utf-8', { fatal: false }).decode(decompressed);
    } catch (decodeErr) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'HTML içeriği UTF-8 olarak çözümlenemedi.',
        details: decodeErr,
      });
    }

    return ok({
      kind: 'html',
      html,
      rawBytes: decompressed,
      sizes: expectedSizes || {
        encoded: stitched.length,
        unpacked: decompressed.length,
        fileCount: 1,
      },
      manifest,
    });
  }

  return err({
    code: AppErrorCode.INVALID_ARGUMENT,
    message: `Bilinmeyen sunum türü: ${kind}`,
  });
}
