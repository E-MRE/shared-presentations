import { test, expect, mount, navigate, card, metrics } from './browser-support';
import { smallHtml } from '../editor/fixture-bytes';

test('header has one active route; theme changes directly and visitor has one login action', async ({ page }) => {
  await mount(page, '/benim');
  const nav = page.getByRole('navigation', { name: 'Ana gezinme' });
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.getByRole('link', { name: 'Benim Sunumlarım' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Yeni Sunum' })).not.toHaveAttribute('aria-current', 'page');
  const current = await page.locator('html').getAttribute('data-theme');
  const toggle = page.getByRole('button', { name: current === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç' });
  const icon = await toggle.locator('svg').innerHTML(); await toggle.click();
  const iconBounds = await page.locator('.theme-toggle svg').boundingBox();
  expect(iconBounds?.width).toBeGreaterThanOrEqual(20); expect(iconBounds?.height).toBeGreaterThanOrEqual(20);
  await expect(page.locator('html')).toHaveAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  expect(await page.locator('.theme-toggle svg').innerHTML()).not.toBe(icon);
  await mount(page, '/', 'visitor');
  await expect(page.getByRole('banner').getByRole('button', { name: 'Giriş Yap', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Giriş Yap', exact: true })).toHaveCount(1);
});

test('deletion gives a temporary toast; signout leaves no stale text after another login', async ({ page }) => {
  await page.clock.install(); await mount(page, '/benim');
  await card(page, 'pending').getByRole('button', { name: 'Sil', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sunumu sil', exact: true }).click();
  await expect(page.locator('.vektor-toasts')).toContainText('Sunum silindi.');
  await expect(page.getByRole('main')).not.toContainText('Sunum silindi.');
  await page.clock.runFor(4000); await expect(page.locator('.vektor-toast')).toHaveCount(0);
  await page.getByLabel('Hesap menüsü').click(); await page.getByRole('button', { name: 'Çıkış Yap', exact: true }).click();
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Google ile giriş yap' }).click();
  await expect(page.getByText('Çıkış yapıldı.', { exact: true })).toHaveCount(0);
});

test('archive keeps accessible search but removes visible redundant text and empty count', async ({ page }) => {
  await mount(page, '/');
  await expect(page.getByLabel('Sunum ara')).toBeVisible();
  await expect(page.getByText('Sunum ara', { exact: true })).toHaveCSS('clip-path', 'inset(50%)');
  await expect(page.locator('.intro-desc')).toHaveCount(0);
  await page.getByLabel('Sunum ara').fill('DoesNotExist');
  await expect(page.getByRole('heading', { name: 'Aramanızla eşleşen sunum bulunamadı' })).toBeVisible();
  await expect(page.getByText('0 sunum', { exact: true })).toHaveCount(0);
});

test('upload tabs have keyboard navigation and format-specific controls; optional sources start visible', async ({ page }) => {
  await mount(page, '/yeni');
  await expect(page.locator('.editor-steps')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Klasör seç', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ZIP seç', exact: true })).toBeVisible();
  await expect(page.locator('#editor-link-0-label')).toBeVisible();
  await expect(page.locator('#editor-link-0-url')).toBeVisible();
  await page.getByRole('tab', { name: 'HTML (Klasör / ZIP)', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tek HTML', exact: true })).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Tek HTML', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Klasör seç', exact: true })).toHaveCount(0);
  await expect(page.locator('#editor-file')).toHaveAttribute('accept', '.html,.htm');
  await page.locator('#editor-file').setInputFiles({ name: 'test.html', mimeType: 'text/html', buffer: Buffer.from(smallHtml) });
  await expect(page.getByText('Sunum hazır', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click();
  await expect(page).toHaveURL(/\/s\/created-1/); expect((await metrics(page)).creates[0].links).toEqual([]);
});

test('unavailable lazy preparation module reports refresh guidance instead of generic file failure', async ({ page }) => {
  await page.route('**/src/content/pipeline.ts*', route => route.abort());
  await mount(page, '/yeni'); await page.getByRole('tab', { name: 'Tek HTML', exact: true }).click();
  await page.locator('#editor-file').setInputFiles({ name: 'test.html', mimeType: 'text/html', buffer: Buffer.from(smallHtml) });
  await expect(page.getByRole('alert')).toContainText('Sayfayı yenileyip dosyayı tekrar seçin.');
  expect((await metrics(page)).creates).toHaveLength(0);
});

test('auth has one introductory message, eye control and a separate recovery link', async ({ page }) => {
  await mount(page, '/', 'visitor'); await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.auth-brand')).toHaveCount(0);
  await dialog.getByLabel('Şifre', { exact: true }).fill('test-only');
  await dialog.getByRole('button', { name: 'Şifreyi göster', exact: true }).click();
  await expect(dialog.getByLabel('Şifre', { exact: true })).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Şifreyi gizle', exact: true }).click();
  await expect(dialog.getByLabel('Şifre', { exact: true })).toHaveAttribute('type', 'password');
  await expect(dialog.locator('.auth-recovery')).toContainText('Şifremi unuttum');
  await expect(dialog.locator('.auth-field-icon')).toHaveCount(2);
  await navigate(page, '/');
});
