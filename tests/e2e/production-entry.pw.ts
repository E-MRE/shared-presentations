import { preview, type PreviewServer } from 'vite';
import { test, expect } from './browser-support';
let server: PreviewServer;
let origin: string;
test.beforeAll(async () => {
  server = await preview({ preview: { host: '127.0.0.1', port: 0, strictPort: false }, logLevel: 'error' });
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Production preview address unavailable');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { if (server) await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); });
test('built production entry loads emitted SDK app assets and visitor gates on direct links/reload', async ({ page, transport }) => {
  const scripts: string[] = [];
  page.on('response', response => { if (/\/assets\/.*\.js$/.test(new URL(response.url()).pathname)) scripts.push(response.url()); });
  for (const path of ['/', '/benim', '/yeni', '/duzenle/html', '/admin', '/s/html', '/unknown']) {
    await page.goto(origin + path);
    await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('.foundation-placeholder')).toHaveCount(0);
    await expect(page.getByText('Uygulama temeli hazır.')).toHaveCount(0);
    expect(await page.evaluate(() => 'e2e' in window)).toBe(false);
    await page.reload();
    await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  }
  expect(scripts.length).toBeGreaterThan(0);
  expect(transport.some(event => event.includes('/tests/e2e/'))).toBe(false);
  await test.info().attach('production-emitted-assets', { body: JSON.stringify(scripts, null, 2), contentType: 'application/json' });
});
