/**
 * Main Content Pipeline Coordinator
 *
 * Orchestrates input validation, ZIP/folder unpacking, HTML bundling,
 * identity PPTX packaging, chunking/manifesting, and cover generation.
 *
 * References:
 * - src/contracts/content.ts
 * - src/contracts/models.ts
 * - src/contracts/limits.ts
 * - src/contracts/errors.ts
 * - src/contracts/services.ts
 */

import {
  MAX_HTML_FILE_COUNT,
  MAX_HTML_UNPACKED_BYTES,
  MAX_PPTX_BYTES,
  MANIFEST_VERSION,
} from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import type { DeckSizes } from '../contracts/models';
import type { CoverDescriptor } from '../contracts/content';
import { normalizePath, isPathTraversal, stripCommonRoot } from './paths';
import { extractZipArchive, validatePptxStructure } from './zip';
import { bundlePresentation } from './bundler';
import { prepareChunks } from './chunks';
import {
  generateDefaultCover,
  processCoverOverride,
  captureHtmlCover,
} from './cover';
import type {
  PipelineInput,
  PipelineOptions,
  PipelineResult,
  BundleFile,
  PipelineWarning,
} from './types';

/**
 * Executes the complete content pipeline on presentation input.
 * Strictly enforces all resource bounds prior to chunking and Firestore preparation.
 */
