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

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

/** Computes the standard IEEE 802.3 32-bit CRC checksum */
export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ParsedXmlElement {
  rawTag: string;
  prefix: string;
  localName: string;
  attrs: Record<string, string>;
  nsUri: string;
  children: ParsedXmlElement[];
}

/** Maps a DOM element to the stable lightweight shape used by PPTX validation. */
function domElementToParsed(element: Element): ParsedXmlElement {
  const prefix = element.prefix || '';
  const localName = element.localName;
  const attrs: Record<string, string> = {};

  for (let index = 0; index < element.attributes.length; index++) {
    const attribute = element.attributes[index];
    attrs[attribute.name] = attribute.value;
  }

  const children: ParsedXmlElement[] = [];
  for (let index = 0; index < element.children.length; index++) {
    children.push(domElementToParsed(element.children[index]));
  }

  return {
    rawTag: prefix ? `${prefix}:${localName}` : localName,
    prefix,
    localName,
    attrs,
    nsUri: element.namespaceURI || '',
    children,
  };
}

/** Parses XML with the platform parser; XML validation requires a browser DOM. */
export function parseXmlDoc(
  rawXml: string,
): { ok: boolean; root?: ParsedXmlElement; error?: string } {
  if (typeof DOMParser === 'undefined') {
    return {
      ok: false,
      error: 'DOMParser is unavailable; XML validation requires a browser DOM.',
    };
  }

  const document = new DOMParser().parseFromString(rawXml, 'application/xml');
  const parserErrors = document.getElementsByTagNameNS('*', 'parsererror');
  const mozillaParserErrors = document.getElementsByTagNameNS(
    'http://www.mozilla.org/newlayout/xml/parsererror.xml',
    'parsererror',
  );
  if (parserErrors.length > 0 || mozillaParserErrors.length > 0) {
    const parserError = mozillaParserErrors[0] || parserErrors[0];
    return {
      ok: false,
      error: parserError.textContent || 'XML parser reported malformed input.',
    };
  }

  const root = document.documentElement;
  if (!root) {
    return { ok: false, error: 'XML document has no root element.' };
  }

  return { ok: true, root: domElementToParsed(root) };
}

/**
 * Validates XML well-formedness and ensures a single root element.
 * Uses the platform XML parser and therefore requires a browser DOM.
 */
export function validateXml(rawXml: string): { ok: boolean; error?: string } {
  const parsed = parseXmlDoc(rawXml);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true };
}

