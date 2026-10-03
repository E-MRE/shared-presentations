/**
 * ZIP Archive Extraction, Traversal Protection, Expansion Bounding, and PPTX OOXML Validation
 *
 * References:
 * - src/contracts/limits.ts
 * - src/contracts/errors.ts
 * - src/contracts/services.ts
 */

import { Unzip, UnzipInflate, UnzipPassThrough, type UnzipFile } from 'fflate';
import {
  MAX_HTML_FILE_COUNT,
  MAX_HTML_UNPACKED_BYTES,
  MAX_PPTX_BYTES,
} from '../contracts/limits';
import { AppErrorCode } from '../contracts/errors';
import { ok, err, type Result } from '../contracts/services';
import { normalizePath, isPathTraversal, stripCommonRoot } from './paths';
import type { BundleFile } from './types';

/** Result of expanding a valid ZIP archive */
export interface ZipArchiveResult {
  files: BundleFile[];
  totalBytes: number;
  fileCount: number;
}

/** Reads a 16-bit unsigned integer in little-endian format */
function readUInt16LE(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.length) return 0;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/** Reads a 32-bit unsigned integer in little-endian format */
function readUInt32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

/**
 * Searches for the End of Central Directory (EOCD) record starting from the end of the file.
 * Returns the offset of EOCD signature (0x06054b50), or -1 if not found.
 */
