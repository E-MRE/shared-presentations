import { test, expect, mount, flags, metrics, role } from './browser-support';

test('signup keeps dispatch failure visible; resend recovers without recreating the account', async ({ page }) => {
  await mount(page, '/', 'visitor');
  await page.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Ad soyad').fill('Test'); await dialog.getByLabel('E-posta', { exact: true }).fill('test@example.invalid'); await dialog.getByLabel('Şifre', { exact: true }).fill('test-only');
  await flags(page, { mailFail: true }); await dialog.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Hesabınız oluşturuldu fakat');
  await flags(page, { mailFail: false }); await page.getByRole('button', { name: 'Doğrulama e-postasını yeniden gönder' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gönderim isteği kabul edildi.' }).last()).toBeVisible();
  expect((await metrics(page)).authCalls.filter(action => action === 'signup')).toHaveLength(1);
});

test('dirty editor protects links, browser back and close; saved metadata includes category and tags', async ({ page }) => {
  await mount(page, '/benim'); await page.getByRole('link', { name: 'Yeni Sunum Yükle' }).click();
  await page.getByLabel('Sunum başlığı (zorunlu)').fill('Kaybolmayan taslak');
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('link', { name: 'Sunum Arşivi', exact: true }).click();
  await expect(page).toHaveURL(/\/yeni/); await expect(page.getByLabel('Sunum başlığı (zorunlu)')).toHaveValue('Kaybolmayan taslak');
  page.once('dialog', dialog => dialog.dismiss()); await page.goBack();
  await expect(page).toHaveURL(/\/yeni/); await expect(page.getByLabel('Sunum başlığı (zorunlu)')).toHaveValue('Kaybolmayan taslak');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Benim Sunumlarım' })).toBeVisible();
  await page.locator('a[href="/duzenle/html"]').click(); await page.getByLabel('Kategori', { exact: true }).selectOption('AI & LLM'); await page.getByLabel('Etiketler').fill('öğrenme, LLM');
  await page.getByRole('button', { name: 'Değişiklikleri onaya gönder' }).click(); await expect(page).toHaveURL(/\/s\/html/);
  expect((await metrics(page)).updates.at(-1)).toMatchObject({ category: 'AI & LLM', tags: ['öğrenme', 'LLM'] });
});

test('viewer closes to the originating own list and admin tab', async ({ page }) => {
  await mount(page, '/benim'); await page.locator('a[href="/s/html"]').first().click();
  await expect(page.getByRole('button', { name: 'Sunumu kapat' })).toBeVisible(); await page.getByRole('button', { name: 'Sunumu kapat' }).click();
  await expect(page).toHaveURL(/\/benim/);
  await mount(page, '/admin', 'admin'); await page.getByRole('button', { name: 'Tüm Sunumlar', exact: true }).click(); await page.locator('a[href="/s/html"]').first().click();
  await page.getByRole('button', { name: 'Sunumu kapat' }).click(); await expect(page).toHaveURL(/\/admin\?sekme=all/); await expect(page.getByRole('button', { name: 'Tüm Sunumlar', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('initial feed requests one page; complete category and tag search is explicit and filters survive viewing', async ({ page }) => {
  await mount(page, '/', 'visitor'); await page.evaluate(() => window.e2e.seedFeed()); await role(page, 'member'); await expect(page.locator('.deck-card')).toHaveCount(12);
  expect((await metrics(page)).calls.filter(call => call === 'feed')).toHaveLength(1);
  await page.getByRole('button', { name: 'AI & LLM', exact: true }).click(); await page.getByLabel('Sunum ara').fill('öğrenme');
  await page.getByRole('button', { name: 'Tüm arşivde ara' }).click(); await expect(page.locator('.deck-card')).toHaveCount(20);
  await page.locator('.card-cover-link').first().click(); await page.getByRole('button', { name: 'Sunumu kapat' }).click();
  await expect(page.getByLabel('Sunum ara')).toHaveValue('öğrenme'); await expect(page.getByRole('button', { name: 'AI & LLM', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.locator('.deck-card')).toHaveCount(20);
});

test('local state animation loads when motion is allowed and pauses for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await mount(page, '/', 'visitor');
  await expect(page.locator('.state-motion svg')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.state-motion')).toBeHidden();
});
