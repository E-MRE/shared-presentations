/**
 * Unit Test Suite: HTML Bundling, Inlining, Gzip Chunking, Manifest Parity, and Reconstruction
 *
 * Verifies roundtrip behavior on four design fixtures and multi-file packages.
 *
 * References:
 * - src/content/bundler.ts
 * - src/content/chunks.ts
 * - src/contracts/limits.ts
 * - src/contracts/errors.ts
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundlePresentation, findHtmlEntry } from '../../src/content/bundler';
import { prepareChunks, reconstructPresentation } from '../../src/content/chunks';
import {
  MAX_CHUNK_BYTES,
  MAX_CHUNKS_COUNT,
  MAX_HTML_ENCODED_BYTES,
  MANIFEST_VERSION,
} from '../../src/contracts/limits';
import { AppErrorCode } from '../../src/contracts/errors';
import type { BundleFile } from '../../src/content/types';

const FIXTURES_DIR = join(process.cwd(), 'design/presentations');
const FIXTURE_NAMES = [
  'flutter-fluid-rendering.html',
  'local-first-crdt-sync.html',
  'multi-agent-orchestration.html',
  'zero-dependency-design-tokens.html',
];

describe('HTML Bundling & Chunks Roundtrip Suite', () => {
  describe('Entry HTML Selection', () => {
    it('selects index.html preferentially over other HTML files', () => {
      const files: BundleFile[] = [
        { path: 'intro.html', data: new Uint8Array(), size: 0 },
        { path: 'index.html', data: new Uint8Array(), size: 0 },
        { path: 'summary.html', data: new Uint8Array(), size: 0 },
      ];
      const res = findHtmlEntry(files);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.path).toBe('index.html');
      }
    });

    it('falls back to deterministic first HTML file sorted alphabetically', () => {
      const files: BundleFile[] = [
        { path: 'zebra.html', data: new Uint8Array(), size: 0 },
        { path: 'alpha.html', data: new Uint8Array(), size: 0 },
        { path: 'beta.html', data: new Uint8Array(), size: 0 },
      ];
      const res = findHtmlEntry(files);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.path).toBe('alpha.html');
      }
    });

    it('respects explicit entry selection when provided', () => {
      const files: BundleFile[] = [
        { path: 'index.html', data: new Uint8Array(), size: 0 },
        { path: 'custom-entry.html', data: new Uint8Array(), size: 0 },
      ];
      const res = findHtmlEntry(files, 'custom-entry.html');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.path).toBe('custom-entry.html');
      }
    });

    it('rejects bundle when no HTML files exist', () => {
      const files: BundleFile[] = [
        { path: 'style.css', data: new Uint8Array(), size: 0 },
        { path: 'image.png', data: new Uint8Array(), size: 0 },
      ];
      const res = findHtmlEntry(files);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe(AppErrorCode.INVALID_ARGUMENT);
      }
    });
  });

  describe('Multi-File Inlining and Dependency Resolution', () => {
    it('inlines linked CSS, nested @import, and url() images as data URIs', () => {
      const htmlText = `<!DOCTYPE html>
<html>
<head>
  <title>Test Deck</title>
  <link rel="stylesheet" href="css/main.css">
</head>
<body>
  <h1>Hello Vektör</h1>
</body>
</html>`;

      const mainCss = `
@import "sub/nested.css";
body {
  background: url("../images/bg.png");
}
`;

      const nestedCss = `
h1 {
  font-family: 'TestFont';
  background: url("../../fonts/icon.svg#symbol");
}
`;

      const bgPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
      const iconSvg = new TextEncoder().encode('<svg id="symbol"><circle r="10"/></svg>');

      const files: BundleFile[] = [
        { path: 'index.html', data: new TextEncoder().encode(htmlText), size: htmlText.length },
        { path: 'css/main.css', data: new TextEncoder().encode(mainCss), size: mainCss.length },
        { path: 'css/sub/nested.css', data: new TextEncoder().encode(nestedCss), size: nestedCss.length },
        { path: 'images/bg.png', data: bgPng, size: bgPng.length },
        { path: 'fonts/icon.svg', data: iconSvg, size: iconSvg.length },
      ];

      const res = bundlePresentation(files);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const bundledHtml = res.value.html;

      // Link tag replaced with inlined <style>
      expect(bundledHtml).not.toContain('<link rel="stylesheet"');
      expect(bundledHtml).toContain('<style data-inlined-from="css/main.css">');

      // Nested @import inlined
      expect(bundledHtml).toContain("font-family: 'TestFont'");

      // Images and SVG url(...) converted to data URIs
      expect(bundledHtml).toContain('data:image/png;base64,');
      expect(bundledHtml).toContain('data:image/svg+xml;charset=utf-8;base64,');
    });

    it('detects and halts @import cycles gracefully', () => {
      const htmlText = '<link rel="stylesheet" href="a.css">';
      const cssA = '@import "b.css";\nbody { color: blue; }';
      const cssB = '@import "a.css";\nh1 { color: red; }';

      const files: BundleFile[] = [
        { path: 'index.html', data: new TextEncoder().encode(htmlText), size: htmlText.length },
        { path: 'a.css', data: new TextEncoder().encode(cssA), size: cssA.length },
        { path: 'b.css', data: new TextEncoder().encode(cssB), size: cssB.length },
      ];

      const res = bundlePresentation(files);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.warnings.some((w) => w.code === 'CYCLE_DETECTED')).toBe(true);
      expect(res.value.html).toContain('/* @import cycle skipped:');
    });

    it('inlines linked scripts and safely escapes </script> inside script bodies', () => {
      const htmlText = `
<!DOCTYPE html>
<html>
<body>
  <script src="js/app.js"></script>
</body>
</html>`;

      const scriptCode = `
const markup = "<div>Hello</div></script><script>alert('pwned')</script>";
console.log("Deck active");
`;

      const files: BundleFile[] = [
        { path: 'index.html', data: new TextEncoder().encode(htmlText), size: htmlText.length },
        { path: 'js/app.js', data: new TextEncoder().encode(scriptCode), size: scriptCode.length },
      ];

      const res = bundlePresentation(files);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const bundled = res.value.html;
      expect(bundled).not.toContain('<script src="js/app.js"');
      expect(bundled).toContain('data-inlined-from="js/app.js"');
      // </script> escaped as <\/script>
      expect(bundled).toContain('<\\/script>');
      expect(bundled).toContain('console.log("Deck active")');
    });

    it('inlines img src and multi-descriptor srcset without leaking parent-origin URLs', () => {
      const htmlText = `
<img src="assets/photo.jpg" srcset="assets/photo.jpg 1x, assets/photo-2x.jpg 2x" alt="Pic">
<img src="missing.png" alt="Missing">`;

      const imgBytes = new Uint8Array([255, 216, 255, 224]);

      const files: BundleFile[] = [
        { path: 'index.html', data: new TextEncoder().encode(htmlText), size: htmlText.length },
        { path: 'assets/photo.jpg', data: imgBytes, size: imgBytes.length },
        { path: 'assets/photo-2x.jpg', data: imgBytes, size: imgBytes.length },
      ];

      const res = bundlePresentation(files);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const bundled = res.value.html;
      expect(bundled).toContain('srcset="data:image/jpeg;base64,');
      // Missing image replaced with inert 1x1 transparent data URI
      expect(bundled).toContain('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
      expect(res.value.warnings.some((w) => w.code === 'MISSING_RESOURCE')).toBe(true);
    });

    it('neutralizes <base href="..."> tag with a warning', () => {
      const htmlText = '<html><head><base href="/subfolder/"></head><body><h1>Base</h1></body></html>';
      const files: BundleFile[] = [
        { path: 'index.html', data: new TextEncoder().encode(htmlText), size: htmlText.length },
      ];

      const res = bundlePresentation(files);
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.value.html).not.toContain('<base href=');
      expect(res.value.html).toContain('<!-- Base tag neutralized:');
      expect(res.value.warnings.some((w) => w.code === 'NORMALIZATION_NOTE')).toBe(true);
    });
  });

  describe('Four Design Presentation Fixtures Bundling & Roundtrip', () => {
    for (const fixtureName of FIXTURE_NAMES) {
      it(`bundles and roundtrips fixture: ${fixtureName}`, () => {
        const fixturePath = join(FIXTURES_DIR, fixtureName);
        const originalBytes = readFileSync(fixturePath);
        const originalHtml = originalBytes.toString('utf-8');

        const files: BundleFile[] = [
          {
            path: fixtureName,
            name: fixtureName,
            data: new Uint8Array(originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength),
            size: originalBytes.length,
          },
        ];

        // 1. Bundling
        const bundleRes = bundlePresentation(files);
        expect(bundleRes.ok).toBe(true);
        if (!bundleRes.ok) return;

        expect(bundleRes.value.title).toBeTruthy();
        expect(bundleRes.value.unpackedBytes).toBeGreaterThan(0);

        // Google Fonts links are external HTTPS, preserved with observable warning
        expect(bundleRes.value.warnings.some((w) => w.code === 'EXTERNAL_RESOURCE')).toBe(true);
        expect(bundleRes.value.html).toContain('https://fonts.googleapis.com');

        // Navigation script is preserved intact
        expect(bundleRes.value.html).toContain('<script>');
        expect(bundleRes.value.html).toContain('addEventListener');

        // 2. Chunks and manifest generation
        const bundledBytes = new TextEncoder().encode(bundleRes.value.html);
        const chunkRes = prepareChunks(bundledBytes, 'html');
        expect(chunkRes.ok).toBe(true);
        if (!chunkRes.ok) return;

        const { encodedData, chunks, manifest, chunkCount, manifestVersion } = chunkRes.value;

        // Frozen contract invariants
        expect(manifestVersion).toBe(MANIFEST_VERSION);
        expect(encodedData.length).toBeLessThanOrEqual(MAX_HTML_ENCODED_BYTES);
        expect(chunkCount).toBeGreaterThanOrEqual(1);
        expect(chunkCount).toBeLessThanOrEqual(MAX_CHUNKS_COUNT);
        expect(chunks.length).toBe(chunkCount);
        expect(manifest.length).toBe(chunkCount);

        // Exact sum parity
        const manifestSum = manifest.reduce((acc, entry) => acc + entry.size, 0);
        expect(manifestSum).toBe(encodedData.length);
        for (let i = 0; i < chunks.length; i++) {
          expect(chunks[i].index).toBe(i);
          expect(chunks[i].size).toBe(chunks[i].data.length);
          expect(chunks[i].size).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
          expect(manifest[i].index).toBe(i);
          expect(manifest[i].size).toBe(chunks[i].size);
        }

        // 3. Reconstruction & Decompression roundtrip
        const reconstructRes = reconstructPresentation(chunks, manifest, 'html');
        expect(reconstructRes.ok).toBe(true);
        if (!reconstructRes.ok) return;

        expect(reconstructRes.value.kind).toBe('html');
        expect(reconstructRes.value.html).toBe(bundleRes.value.html);
        expect(reconstructRes.value.rawBytes.length).toBe(bundleRes.value.unpackedBytes);
      });
    }
  });

  describe('Multi-Chunk Splitting and Bounded Reconstruction', () => {
    it('slices large payloads (> 900 KB) into multiple ordered chunks', () => {
      // Create a 1 MB payload to test boundary chunking
      const targetSize = 1000000;
      const largeData = new Uint8Array(targetSize);
      for (let i = 0; i < targetSize; i++) {
        largeData[i] = (i * 31 + 17) % 256;
      }

      // PPTX identity chunking to test exact multi-chunk boundary slicing
      const chunkRes = prepareChunks(largeData, 'pptx');
      expect(chunkRes.ok).toBe(true);
      if (!chunkRes.ok) return;

      expect(chunkRes.value.chunkCount).toBe(2);
      expect(chunkRes.value.chunks[0].size).toBe(MAX_CHUNK_BYTES); // 900,000 bytes
      expect(chunkRes.value.chunks[1].size).toBe(targetSize - MAX_CHUNK_BYTES); // 100,000 bytes

      // Roundtrip reconstruction
      const reconRes = reconstructPresentation(
        chunkRes.value.chunks,
        chunkRes.value.manifest,
        'pptx',
      );
      expect(reconRes.ok).toBe(true);
      if (!reconRes.ok) return;

      expect(reconRes.value.rawBytes.length).toBe(largeData.length);
      // Fast byte sample checks
      expect(reconRes.value.rawBytes[0]).toBe(largeData[0]);
      expect(reconRes.value.rawBytes[899999]).toBe(largeData[899999]);
      expect(reconRes.value.rawBytes[900000]).toBe(largeData[900000]);
      expect(reconRes.value.rawBytes[targetSize - 1]).toBe(largeData[targetSize - 1]);
    });

    it('rejects malformed manifests with non-sequential or mismatched sizes', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const chunkRes = prepareChunks(data, 'pptx');
      expect(chunkRes.ok).toBe(true);
      if (!chunkRes.ok) return;

      const { chunks, manifest } = chunkRes.value;

      // 1. Wrong index
      const badManifest1 = [{ index: 1, size: 5 }];
      const res1 = reconstructPresentation(chunks, badManifest1, 'pptx');
      expect(res1.ok).toBe(false);
      expect(res1.error?.code).toBe(AppErrorCode.MALFORMED_MANIFEST);

      // 2. Mismatched size
      const badManifest2 = [{ index: 0, size: 999 }];
      const res2 = reconstructPresentation(chunks, badManifest2, 'pptx');
      expect(res2.ok).toBe(false);
      expect(res2.error?.code).toBe(AppErrorCode.MALFORMED_MANIFEST);

      // 3. Length mismatch
      const res3 = reconstructPresentation(chunks, [], 'pptx');
      expect(res3.ok).toBe(false);
      expect(res3.error?.code).toBe(AppErrorCode.MALFORMED_MANIFEST);
    });
  });
});
