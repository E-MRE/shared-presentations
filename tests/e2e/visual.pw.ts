import { test, expect, mount, navigate, role, flags, card } from './browser-support';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
const evidence = process.env.EVIDENCE_DIR ?? 'test-results/e2e';
async function settled(page: Page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
  await expect(page.locator('.vektor-library').getByText('Sunumlar yükleniyor…', { exact: true })).toHaveCount(0);
}
async function measure(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.vektor-main, .main-content, .viewer-topbar, .viewer-panel:not([hidden]), .viewer-pptx, .viewer-actions, .footer-container, dialog[open], .modal-body, .editor-columns, .deck-grid, .vektor-navigation, .header-actions'));
    const panels = nodes.filter(node => node.getClientRects().length > 0).map(node => { const r = node.getBoundingClientRect(); return { selector: node.tagName.toLowerCase()+'.'+node.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }; });
    const controls = Array.from(document.querySelectorAll<HTMLElement>('dialog[open] button, dialog[open] input, dialog[open] textarea, dialog[open] select, .viewer-topbar button')).filter(node => node.getClientRects().length > 0).map(node => { const r = node.getBoundingClientRect(); return { label: node.getAttribute('aria-label') || node.textContent || node.id, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    const motion = Array.from(document.querySelectorAll<HTMLElement>('button')).filter(node => node.getClientRects().length > 0).map(node => ({ label: node.getAttribute('aria-label') || node.textContent, transition: getComputedStyle(node).transitionDuration, animation: getComputedStyle(node).animationDuration }));
    return { clientWidth: width, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, panels, controls, outOfBounds: [...panels, ...controls].filter(r => r.left < -1 || r.right > width + 1), viewerScheme: document.querySelector('.vektor-viewer') ? getComputedStyle(document.querySelector('.vektor-viewer')!).colorScheme : null, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, motion };
  });
}
for (const width of [375, 1280]) for (const theme of ['light', 'dark'] as const) {
  test(`normal screenshot and overflow matrix ${width}px ${theme}`, async ({ page }, info) => {
    test.setTimeout(120000); await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.addInitScript(theme => { if (top === self) localStorage.setItem('vektor-theme', theme); }, theme);
    await mount(page); await expect(page.getByRole('heading', { name: 'Sunum Arşivi' })).toBeVisible();
    const rows: object[] = []; const dir = join(evidence, 'screenshots'); await mkdir(dir, { recursive: true });
    async function capture(state: string, auth: string) {
      await settled(page); const metrics = await measure(page); const name = `normal-${width}-${theme}-${state}.png`;
      const png = await page.screenshot({ path: join(dir, name), fullPage: false, scale: 'css' });
      rows.push({ class: 'normal', route: new URL(page.url()).pathname, state, role: auth, width, height: 900, theme, dpr: await page.evaluate(() => devicePixelRatio), fullPage: false, file: `screenshots/${name}`, sha256: createHash('sha256').update(png).digest('hex'), test: info.title, title: await page.title(), measurements: metrics });
      await writeFile(join(evidence, `matrix-normal-${width}-${theme}.json`), JSON.stringify(rows, null, 2));
      expect(metrics.scrollWidth, `${state}: document horizontal overflow`).toBeLessThanOrEqual(metrics.clientWidth + 1);
      expect(metrics.outOfBounds, `${state}: panel/control horizontal bounds`).toEqual([]);
      expect(metrics.reducedMotion).toBe(true);
      for (const item of metrics.motion) for (const seconds of [item.transition, item.animation].flatMap(value => value.split(',').map(parseFloat))) expect(seconds).toBeLessThanOrEqual(0.00001);
      expect(rows.at(-1)).toMatchObject({ dpr: 1 });
      for (const control of metrics.controls.filter(control => ['Sunumu kapat', 'Tam Ekran'].includes(control.label))) { expect(control.top).toBeGreaterThanOrEqual(0); expect(control.bottom).toBeLessThanOrEqual(900); }
      if (metrics.viewerScheme) expect(metrics.viewerScheme).toBe('dark');
    }
    await capture('feed', 'member');
    for (const [path, heading, state] of [['/benim','Benim Sunumlarım','own'],['/yeni','Yeni Sunum Yükle','upload'],['/duzenle/html','Sunumu Düzenle','edit']]) {
      await navigate(page,path); await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible(); await capture(state,'member');
    }
    await navigate(page,'/admin'); await role(page,'admin'); await expect(page.getByRole('heading',{name:'Onay Masası'})).toBeVisible(); await capture('admin','admin');
    await card(page,'pending').getByRole('button',{name:'Reddet',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Reddet',exact:true}).click(); await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Ret gerekçesi zorunludur.'); await capture('reject-required','admin');
    await page.getByRole('dialog').getByRole('button',{name:'Vazgeç',exact:true}).click();
    await card(page,'pending').getByRole('button',{name:'Sil',exact:true}).click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture('confirm-delete','admin'); await page.getByRole('dialog').getByRole('button',{name:'Vazgeç',exact:true}).click();
    await page.getByRole('button',{name:'Tüm Sunumlar',exact:true}).click(); await card(page,'html').getByRole('button',{name:'Yayından kaldır',exact:true}).click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture('confirm-unpublish','admin'); await page.getByRole('dialog').getByRole('button',{name:'Vazgeç',exact:true}).click();
    await navigate(page,'/s/html'); await expect(page.frameLocator('iframe').getByRole('heading',{name:/Güvenilir sistemler/})).toBeVisible(); await capture('html-viewer','admin');
    await page.getByRole('button',{name:'Bilgi',exact:true}).click(); await expect(page.getByRole('complementary',{name:'Sunum bilgileri'})).toBeVisible(); await capture('html-info','admin');
    await navigate(page,'/s/pptx'); await expect(page.getByRole('button',{name:'PPTX dosyasını indir'})).toBeVisible(); await capture('pptx-viewer','admin');
    await navigate(page,'/'); await role(page,'unverified'); await expect(page.getByRole('heading',{name:'E-posta adresinizi doğrulayın'})).toBeVisible(); await capture('unverified','unverified');
    await role(page,'visitor'); await page.getByRole('button',{name:'Giriş Yap',exact:true}).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); await capture('auth-login','visitor');
    await flags(page,{error:'auth'}); await page.getByRole('dialog').getByRole('button',{name:'Google ile giriş yap'}).click(); await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); await capture('auth-error','visitor');
    await page.getByRole('dialog').getByRole('button',{name:'Hesap oluştur',exact:true}).click(); await expect(page.getByLabel('Ad soyad')).toBeVisible(); await capture('auth-signup','visitor');
    await page.getByRole('dialog').getByRole('button',{name:'Girişe dön'}).click(); await page.getByRole('dialog').getByRole('button',{name:'Şifremi unuttum'}).click(); await expect(page.getByRole('dialog').getByRole('button',{name:'Sıfırlama bağlantısı gönder'})).toBeVisible(); await capture('auth-reset','visitor');
    expect(rows).toHaveLength(16);
  });
  test(`long metadata stress overflow ${width}px ${theme}`, async ({page},info)=>{
    await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'}); await mount(page,'/admin','admin');
    await expect(page.getByRole('heading',{name:'Onay Masası'})).toBeVisible();
    await card(page,'pending').getByRole('button',{name:'Reddet',exact:true}).click(); await page.getByLabel('Ret gerekçesi (zorunlu)').fill('RetGerekçesi'.repeat(80)); await page.getByRole('dialog').getByRole('button',{name:'Reddet',exact:true}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.evaluate(()=>window.e2e.long()); const rows:object[]=[]; await mkdir(join(evidence,'screenshots'),{recursive:true});
    for (const [path,state] of [['/benim','own-long'],['/duzenle/html','edit-long'],['/s/html','html-info-long'],['/s/pptx','pptx-long']]) {
      await navigate(page,path);
      if (state==='html-info-long') { await expect(page.locator('iframe')).toBeVisible(); await page.getByRole('button',{name:'Bilgi',exact:true}).click(); await expect(page.getByRole('complementary',{name:'Sunum bilgileri'})).toBeVisible(); }
      else if (state==='edit-long') await expect(page.getByLabel('Sunum başlığı (zorunlu)')).toBeVisible();
      else if (state==='own-long') await expect(card(page,'pending')).toContainText('RetGerekçesi');
      else await expect(page.getByRole('button',{name:'PPTX dosyasını indir'})).toBeVisible();
      await settled(page); const metrics=await measure(page),name=`stress-${width}-${theme}-${state}.png`; const png=await page.screenshot({path:join(evidence,'screenshots',name),fullPage:false,scale:'css'});
      rows.push({class:'stress',route:path,state,role:'admin',width,height:900,theme,dpr:await page.evaluate(()=>devicePixelRatio),file:`screenshots/${name}`,sha256:createHash('sha256').update(png).digest('hex'),test:info.title,title:await page.title(),measurements:metrics}); await writeFile(join(evidence,`matrix-stress-${width}-${theme}.json`),JSON.stringify(rows,null,2));
      expect(metrics.scrollWidth,`${state}: horizontal document overflow`).toBeLessThanOrEqual(metrics.clientWidth+1); expect(metrics.outOfBounds,`${state}: panel/control bounds`).toEqual([]);
    }
  });
}
