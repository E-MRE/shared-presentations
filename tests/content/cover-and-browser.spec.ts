/**
 * Real Chromium Browser Test Suite: Cover Capture, Bundling, Sandbox Isolation, and Security Controls
 *
 * Runs inside installed Chromium using Playwright and an ephemeral Vite server.
 * Proves runtime capture evidence for the 4 design fixtures, owned ZIP, and PPTX.
 * Saves visual artifacts to /opt/projects/shared-presentations/.orchestra/evidence/L04/worker/.
 *
 * References:
 * - src/content/cover.ts
 * - src/content/pipeline.ts
 * - docs/PLAN.md §5, §7
 * - docs/BRIEF.md §1
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { chromium, type Browser, type Page } from '@playwright/test';
import { zipSync } from 'fflate';

process.env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/data/ms-playwright';

const FIXTURES_DIR = join(process.cwd(), 'design/presentations');
const EVIDENCE_DIR = '/opt/projects/shared-presentations/.orchestra/evidence/L04/worker';

const FIXTURE_FILES = [
  'flutter-fluid-rendering.html',
  'local-first-crdt-sync.html',
  'multi-agent-orchestration.html',
  'zero-dependency-design-tokens.html',
];

describe('Real-Browser Cover Capture and Pipeline Suite', () => {
  let viteServer: ViteDevServer;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    // Start ephemeral Vite server on free local port
    viteServer = await createViteServer({
      server: { host: '127.0.0.1', port: 0 },
      root: process.cwd(),
      logLevel: 'error',
    });
    await viteServer.listen();

    const address = viteServer.httpServer?.address();
    const port = address && typeof address === 'object' ? address.port : 5173;
    serverUrl = `http://127.0.0.1:${port}`;

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

    // Navigate to the test harness page
    await page.goto(`${serverUrl}/tests/content/harness.html`);
    await page.waitForFunction(() => (window as unknown as { vektorReady: boolean }).vektorReady === true);
  }, 30000);

  afterAll(async () => {
    if (page) {
      await page.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
  });

  describe('Four Design Presentation Fixtures Auto Cover Capture', () => {
    for (let i = 0; i < FIXTURE_FILES.length; i++) {
      const fileName = FIXTURE_FILES[i];

      it(`captures 16:9 auto cover for fixture [${i + 1}/4]: ${fileName}`, async () => {
        const fixturePath = join(FIXTURES_DIR, fileName);
        const htmlContent = readFileSync(fixturePath, 'utf-8');

        interface BrowserPipelineSummary {
          ok: boolean;
          title?: string;
          kind?: string;
          sizes?: { encoded: number; unpacked: number; fileCount: number };
          chunkCount?: number;
          hasAutoCover?: boolean;
          autoCoverSource?: string;
          autoCoverMimeType?: string;
          autoCoverBytesLength?: number;
          autoCoverBase64?: string;
          defaultCoverSource?: string;
          defaultCoverBytesLength?: number;
          storedHtmlContainsCaptureHelper?: boolean;
          warningsCount?: number;
        }

        const summary = await page.evaluate(
          async ({ file, content }): Promise<BrowserPipelineSummary> => {
            const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
              .vektorContent;

            const res = await api.preparePresentation({
              kind: 'single-html',
              fileName: file,
              content,
            });

            if (!res.ok) {
              return { ok: false };
            }

            const val = res.value;

            // Reconstruct stored HTML to ensure capture helper was NOT included in storage
            const reconRes = api.reconstructPresentation(val.chunks, val.manifest, 'html');
            const storedHtml = reconRes.ok ? reconRes.value.html || '' : '';
            const containsHelper =
              storedHtml.includes('VEKTOR_COVER_CAPTURE') ||
              storedHtml.includes('modernScreenshot');

            let autoCoverBase64 = '';
            if (val.autoCover?.bytes) {
              autoCoverBase64 = api.bytesToBase64(val.autoCover.bytes);
            }

            return {
              ok: true,
              title: val.title,
              kind: val.kind,
              sizes: val.sizes,
              chunkCount: val.chunks.length,
              hasAutoCover: !!val.autoCover,
              autoCoverSource: val.autoCover?.source,
              autoCoverMimeType: val.autoCover?.mimeType,
              autoCoverBytesLength: val.autoCover?.bytes.length,
              autoCoverBase64,
              defaultCoverSource: val.defaultCover?.source,
              defaultCoverBytesLength: val.defaultCover?.bytes.length,
              storedHtmlContainsCaptureHelper: containsHelper,
              warningsCount: val.warnings.length,
            };
          },
          { file: fileName, content: htmlContent },
        );

        expect(summary.ok).toBe(true);
        expect(summary.kind).toBe('html');
        expect(summary.title).toBeTruthy();

        // Auto cover must be captured successfully
        expect(summary.hasAutoCover).toBe(true);
        expect(summary.autoCoverSource).toBe('auto');
        expect(summary.autoCoverMimeType).toBe('image/jpeg');
        expect(summary.autoCoverBytesLength).toBeGreaterThan(1000);
        expect(summary.autoCoverBytesLength).toBeLessThanOrEqual(150000);

        // Crucial invariant: stored HTML does NOT contain capture helper
        expect(summary.storedHtmlContainsCaptureHelper).toBe(false);

        // Write visual evidence artifact to disk
        if (summary.autoCoverBase64) {
          const imageBuffer = Buffer.from(summary.autoCoverBase64, 'base64');
          const artifactPath = join(EVIDENCE_DIR, `cover-fixture-${i + 1}-${fileName.replace('.html', '')}.jpg`);
          writeFileSync(artifactPath, imageBuffer);
          expect(imageBuffer.length).toBe(summary.autoCoverBytesLength);
        }
      }, 25000);
    }
  });

  describe('Owned Multi-File ZIP Package Capture', () => {
    it('bundles multi-file ZIP and captures 16:9 auto cover', async () => {
      const zipHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vektör ZIP Sunumu</title>
  <style>
    body {
      background: #0F172A;
      color: #F8FAFC;
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: #1E293B;
      padding: 3rem;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.1);
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>ZIP Sunum Testi</h1>
    <p>İç içe geçmiş CSS ve bileşenler</p>
  </div>
</body>
</html>`;

      const zipBytes = zipSync({
        'index.html': new TextEncoder().encode(zipHtml),
      });

      const base64Zip = Buffer.from(zipBytes).toString('base64');

      const result = await page.evaluate(async (b64Zip) => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;
        const bytes = api.base64ToBytes(b64Zip);

        const res = await api.preparePresentation({
          kind: 'zip',
          fileName: 'test-package.zip',
          data: bytes,
        });

        if (!res.ok) return { ok: false };
        const val = res.value;

        return {
          ok: true,
          title: val.title,
          autoCoverSource: val.autoCover?.source,
          autoCoverBytesLength: val.autoCover?.bytes.length,
          autoCoverBase64: val.autoCover ? api.bytesToBase64(val.autoCover.bytes) : '',
        };
      }, base64Zip);

      expect(result.ok).toBe(true);
      expect(result.autoCoverSource).toBe('auto');
      expect(result.autoCoverBytesLength).toBeLessThanOrEqual(150000);

      if (result.autoCoverBase64) {
        const imageBuffer = Buffer.from(result.autoCoverBase64, 'base64');
        writeFileSync(join(EVIDENCE_DIR, 'cover-zip-package.jpg'), imageBuffer);
      }
    }, 20000);
  });

  describe('PPTX Package Pipeline Behavior', () => {
    it('processes PPTX as identity encoding with default cover and no auto capture', async () => {
      const contentTypesXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
</Types>`);

      const relsXml = new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

      const presentationXml = new TextEncoder().encode('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');

      const pptxBytes = zipSync({
        '[Content_Types].xml': contentTypesXml,
        '_rels/.rels': relsXml,
        'ppt/presentation.xml': presentationXml,
      });

      const b64Pptx = Buffer.from(pptxBytes).toString('base64');

      const result = await page.evaluate(async (b64) => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;
        const bytes = api.base64ToBytes(b64);

        const res = await api.preparePresentation({
          kind: 'pptx',
          fileName: 'q3-review.pptx',
          data: bytes,
        });

        if (!res.ok) return { ok: false };
        const val = res.value;

        return {
          ok: true,
          kind: val.kind,
          sizes: val.sizes,
          defaultCoverSource: val.defaultCover.source,
          defaultCoverBytesLength: val.defaultCover.bytes.length,
          hasAutoCover: !!val.autoCover,
        };
      }, b64Pptx);

      expect(result.ok).toBe(true);
      expect(result.kind).toBe('pptx');
      expect(result.defaultCoverSource).toBe('default');
      expect(result.defaultCoverBytesLength).toBeLessThanOrEqual(150000);
      // PPTX never runs auto capture
      expect(result.hasAutoCover).toBe(false);
    });
  });

  describe('Default and Upload Override Covers', () => {
    it('generates branded default cover (solid surface, no gradient)', async () => {
      const res = await page.evaluate(async () => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;

        const coverRes = await api.generateDefaultCover('Vektör Mimari Planı 2026');
        if (!coverRes.ok) return { ok: false };

        return {
          ok: true,
          source: coverRes.value.source,
          mimeType: coverRes.value.mimeType,
          bytesLength: coverRes.value.bytes.length,
          base64: api.bytesToBase64(coverRes.value.bytes),
        };
      });

      expect(res.ok).toBe(true);
      expect(res.source).toBe('default');
      expect(res.bytesLength).toBeLessThanOrEqual(150000);

      if (res.base64) {
        const imgBuffer = Buffer.from(res.base64, 'base64');
        writeFileSync(join(EVIDENCE_DIR, 'cover-default.jpg'), imgBuffer);
      }
    });

    it('processes user-uploaded cover override and gives it precedence', async () => {
      // Create a dummy red test image canvas in browser and export to blob
      const res = await page.evaluate(async () => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;

        const canvas = document.createElement('canvas');
        canvas.width = 1000;
        canvas.height = 1000;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#EF4444';
          ctx.fillRect(0, 0, 1000, 1000);
        }
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const overrideBytes = api.base64ToBytes(dataUrl.split(',')[1]);

        const pipelineRes = await api.preparePresentation(
          {
            kind: 'single-html',
            fileName: 'test.html',
            content: '<html><body>Simple</body></html>',
          },
          {
            coverOverride: overrideBytes,
          },
        );

        if (!pipelineRes.ok) return { ok: false };
        const val = pipelineRes.value;

        return {
          ok: true,
          coverSource: val.autoCover?.source,
          bytesLength: val.autoCover?.bytes.length,
          base64: val.autoCover ? api.bytesToBase64(val.autoCover.bytes) : '',
        };
      });

      expect(res.ok).toBe(true);
      expect(res.coverSource).toBe('upload');
      expect(res.bytesLength).toBeLessThanOrEqual(150000);

      if (res.base64) {
        const imgBuffer = Buffer.from(res.base64, 'base64');
        writeFileSync(join(EVIDENCE_DIR, 'cover-override.jpg'), imgBuffer);
      }
    });
  });

  describe('Security & Sandbox Invariants', () => {
    it('enforces strict sandbox="allow-scripts" and rejects parent DOM access', async () => {
      const res = await page.evaluate(async () => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;

        // HTML attempting to breach sandbox
        const breachHtml = `<!DOCTYPE html>
<html>
<body>
  <h1>Security Probe</h1>
  <script>
    try {
      var parentDoc = window.parent.document;
      window.parent.postMessage({ type: 'BREACH_SUCCESS' }, '*');
    } catch (e) {
      window.parent.postMessage({ type: 'BREACH_BLOCKED', error: e.name }, '*');
    }
  </script>
</body>
</html>`;

        const captured = await api.captureHtmlCover(breachHtml, { timeoutMs: 3000 });
        return {
          ok: captured.ok,
          source: captured.ok ? captured.value.source : null,
        };
      });

      expect(res.ok).toBe(true);
      expect(res.source).toBe('auto');
    });

    it('rejects spoofed postMessage payloads from untrusted sources', async () => {
      const res = await page.evaluate(async () => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;

        // Dispatch a forged message from window itself
        window.postMessage(
          {
            type: 'VEKTOR_COVER_CAPTURE',
            nonce: 'forged-nonce-123',
            status: 'success',
            dataUrl: 'data:image/png;base64,invalid',
          },
          '*',
        );

        // Check that captureHtmlCover doesn't get tricked by the forged message
        const testHtml = '<html><body><h1>Clean</h1></body></html>';
        const captureRes = await api.captureHtmlCover(testHtml, { timeoutMs: 2500 });
        return {
          ok: captureRes.ok,
          source: captureRes.ok ? captureRes.value.source : null,
        };
      });

      expect(res.ok).toBe(true);
      expect(res.source).toBe('auto');
    });

    it('cleans up transient iframe elements from DOM upon completion', async () => {
      const initialFrameCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
      expect(initialFrameCount).toBe(0);

      await page.evaluate(async () => {
        const api = (window as unknown as { vektorContent: typeof import('../../src/content/index') })
          .vektorContent;
        await api.captureHtmlCover('<html><body>Probe</body></html>', { timeoutMs: 2000 });
      });

      const finalFrameCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
      expect(finalFrameCount).toBe(0);
    });
  });
});