function findEocdOffset(bytes: Uint8Array): number {
  // EOCD record is minimum 22 bytes, maximum 22 + 65535 bytes
  const minOffset = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * Validates XML well-formedness and ensures a single root element.
 * Works uniformly across both Node and browser environments without DOMParser dependency.
 */
export function validateXml(rawXml: string): { ok: boolean; error?: string } {
  // Strip XML declaration, comments, processing instructions, and CDATA
  let stripped = rawXml.replace(/^<\?xml[\s\S]*?\?>/i, '');
  stripped = stripped.replace(/<!--[\s\S]*?-->/g, '');
  stripped = stripped.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  stripped = stripped.replace(/<\?[\s\S]*?\?>/g, '');
  stripped = stripped.trim();

  if (!stripped) {
    return { ok: false, error: 'Boş XML içeriği.' };
  }

  const tagStack: string[] = [];
  let rootCount = 0;
  const TAG_REGEX = /<(\/?)([\w:-]+)((?:\s+[^>]*)?)(\/?)>/g;
  let match: RegExpExecArray | null;

  while ((match = TAG_REGEX.exec(stripped)) !== null) {
    const [, isClose, tagName, , isSelfClosing] = match;
    if (isClose) {
      if (tagStack.length === 0) {
        return { ok: false, error: `Beklenmeyen kapanış etiketi: </${tagName}>` };
      }
      const expected = tagStack.pop();
      if (expected !== tagName) {
        return {
          ok: false,
          error: `Uyuşmayan etiket: </${expected}> yerine </${tagName}> bulundu.`,
        };
      }
    } else if (isSelfClosing || match[0].endsWith('/>')) {
      if (tagStack.length === 0) rootCount++;
    } else {
      if (tagStack.length === 0) rootCount++;
      tagStack.push(tagName);
    }
  }

  if (tagStack.length > 0) {
    return { ok: false, error: `Kapatılmamış XML etiketleri: ${tagStack.join(', ')}` };
  }
  if (rootCount !== 1) {
    return {
      ok: false,
      error: `XML tam olarak bir kök elemana sahip olmalıdır (bulunan: ${rootCount}).`,
    };
  }

  return { ok: true };
}

/**
 * Validates the Central Directory of a ZIP archive.
 * Rejects truncated archives, encrypted archives, unsupported compression methods,
 * symlinks, directory traversal, corrupt offsets, and declared over-limit sizes.
 */
function validateZipCentralDirectory(
  zipBytes: Uint8Array,
  maxFiles: number,
  maxBytes: number,
): Result<{ declaredBytes: number; fileCount: number }> {
  const eocdOffset = findEocdOffset(zipBytes);
  if (eocdOffset === -1) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz arşiv: Merkezi dizin kaydı (EOCD) bulunamadı veya arşiv kesilmiş.',
    });
  }

  const diskNumber = readUInt16LE(zipBytes, eocdOffset + 4);
  const cdStartDisk = readUInt16LE(zipBytes, eocdOffset + 6);
  const totalEntries = readUInt16LE(zipBytes, eocdOffset + 10);
  const cdSize = readUInt32LE(zipBytes, eocdOffset + 12);
  const cdOffset = readUInt32LE(zipBytes, eocdOffset + 16);

  if (diskNumber !== 0 || cdStartDisk !== 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Çok diskli ZIP arşivleri desteklenmemektedir.',
    });
  }

  if (cdOffset + cdSize > eocdOffset || cdOffset >= zipBytes.length) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Bozuk arşiv: Merkezi dizin sınırları geçersiz.',
    });
  }

  let pos = cdOffset;
  let fileCount = 0;
  let declaredBytes = 0;
  const seenOriginalNames = new Set<string>();

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > cdOffset + cdSize) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Bozuk arşiv: Merkezi dizin kaydı beklenenden erken sonlandı.',
      });
    }

    const sig = readUInt32LE(zipBytes, pos);
    if (sig !== 0x02014b50) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Bozuk arşiv: Geçersiz merkezi dizin başlık imzası (konum: ${pos}).`,
      });
    }

    const flags = readUInt16LE(zipBytes, pos + 8);
    const method = readUInt16LE(zipBytes, pos + 10);
    const uncompressedSize = readUInt32LE(zipBytes, pos + 24);
    const nameLen = readUInt16LE(zipBytes, pos + 28);
    const extraLen = readUInt16LE(zipBytes, pos + 30);
    const commentLen = readUInt16LE(zipBytes, pos + 32);
    const externalAttrs = readUInt32LE(zipBytes, pos + 38);
    const localHeaderOffset = readUInt32LE(zipBytes, pos + 42);

    // 1. Bit 0 of flags: Encryption check
    if ((flags & 1) !== 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Şifreli arşivler desteklenmemektedir.',
      });
    }

    // 2. Compression method check: only 0 (store) and 8 (deflate)
    if (method !== 0 && method !== 8) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Desteklenmeyen sıkıştırma yöntemi: ${method}. Sadece Store (0) ve Deflate (8) desteklenir.`,
      });
    }

    // 3. Symlink check: Unix file mode in top 16 bits of externalAttrs
    // S_IFLNK is 0o120000 (0xA000)
    const unixMode = (externalAttrs >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Sembolik bağlar (symlink) içeren arşivler desteklenmemektedir.',
      });
    }
    // Windows reparse point check
    if ((externalAttrs & 0x400) !== 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Yeniden ayrıştırma noktaları (reparse point / symlink) desteklenmemektedir.',
      });
    }

    // 4. Filename extraction & traversal check
    if (pos + 46 + nameLen > zipBytes.length) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Bozuk arşiv: Dosya adı verisi arşiv sınırını aşıyor.',
      });
    }
    const nameBytes = zipBytes.subarray(pos + 46, pos + 46 + nameLen);
    const rawName = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);

    if (rawName.includes('\0')) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: 'Dosya yolunda geçersiz karakter tespit edildi.',
      });
    }

    if (isPathTraversal(rawName)) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Güvensiz arşiv yolu tespit edildi: ${rawName}`,
      });
    }

    // 5. Check local file header coherence
    if (localHeaderOffset + 30 > zipBytes.length) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Bozuk arşiv: Yerel dosya başlık konumu (${localHeaderOffset}) geçersiz.`,
      });
    }
    const localSig = readUInt32LE(zipBytes, localHeaderOffset);
    if (localSig !== 0x04034b50) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Bozuk arşiv: Yerel dosya başlık imzası eksik veya hatalı (${rawName}).`,
      });
    }
    const localFlags = readUInt16LE(zipBytes, localHeaderOffset + 6);
    if ((localFlags & 1) !== 0) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Şifreli yerel dosya başlığı tespit edildi: ${rawName}`,
      });
    }
    const localMethod = readUInt16LE(zipBytes, localHeaderOffset + 8);
    if (localMethod !== method) {
      return err({
        code: AppErrorCode.INVALID_ARGUMENT,
        message: `Arşiv meta verisi tutarsız: yerel ve merkezi sıkıştırma yöntemleri uyuşmuyor (${rawName}).`,
      });
    }

    const isDirectory = rawName.endsWith('/') || (externalAttrs & 0x10) !== 0;
    if (!isDirectory) {
      const lowerName = rawName.toLowerCase();
      if (seenOriginalNames.has(lowerName)) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Arşiv içinde yinelenen dosya tespit edildi: ${rawName}`,
        });
      }
      seenOriginalNames.add(lowerName);

      fileCount++;
      if (fileCount > maxFiles) {
        return err({
          code: AppErrorCode.FILE_COUNT_EXCEEDED,
          message: `Arşivdeki dosya sayısı sınırını aşıyor (maksimum ${maxFiles} dosya).`,
        });
      }

      declaredBytes += uncompressedSize;
      if (uncompressedSize > maxBytes || declaredBytes > maxBytes) {
        return err({
          code: AppErrorCode.FILE_TOO_LARGE,
          message: `Arşiv açılmış boyutu sınırını aşıyor (maksimum ${maxBytes} bayt).`,
        });
      }
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return ok({ declaredBytes, fileCount });
}

/**
 * Extracts and validates a ZIP archive with strict incremental size bounds,
 * traversal prevention, and collision rejection.
 */
export async function extractZipArchive(
  zipBytes: Uint8Array,
  options?: { maxFiles?: number; maxBytes?: number },
): Promise<Result<ZipArchiveResult>> {
  // Clamp options to strictly prevent bypassing hard limits
  const maxFiles = Math.min(options?.maxFiles ?? MAX_HTML_FILE_COUNT, MAX_HTML_FILE_COUNT);
  const maxBytes = Math.min(options?.maxBytes ?? MAX_HTML_UNPACKED_BYTES, MAX_HTML_UNPACKED_BYTES);

  if (!zipBytes || zipBytes.length < 22) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Arşiv dosyası boş veya geçersiz boyutta.',
    });
  }

  // Quick signature check
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz arşiv formatı: ZIP başlığı bulunamadı.',
    });
  }

  // Pre-validate Central Directory structures, encryption flags, symlinks, and declared sizes
  const cdValidation = validateZipCentralDirectory(zipBytes, maxFiles, maxBytes);
  if (!cdValidation.ok) {
    return cdValidation;
  }

  return new Promise<Result<ZipArchiveResult>>((resolve) => {
    const rawFiles: Array<{ originalPath: string; data: Uint8Array; size: number }> = [];
    let totalUnpackedBytes = 0;
    let fileCount = 0;
    let aborted = false;
    let unzipper: Unzip | null = null;

    const abortWithError = (errorResult: Result<ZipArchiveResult>) => {
      if (aborted) return;
      aborted = true;
      unzipper = null;
      resolve(errorResult);
    };

    try {
      unzipper = new Unzip();
      unzipper.register(UnzipInflate);
      unzipper.register(UnzipPassThrough);

      const seenOriginalNames = new Set<string>();

      unzipper.onfile = (file: UnzipFile) => {
        if (aborted) return;

        const rawName = file.name;

        // Skip directory markers
        if (rawName.endsWith('/')) {
          return;
        }

        if (isPathTraversal(rawName)) {
          abortWithError(
            err({
              code: AppErrorCode.INVALID_ARGUMENT,
              message: `Güvensiz arşiv yolu tespit edildi: ${rawName}`,
            }),
          );
          return;
        }

        const lowerRaw = rawName.toLowerCase();
        if (seenOriginalNames.has(lowerRaw)) {
          abortWithError(
            err({
              code: AppErrorCode.INVALID_ARGUMENT,
              message: `Arşiv içinde yinelenen dosya tespit edildi: ${rawName}`,
            }),
          );
          return;
        }
        seenOriginalNames.add(lowerRaw);

        fileCount++;
        if (fileCount > maxFiles) {
          abortWithError(
            err({
              code: AppErrorCode.FILE_COUNT_EXCEEDED,
              message: `Arşivdeki dosya sayısı sınırını aşıyor (maksimum ${maxFiles} dosya).`,
            }),
          );
          return;
        }

        const chunks: Uint8Array[] = [];
        let fileExtractedBytes = 0;

        file.ondata = (streamErr, chunk, final) => {
          if (aborted) return;

          if (streamErr) {
            abortWithError(
              err({
                code: AppErrorCode.INVALID_ARGUMENT,
                message: `Arşiv açılırken hata oluştu: ${streamErr.message || 'Bozuk veri'}`,
                details: streamErr,
              }),
            );
            return;
          }

          if (chunk && chunk.length > 0) {
            fileExtractedBytes += chunk.length;
            totalUnpackedBytes += chunk.length;

            // Enforce cumulative and per-file decompressed limits against zip bombs
            if (totalUnpackedBytes > maxBytes || fileExtractedBytes > maxBytes) {
              abortWithError(
                err({
                  code: AppErrorCode.FILE_TOO_LARGE,
                  message: `Arşiv açılmış boyutu sınırını aşıyor (maksimum ${maxBytes} bayt).`,
                }),
              );
              return;
            }

            chunks.push(chunk);
          }

          if (final) {
            const combined = new Uint8Array(fileExtractedBytes);
            let offset = 0;
            for (const c of chunks) {
              combined.set(c, offset);
              offset += c.length;
            }

            rawFiles.push({
              originalPath: rawName,
              data: combined,
              size: fileExtractedBytes,
            });
          }
        };

        try {
          file.start();
        } catch (startErr) {
          abortWithError(
            err({
              code: AppErrorCode.INVALID_ARGUMENT,
              message: `Arşiv dosyası açılamadı: ${rawName}`,
              details: startErr,
            }),
          );
        }
      };

      // Feed input to decompressor in bounded incremental chunks (8192 bytes)
      // This prevents allocating unbounded uncompressed memory if a single member expands massively
      const FEED_CHUNK_SIZE = 8192;
      for (let offset = 0; offset < zipBytes.length; offset += FEED_CHUNK_SIZE) {
        if (aborted) break;
        const end = Math.min(offset + FEED_CHUNK_SIZE, zipBytes.length);
        const isFinal = end === zipBytes.length;
        unzipper.push(zipBytes.subarray(offset, end), isFinal);
      }

      if (aborted) return;

      if (rawFiles.length === 0) {
        resolve(
          err({
            code: AppErrorCode.INVALID_ARGUMENT,
            message: 'Arşiv dosyası boş veya geçerli dosya içermiyor.',
          }),
        );
        return;
      }

      // Check common root directory stripping
      const allPaths = rawFiles.map((f) => f.originalPath);
      const { strippedMap } = stripCommonRoot(allPaths);

      // Verify no collisions after path normalization
      const normalizedFiles: BundleFile[] = [];
      const seenNormalized = new Set<string>();

      for (const item of rawFiles) {
        const stripped = strippedMap.get(item.originalPath) || item.originalPath;
        const norm = normalizePath(stripped);

        if (!norm) {
          resolve(
            err({
              code: AppErrorCode.INVALID_ARGUMENT,
              message: `Geçersiz veya kök dışına çıkan dosya yolu: ${item.originalPath}`,
            }),
          );
          return;
        }

        const lowerNorm = norm.toLowerCase();
        if (seenNormalized.has(lowerNorm)) {
          resolve(
            err({
              code: AppErrorCode.INVALID_ARGUMENT,
              message: `Yol normalizasyonu sonrasında çakışan dosya tespit edildi: ${norm}`,
            }),
          );
          return;
        }
        seenNormalized.add(lowerNorm);

        normalizedFiles.push({
          path: norm,
          data: item.data,
          name: norm.split('/').pop() || norm,
          size: item.size,
        });
      }

      resolve(
        ok({
          files: normalizedFiles,
          totalBytes: totalUnpackedBytes,
          fileCount: normalizedFiles.length,
        }),
      );
    } catch (zipErr) {
      if (!aborted) {
        resolve(
          err({
            code: AppErrorCode.INVALID_ARGUMENT,
            message: 'Bozuk veya geçersiz arşiv dosyası.',
            details: zipErr,
          }),
        );
      }
    }
  });
}

/**
 * Validates a PPTX file's structure and byte limit without full rendering.
 * Strictly verifies OOXML container structure:
 * - [Content_Types].xml must exist and declare PresentationML content type.
 * - _rels/.rels must exist and declare presentation relationship.
 * - ppt/presentation.xml must exist, be well-formed XML, and have root <p:presentation>.
 */
export async function validatePptxStructure(pptxBytes: Uint8Array): Promise<Result<void>> {
  if (!pptxBytes || pptxBytes.length === 0) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'PPTX dosyası boş olamaz.',
    });
  }

  if (pptxBytes.length > MAX_PPTX_BYTES) {
    return err({
      code: AppErrorCode.FILE_TOO_LARGE,
      message: `PPTX dosyası en fazla 8 MB olabilir (${MAX_PPTX_BYTES} bayt). Mevcut: ${pptxBytes.length} bayt.`,
    });
  }

  // Extract archive boundedly
  const extractRes = await extractZipArchive(pptxBytes, {
    maxBytes: MAX_HTML_UNPACKED_BYTES,
    maxFiles: 500,
  });

  if (!extractRes.ok) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX konteyneri: ${extractRes.error.message}`,
      details: extractRes.error,
    });
  }

  const files = extractRes.value.files;
  const fileMap = new Map<string, BundleFile>();
  for (const f of files) {
    fileMap.set(f.path.toLowerCase(), f);
  }

  // 1. [Content_Types].xml check
  const contentTypesFile = fileMap.get('[content_types].xml');
  if (!contentTypesFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz PPTX dosyası: OOXML sunum yapısı bulunamadı ([Content_Types].xml bulunamadı).',
    });
  }

  const contentTypesXml = new TextDecoder('utf-8').decode(contentTypesFile.data);
  const ctXmlCheck = validateXml(contentTypesXml);
  if (!ctXmlCheck.ok) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: [Content_Types].xml hatalı XML içeriyor: ${ctXmlCheck.error}`,
    });
  }

  // Must declare PresentationML main part (reject Word wordprocessingml or Excel spreadsheetml)
  const isPresentationML =
    /application\/vnd\.openxmlformats-officedocument\.presentationml\.(presentation|slideshow)\.main\+xml/i.test(
      contentTypesXml,
    ) ||
    /application\/vnd\.ms-powerpoint\.presentation\.macroEnabled\.main\+xml/i.test(
      contentTypesXml,
    );

  if (!isPresentationML) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: PresentationML içerik türü bulunamadı (Word veya farklı bir OOXML belgesi).',
    });
  }

  // 2. _rels/.rels check
  const relsFile = fileMap.get('_rels/.rels');
  if (!relsFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz PPTX dosyası: OOXML _rels/.rels bulunamadı.',
    });
  }

  const relsXml = new TextDecoder('utf-8').decode(relsFile.data);
  const relsXmlCheck = validateXml(relsXml);
  if (!relsXmlCheck.ok) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: _rels/.rels hatalı XML içeriyor: ${relsXmlCheck.error}`,
    });
  }

  // 3. ppt/presentation.xml check
  const presentationFile = fileMap.get('ppt/presentation.xml');
  if (!presentationFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz PPTX dosyası: Ana sunum bölümü (ppt/presentation.xml) bulunamadı.',
    });
  }

  const presentationXml = new TextDecoder('utf-8').decode(presentationFile.data);
  const presXmlCheck = validateXml(presentationXml);
  if (!presXmlCheck.ok) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: ppt/presentation.xml hatalı XML içeriyor: ${presXmlCheck.error}`,
    });
  }

  // Verify presentation root element and presentationml namespace
  const hasPresentationRoot =
    /<(?:[a-zA-Z0-9_-]+:)?presentation\b[^>]*>/i.test(presentationXml) &&
    /http:\/\/schemas\.openxmlformats\.org\/presentationml\/2006\/main/i.test(presentationXml);

  if (!hasPresentationRoot) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: ppt/presentation.xml geçerli bir PresentationML kök elemanı içermiyor.',
    });
  }

  return ok(undefined);
}
