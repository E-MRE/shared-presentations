import { describe, expect, it } from 'vitest';
import { prepareChunks } from '../../src/content/chunks';
import { AppErrorCode } from '../../src/contracts/errors';
import { MAX_HTML_ENCODED_BYTES, MAX_HTML_UNPACKED_BYTES } from '../../src/contracts/limits';
import { metadataErrors } from '../../src/features/editor/validation';
describe('supplemental byte and metadata boundaries', () => {
  it('rejects actual high-entropy gzip payload above 5MB and unpacked bytes above25MB before persistence', () => {
    const bytes = new Uint8Array(MAX_HTML_ENCODED_BYTES + 128 * 1024);
    let seed = 0x12345678;
    for (let i = 0; i < bytes.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; bytes[i] = seed & 255; }
    const encoded = prepareChunks(bytes, 'html'); expect(encoded.ok).toBe(false); if (!encoded.ok) { expect(encoded.error.code).toBe(AppErrorCode.FILE_TOO_LARGE); expect(encoded.error.message).toContain('5 MB'); }
    const unpacked = prepareChunks(new Uint8Array(MAX_HTML_UNPACKED_BYTES + 1), 'html'); expect(unpacked.ok).toBe(false); if (!unpacked.ok) expect(unpacked.error.code).toBe(AppErrorCode.FILE_TOO_LARGE);
  });
  it('rejects more than10 resources at editor output boundary', () => {
    const links = Array.from({ length: 11 }, () => ({ label: 'Kaynak', url: 'https://example.test/' })); expect(metadataErrors('Başlık', '', links).links).toContain('10');
  });
});
