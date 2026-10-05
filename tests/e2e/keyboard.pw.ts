import { test, expect, mount, navigate, role, card } from './browser-support';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
const evidence = process.env.EVIDENCE_DIR ?? 'test-results/e2e';
async function save(name: string, rows: object[]) {
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, name + '.json'), JSON.stringify(rows, null, 2));
}
async function trap(page: Page) {
  const controls = page.getByRole('dialog').locator('button, input, textarea, select, a[href], [tabindex="0"]').filter({ visible: true });
  const first = controls.first(), last = controls.last();
  await first.focus(); await page.keyboard.press('Shift+Tab'); await expect(last).toBeFocused();
  await page.keyboard.press('Tab'); await expect(first).toBeFocused();
  for (let i = 0; i < await controls.count() + 2; i++) {
    await page.keyboard.press('Tab');
    expect(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  }
  const style = await page.locator(':focus').evaluate(node => {
    const css = getComputedStyle(node); return { focusVisible: node.matches(':focus-visible'), outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth, outlineColor: css.outlineColor };
  });
  expect(style.focusVisible).toBe(true); expect(style.outlineStyle).not.toBe('none'); expect(parseFloat(style.outlineWidth)).toBeGreaterThan(0);
  return style;
}
test('keyboard auth and admin dialogs contain focus, validate, close and restore triggers', async ({ page }) => {
  const rows: object[] = []; await mount(page, '/', 'visitor');
  const login = page.getByRole('button', { name: 'Giriş Yap', exact: true }).first();
  await login.focus(); await page.keyboard.press('Enter'); await expect(page.getByLabel('E-posta')).toBeFocused();
  rows.push({ state: 'auth-login', style: await trap(page) }); await save('keyboard-dialogs', rows);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(login).toBeFocused();
  for (const [label, state] of [['Hesap oluştur', 'auth-signup'], ['Şifremi unuttum', 'auth-reset']]) {
    await page.keyboard.press('Enter'); await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
    rows.push({ state, style: await trap(page) }); await save('keyboard-dialogs', rows);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(login).toBeFocused();
  }
  await navigate(page, '/admin'); await role(page, 'admin'); await expect(page.getByRole('heading', { name: 'Onay Masası' })).toBeVisible();
  const reject = card(page, 'pending').getByRole('button', { name: 'Reddet', exact: true });
  await reject.focus(); await page.keyboard.press('Enter');
  const note = page.getByLabel('Ret gerekçesi (zorunlu)'); await expect(note).toBeFocused();
  rows.push({ state: 'admin-reject', style: await trap(page) }); await save('keyboard-dialogs', rows);
  await page.getByRole('dialog').getByRole('button', { name: 'Reddet', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Ret gerekçesi zorunludur.'); await expect(note).toBeFocused(); await expect(note).toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(reject).toBeFocused();
  const remove = card(page, 'pending').getByRole('button', { name: 'Sil', exact: true });
  await remove.focus(); await page.keyboard.press('Enter'); await expect(page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' })).toBeFocused();
  rows.push({ state: 'admin-delete', style: await trap(page) }); await save('keyboard-dialogs', rows);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(remove).toBeFocused();
  await page.getByRole('button', { name: 'Tüm Sunumlar', exact: true }).click();
  const unpublish = card(page, 'html').getByRole('button', { name: 'Yayından kaldır', exact: true });
  await unpublish.focus(); await page.keyboard.press('Enter');
  rows.push({ state: 'admin-unpublish', style: await trap(page) }); await save('keyboard-dialogs', rows);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(unpublish).toBeFocused();
  rows.push({ state: 'restoration-and-validation', passed: true }); await save('keyboard-dialogs', rows);
});
test('viewer native fullscreen, close controls and opaque frame keyboard isolation', async ({ page }) => {
  const rows: object[] = []; await mount(page, '/s/html');
  const frame = page.frameLocator('iframe'); await expect(frame.getByRole('heading', { name: /Güvenilir sistemler/ })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts'); await expect(page.locator('iframe')).toHaveAttribute('allow', 'fullscreen');
  await frame.getByRole('button', { name: 'Sunuma odaklan' }).click();
  for (const key of ['ArrowRight', 'ArrowLeft', 'f', 'Escape']) {
    await page.keyboard.press(key); await expect(frame.locator('#keys')).toContainText(key);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true); await expect(page).toHaveURL(/\/s\/html/);
  }
  rows.push({ state: 'frame-key-isolation', keys: ['ArrowRight', 'ArrowLeft', 'f', 'Escape'], sandbox: await page.locator('iframe').getAttribute('sandbox'), allow: await page.locator('iframe').getAttribute('allow') }); await save('keyboard-viewer', rows);
  const info = page.getByRole('button', { name: 'Bilgi', exact: true }); await info.focus(); await page.keyboard.press('Tab');
  const enter = page.getByRole('button', { name: 'Tam Ekran', exact: true }); await expect(enter).toBeFocused();
  const outline = await enter.evaluate(node => ({ visible: node.matches(':focus-visible'), width: getComputedStyle(node).outlineWidth })); expect(outline.visible).toBe(true); expect(parseFloat(outline.width)).toBeGreaterThan(0);
  await page.keyboard.press('f'); await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('vektor-viewer');
  await expect(page.getByRole('button', { name: 'Tam ekrandan çık' })).toBeVisible(); rows.push({ state: 'F-enter-fullscreen', outline }); await save('keyboard-viewer', rows);
  await page.keyboard.press('Escape'); await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true); await expect(page).toHaveURL(/\/s\/html/);
  await page.getByRole('button', { name: 'Bilgi', exact: true }).focus(); await page.keyboard.press('Escape'); await expect(page).toHaveURL(/\/$/); await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
  rows.push({ state: 'Escape-exit-then-close', passed: true }); await save('keyboard-viewer', rows);
  await navigate(page, '/s/html'); await expect(page.locator('iframe')).toBeVisible(); await page.getByRole('button', { name: 'Tam Ekran', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('vektor-viewer');
  await page.getByRole('button', { name: 'Tam ekrandan çık' }).click(); await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole('button', { name: 'Sunumu kapat' }).click(); await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
  rows.push({ state: 'visible-fullscreen-and-close-controls', passed: true }); await save('keyboard-viewer', rows);
});
