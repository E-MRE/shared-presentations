import { preview, type PreviewServer } from 'vite';
import { test, expect, mount } from './browser-support';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const evidence = process.env.EVIDENCE_DIR ?? 'test-results/e2e';
let server: PreviewServer, origin: string;
test.beforeAll(async () => {
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Production preview address unavailable');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); });
async function record(name: string, value: object) { await mkdir(evidence, { recursive: true }); await writeFile(join(evidence, name + '.json'), JSON.stringify(value, null, 2)); }
for (const system of ['light', 'dark'] as const) for (const storage of ['explicit', 'unset', 'denied'] as const) {
  test(`production prepaint ${system} system and ${storage} storage before module execution`, async ({ page }) => {
    const expected = storage === 'explicit' ? system === 'light' ? 'dark' : 'light' : system;
    await page.emulateMedia({ colorScheme: system });
    await page.addInitScript(({ storage, expected }) => {
      if (top !== self) return;
      if (storage === 'explicit') localStorage.setItem('vektor-theme', expected);
      else if (storage === 'unset') localStorage.removeItem('vektor-theme');
      else Object.defineProperty(Storage.prototype, 'getItem', { value: () => { throw new DOMException('Storage denied for acceptance', 'SecurityError'); } });
    }, { storage, expected });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }); let requested = false;
    await page.route('**/assets/*.js', async route => { requested = true; await gate; await route.fallback(); });
    try {
      await page.goto(origin, { waitUntil: 'commit' }); await expect.poll(() => requested).toBe(true);
      await expect(page.locator('#root')).toBeEmpty();
      const initial = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, colorScheme: document.documentElement.style.colorScheme, rootChildren: document.querySelector('#root')?.childElementCount, fixture: 'e2e' in window }));
      expect(initial.theme).toBe(expected); expect(initial.colorScheme).toBe(expected); expect(initial.rootChildren).toBe(0); expect(initial.fixture).toBe(false);
      await record(`prepaint-${system}-${storage}`, { evidenceClass: 'built-production-entry-paused-emitted-module', origin, system, storage, expected, initial });
    } finally { release(); }
    await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', expected);
  });
}
test('theme provider persists, reloads and responds to real cross-page storage and system changes', async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' }); await mount(page, '/', 'visitor');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Koyu temaya geç' }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('vektor-theme'))).toBe('dark'); await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const external = await context.newPage(); await external.goto('/tests/e2e/harness.html?role=visitor');
  await external.evaluate(() => localStorage.setItem('vektor-theme', 'light')); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await external.evaluate(() => localStorage.removeItem('vektor-theme')); await expect(page.getByRole('button', { name: 'Koyu temaya geç' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Açık temaya geç' }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => { localStorage.removeItem('vektor-theme'); window.dispatchEvent(new StorageEvent('storage', { key: 'vektor-theme', newValue: null })); }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('vektor-theme'))).toBe(null);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await record('theme-provider-storage', { evidenceClass: 'actual-provider-DI-application', persistenceReload: true, crossPageStorageSetAndRemove: true, systemChanges: true, reducedMotion: true }); await external.close();
});
test('theme provider keeps in-memory controls usable when storage reads and writes fail', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => { if (top === self) for (const method of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, method, { value: () => { throw new DOMException('Storage denied for acceptance', 'SecurityError'); } }); });
  await mount(page, '/', 'visitor'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Açık temaya geç' }).click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Açık temaya geç' }).click(); await page.evaluate(() => { try { localStorage.removeItem('vektor-theme'); } catch { /* storage deliberately denied */ } window.dispatchEvent(new StorageEvent('storage', { key: 'vektor-theme', newValue: null })); }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await record('theme-provider-denied', { evidenceClass: 'actual-provider-DI-application', deniedRead: true, deniedWrite: true, inMemoryToggle: true, reloadSystemFallback: true, systemReset: true });
});
