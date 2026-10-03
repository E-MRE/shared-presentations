/**
 * Unit Test Suite: ZIP Archive Extraction, Bounded Expansion, and PPTX OOXML Validation
 *
 * References:
 * - src/content/zip.ts
 * - src/contracts/limits.ts
 * - src/contracts/errors.ts
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1
 */

import { describe, it, expect } from 'vitest';
import { zipSync } from 'fflate';
import { extractZipArchive, validatePptxStructure } from '../../src/content/zip';
import {
  MAX_HTML_FILE_COUNT,
  MAX_HTML_UNPACKED_BYTES,
  MAX_PPTX_BYTES,
} from '../../src/contracts/limits';
import { AppErrorCode } from '../../src/contracts/errors';

/** Helper to create a valid PPTX zip structure */
function createMockPptxBytes(options?: { customFiles?: Record<string, Uint8Array> }): Uint8Array {
  const contentTypesXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`);

  const relsXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const presentationXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
  </p:sldIdLst>
</p:presentation>`);

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': contentTypesXml,
    '_rels/.rels': relsXml,
    'ppt/presentation.xml': presentationXml,
    ...(options?.customFiles || {}),
  };

  return zipSync(files);
}

describe('ZIP Extraction & PPTX Validation Suite', () => {
  describe('extractZipArchive', () => {
    it('successfully extracts a valid multi-file ZIP', async () => {
      const files: Record<string, Uint8Array> = {
        'index.html': new TextEncoder().encode('<!DOCTYPE html><html><body><h1>Deck</h1></body></html>'),
        'css/style.css': new TextEncoder().encode('body { background: #000; }'),
        'images/logo.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      };
      const zipData = zipSync(files);

      const res = await extractZipArchive(zipData);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.files).toHaveLength(3);
      expect(res.value.fileCount).toBe(3);
      expect(res.value.files.map((f) => f.path)).toContain('index.html');
      expect(res.value.files.map((f) => f.path)).toContain('css/style.css');
      expect(res.value.files.map((f) => f.path)).toContain('images/logo.png');
    });

    it('strips common root directory if all entries reside within single top folder', async () => {
      const files: Record<string, Uint8Array> = {
        'my-deck/index.html': new TextEncoder().encode('<html>Deck</html>'),
        'my-deck/styles.css': new TextEncoder().encode('h1 { color: red; }'),
      };
      const zipData = zipSync(files);

      const res = await extractZipArchive(zipData);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.files.map((f) => f.path)).toContain('index.html');
      expect(res.value.files.map((f) => f.path)).toContain('styles.css');
    });

    it(`enforces MAX_HTML_FILE_COUNT (${MAX_HTML_FILE_COUNT}) during extraction`, async () => {
      const files: Record<string, Uint8Array> = {};
      const fileCount = MAX_HTML_FILE_COUNT + 5;
      for (let i = 0; i < fileCount; i++) {
        files[`file_${i}.txt`] = new Uint8Array([65]);
      }
      const zipData = zipSync(files);

      const res = await extractZipArchive(zipData);
      expect(res.ok).toBe(false);
      if (res.ok) return;

      expect(res.error.code).toBe(AppErrorCode.FILE_COUNT_EXCEEDED);
      expect(res.error.message).toContain('dosya sayısı sınırını aşıyor');
    });

    it('enforces decompressed byte limit against zip bombs during expansion', async () => {
      // Create a small compressed file that expands beyond custom small bound or MAX_HTML_UNPACKED_BYTES
      const largeContent = new Uint8Array(100 * 1024); // 100 KB filled with zeroes compresses very small
      const zipData = zipSync({
        'large.txt': largeContent,
      });

      // Test with custom maxBytes limit of 50 KB
      const res = await extractZipArchive(zipData, { maxBytes: 50 * 1024 });
      expect(res.ok).toBe(false);
      if (res.ok) return;

      expect(res.error.code).toBe(AppErrorCode.FILE_TOO_LARGE);
      expect(res.error.message).toContain('açılmış boyutu sınırını aşıyor');
    });

    it('rejects directory traversal in ZIP file names', async () => {
      const files: Record<string, Uint8Array> = {
        '../evil.html': new TextEncoder().encode('evil'),
        'index.html': new TextEncoder().encode('ok'),
      };
      const zipData = zipSync(files);

      const res = await extractZipArchive(zipData);
      expect(res.ok).toBe(false);
      if (res.ok) return;

      expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
      expect(res.error.message).toContain('Güvensiz arşiv yolu');
    });

    it('rejects truncated ZIP lacking central directory', async () => {
      const full = zipSync({ 'index.html': new TextEncoder().encode('<html><body>Test</body></html>') });
      let p = 0;
      for (let i = 0; i < full.length - 3; i++) {
        if (full[i] === 0x50 && full[i + 1] === 0x4b && full[i + 2] === 1 && full[i + 3] === 2) {
          p = i;
          break;
        }
      }
      const truncated = full.subarray(0, p);
      const res = await extractZipArchive(truncated);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
      }
    });

    it('rejects encrypted-flag ZIP archive', async () => {
      const data = zipSync({ 'index.html': new TextEncoder().encode('<html><body>Test</body></html>') });
      data[6] |= 1; // Set encryption bit in local file header
      const res = await extractZipArchive(data);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('Şifreli');
      }
    });

    it('rejects symlink archive entries', async () => {
      // Craft a zip buffer with Unix symlink external attribute (0o120000 << 16)
      const data = zipSync({ 'link.txt': new TextEncoder().encode('target.txt') });
      // Find central directory header
      for (let i = 0; i < data.length - 4; i++) {
        if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 1 && data[i + 3] === 2) {
          // external file attributes at offset 38-41
          data[i + 40] = 0x20;
          data[i + 41] = 0xa0; // S_IFLNK (0o120000 = 0xA000)
          break;
        }
      }
      const res = await extractZipArchive(data);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('Sembolik bağlar');
      }
    });

    it('rejects empty or corrupt ZIP data', async () => {
      const emptyRes = await extractZipArchive(new Uint8Array(0));
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);

      const corruptRes = await extractZipArchive(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      expect(corruptRes.ok).toBe(false);
      expect(corruptRes.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });

    it('rejects stored ZIP member with corrupted payload (CRC-32 mismatch)', async () => {
      const bytes = zipSync(
        {
          'index.html': [
            new TextEncoder().encode('<html><body>Stored Integrity Payload</body></html>'),
            { level: 0 },
          ],
        },
        { level: 0 },
      );
      const localDataOffset = 30 + (bytes[26] | (bytes[27] << 8)) + (bytes[28] | (bytes[29] << 8));
      bytes[localDataOffset + 12] ^= 1; // Flip a bit in the uncompressed stored payload

      const res = await extractZipArchive(bytes);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('CRC-32');
      }
    });

    it('rejects deflated ZIP member with corrupted payload', async () => {
      const bytes = zipSync({
        'index.html': new TextEncoder().encode('<html><body>Compressed Deflate Payload Integrity Test</body></html>'),
      });
      const localDataOffset = 30 + (bytes[26] | (bytes[27] << 8)) + (bytes[28] | (bytes[29] << 8));
      bytes[localDataOffset + 5] ^= 1;

      const res = await extractZipArchive(bytes);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
      }
    });
  });

  describe('validatePptxStructure', () => {
    it('accepts valid OOXML PPTX file structure', async () => {
      const pptxData = createMockPptxBytes();
      const res = await validatePptxStructure(pptxData);
      expect(res.ok).toBe(true);
    });

    it('rejects non-PPTX renamed ZIP archives', async () => {
      const fakePptx = zipSync({
        'index.html': new TextEncoder().encode('<h1>Not a PPTX</h1>'),
        'style.css': new TextEncoder().encode('body { margin: 0; }'),
      });

      const res = await validatePptxStructure(fakePptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('OOXML sunum yapısı bulunamadı');
      }
    });

    it('rejects ordinary Word OOXML ZIP renamed .pptx', async () => {
      const wordZip = zipSync({
        '[Content_Types].xml': new TextEncoder().encode(
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': new TextEncoder().encode(
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': new TextEncoder().encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'),
      });

      const res = await validatePptxStructure(wordZip);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('PresentationML içerik türü');
      }
    });

    it('rejects PPTX when _rels/.rels is missing officeDocument relationship', async () => {
      const badPptx = createMockPptxBytes({
        customFiles: {
          '_rels/.rels': new TextEncoder().encode(
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
          ),
        },
      });

      const res = await validatePptxStructure(badPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('officeDocument ilişkisi bulunamadı');
      }
    });

    it('rejects PPTX when officeDocument relationship has TargetMode="External"', async () => {
      const badPptx = createMockPptxBytes({
        customFiles: {
          '_rels/.rels': new TextEncoder().encode(
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="http://external.com/pres.xml" TargetMode="External"/></Relationships>',
          ),
        },
      });

      const res = await validatePptxStructure(badPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('officeDocument ilişkisi bulunamadı');
      }
    });

    it('rejects PPTX when [Content_Types].xml has unrelated PartName override', async () => {
      const badPptx = createMockPptxBytes({
        customFiles: {
          '[Content_Types].xml': new TextEncoder().encode(
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/unrelated.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
          ),
        },
      });

      const res = await validatePptxStructure(badPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('PresentationML içerik türü');
      }
    });

    it('rejects PPTX when main part root element is not <presentation> (e.g. nested in <wrong>)', async () => {
      const badPptx = createMockPptxBytes({
        customFiles: {
          'ppt/presentation.xml': new TextEncoder().encode(
            '<wrong xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:presentation/></wrong>',
          ),
        },
      });

      const res = await validatePptxStructure(badPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('PresentationML <presentation> elemanı değil');
      }
    });

    it('rejects PPTX when main part root has wrong namespace URI', async () => {
      const badPptx = createMockPptxBytes({
        customFiles: {
          'ppt/presentation.xml': new TextEncoder().encode(
            '<presentation xmlns="http://wrong.schema/presentation"><sldIdLst/></presentation>',
          ),
        },
      });

      const res = await validatePptxStructure(badPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('PresentationML <presentation> elemanı değil');
      }
    });

    it('rejects PPTX with malformed XML in [Content_Types].xml', async () => {
      const malformedPptx = createMockPptxBytes({
        customFiles: {
          '[Content_Types].xml': new TextEncoder().encode('<Types><Override>unclosed</Types>'),
        },
      });

      const res = await validatePptxStructure(malformedPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('hatalı XML');
      }
    });

    it('rejects PPTX with malformed XML in ppt/presentation.xml', async () => {
      const malformedPptx = createMockPptxBytes({
        customFiles: {
          'ppt/presentation.xml': new TextEncoder().encode('<p:presentation><unmatched></p:presentation>'),
        },
      });

      const res = await validatePptxStructure(malformedPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
        expect(res.error.message).toContain('hatalı XML');
      }
    });

    it(`rejects PPTX exceeding MAX_PPTX_BYTES (${MAX_PPTX_BYTES})`, async () => {
      const oversizedPptx = new Uint8Array(MAX_PPTX_BYTES + 10);
      oversizedPptx[0] = 0x50;
      oversizedPptx[1] = 0x4b; // Mock zip header

      const res = await validatePptxStructure(oversizedPptx);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.FILE_TOO_LARGE);
        expect(res.error.message).toContain('en fazla 8 MB olabilir');
      }
    });

    it('rejects empty or corrupt PPTX files', async () => {
      const emptyRes = await validatePptxStructure(new Uint8Array(0));
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);

      const corruptRes = await validatePptxStructure(new Uint8Array([10, 20, 30, 40]));
      expect(corruptRes.ok).toBe(false);
      expect(corruptRes.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });
  });
});
