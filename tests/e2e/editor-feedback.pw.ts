import { test, expect, mount, flags, metrics } from './browser-support';
import { smallHtml, raster } from '../editor/fixture-bytes';

async function prepare(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: 'Tek HTML', exact: true }).click();
  await page.locator('#editor-file').setInputFiles({ name: 'test.html', mimeType: 'text/html', buffer: Buffer.from(smallHtml) });
  await expect(page.getByText('Sunum hazır', { exact: true })).toBeVisible();
}

test('preview opens in a visible modal on desktop and phone, isolates HTML and restores focus on Escape', async ({ page }, info) => {
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 760 }); await mount(page, '/yeni'); await prepare(page);
    const trigger = page.getByRole('button', { name: 'Sunumu önizle', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Sunum önizlemesi', exact: true });
    await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Önizlemeyi kapat' })).toBeFocused();
    expect(await page.locator('body').evaluate(node => node.style.overflow)).toBe('hidden');
    const box = await dialog.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width); expect(box!.y + box!.height).toBeLessThanOrEqual(760); if (width === 1280) expect(box!.width).toBeGreaterThanOrEqual(1000);
    await expect(dialog.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(dialog.frameLocator('iframe').getByRole('heading', { name: 'Test Sunumu' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`preview-${width}.png`) });
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', { name: 'Pencereyi kapat' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
    expect(await page.locator('body').evaluate(node => node.style.overflow)).not.toBe('hidden');
  }
});

test('quota failure stays visible at any scroll position, preserves the form, replaces repeats and allows retry', async ({ page }, info) => {
  await page.clock.install(); await mount(page, '/yeni'); await prepare(page); await flags(page, { error: 'quota' });
  await page.locator('#editor-title').fill('Korunan sunum');
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click();
  const notices = page.locator('.vektor-toasts'); await expect(notices.getByRole('alert')).toContainText('En fazla 5');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const box = await notices.boundingBox(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(900);
  const messageBox = await notices.locator('.vektor-toast').boundingBox(); expect(Math.abs(messageBox!.x + messageBox!.width / 2 - 640)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('quota-at-top.png') });
  await page.setViewportSize({ width: 375, height: 760 }); await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const phoneBox = await notices.locator('.vektor-toast').boundingBox(); expect(phoneBox!.x).toBeGreaterThanOrEqual(0); expect(phoneBox!.x + phoneBox!.width).toBeLessThanOrEqual(375); expect(phoneBox!.y + phoneBox!.height).toBeLessThanOrEqual(760); expect(Math.abs(phoneBox!.x + phoneBox!.width / 2 - 187.5)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('quota-phone.png') }); await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('#editor-title')).toHaveValue('Korunan sunum'); expect((await metrics(page)).creates).toHaveLength(0);
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click(); await expect(notices.getByRole('alert')).toHaveCount(1);
  await page.mouse.move(0, 0); await page.locator('#editor-title').focus(); await page.clock.runFor(8000); await expect(notices.getByRole('alert')).toHaveCount(0);
  await flags(page, { error: '' }); await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click();
  await expect(page).toHaveURL(/\/s\/created-1/); await expect(notices.getByRole('status')).toContainText('Sunum onaya gönderildi.');
});

test('cover picker separates upload and ready covers with keyboard tabs and a real image drop', async ({ page }) => {
  await mount(page, '/yeni'); await prepare(page);
  const picker = page.locator('.cover-picker');
  await picker.getByRole('tab', { name: 'Görsel yükle' }).focus(); await page.keyboard.press('ArrowRight');
  await expect(picker.getByRole('tab', { name: 'Hazır kapak' })).toBeFocused(); await expect(picker.getByRole('button', { name: 'Kapak görseli seç' })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Varsayılan kapağa dön' }).click(); await expect(page.getByText('Varsayılan kapak', { exact: true })).toBeVisible();
  await picker.getByRole('tab', { name: 'Hazır kapak' }).focus(); await page.keyboard.press('Home'); await expect(picker.getByRole('tab', { name: 'Görsel yükle' })).toBeFocused();
  await picker.getByRole('tabpanel').evaluate((node, bytes) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], 'cover.png', { type: 'image/png' }));
    node.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, [...raster]);
  await expect(page.getByText('Yüklediğiniz kapak', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click(); await expect(page).toHaveURL(/\/s\/created-1/);
  expect((await metrics(page)).creates[0].coverSource).toBe('upload');
});

test('authentication failure is visible and dismissible above its active native dialog', async ({ page }, info) => {
  await mount(page, '/', 'visitor'); await page.getByRole('button', { name: 'Giriş Yap', exact: true }).click();
  const dialog = page.getByRole('dialog'); await flags(page, { error: 'auth' });
  await dialog.getByRole('button', { name: 'Google ile giriş yap' }).click();
  const alert = dialog.locator('.vektor-toasts').getByRole('alert'); await expect(alert).toBeVisible();
  const button = dialog.getByRole('button', { name: 'Hata bildirimini kapat' });
  expect(await button.evaluate(node => { const box = node.getBoundingClientRect(); return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') === node; })).toBe(true);
  await page.screenshot({ path: info.outputPath('dialog-error.png') });
  await button.click(); await expect(alert).toHaveCount(0); await expect(dialog).toBeVisible();
});

test('download failures remain visible and dismissible inside native fullscreen', async ({ page }) => {
  await mount(page, '/s/pptx'); await page.getByRole('button', { name: 'Tam Ekran', exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe('vektor-viewer');
  await flags(page, { error: 'chunks' }); await page.getByRole('button', { name: 'PPTX dosyasını indir' }).click();
  const alert = page.locator('.vektor-toasts').getByRole('alert'); await expect(alert).toContainText('Dosya indirilemedi');
  expect(await alert.evaluate(node => document.fullscreenElement?.contains(node))).toBe(true);
  await page.getByRole('button', { name: 'Hata bildirimini kapat' }).click(); await expect(alert).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tam ekrandan çık', exact: true })).toBeVisible();
});
