import { test, expect, mount, navigate, role, metrics, flags, card } from './browser-support';
import { pptx, smallHtml } from '../editor/fixture-bytes';

test('visitor and unverified gates keep all six routes free of feature calls; ordinary member cannot enter admin', async ({ page }) => {
  await mount(page, '/', 'visitor');
  for (const value of ['visitor', 'unverified']) {
    await role(page, value);
    for (const path of ['/', '/benim', '/yeni', '/duzenle/html', '/admin', '/s/html']) {
      await navigate(page, path);
      await expect(page.getByRole('heading', { name: value === 'visitor' ? /İyi fikirler/ : 'E-posta adresinizi doğrulayın' })).toBeVisible();
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('iframe')).toHaveCount(0);
    }
  }
  expect((await metrics(page)).calls).toEqual([]);
  expect((await metrics(page)).subscriptions).toBe(0);
  expect((await metrics(page)).creates).toEqual([]);
  await navigate(page, '/admin'); await role(page, 'member');
  await expect(page.getByRole('heading', { name: 'Yönetici yetkisi gerekiyor' })).toBeVisible();
  expect((await metrics(page)).calls).toEqual([]);
  expect((await metrics(page)).unauthorized).toBe(0);
});

test('composed direct routes and reload show actual library, own list, editor, admin and HTML/PPTX viewer', async ({ page }) => {
  const cases = [
    ['/', 'member', 'Sunum Arşivi', 'feed'], ['/benim', 'member', 'Benim Sunumlarım', 'own'],
    ['/yeni', 'member', 'Yeni Sunum Yükle', ''], ['/duzenle/html', 'member', 'Sunumu Düzenle', 'deck'],
    ['/admin', 'admin', 'Onay Masası', 'queue'], ['/s/html', 'member', 'Güvenilir Sistem Tasarımı', 'chunks'],
    ['/s/pptx', 'member', 'Ekip Mimari Notları', 'deck'],
  ];
  for (const [path, value, heading, method] of cases) {
    await mount(page, path, value);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
    if (method) expect((await metrics(page)).calls).toContain(method);
    if (path === '/') await expect(page.locator('iframe')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole('button', { name: /indir/i })).toBeVisible();
});

test('unknown and missing IDs recover visibly, foreign owner edit and private viewer read no chunks', async ({ page }) => {
  await mount(page, '/missing'); await expect(page.getByRole('heading', { name: 'Sayfa bulunamadı' })).toBeVisible();
  await page.getByRole('link', { name: 'Arşive dön' }).click(); await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
  await navigate(page, '/duzenle/foreign'); await expect(page.getByRole('heading', { name: 'Yalnızca kendi sunumunuzu düzenleyebilirsiniz.' })).toBeVisible();
  await expect(page.getByLabel('Sunum başlığı (zorunlu)')).toHaveCount(0);
  await navigate(page, '/s/foreign'); await expect(page.getByRole('alert')).toBeVisible();
  expect((await metrics(page)).calls.filter(call => call === 'chunks')).toEqual([]);
  await navigate(page, '/duzenle/not-found'); await expect(page.getByRole('heading', { name: 'Sunum bulunamadı.' })).toBeVisible();
  await navigate(page, '/s/not-found'); await expect(page.getByRole('alert')).toContainText('bulunamadı');
  const beforeInvalid = (await metrics(page)).calls.length;
  await navigate(page, '/duzenle/bad%2Fid'); await expect(page.getByRole('heading', { name: 'Geçerli bir sunum kimliği bulunamadı.' })).toBeVisible();
  await navigate(page, '/s/bad%2Fid'); await expect(page.getByRole('alert')).toContainText('Geçerli bir sunum kimliği bulunamadı.');
  expect((await metrics(page)).calls).toHaveLength(beforeInvalid);
  expect((await metrics(page)).unauthorized).toBe(0);
});

test('Google and verified-email actions open member features; errors/signup/reset remain recoverable', async ({ page }) => {
  await mount(page, '/', 'visitor');
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await flags(page, { error: 'auth' });
  await dialog.getByRole('button', { name: 'Google ile giriş yap' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await flags(page, { error: '' });
  await dialog.getByRole('button', { name: 'Google ile giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
  expect(await page.evaluate(() => window.e2e.store.getMember()?.isGoogle)).toBe(true);
  await page.getByLabel('Hesap menüsü').click(); await page.getByRole('button', { name: 'Çıkış Yap' }).click();
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Şifremi unuttum' }).click();
  await dialog.getByLabel('E-posta', { exact: true }).fill('fixture@example.invalid');
  await flags(page, { mailFail: true }); await dialog.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Sıfırlama e-postası gönderilemedi.');
  await flags(page, { mailFail: false }); await dialog.getByRole('button', { name: 'Sıfırlama bağlantısı gönder' }).click();
  await expect(dialog.getByRole('status')).toContainText('Bu adresle bir hesap varsa');
  await dialog.getByRole('button', { name: 'Girişe dön' }).click();
  await dialog.getByLabel('E-posta', { exact: true }).fill('fixture@example.invalid');
  await dialog.getByLabel('Şifre', { exact: true }).fill('fixture-only');
  await dialog.getByRole('button', { name: 'E-posta ile giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
  expect(await page.evaluate(() => window.e2e.store.getMember()?.isEmailVerified)).toBe(true);
  await page.getByLabel('Hesap menüsü').click(); await page.getByRole('button', { name: 'Çıkış Yap' }).click();
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  await dialog.getByLabel('Ad soyad').fill('Test Üyesi'); await dialog.getByLabel('E-posta', { exact: true }).fill('fixture@example.invalid'); await dialog.getByLabel('Şifre', { exact: true }).fill('fixture-only');
  await dialog.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'E-posta adresinizi doğrulayın' })).toBeVisible();
  expect(await page.evaluate(() => window.e2e.store.getMember())).toBeNull();
});

test('unverified resend/reload/token failures remain visible and verification enables the real upload route', async ({ page }) => {
  await mount(page, '/yeni', 'unverified');
  await expect(page.getByRole('heading', { name: 'E-posta adresinizi doğrulayın' })).toBeVisible();
  await flags(page, { mailFail: true }); await page.getByRole('button', { name: 'Doğrulama e-postasını yeniden gönder' }).click();
  await expect(page.getByRole('alert')).toHaveText('Doğrulama e-postası gönderilemedi.');
  await flags(page, { mailFail: false }); await page.getByRole('button', { name: 'Doğrulama e-postasını yeniden gönder' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gönderim isteği kabul edildi.' })).toBeVisible();
  await flags(page, { reloadFail: true }); await page.getByRole('button', { name: 'Doğruladım, yeniden kontrol et' }).click();
  await expect(page.getByRole('alert')).toContainText('Doğrulama kontrol edilemedi');
  await expect(page.getByRole('heading', { name: 'E-posta adresinizi doğrulayın' })).toBeVisible();
  expect((await metrics(page)).calls).toEqual([]);
  await flags(page, { reloadFail: false, tokenFail: true }); await page.getByRole('button', { name: 'Doğruladım, yeniden kontrol et' }).click();
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Ağ bağlantısı');
  await flags(page, { tokenFail: false }); await role(page, 'unverified');
  await page.getByRole('button', { name: 'Doğruladım, yeniden kontrol et' }).click();
  await expect(page.getByRole('heading', { name: 'Yeni Sunum Yükle' })).toBeVisible();
  expect((await metrics(page)).unauthorized).toBe(0);
});

test('route navigation and role/logout transitions dispose and reopen one admin count with error retry', async ({ page }) => {
  await mount(page, '/admin', 'admin');
  await expect(page.getByRole('heading', { name: 'Onay Masası' })).toBeVisible();
  await expect.poll(async () => (await metrics(page)).active).toBe(1);
  const start = await metrics(page);
  await page.getByRole('link', { name: 'Benim Sunumlarım', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Benim Sunumlarım' })).toBeVisible();
  const next = await metrics(page);
  expect(next.subscriptions).toBe(start.subscriptions); expect(next.disposals).toBe(start.disposals); expect(next.active).toBe(1);
  await page.goBack(); await expect(page.getByRole('heading', { name: 'Onay Masası' })).toBeVisible();
  await page.evaluate(() => window.e2e.countError());
  await expect(page.getByRole('alert')).toContainText('Bekleyen sunum sayısı alınamadı');
  const beforeRetry = await metrics(page);
  await page.getByRole('button', { name: 'Sayacı yeniden dene' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const recovered = await metrics(page); expect(recovered.subscriptions).toBe(beforeRetry.subscriptions + 1); expect(recovered.disposals).toBe(beforeRetry.disposals + 1); expect(recovered.active).toBe(1);
  await role(page, 'member'); await expect(page.getByRole('heading', { name: 'Yönetici yetkisi gerekiyor' })).toBeVisible();
  await expect.poll(async () => (await metrics(page)).active).toBe(0);
  await role(page, 'admin'); await expect(page.getByRole('heading', { name: 'Onay Masası' })).toBeVisible();
  await expect.poll(async () => (await metrics(page)).active).toBe(1);
  await page.getByLabel('Hesap menüsü').click(); await page.getByRole('button', { name: 'Çıkış Yap' }).click();
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  const end = await metrics(page); expect(end.active).toBe(0); expect(end.subscriptions).toBe(end.disposals); expect(end.roleSubscriptions).toBe(end.roleDisposals); expect(await page.evaluate(() => window.e2e.registryCount())).toBe(0); expect(end.unauthorized).toBe(0);
});

test('late metadata and own-list reads cannot restore signed-out or replaced sessions', async ({ page }) => {
  await mount(page, '/yeni'); await expect(page.getByRole('heading', { name: 'Yeni Sunum Yükle' })).toBeVisible();
  await flags(page, { hold: 'deck' }); await navigate(page, '/s/html');
  await expect.poll(async () => (await metrics(page)).calls.filter(call => call === 'deck').length).toBe(1);
  await role(page, 'visitor'); await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  await flags(page, { hold: '' }); await page.evaluate(() => window.e2e.release());
  await expect(page.locator('iframe')).toHaveCount(0); expect((await metrics(page)).calls).not.toContain('chunks');
  await navigate(page, '/yeni'); await role(page, 'member'); await expect(page.getByRole('heading', { name: 'Yeni Sunum Yükle' })).toBeVisible();
  await flags(page, { hold: 'own' }); await navigate(page, '/benim');
  await expect.poll(async () => (await metrics(page)).calls.filter(call => call === 'own').length).toBe(1);
  await role(page, 'other'); await expect.poll(async () => (await metrics(page)).calls.filter(call => call === 'own').length).toBe(2);
  await flags(page, { hold: '' }); await page.evaluate(() => window.e2e.release());
  await expect(card(page, 'html')).toHaveCount(0); await expect(card(page, 'pending')).toHaveCount(0);
  await expect(card(page, 'foreign')).toBeVisible(); expect((await metrics(page)).unauthorized).toBe(0);
});

test('real HTML file preparation persists pending chunks, preview and viewer, then admin approval enters feed', async ({ page }) => {
  await mount(page, '/yeni'); await expect(page.getByRole('heading', { name: 'Yeni Sunum Yükle' })).toBeVisible();
  await page.getByLabel('Sunum başlığı (zorunlu)').fill('Yüklenen HTML Sunumu');
  await page.getByLabel('Açıklama', { exact: true }).fill('Gerçek dosya girdisinden hazırlanan sunum.');
  await page.getByRole('tab', { name: 'PowerPoint', exact: true }).click();
  await page.locator('#editor-file').setInputFiles({ name: 'upload.html', mimeType: 'text/html', buffer: Buffer.from(smallHtml) });
  await expect(page.getByText('Sunum hazır', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sunumu önizle', exact: true }).click();
  const preview = page.locator('iframe'); await expect(preview).toHaveAttribute('sandbox', 'allow-scripts'); await expect(preview).toHaveAttribute('allow', 'fullscreen');
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Test Sunumu' })).toBeVisible();
  await page.getByRole('button', { name: 'Önizlemeyi kapat' }).click();
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click();
  await expect(page).toHaveURL(/\/s\/created-1/);
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Test Sunumu' })).toBeVisible();
  const payload = await page.evaluate(() => {
    const input = window.e2e.metrics.creates[0];
    return { keys: Object.keys(input).sort(), title: input.title, kind: input.kind, filename: input.fileName, count: input.chunkCount, manifest: input.manifest, lengths: input.chunks.map(chunk => chunk.data.byteLength), encoded: input.sizes.encoded, unpacked: input.sizes.unpacked, coverBytes: input.cover.byteLength, coverSource: input.coverSource };
  });
  expect(payload.title).toBe('Yüklenen HTML Sunumu'); expect(payload.kind).toBe('html'); expect(payload.filename).toBe('upload.html'); expect(payload.count).toBeGreaterThan(0);
  expect(payload.manifest.map(entry => entry.size)).toEqual(payload.lengths); expect(payload.lengths.reduce((sum, length) => sum + length, 0)).toBe(payload.encoded);
  expect(payload.unpacked).toBeGreaterThan(0); expect(payload.coverBytes).toBeGreaterThan(0); expect(payload.coverBytes).toBeLessThanOrEqual(150000);
  expect(payload.keys).not.toContain('status'); expect(payload.keys).not.toContain('ownerUid');
  await test.info().attach('actual-create-payload-summary', { body: JSON.stringify(payload, null, 2), contentType: 'application/json' });
  await navigate(page, '/benim'); await expect(card(page, 'created-1')).toContainText('Onay Bekliyor');
  await navigate(page, '/admin'); await role(page, 'admin'); await expect(page.getByRole('heading', { name: 'Onay Masası' })).toBeVisible();
  await card(page, 'created-1').getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect(card(page, 'created-1')).toHaveCount(0);
  expect((await metrics(page)).reviews).toEqual([{ id: 'created-1', action: 'approve' }]);
  await navigate(page, '/'); await expect(card(page, 'created-1')).toBeVisible(); await expect(page.locator('iframe')).toHaveCount(0);
  expect((await metrics(page)).unauthorized).toBe(0);
});

test('real PPTX upload uses identity chunks and actual viewer download preserves bytes', async ({ page }) => {
  await mount(page, '/yeni'); await expect(page.getByRole('heading', { name: 'Yeni Sunum Yükle' })).toBeVisible();
  await page.getByLabel('Sunum başlığı (zorunlu)').fill('Yüklenen PowerPoint');
  await page.getByRole('tab', { name: 'PowerPoint', exact: true }).click();
  await page.locator('#editor-file').setInputFiles({ name: 'upload.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx });
  await expect(page.getByText('Sunum hazır', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Onaya gönder', exact: true }).click();
  await expect(page).toHaveURL(/\/s\/created-1/); await expect(page.getByRole('heading', { name: 'Yüklenen PowerPoint', exact: true }).first()).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0); await expect(page.getByText(/antivirüs/)).toBeVisible();
  const payload = await page.evaluate(() => { const input = window.e2e.metrics.creates[0]; return { kind: input.kind, sizes: input.sizes, count: input.chunkCount, manifest: input.manifest, bytes: input.chunks.flatMap(chunk => [...chunk.data]) }; });
  expect(payload.kind).toBe('pptx'); expect(payload.sizes.encoded).toBe(pptx.length); expect(payload.sizes.unpacked).toBe(pptx.length); expect(payload.bytes).toEqual([...pptx]); expect(payload.manifest.reduce((sum, chunk) => sum + chunk.size, 0)).toBe(pptx.length);
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: /indir/i }).click(); const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('upload.pptx');
  const stream = await download.createReadStream(); const output: Buffer[] = []; for await (const chunk of stream) output.push(Buffer.from(chunk)); expect(Buffer.concat(output)).toEqual(pptx);
  expect((await metrics(page)).unauthorized).toBe(0);
});

test('review rejection note, owner published edit, unpublish/reapprove and delete use typed feature payloads', async ({ page }) => {
  await mount(page, '/admin', 'admin'); await expect(card(page, 'pending')).toBeVisible();
  await card(page, 'pending').getByRole('button', { name: 'Reddet', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Reddet', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText('Ret gerekçesi zorunludur.'); expect((await metrics(page)).reviews).toEqual([]);
  await dialog.getByLabel('Ret gerekçesi (zorunlu)').fill('  Kaynakları ayrıntılandırın.  '); await dialog.getByRole('button', { name: 'Reddet', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect((await metrics(page)).reviews).toEqual([{ id: 'pending', action: 'reject', rejectNote: 'Kaynakları ayrıntılandırın.' }]);
  await navigate(page, '/benim'); await role(page, 'member'); await expect(card(page, 'pending')).toContainText('Kaynakları ayrıntılandırın.');
  await navigate(page, '/duzenle/html'); await expect(page.getByRole('heading', { name: 'Sunumu Düzenle' })).toBeVisible();
  await page.getByLabel('Sunum başlığı (zorunlu)').fill('Güncellenen Tasarım'); await page.getByRole('button', { name: 'Değişiklikleri onaya gönder' }).click();
  await expect(page).toHaveURL(/\/s\/html/); await expect(page.frameLocator('iframe').getByRole('heading', { name: /Güvenilir sistemler/ })).toBeVisible();
  const update = await page.evaluate(() => window.e2e.metrics.updates[0]); expect(Object.keys(update).sort()).toEqual(['category', 'description', 'id', 'links', 'tags', 'title']); expect(update.id).toBe('html'); expect(update.title).toBe('Güncellenen Tasarım');
  await navigate(page, '/'); await expect(card(page, 'html')).toHaveCount(0);
  await navigate(page, '/admin'); await role(page, 'admin'); await expect(card(page, 'html')).toContainText('Onay Bekliyor');
  await card(page, 'html').getByRole('button', { name: 'Onayla', exact: true }).click(); await expect(card(page, 'html')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tüm Sunumlar', exact: true }).click(); await expect(card(page, 'html')).toBeVisible();
  await card(page, 'html').getByRole('button', { name: 'Yayından kaldır', exact: true }).click(); await dialog.getByRole('button', { name: 'Yayından kaldır', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(card(page, 'html')).toContainText('Yayından Kaldırıldı');
  await card(page, 'html').getByRole('button', { name: 'Yeniden onayla', exact: true }).click(); await expect(card(page, 'html')).toContainText('Yayında');
  await card(page, 'html').getByRole('button', { name: 'Sil', exact: true }).click(); await dialog.getByRole('button', { name: 'Sunumu sil', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(card(page, 'html')).toHaveCount(0);
  const result = await metrics(page); expect(result.reviews).toEqual([{ id: 'pending', action: 'reject', rejectNote: 'Kaynakları ayrıntılandırın.' }, { id: 'html', action: 'approve' }, { id: 'html', action: 'unpublish' }, { id: 'html', action: 'reapprove' }]); expect(result.deletes).toEqual([{ id: 'html' }]); expect(result.unauthorized).toBe(0);
});

test('delayed auth admin, reload and login completions never revive a signed-out account', async ({ page }) => {
  await mount(page, '/yeni', 'visitor'); await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible();
  await flags(page, { hold: 'admin' }); await role(page, 'admin');
  await expect(page.getByRole('heading', { name: 'Oturum kontrol ediliyor…' })).toBeVisible();
  await role(page, 'visitor'); await flags(page, { hold: '' }); await page.evaluate(() => window.e2e.release());
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible(); expect((await metrics(page)).calls).toEqual([]); expect((await metrics(page)).subscriptions).toBe(0);
  await role(page, 'unverified'); await expect(page.getByRole('heading', { name: 'E-posta adresinizi doğrulayın' })).toBeVisible();
  await flags(page, { hold: 'reload' }); await page.getByRole('button', { name: 'Doğruladım, yeniden kontrol et' }).click();
  await expect(page.getByRole('heading', { name: 'Oturum kontrol ediliyor…' })).toBeVisible();
  await role(page, 'visitor'); await flags(page, { hold: '' }); await page.evaluate(() => window.e2e.release());
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible(); expect((await metrics(page)).calls).toEqual([]);
  await page.getByRole('button', { name: 'Giriş Yap', exact: true }).first().click();
  await flags(page, { hold: 'login' }); await page.getByRole('dialog').getByRole('button', { name: 'Google ile giriş yap' }).click();
  await expect.poll(async () => (await metrics(page)).authCalls.filter(call => call === 'google').length).toBe(1);
  await page.evaluate(() => window.e2e.store.actions.signOut()); await flags(page, { hold: '' }); await page.evaluate(() => window.e2e.release());
  await expect.poll(async () => (await metrics(page)).authCalls.filter(call => call === 'signout').length).toBe(2);
  await expect(page.getByRole('heading', { name: /İyi fikirler/ })).toBeVisible(); expect(await page.evaluate(() => window.e2e.store.getMember())).toBeNull(); expect((await metrics(page)).calls).toEqual([]); expect((await metrics(page)).unauthorized).toBe(0);
});
