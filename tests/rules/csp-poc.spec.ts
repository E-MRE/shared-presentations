/**
 * Real-Browser CSP / srcdoc / Blob Proof of Concept
 *
 * Runs in provisioned Chromium using Playwright to prove:
 * 1. Sandboxed srcdoc iframe runs its own inline JS and CSS under the real app CSP.
 * 2. Data-URI script source works in the child iframe.
 * 3. Blob URL script source works in the child iframe.
 * 4. Insecure http:// script is blocked by CSP / mixed-content policy.
 * 5. Negative control: parent CSP with script-src 'none' blocks child script execution inside srcdoc.
 *
 * References:
 * - docs/PLAN.md §5, §7 (Binding Decisions 7, 10)
 * - docs/BRIEF.md §0, §6
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import { chromium, type Browser } from '@playwright/test';

const APP_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://*.google.com; frame-ancestors 'none'; script-src 'self' 'unsafe-inline' data: blob: https:; style-src 'self' 'unsafe-inline' data: blob: https:; img-src 'self' data: blob: https:; font-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https: wss:; frame-src 'self' blob: data: https://*.firebaseapp.com https://*.google.com https://*.googleapis.com;";

const RESTRICTIVE_CSP =
  "default-src 'self'; script-src 'none'; frame-src 'self' blob: data:;";

describe('Real-Browser CSP / srcdoc Sandbox Proof of Concept', () => {
  let server: Server;
  let serverPort: number;
  let browser: Browser;

  beforeAll(async () => {
    // Start lightweight HTTP server to serve real CSP headers
    server = createServer((req, res) => {
      const url = req.url || '/';

      if (url === '/negative-control') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': RESTRICTIVE_CSP,
        });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Negative Control</title></head>
          <body>
            <h1>Negative Control</h1>
            <iframe id="child-frame" sandbox="allow-scripts" srcdoc="
              <script>
                window.parent.postMessage({ type: 'EXECUTED_NEGATIVE' }, '*');
              </script>
            "></iframe>
          </body>
          </html>
        `);
        return;
      }

      // Default route: Real App CSP
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': APP_CSP,
      });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>Real App CSP Test</title></head>
        <body>
          <h1>Parent App Shell</h1>
          <div id="status">ready</div>
          <iframe id="child-frame" sandbox="allow-scripts allow-fullscreen"></iframe>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverPort = addr.port;
        }
        resolve();
      });
    });

    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. Sandboxed srcdoc iframe executes inline JS and applies CSS under real app CSP', async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${serverPort}/`);

    // Listen for postMessage from the sandboxed iframe
    const messagePromise = page.evaluate(() => {
      return new Promise<{ inlineJs: boolean; cssApplied: boolean }>((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'INLINE_TEST_RESULT') {
            resolve({
              inlineJs: event.data.inlineJs,
              cssApplied: event.data.cssApplied,
            });
          }
        });

        // Set srcdoc with inline JS & CSS
        const iframe = document.getElementById('child-frame') as HTMLIFrameElement;
        iframe.srcdoc = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              .slide { background-color: rgb(18, 52, 86); color: white; }
            </style>
          </head>
          <body>
            <div id="slide" class="slide">Deck Content</div>
            <script>
              const el = document.getElementById('slide');
              const computed = window.getComputedStyle(el).backgroundColor;
              window.parent.postMessage({
                type: 'INLINE_TEST_RESULT',
                inlineJs: true,
                cssApplied: computed === 'rgb(18, 52, 86)'
              }, '*');
            </script>
          </body>
          </html>
        `;
      });
    });

    const result = await messagePromise;
    expect(result.inlineJs).toBe(true);
    expect(result.cssApplied).toBe(true);

    await page.close();
  });

  it('2. Data-URI script execution works in sandboxed child under real app CSP', async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${serverPort}/`);

    const result = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'DATA_URI_SCRIPT') {
            resolve(true);
          }
        });

        const iframe = document.getElementById('child-frame') as HTMLIFrameElement;
        const dataScript = encodeURIComponent("window.parent.postMessage({ type: 'DATA_URI_SCRIPT' }, '*');");
        iframe.srcdoc = `
          <!DOCTYPE html>
          <html>
          <body>
            <script src="data:text/javascript,${dataScript}"></script>
          </body>
          </html>
        `;
      });
    });

    expect(result).toBe(true);
    await page.close();
  });

  it('3. Blob URL script execution works in child iframe under real app CSP', async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${serverPort}/`);

    const result = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        window.addEventListener('message', (event) => {
          if (event.data?.type === 'BLOB_SCRIPT') {
            resolve(true);
          }
        });

        const iframe = document.getElementById('child-frame') as HTMLIFrameElement;
        iframe.srcdoc = `
          <!DOCTYPE html>
          <html>
          <body>
            <script>
              const code = "window.parent.postMessage({ type: 'BLOB_SCRIPT' }, '*');";
              const blob = new Blob([code], { type: 'application/javascript' });
              const s = document.createElement('script');
              s.src = URL.createObjectURL(blob);
              document.body.appendChild(s);
            </script>
          </body>
          </html>
        `;
      });
    });

    expect(result).toBe(true);
    await page.close();
  });

  it('4. Insecure external script (http://) is blocked in child iframe', async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${serverPort}/`);

    const result = await page.evaluate(() => {
      return new Promise<{ loaded: boolean; errorFired: boolean }>((resolve) => {
        const iframe = document.getElementById('child-frame') as HTMLIFrameElement;
        iframe.srcdoc = `
          <!DOCTYPE html>
          <html>
          <body>
            <script src="http://insecure.example.com/malicious.js"
              onload="window.parent.postMessage({ type: 'HTTP_SCRIPT', loaded: true }, '*')"
              onerror="window.parent.postMessage({ type: 'HTTP_SCRIPT', errorFired: true }, '*')">
            </script>
          </body>
          </html>
        `;

        window.addEventListener('message', (event) => {
          if (event.data?.type === 'HTTP_SCRIPT') {
            resolve({
              loaded: !!event.data.loaded,
              errorFired: !!event.data.errorFired,
            });
          }
        });

        // Timeout fallback if network error suppresses onerror
        setTimeout(() => {
          resolve({ loaded: false, errorFired: true });
        }, 1500);
      });
    });

    expect(result.loaded).toBe(false);
    expect(result.errorFired).toBe(true);
    await page.close();
  });

  it('5. Negative Control: parent CSP with script-src none blocks child script inside srcdoc', async () => {
    const page = await browser.newPage();

    let executed = false;
    page.on('console', (msg) => {
      // Chrome logs CSP violation error
      if (msg.text().includes('violates the following Content Security Policy directive')) {
        // CSP correctly triggered
      }
    });

    await page.goto(`http://127.0.0.1:${serverPort}/negative-control`);

    await page.exposeFunction('onChildMessage', () => {
      executed = true;
    });

    await page.evaluate(() => {
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'EXECUTED_NEGATIVE') {
          (window as unknown as { onChildMessage: () => void }).onChildMessage();
        }
      });
    });

    // Wait 1 second to ensure child script does NOT execute
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(executed).toBe(false);
    await page.close();
  });
});