export async function preparePresentation(
  input: PipelineInput,
  options?: PipelineOptions,
): Promise<Result<PipelineResult>> {
  if (!input || !input.kind) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz veya eksik sunum girdisi.',
    });
  }

  const accumulatedWarnings: PipelineWarning[] = [];

  // =========================================================================
  // PPTX Pipeline
  // =========================================================================
  if (input.kind === 'pptx') {
    const rawData = input.data;
    if (!rawData || rawData.length === 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'PPTX dosyası boş olamaz.',
      });
    }

    if (rawData.length > MAX_PPTX_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `PPTX dosyası azami 8 MB olabilir. Mevcut: ${rawData.length} bayt.`,
      });
    }

    const pptxValidRes = await validatePptxStructure(rawData);
    if (!pptxValidRes.ok) {
      return pptxValidRes;
    }

    const chunkingRes = prepareChunks(rawData, 'pptx');
    if (!chunkingRes.ok) {
      return chunkingRes;
    }

    const cleanFileName = input.fileName || 'sunum.pptx';
    const title =
      options?.title?.trim() ||
      cleanFileName.replace(/\.pptx$/i, '').replace(/[-_]+/g, ' ') ||
      'PowerPoint Sunumu';

    // Default cover
    const defaultCoverRes = await generateDefaultCover(title);
    if (!defaultCoverRes.ok) {
      return defaultCoverRes;
    }
    const defaultCover = defaultCoverRes.value;

    let finalCover: CoverDescriptor = defaultCover;

    // User override cover if supplied
    if (options?.coverOverride) {
      const overrideRes = await processCoverOverride(options.coverOverride);
      if (overrideRes.ok) {
        finalCover = overrideRes.value;
      } else {
        accumulatedWarnings.push({
          code: 'COVER_CAPTURE_FAILED',
          message: 'Kullanıcı kapak görseli işlenemedi, varsayılan kapak kullanıldı.',
          details: overrideRes.error,
        });
      }
    }

    const sizes: DeckSizes = {
      encoded: rawData.length,
      unpacked: rawData.length,
      fileCount: 1,
    };

    return ok({
      kind: 'pptx',
      fileName: cleanFileName,
      title,
      encodedData: chunkingRes.value.encodedData,
      sizes,
      chunks: chunkingRes.value.chunks,
      manifest: chunkingRes.value.manifest,
      defaultCover,
      autoCover: finalCover.source === 'upload' ? finalCover : undefined,
      manifestVersion: MANIFEST_VERSION,
      warnings: accumulatedWarnings,
    });
  }

  // =========================================================================
  // HTML Pipeline (Single HTML, Folder, or ZIP)
  // =========================================================================
  let bundleFiles: BundleFile[] = [];
  let reportedFileName = 'sunum.html';

  if (input.kind === 'single-html') {
    reportedFileName = input.fileName || 'sunum.html';
    const rawContent = input.content;
    const bytes =
      typeof rawContent === 'string'
        ? new TextEncoder().encode(rawContent)
        : rawContent;

    if (!bytes || bytes.length === 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'HTML dosyası boş olamaz.',
      });
    }

    if (bytes.length > MAX_HTML_UNPACKED_BYTES) {
      return err({
        code: AppErrorCode.FILE_TOO_LARGE,
        message: `HTML dosya boyutu sınırını aşıyor (maksimum 25 MB). Mevcut: ${bytes.length} bayt.`,
      });
    }

    bundleFiles = [
      {
        path: 'index.html',
        data: bytes,
        name: reportedFileName,
        size: bytes.length,
      },
    ];
  } else if (input.kind === 'zip') {
    reportedFileName = input.fileName || 'sunum.zip';
    const zipRes = await extractZipArchive(input.data, {
      maxFiles: MAX_HTML_FILE_COUNT,
      maxBytes: MAX_HTML_UNPACKED_BYTES,
    });
    if (!zipRes.ok) {
      return zipRes;
    }
    bundleFiles = zipRes.value.files;
  } else if (input.kind === 'folder') {
    reportedFileName = 'klasor-sunumu';
    if (!input.files || input.files.length === 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Klasör içinde dosya bulunamadı.',
      });
    }

    if (input.files.length > MAX_HTML_FILE_COUNT) {
      return err({
        code: AppErrorCode.FILE_COUNT_EXCEEDED,
        message: `Klasördeki dosya sayısı sınırını aşıyor (maksimum ${MAX_HTML_FILE_COUNT} dosya).`,
      });
    }

    const rawFileEntries = input.files.map((f) => {
      const bytes =
        typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data;
      return {
        originalPath: f.path,
        name: f.name,
        data: bytes,
        size: bytes.length,
      };
    });

    // Check traversal and cumulative size
    let cumulativeBytes = 0;
    for (const f of rawFileEntries) {
      if (isPathTraversal(f.originalPath)) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Güvensiz dosya yolu tespit edildi: ${f.originalPath}`,
        });
      }
      cumulativeBytes += f.size;
      if (cumulativeBytes > MAX_HTML_UNPACKED_BYTES) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: `Klasörün toplam boyutu açılmış sınırını aşıyor (maksimum 25 MB).`,
        });
      }
    }

    // Strip common directory prefix if present
    const allPaths = rawFileEntries.map((f) => f.originalPath);
    const { strippedMap } = stripCommonRoot(allPaths);

    const seenNormalized = new Set<string>();
    for (const item of rawFileEntries) {
      const stripped = strippedMap.get(item.originalPath) || item.originalPath;
      const norm = normalizePath(stripped);

      if (!norm) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Geçersiz veya kök dışına çıkan dosya yolu: ${item.originalPath}`,
        });
      }

      const lowerNorm = norm.toLowerCase();
      if (seenNormalized.has(lowerNorm)) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Klasör içinde çakışan normalize dosya yolu: ${norm}`,
        });
      }
      seenNormalized.add(lowerNorm);

      bundleFiles.push({
        path: norm,
        data: item.data,
        name: item.name || norm.split('/').pop() || norm,
        size: item.size,
      });
    }
  }

  // Bundle into a single self-contained HTML document
  const bundlingRes = bundlePresentation(bundleFiles, {
    explicitEntry: options?.entrySelection || (input.kind === 'folder' || input.kind === 'zip' ? input.entryPath : undefined),
    titleOverride: options?.title,
  });

  if (!bundlingRes.ok) {
    return bundlingRes;
  }

  accumulatedWarnings.push(...bundlingRes.value.warnings);

  const bundledHtml = bundlingRes.value.html;
  const title = bundlingRes.value.title;
  const unpackedBytes = bundlingRes.value.unpackedBytes;
  const fileCount = bundleFiles.length;

  // Gzip compression and chunking
  const htmlRawBytes = new TextEncoder().encode(bundledHtml);
  const chunkingRes = prepareChunks(htmlRawBytes, 'html');
  if (!chunkingRes.ok) {
    return chunkingRes;
  }

  // Default cover generation (brand solid surface, no gradient)
  const defaultCoverRes = await generateDefaultCover(title);
  if (!defaultCoverRes.ok) {
    return defaultCoverRes;
  }
  const defaultCover = defaultCoverRes.value;

  let autoCover: CoverDescriptor | undefined;

  // Cover selection order: Override wins -> Auto capture -> Default fallback
  if (options?.coverOverride) {
    const overrideRes = await processCoverOverride(options.coverOverride);
    if (overrideRes.ok) {
      autoCover = overrideRes.value; // Store override descriptor
    } else {
      accumulatedWarnings.push({
        code: 'COVER_CAPTURE_FAILED',
        message: 'Kullanıcı kapak görseli işlenemedi, varsayılan kapak kullanıldı.',
        details: overrideRes.error,
      });
    }
  } else if (!options?.skipAutoCover) {
    // Attempt sandboxed first-viewport capture
    const captureRes = await captureHtmlCover(bundledHtml, {
      timeoutMs: options?.captureTimeoutMs ?? 8000,
    });
    if (captureRes.ok) {
      autoCover = captureRes.value;
    } else {
      accumulatedWarnings.push({
        code: 'COVER_CAPTURE_FAILED',
        message: 'Otomatik kapak yakalama gerçekleştirilemedi, varsayılan kapak kullanıldı.',
        details: captureRes.error?.message,
      });
    }
  }

  const sizes: DeckSizes = {
    encoded: chunkingRes.value.encodedData.length,
    unpacked: unpackedBytes,
    fileCount,
  };

  return ok({
    kind: 'html',
    fileName: reportedFileName,
    title,
    encodedData: chunkingRes.value.encodedData,
    sizes,
    chunks: chunkingRes.value.chunks,
    manifest: chunkingRes.value.manifest,
    defaultCover,
    autoCover,
    manifestVersion: MANIFEST_VERSION,
    warnings: accumulatedWarnings,
  });
}
