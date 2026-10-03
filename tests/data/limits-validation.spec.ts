/**
 * Unit Test Suite: Data Limits & Client-Side Validation
 *
 * Verifies that client-side validation rigorously enforces all limits from
 * src/contracts/limits.ts, including Operator Decision 3 browser-only invariants.
 *
 * References:
 * - src/contracts/limits.ts
 * - docs/ARCHITECTURE.md §7
 * - docs/PLAN.md §5, §7
 */

import { describe, it, expect } from 'vitest';
import {
  validateTitle,
  validateDescription,
  validateLinks,
  validateCover,
  validateSizes,
  validateManifest,
  validateCreateDeckInput,
  validateUpdateDeckInput,
} from '../../src/data/validation';
import {
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LINKS_COUNT,
  MAX_COVER_BYTES,
  MAX_CHUNK_BYTES,
  MAX_HTML_ENCODED_BYTES,
  MAX_PPTX_BYTES,
  MAX_HTML_UNPACKED_BYTES,
  MAX_HTML_FILE_COUNT,
} from '../../src/contracts/limits';
import { AppErrorCode } from '../../src/contracts/errors';

describe('Data Limits Validation Unit Suite', () => {
  describe('Title validation', () => {
    it('accepts valid titles within limits', () => {
      const res = validateTitle('Geçerli Sunum Başlığı');
      expect(res.ok).toBe(true);
    });

    it('rejects empty or whitespace-only titles', () => {
      const res1 = validateTitle('');
      expect(res1.ok).toBe(false);
      expect(res1.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);

      const res2 = validateTitle('   ');
      expect(res2.ok).toBe(false);
      expect(res2.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });

    it(`rejects titles exceeding MAX_TITLE_LENGTH (${MAX_TITLE_LENGTH})`, () => {
      const longTitle = 'a'.repeat(MAX_TITLE_LENGTH + 1);
      const res = validateTitle(longTitle);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });
  });

  describe('Description validation', () => {
    it('accepts valid descriptions', () => {
      const res = validateDescription('Bu geçerli bir sunum açıklamasıdır.');
      expect(res.ok).toBe(true);
    });

    it(`rejects descriptions exceeding MAX_DESCRIPTION_LENGTH (${MAX_DESCRIPTION_LENGTH})`, () => {
      const longDesc = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);
      const res = validateDescription(longDesc);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });
  });

  describe('Links validation', () => {
    it('accepts valid HTTPS links array up to MAX_LINKS_COUNT', () => {
      const links = [
        { label: 'GitHub', url: 'https://github.com/example/repo' },
        { label: 'Dokümantasyon', url: 'https://docs.example.com' },
      ];
      const res = validateLinks(links);
      expect(res.ok).toBe(true);
    });

    it(`rejects links array exceeding MAX_LINKS_COUNT (${MAX_LINKS_COUNT})`, () => {
      const links = Array.from({ length: MAX_LINKS_COUNT + 1 }, (_, i) => ({
        label: `Link ${i}`,
        url: `https://example.com/${i}`,
      }));
      const res = validateLinks(links);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });

    it('rejects insecure HTTP links', () => {
      const links = [{ label: 'Insecure', url: 'http://example.com' }];
      const res = validateLinks(links);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });

    it('rejects links with empty labels', () => {
      const links = [{ label: '', url: 'https://example.com' }];
      const res = validateLinks(links);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });
  });

  describe('Cover validation', () => {
    it('accepts valid cover payloads', () => {
      const cover = new Uint8Array([1, 2, 3, 4, 5]);
      const res = validateCover(cover);
      expect(res.ok).toBe(true);
    });

    it('rejects empty cover payload', () => {
      const cover = new Uint8Array(0);
      const res = validateCover(cover);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_COVER);
    });

    it(`rejects cover exceeding MAX_COVER_BYTES (${MAX_COVER_BYTES})`, () => {
      const cover = new Uint8Array(MAX_COVER_BYTES + 1);
      const res = validateCover(cover);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_COVER);
    });
  });

  describe('Sizes validation & Operator Decision 3 invariants', () => {
    it('accepts sizes within HTML compressed and unpacked limits', () => {
      const sizes = {
        encoded: 1024 * 1024,
        unpacked: 5 * 1024 * 1024,
        fileCount: 42,
      };
      const res = validateSizes(sizes, 'html');
      expect(res.ok).toBe(true);
    });

    it(`rejects HTML encoded size exceeding MAX_HTML_ENCODED_BYTES (${MAX_HTML_ENCODED_BYTES})`, () => {
      const sizes = {
        encoded: MAX_HTML_ENCODED_BYTES + 1,
        unpacked: 2000,
        fileCount: 1,
      };
      const res = validateSizes(sizes, 'html');
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.FILE_TOO_LARGE);
    });

    it(`rejects PPTX encoded size exceeding MAX_PPTX_BYTES (${MAX_PPTX_BYTES})`, () => {
      const sizes = {
        encoded: MAX_PPTX_BYTES + 1,
        unpacked: 0,
        fileCount: 1,
      };
      const res = validateSizes(sizes, 'pptx');
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.FILE_TOO_LARGE);
    });

    it(`enforces browser-only unpacked size MAX_HTML_UNPACKED_BYTES (${MAX_HTML_UNPACKED_BYTES})`, () => {
      const sizes = {
        encoded: 1000,
        unpacked: MAX_HTML_UNPACKED_BYTES + 1,
        fileCount: 10,
      };
      const res = validateSizes(sizes, 'html');
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.FILE_TOO_LARGE);
    });

    it(`enforces browser-only file count limit MAX_HTML_FILE_COUNT (${MAX_HTML_FILE_COUNT})`, () => {
      const sizes = {
        encoded: 1000,
        unpacked: 5000,
        fileCount: MAX_HTML_FILE_COUNT + 1,
      };
      const res = validateSizes(sizes, 'html');
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.FILE_COUNT_EXCEEDED);
    });
  });

  describe('Manifest and Chunk validation', () => {
    it('accepts valid chunk manifest with matching sizes', () => {
      const c0 = new Uint8Array(400);
      const c1 = new Uint8Array(600);
      const chunks = [
        { index: 0, data: c0, size: 400 },
        { index: 1, data: c1, size: 600 },
      ];
      const manifest = [
        { index: 0, size: 400 },
        { index: 1, size: 600 },
      ];

      const res = validateManifest(2, manifest, chunks, 1000);
      expect(res.ok).toBe(true);
    });

    it(`rejects chunk exceeding MAX_CHUNK_BYTES (${MAX_CHUNK_BYTES})`, () => {
      const big = new Uint8Array(MAX_CHUNK_BYTES + 1);
      const chunks = [{ index: 0, data: big, size: MAX_CHUNK_BYTES + 1 }];
      const manifest = [{ index: 0, size: MAX_CHUNK_BYTES + 1 }];

      const res = validateManifest(1, manifest, chunks, MAX_CHUNK_BYTES + 1);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.CHUNK_TOO_LARGE);
    });

    it('rejects manifest where sum of chunks does not equal encoded size', () => {
      const c0 = new Uint8Array(300);
      const chunks = [{ index: 0, data: c0, size: 300 }];
      const manifest = [{ index: 0, size: 300 }];

      // Claimed encoded size is 400, but sum is 300
      const res = validateManifest(1, manifest, chunks, 400);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.MALFORMED_MANIFEST);
    });

    it('rejects mismatch between binary chunk byteLength and manifest size', () => {
      const c0 = new Uint8Array(300);
      const chunks = [{ index: 0, data: c0, size: 500 }]; // forged size
      const manifest = [{ index: 0, size: 500 }];

      const res = validateManifest(1, manifest, chunks, 500);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.MALFORMED_MANIFEST);
    });
  });

  describe('CreateDeckInput and UpdateDeckInput validation', () => {
    it('validates a complete valid CreateDeckInput payload', () => {
      const c0 = new Uint8Array(500);
      const input = {
        title: 'Harika Bir Sunum',
        description: 'Sunum açıklaması',
        links: [{ label: 'GitHub', url: 'https://github.com/vektor' }],
        kind: 'html' as const,
        fileName: 'sunum.html',
        cover: new Uint8Array([1, 2, 3]),
        coverSource: 'auto' as const,
        sizes: { encoded: 500, unpacked: 1000, fileCount: 1 },
        chunkCount: 1,
        chunks: [{ index: 0, data: c0, size: 500 }],
        manifest: [{ index: 0, size: 500 }],
      };

      const res = validateCreateDeckInput(input);
      expect(res.ok).toBe(true);
    });

    it('rejects invalid UpdateDeckInput missing id', () => {
      const input = {
        id: '',
        title: 'Başlık',
        description: 'Açıklama',
        links: [],
      };
      const res = validateUpdateDeckInput(input);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe(AppErrorCode.INVALID_ARGUMENT);
    });
  });
});