export interface ZipMemberMeta {
  crc32: number;
  uncompressedSize: number;
  compressedSize: number;
  method: number;
  localHeaderOffset: number;
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
): Result<{
  declaredBytes: number;
  fileCount: number;
  memberMetaMap: Map<string, ZipMemberMeta>;
}> {
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
  const memberMetaMap = new Map<string, ZipMemberMeta>();

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
    const crc32 = readUInt32LE(zipBytes, pos + 16);
    const compressedSize = readUInt32LE(zipBytes, pos + 20);
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

    // Coherence between local header and central directory when bit 3 (data descriptor) is not set
    if ((localFlags & 8) === 0) {
      const localCrc = readUInt32LE(zipBytes, localHeaderOffset + 14);
      const localComp = readUInt32LE(zipBytes, localHeaderOffset + 18);
      const localUncomp = readUInt32LE(zipBytes, localHeaderOffset + 22);

      if (localCrc !== 0 && localCrc !== crc32) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Bozuk arşiv: Yerel ve merkezi dizin CRC değerleri uyuşmuyor (${rawName}).`,
        });
      }
      if (localComp !== 0 && localComp !== compressedSize) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Bozuk arşiv: Yerel ve merkezi dizin sıkıştırılmış boyutları uyuşmuyor (${rawName}).`,
        });
      }
      if (localUncomp !== 0 && localUncomp !== uncompressedSize) {
        return err({
          code: AppErrorCode.INVALID_ARGUMENT,
          message: `Bozuk arşiv: Yerel ve merkezi dizin açılmış boyutları uyuşmuyor (${rawName}).`,
        });
      }
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

      const meta: ZipMemberMeta = {
        crc32,
        uncompressedSize,
        compressedSize,
        method,
        localHeaderOffset,
      };
      memberMetaMap.set(rawName, meta);
      memberMetaMap.set(lowerName, meta);
      memberMetaMap.set(rawName.replace(/^\/+/, ''), meta);
      memberMetaMap.set(rawName.replace(/^\/+/, '').toLowerCase(), meta);

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

  return ok({ declaredBytes, fileCount, memberMetaMap });
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

  const { memberMetaMap } = cdValidation.value;

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

            const meta =
              memberMetaMap.get(rawName) ??
              memberMetaMap.get(rawName.toLowerCase()) ??
              memberMetaMap.get(rawName.replace(/^\/+/, '')) ??
              memberMetaMap.get(rawName.replace(/^\/+/, '').toLowerCase());

            if (meta) {
              if (fileExtractedBytes !== meta.uncompressedSize) {
                abortWithError(
                  err({
                    code: AppErrorCode.INVALID_ARGUMENT,
                    message: `Bozuk arşiv: Açılan dosya boyutu (${fileExtractedBytes}) merkezi dizinde belirtilen boyutla (${meta.uncompressedSize}) uyuşmuyor: ${rawName}`,
                  }),
                );
                return;
              }
              const calculatedCrc = computeCrc32(combined);
              if (calculatedCrc !== meta.crc32) {
                abortWithError(
                  err({
                    code: AppErrorCode.INVALID_ARGUMENT,
                    message: `Bozuk arşiv: Dosya CRC-32 sağlama toplamı uyuşmuyor (beklenen: 0x${meta.crc32.toString(16)}, hesaplanan: 0x${calculatedCrc.toString(16)}): ${rawName}`,
                  }),
                );
                return;
              }
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

  // 1. [Content_Types].xml check: OOXML package entry point
  const contentTypesFile = fileMap.get('[content_types].xml');
  if (!contentTypesFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: OOXML sunum yapısı bulunamadı ([Content_Types].xml bulunamadı).',
    });
  }

  const contentTypesXml = new TextDecoder('utf-8').decode(contentTypesFile.data);
  const ctDoc = parseXmlDoc(contentTypesXml);
  if (!ctDoc.ok || !ctDoc.root) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: [Content_Types].xml hatalı XML içeriyor: ${ctDoc.error || 'Ayrıştırma hatası'}`,
    });
  }

  if (
    ctDoc.root.localName.toLowerCase() !== 'types' ||
    ctDoc.root.nsUri !== 'http://schemas.openxmlformats.org/package/2006/content-types'
  ) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: [Content_Types].xml kök elemanı geçerli bir <Types> elemanı değil.',
    });
  }

  // 2. _rels/.rels check: Must have Relationships root and valid officeDocument relationship
  const relsFile = fileMap.get('_rels/.rels');
  if (!relsFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: 'Geçersiz PPTX dosyası: OOXML _rels/.rels bulunamadı.',
    });
  }

  const relsXml = new TextDecoder('utf-8').decode(relsFile.data);
  const relsDoc = parseXmlDoc(relsXml);
  if (!relsDoc.ok || !relsDoc.root) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: _rels/.rels hatalı XML içeriyor: ${relsDoc.error || 'Ayrıştırma hatası'}`,
    });
  }

  if (
    relsDoc.root.localName.toLowerCase() !== 'relationships' ||
    relsDoc.root.nsUri !== 'http://schemas.openxmlformats.org/package/2006/relationships'
  ) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: _rels/.rels kök elemanı geçerli bir <Relationships> elemanı değil.',
    });
  }

  const OFFICE_DOC_REL_TYPES = new Set([
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
    'http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument',
  ]);

  let presentationPartTarget: string | null = null;
  for (const child of relsDoc.root.children) {
    if (child.localName.toLowerCase() === 'relationship') {
      const type = child.attrs.Type || child.attrs.type || '';
      const targetMode = child.attrs.TargetMode || child.attrs.targetMode || '';
      const target = child.attrs.Target || child.attrs.target || '';

      if (OFFICE_DOC_REL_TYPES.has(type)) {
        if (targetMode.toLowerCase() === 'external') {
          continue; // External target cannot be the presentation main part
        }
        if (target) {
          presentationPartTarget = target;
          break;
        }
      }
    }
  }

  if (!presentationPartTarget) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: OOXML _rels/.rels dosyasında geçerli bir officeDocument ilişkisi bulunamadı.',
    });
  }

  // Normalize target: e.g. "ppt/presentation.xml" or "/ppt/presentation.xml" -> normalize to without leading slash
  let normalizedTargetPath = presentationPartTarget.replace(/^\/+/, '');
  if (normalizedTargetPath.startsWith('./')) {
    normalizedTargetPath = normalizedTargetPath.slice(2);
  }
  const partNameForContentType = `/${normalizedTargetPath}`.toLowerCase();

  // 3. Match [Content_Types].xml Override for the resolved presentationPartTarget

  const PRESENTATION_CONTENT_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml',
    'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml',
    'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml',
    'application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml',
  ]);

  let matchedContentType: string | null = null;
  for (const child of ctDoc.root.children) {
    if (child.localName.toLowerCase() === 'override') {
      const partName = (child.attrs.PartName || child.attrs.partname || '').toLowerCase();
      const contentType = (child.attrs.ContentType || child.attrs.contenttype || '').toLowerCase();

      const normPart = partName.startsWith('/') ? partName : `/${partName}`;
      if (normPart === partNameForContentType) {
        if (PRESENTATION_CONTENT_TYPES.has(contentType)) {
          matchedContentType = contentType;
          break;
        }
      }
    }
  }

  if (!matchedContentType) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message:
        'Geçersiz PPTX dosyası: Ana sunum bölümü için geçerli PresentationML içerik türü ([Content_Types].xml Override) bulunamadı.',
    });
  }

  // 3. Presentation main part check (e.g. ppt/presentation.xml)
  const presentationFile = fileMap.get(normalizedTargetPath.toLowerCase());
  if (!presentationFile) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: Ana sunum bölümü (${normalizedTargetPath}) arşiv içinde bulunamadı.`,
    });
  }

  const presentationXml = new TextDecoder('utf-8').decode(presentationFile.data);
  const presDoc = parseXmlDoc(presentationXml);
  if (!presDoc.ok || !presDoc.root) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: ${normalizedTargetPath} hatalı XML içeriyor: ${presDoc.error || 'Ayrıştırma hatası'}`,
    });
  }

  const PRESENTATIONML_NAMESPACES = new Set([
    'http://schemas.openxmlformats.org/presentationml/2006/main',
    'http://purl.oclc.org/ooxml/presentationml/main',
  ]);

  if (
    presDoc.root.localName.toLowerCase() !== 'presentation' ||
    !PRESENTATIONML_NAMESPACES.has(presDoc.root.nsUri)
  ) {
    return err({
      code: AppErrorCode.INVALID_ARGUMENT,
      message: `Geçersiz PPTX dosyası: ${normalizedTargetPath} dosyasının kök elemanı geçerli bir PresentationML <presentation> elemanı değil (bulunan: <${presDoc.root.rawTag}>, ad alanı: ${presDoc.root.nsUri || 'yok'}).`,
    });
  }

  return ok(undefined);
}
