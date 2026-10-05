import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as check, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ViewerHarness } from './harness';
import { pptxBytes, type HarnessMetrics, type Scenario } from './fixtures';

declare global { interface Window { viewer: ViewerHarness; viewerMetrics: HarnessMetrics; unmountViewer: () => void; } }
const evidence = process.env.EVIDENCE_DIR || '/opt/projects/shared-presentations/.orchestra/evidence/L06/worker/artifacts';
let server: ViteDevServer, browser: Browser, context: BrowserContext, page: Page, base: string;
let errors: string[] = [];
const reports: object[] = [];
const frame = () => page.frameLocator('iframe');
const close = () => page.getByRole('button', { name: 'Sunumu kapat' });
const fullscreen = () => page.getByRole('button', { name: /^(Tam Ekran|Tam ekrandan çık)$/ });
const info = () => page.getByRole('button', { name: 'Bilgi', exact: true });
async function metrics() { return page.evaluate(() => window.viewerMetrics); }
async function configure(scenario: Scenario = {}, role = 'member') {
  await page.evaluate(({ scenario, role }) => { window.viewer.scenario(scenario); window.viewer.auth(role); }, { scenario, role });
}
async function ready(scenario: Scenario = {}, role = 'member') {
  await configure(scenario, role);
  if (scenario.kind === 'pptx') await check(page.getByRole('button', { name: 'PPTX dosyasını indir' })).toBeVisible();
  else await check(frame().getByRole('button', { name: 'Sunuma odaklan' })).toBeVisible();
}
async function auth(role: string) { await page.evaluate(role => window.viewer.auth(role), role); }
async function release() { await page.evaluate(() => window.viewer.release()); }
async function unmount() { await page.evaluate(() => window.viewer.mount(false)); await check(page.locator('.vektor-viewer')).toHaveCount(0); }
beforeAll(async () => {
  mkdirSync(evidence, { recursive: true });
  try {
    server = await createServer({ root: process.cwd(), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error', plugins: [{ name: 'viewer-harness-direct-route', configureServer(vite) { vite.middlewares.use((request, _response, next) => { if (request.url?.startsWith('/s/')) request.url = '/tests/viewer/harness.html'; next(); }); } }] });
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw new Error('No ephemeral Vite port');
    base = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  } catch (error) { if (server) await server.close(); throw error; }
}, 30_000);
beforeEach(async () => {
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, colorScheme: 'dark' });
  page = await context.newPage(); page.setDefaultTimeout(10_000); errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/tests/viewer/harness.html?auth=unauthenticated`);
  await check(page.getByRole('status')).toContainText('giriş yapın');
}, 20_000);
afterEach(async () => { expect(errors).toEqual([]); if (context) await context.close(); }, 20_000);
afterAll(async () => {
  writeFileSync(join(evidence, 'browser-assertions.json'), JSON.stringify({ browser: 'real Playwright Chromium', reports }, null, 2));
  try { if (browser) await browser.close(); } finally { if (server) await server.close(); }
}, 20_000);

describe('production presentation viewer in real Chromium', { timeout: 65_000 }, () => {
  it('gates every nonmember state with zero reads and permits published/own/admin metadata only', async () => {
    for (const role of ['loading', 'unauthenticated', 'unverified']) {
      await auth(role);
      await check(page.getByRole('status')).toContainText(role === 'loading' ? 'Oturum' : role === 'unverified' ? 'doğrulayın' : 'giriş yapın');
      expect((await metrics()).decks).toEqual([]); expect((await metrics()).chunks).toEqual([]);
      await page.getByRole('button', { name: 'Kapat', exact: true }).click();
    }
    await ready({ status: 'published', owner: 'other-owner' });
    for (const status of ['pending', 'rejected', 'unpublished'] as const) {
      await configure({ status, owner: 'other-owner' });
      await check(page.getByRole('alert')).toContainText('izniniz yok');
      await check(page.locator('iframe')).toHaveCount(0);
    }
    expect((await metrics()).chunks).toHaveLength(1);
    for (const status of ['pending', 'rejected', 'unpublished'] as const) await ready({ status, owner: 'member' });
    await ready({ status: 'pending', owner: 'other-owner' }, 'admin');
    const m = await metrics(); expect(m.chunks).toHaveLength(5); expect(m.closes).toBe(3);
    reports.push({ check: 'zero reads for loading/visitor/unverified; published, owner and admin authorization; other nonpublished denied before chunks', metrics: m, passed: true });
  });

  it('announces loading/notfound/permission/read/thrown/chunk/corruption errors, validates bounds before reads, and retries', async () => {
    await configure({ hold: 'deck' });
    await check(page.getByRole('status')).toContainText('Sunum yükleniyor'); await check(close()).toBeVisible(); await check(fullscreen()).toBeVisible();
    await release(); await check(page.locator('iframe')).toHaveCount(1);
    for (const mode of ['notfound', 'denied', 'readerror', 'throw', 'chunkerror', 'missing', 'corrupt'] as const) {
      await configure({ mode });
      await check(page.getByRole('alert')).toContainText(mode === 'notfound' ? 'bulunamadı' : mode === 'denied' ? 'izniniz yok' : ['corrupt', 'missing'].includes(mode) ? 'eksik veya bozuk' : 'yüklenemedi');
      await check(close()).toBeVisible(); await check(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible();
    }
    const chunksBefore = (await metrics()).chunks.length;
    for (const invalid of ['count', 'size', 'version', 'order', 'encoded', 'unpacked', 'files'] as const) {
      await configure({ invalid }); await check(page.getByRole('alert')).toContainText('eksik veya bozuk');
    }
    expect((await metrics()).chunks).toHaveLength(chunksBefore);
    // Retry within the same service session: first result fails, later result succeeds.
    await page.evaluate(async () => {
      window.viewer.scenario({ mode: 'retry' });
    });
    await check(page.getByRole('alert')).toContainText('yüklenemedi');
    const readsBefore = (await metrics()).decks.length;
    await page.getByRole('button', { name: 'Tekrar dene' }).click();
    await check.poll(async () => (await metrics()).decks.length).toBe(readsBefore + 1);
    await check(frame().getByRole('button', { name: 'Sunuma odaklan' })).toBeVisible();
    await page.evaluate(() => window.viewer.id(undefined));
    await check(page.getByRole('alert')).toContainText('kimliği bulunamadı');
    expect((await metrics()).decks).toHaveLength(readsBefore + 1);
    reports.push({ check: 'all load errors, retry makes another read, successful recovery, missing id and bounded invalid manifests make no chunk reads', chunksBefore, passed: true });
  });

  it('discards late metadata/chunk work on route, identity, role, service changes and logout', async () => {
    await configure({ hold: 'deck' }); await check.poll(async () => (await metrics()).decks.length).toBe(1);
    await page.evaluate(() => window.viewer.id('new-route'));
    await check.poll(async () => (await metrics()).decks.length).toBe(2);
    await configure({ kind: 'pptx' });
    await check(page.getByRole('button', { name: 'PPTX dosyasını indir' })).toBeVisible();
    await release(); await check.poll(async () => (await metrics()).settled).toBe(3);
    await check(page.locator('iframe')).toHaveCount(0); expect((await metrics()).chunks).toEqual([]);
    await configure({ hold: 'chunks' }); await check.poll(async () => (await metrics()).chunks.length).toBe(1);
    await auth('unauthenticated'); await check(page.getByRole('status')).toContainText('giriş yapın');
    await release(); await check.poll(async () => (await metrics()).settled).toBe(5); await check(page.locator('iframe')).toHaveCount(0);
    await ready({ status: 'pending', owner: 'member' });
    await auth('other'); await check(page.getByRole('alert')).toContainText('izniniz yok'); await check(page.locator('iframe')).toHaveCount(0);
    await auth('admin'); await check(page.locator('iframe')).toHaveCount(1);
    await auth('other'); await check(page.getByRole('alert')).toContainText('izniniz yok');
    reports.push({ check: 'late deck/chunk completions ignored for id/service/logout, prior content hidden for changed uid/admin role', metrics: await metrics(), passed: true });
  });

  it('reconstructs HTML inside the exact opaque sandbox, preserves deck keyboard navigation and safe Bilgi metadata', async () => {
    await context.addCookies([{ name: 'app_session', value: 'private-fixture', url: base }]);
    await ready({ long: true });
    await check(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
    await check(page.locator('iframe')).toHaveAttribute('allow', 'fullscreen');
    await check(page.locator('iframe')).toHaveAttribute('title', /ÇokUzunSunumBaşlığı.* — sunum/);
    await check(frame().locator('#isolation')).toHaveText('parent:true;cookie:true');
    expect(await page.evaluate(() => document.body.dataset.compromised)).toBeUndefined();
    expect(await page.evaluate(() => document.cookie)).toContain('app_session=private-fixture');
    expect(await page.evaluate(() => Reflect.get(window, 'untrusted'))).toBeUndefined();
    await frame().getByRole('button', { name: 'Sunuma odaklan' }).click();
    await page.keyboard.press('ArrowRight'); await check(frame().locator('#keys')).toHaveText('ArrowRight:1');
    await page.keyboard.press('f'); await check(frame().locator('#keys')).toHaveText('f:2');
    await page.keyboard.press('Escape'); await check(frame().locator('#keys')).toHaveText('Escape:3');
    expect((await metrics()).closes).toBe(0); expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await info().click(); await check(info()).toHaveAttribute('aria-expanded', 'true');
    const panelId = await info().getAttribute('aria-controls'); expect(panelId).toBeTruthy();
    const panel = page.getByRole('complementary', { name: 'Sunum bilgileri' }); await check(panel).toHaveAttribute('id', panelId!);
    await check(panel).toContainText('<img src=x onerror=window.untrusted=true>'); expect(await panel.locator('img').count()).toBe(0);
    const links = panel.getByRole('link'); await check(links).toHaveCount(1); await check(links).toHaveAttribute('href', 'https://example.invalid/notes');
    await check(links).toHaveAttribute('target', '_blank'); await check(links).toHaveAttribute('rel', 'noopener noreferrer');
    await info().click(); await check(info()).toHaveAttribute('aria-expanded', 'false'); await check(panel).toBeHidden();
    expect((await metrics()).chunks).toEqual([{ id: 'deck', count: 1 }]);
    reports.push({ check: 'bounded gzip HTML, exact allow-scripts/allow fullscreen srcdoc, parent/cookie deny, deck frame keys, Bilgi state, text-only metadata and HTTPS output links', passed: true });
  });

  it('uses real native fullscreen on the complete viewer, app-focus F/Esc and editable/modifier/repeat exceptions', async () => {
    await ready(); await fullscreen().click();
    await check.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('vektor-viewer');
    await check(fullscreen()).toHaveAttribute('aria-pressed', 'true'); await check(close()).toBeVisible(); await check(info()).toBeVisible();
    await fullscreen().click(); await check.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await close().focus(); await page.keyboard.press('f'); await check(fullscreen()).toHaveAttribute('aria-pressed', 'true');
    // Dispatches the page event in addition to testing native Chromium Escape below.
    await close().dispatchEvent('keydown', { key: 'Escape' });
    await check.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true); expect((await metrics()).closes).toBe(0);
    await close().focus(); await page.keyboard.press('Control+f'); await page.keyboard.press('Shift+F');
    await close().dispatchEvent('keydown', { key: 'f', repeat: true });
    expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.evaluate(() => { const input = document.createElement('input'); input.id = 'app-editable'; input.setAttribute('aria-label', 'App editable fixture'); document.querySelector('.viewer-topbar')!.append(input); input.focus(); });
    await page.keyboard.press('f'); await page.keyboard.press('Escape'); expect((await metrics()).closes).toBe(0);
    expect(await page.locator('#app-editable').inputValue()).toBe('f'); expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
    await page.evaluate(() => document.getElementById('app-editable')!.remove());
    await fullscreen().click(); await check(fullscreen()).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape'); await check.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true); expect((await metrics()).closes).toBe(0);
    await close().focus(); await page.keyboard.press('Escape'); expect((await metrics()).closes).toBe(1);
    await fullscreen().click(); await check(fullscreen()).toHaveAttribute('aria-pressed', 'true'); await unmount();
    await check.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true); expect((await metrics()).fullscreenListeners).toBe(0);
    reports.push({ check: 'real fullscreen request/state/visible controls/exit/native Escape, F and Escape only app chrome; editable, modifier, repeat ignored; owned fullscreen/listener cleanup', passed: true });
  });

  it('reports rejected/unsupported fullscreen and leaves unrelated fullscreen untouched on unmount', async () => {
    await ready();
    await page.evaluate(() => { Object.defineProperty(document.querySelector('.vektor-viewer'), 'requestFullscreen', { configurable: true, value: () => Promise.reject(new Error('Fixture rejection')) }); });
    await fullscreen().click(); await check(page.getByRole('alert')).toContainText('Tam ekran açılamadı');
    await page.evaluate(() => { Object.defineProperty(document.querySelector('.vektor-viewer'), 'requestFullscreen', { configurable: true, value: undefined }); });
    await fullscreen().click(); await check(page.getByRole('alert')).toContainText('desteklemiyor');
    await page.evaluate(() => { const button = document.createElement('button'); button.id = 'unrelated-fullscreen'; button.textContent = 'Unrelated fullscreen'; button.onclick = () => void document.documentElement.requestFullscreen(); document.body.append(button); });
    await page.locator('#unrelated-fullscreen').click(); await check.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('HTML');
    await unmount(); expect(await page.evaluate(() => document.fullscreenElement?.tagName)).toBe('HTML');
    await page.evaluate(() => document.exitFullscreen());
    reports.push({ check: 'rejected and absent APIs surface Turkish errors; leave unrelated native fullscreen intact; no unhandled rejection', passed: true });
  });

  it('keeps PPTX metadata free of chunk reads, downloads exact bytes/MIME/safe filename once and retains URLs through unmount until consumption', async () => {
    await ready({ kind: 'pptx', hold: 'chunks', fileName: '../unsafe:original.pptx' });
    await check(page.locator('iframe')).toHaveCount(0); expect((await metrics()).chunks).toEqual([]);
    await check(page.getByText(/antivirüs taramasından geçirilmemiştir/)).toBeVisible();
    await check(page.getByRole('link')).toHaveCount(1);
    const button = page.getByRole('button', { name: 'PPTX dosyasını indir' }); await button.dblclick();
    await check(page.getByRole('button', { name: 'İndiriliyor…' })).toBeDisabled();
    expect((await metrics()).chunks).toEqual([{ id: 'deck', count: 1 }]);
    const downloadPromise = page.waitForEvent('download'); await release(); const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('unsafe_original.pptx'); const path = await download.path(); expect(path).toBeTruthy();
    expect(new Uint8Array(readFileSync(path!))).toEqual(pptxBytes);
    const m = await metrics(); expect(m.downloads).toHaveLength(1); expect(m.urls.at(-1)?.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    expect(m.revoked).toEqual([]); await unmount();
    // Actual lease expiry; no fake timers or premature revocation substitute for browser evidence.
    await check.poll(async () => (await metrics()).revoked, { timeout: 35_000, intervals: [100, 500, 1000] }).toEqual(m.urls.map(item => item.url));
    expect((await metrics()).fullscreenListeners).toBe(0);
    reports.push({ check: 'PPTX no iframe/chunks before click, warning, concurrent-click guard, exact browser download bytes/sanitized original filename/MIME, download URL lease across unmount and eventual revoke', bytes: pptxBytes.length, passed: true });
  });

  it('shows PPTX chunk/reconstruction errors, allows retry and suppresses stale downloads on auth/route/service changes', async () => {
    for (const mode of ['chunkerror', 'missing'] as const) {
      await ready({ kind: 'pptx', mode });
      await page.getByRole('button', { name: 'PPTX dosyasını indir' }).click();
      await check(page.getByRole('alert')).toContainText(mode === 'missing' ? 'eksik veya bozuk' : 'indirilemedi');
      const count = (await metrics()).chunks.length;
      await page.getByRole('button', { name: 'PPTX dosyasını indir' }).click(); await check.poll(async () => (await metrics()).chunks.length).toBe(count + 1);
    }
    for (const change of ['auth', 'route', 'service'] as const) {
      await ready({ kind: 'pptx', hold: 'chunks' });
      await page.getByRole('button', { name: 'PPTX dosyasını indir' }).click();
      await check(page.getByRole('button', { name: 'İndiriliyor…' })).toBeDisabled();
      const settled = (await metrics()).settled;
      if (change === 'auth') { await auth('unauthenticated'); await check(page.getByRole('status')).toContainText('giriş yapın'); }
      if (change === 'route') { await page.evaluate(() => window.viewer.id('changed')); await check(page.getByRole('button', { name: 'PPTX dosyasını indir' })).toBeVisible(); }
      if (change === 'service') await ready({ kind: 'pptx' });
      await release(); await check.poll(async () => (await metrics()).settled).toBeGreaterThan(settled);
      expect((await metrics()).downloads).toEqual([]); expect((await metrics()).urls).toEqual([]);
    }
    reports.push({ check: 'PPTX download errors and actual retry reads; stale auth/id/service completions never create download URLs or click', passed: true });
  });

  it('cleans JPEG/WebP covers and failed covers, route fullscreen listeners, and safe direct-link router close', async () => {
    const cover = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 64; c.height = 40; c.getContext('2d')!.fillRect(0, 0, 64, 40); return Array.from(atob(c.toDataURL('image/webp').split(',')[1]), char => char.charCodeAt(0)); });
    await ready({ kind: 'pptx', cover }); await check(page.getByRole('img')).toHaveAttribute('src', /^blob:/);
    await check.poll(() => page.getByRole('img').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(64);
    await ready({ kind: 'pptx', cover: [255, 216, 255, 0] }); await check(page.getByRole('img', { name: /kapak görseli yok/ })).toBeVisible();
    await ready({ kind: 'pptx' }); const m = await metrics(); expect(m.urls).toHaveLength(2); expect(m.revoked).toEqual(m.urls.map(item => item.url));
    expect(m.fullscreenListeners).toBe(1); await unmount(); expect((await metrics()).fullscreenListeners).toBe(0);
    await page.goto(`${base}/s/direct`); await check(page.locator('iframe')).toHaveCount(1);
    await close().click(); await check(page).toHaveURL(`${base}/`); await check(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
    reports.push({ check: 'binary cover render/replacement/corrupt fallback/unmount revocation, listener cleanup and Router direct link internal archive fallback', metrics: m, passed: true });
  });

  it('captures actual HTML, Bilgi and PPTX at 375/1280 in both app themes and measures dark colors, wrapping, controls, focus and reduced motion', async () => {
    const layouts: object[] = [];
    for (const theme of ['dark', 'light'] as const) for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(theme => window.viewer.theme(theme), theme);
      await ready();
      await page.screenshot({ path: join(evidence, `html-${theme}-${width}.png`) });
      await info().click(); await check(info()).toHaveAttribute('aria-expanded', 'true');
      await page.screenshot({ path: join(evidence, `info-${theme}-${width}.png`) });
      await ready({ kind: 'pptx' }); await page.screenshot({ path: join(evidence, `pptx-${theme}-${width}.png`) });
      for (const kind of ['html', 'pptx'] as const) {
        await ready({ kind, long: true }); if (kind === 'html') await info().click();
        await check(close()).toBeVisible(); await check(fullscreen()).toBeVisible();
        await page.keyboard.press('Tab'); await close().focus();
        expect(await close().evaluate(node => node.matches(':focus-visible'))).toBe(true);
        expect(await close().evaluate(node => getComputedStyle(node).outlineWidth)).toBe('2px');
        expect(await close().evaluate(node => getComputedStyle(node).outlineColor)).toBe('rgb(96, 165, 250)');
        const layout = await page.evaluate(() => {
          const main = document.querySelector<HTMLElement>('.vektor-viewer')!, style = getComputedStyle(main);
          const controls = Array.from(main.querySelectorAll<HTMLButtonElement>('.viewer-topbar button')).map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height, right: r.right, left: r.left, top: r.top, bottom: r.bottom }; });
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, mainScrollWidth: main.scrollWidth, background: style.backgroundColor, color: style.color, controls, frameCount: main.querySelectorAll('iframe').length, modal: main.getAttribute('aria-modal') };
        });
        expect(layout.scrollWidth).toBe(width); expect(layout.mainScrollWidth).toBe(width);
        expect(layout.background).toBe('rgb(12, 14, 18)'); expect(layout.color).toBe('rgb(243, 244, 246)'); expect(layout.modal).toBeNull();
        for (const control of layout.controls) { expect(control.width).toBeGreaterThanOrEqual(44); expect(control.height).toBeGreaterThanOrEqual(44); expect(control.left).toBeGreaterThanOrEqual(0); expect(control.right).toBeLessThanOrEqual(width); expect(control.top).toBeGreaterThanOrEqual(0); expect(control.bottom).toBeLessThanOrEqual(900); }
        layouts.push({ theme, kind, ...layout });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' }); expect(await close().evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
    reports.push({ check: '12 actual screenshots: HTML/Bilgi/PPTX × 375/1280 × light/dark; long text no overflow, always-dark colors, controls visible and ≥44px, focus rings, nonmodal route, reduced motion', layouts, passed: true });
  });
});
