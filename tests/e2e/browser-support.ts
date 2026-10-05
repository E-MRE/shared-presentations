import { test as base, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const evidence = process.env.EVIDENCE_DIR ?? 'test-results/e2e';
export const test = base.extend<{ transport: string[] }>({
  transport: [async ({ context }, use, info) => {
    const events: string[] = [];
    const runtimeErrors: string[] = [];
    context.on('page', page => page.on('pageerror', error => runtimeErrors.push(error.message)));
    context.on('request', request => events.push(`ATTEMPT ${request.resourceType()} ${request.url()}`));
    await context.route('**/*', route => {
      const host = new URL(route.request().url()).hostname;
      if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]') return route.continue();
      events.push(`BLOCKED ${route.request().url()}`);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => {
      const host = new URL(socket.url()).hostname;
      if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]') socket.connectToServer();
      else { events.push(`BLOCKED WEBSOCKET ${socket.url()}`); socket.close(); }
    });
    await use(events);
    await mkdir(join(evidence, 'transport'), { recursive: true });
    const filename = `${info.testId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    await writeFile(join(evidence, 'transport', filename), JSON.stringify({ title: info.title, events, runtimeErrors, status: info.status }, null, 2));
    await info.attach('browser-transport', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
    expect(runtimeErrors).toEqual([]);
  }, { auto: true }],
});
export { expect };
export async function mount(page: Page, path = '/', role = 'member') {
  const response = await page.request.get('/tests/e2e/harness.html');
  if (!response.ok()) throw new Error('Vite harness transformation failed');
  const html = await response.text();
  await page.route('**/*', route => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(route.request().url()).hostname) && route.request().isNavigationRequest() && route.request().resourceType() === 'document'
    ? route.fulfill({ body: html, contentType: 'text/html' }) : route.fallback());
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}role=${role}`);
  await expect.poll(() => page.evaluate(() => !!window.e2e)).toBe(true);
}
export async function navigate(page: Page, path: string) { await page.evaluate(path => window.e2e.navigate(path), path); }
export async function role(page: Page, value: string) { await page.evaluate(value => window.e2e.auth(value), value); }
export async function metrics(page: Page) { return page.evaluate(() => ({ ...window.e2e.metrics })); }
export async function flags(page: Page, value: { error?: string; hold?: string; mailFail?: boolean; tokenFail?: boolean; reloadFail?: boolean; countFail?: boolean }) { await page.evaluate(value => window.e2e.flags(value), value); }
export function card(page: Page, id: string) { return page.locator('.deck-card').filter({ has: page.locator(`a[href="/s/${id}"]`) }); }
