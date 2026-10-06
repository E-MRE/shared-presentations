import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chromium, expect as check, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessController } from './harness';
import type { metrics as fixtureMetrics } from './fixtures';
declare global { interface Window { library: HarnessController; libraryMetrics: typeof fixtureMetrics; } }
const evidence=process.env.EVIDENCE_DIR || 'test-results/unit';
let browser: Browser, server: ViteDevServer, context: BrowserContext, page: Page, base: string;
const reports: object[]=[];
let errors: string[]=[];
const cards=() => page.locator('.deck-grid article');
const card=(id: string) => page.locator('.deck-grid article').filter({has:page.locator(`a[href="/s/${id}"]`)});
const dialog=() => page.getByRole('dialog');
async function metrics() { return page.evaluate(() => window.libraryMetrics); }
async function role(value: string) { await page.evaluate(value => window.library.auth(value),value); }
async function flags(value: Parameters<HarnessController['flags']>[0]) { await page.evaluate(value => window.library.flags(value),value); }
async function screen(value: string) { await page.evaluate(value => window.library.screen(value),value); }
async function enter(value='library', auth='member') { await screen(value); await role(auth); await check(page.getByRole('heading',{name:value==='library'?'Sunum Arşivi':value==='my'?'Benim Sunumlarım':'Onay Masası',exact:true})).toBeVisible(); }
async function settle() { await check(page.locator('.vektor-library').getByText('Sunumlar yükleniyor…',{exact:true})).toHaveCount(0); }
async function loadAll() { for (let i=0;i<10;i++) { await settle(); const more=page.getByRole('button',{name:'Daha fazla göster'}); if (!await more.count()) return; await more.click(); } throw new Error('pagination did not terminate'); }
async function release(kind:'reads'|'mutations') { await page.evaluate(kind => window.library.release(kind),kind); }
function report(checkName: string, data: unknown) { reports.push({check:checkName,passed:true,data}); }
beforeAll(async () => {
  mkdirSync(evidence,{recursive:true});
  try {
    server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0},logLevel:'error'}); await server.listen();
    const address=server.httpServer!.address(); if (!address || typeof address==='string') throw new Error('No ephemeral server'); base=`http://127.0.0.1:${address.port}`;
    browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
  } catch(error) { if (server) await server.close(); throw error; }
},30_000);
beforeEach(async () => {
  errors=[]; context=await browser.newContext({viewport:{width:1280,height:900},colorScheme:'dark',reducedMotion:'reduce'}); page=await context.newPage(); page.setDefaultTimeout(10_000); page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/tests/library-admin/harness.html`); await check(page.getByRole('heading',{name:'Ekibin sunumlarını keşfedin'})).toBeVisible();
},20_000);
afterEach(async () => { try { expect(errors).toEqual([]); } finally { if (context) await context.close(); } },20_000);
afterAll(async () => {
  writeFileSync(join(evidence,'browser-assertions.json'),JSON.stringify({browser:'real Playwright Chromium',reports},null,2));
  try { if (browser) await browser.close(); } finally { if (server) await server.close(); }
},20_000);
describe('actual production library, own and admin React components in Chromium',{timeout:80_000},()=>{
  it('gates all nonmembers and nonadmin admin routes with zero reads or subscriptions',async()=>{
    for (const view of ['library','my','admin']) for (const auth of ['loading','unauthenticated','unverified']) { await screen(view); await role(auth); expect((await metrics()).reads).toEqual([]); expect((await metrics()).subscriptions).toBe(0); await check(cards()).toHaveCount(0); }
    await screen('admin'); await role('member'); await check(page.getByRole('heading',{name:'Yönetici erişimi gerekiyor'})).toBeVisible(); expect((await metrics()).reads).toEqual([]); expect((await metrics()).subscriptions).toBe(0);
    report('loading/visitor/unverified and nonadmin gate zero reads/listeners',await metrics());
  });
  it('loads published pages on demand, deduplicates newest cards and searches Turkish title, description and author without reads',async()=>{
    await enter(); await settle(); await check(cards()).toHaveCount(2); await loadAll(); await check(cards()).toHaveCount(4);
    expect(await cards().locator('h2').allTextContents()).toEqual(['Ürün Yolculuğu','Veri Hikâyeleri','İşbirliği Atölyesi','Tasarım İlkeleri']);
    const before=await metrics(); expect(before.reads.map(r=>r.kind)).toEqual(['feed','feed']); expect(before.chunks).toBe(0);
    const search=page.getByRole('searchbox',{name:'Sunum ara'});
    for (const query of ['İŞBİRLİĞİ','iletişim','İPEK']) { await search.fill(query); await check(cards()).toHaveCount(1); }
    await search.fill('eşleşmeyen arama'); await check(page.getByRole('heading',{name:'Aramanızla eşleşen sunum bulunamadı'})).toBeVisible();
    await page.getByRole('button',{name:'Temizle',exact:true}).click(); await check(cards()).toHaveCount(4); expect((await metrics()).reads).toEqual(before.reads);
    expect(await page.locator('iframe').count()).toBe(0); report('feed cursors dedupe/order Turkish client search zero extra reads/chunks',await metrics());
  });
  it('shows recoverable list errors, thrown errors, loading and empty states',async()=>{
    await flags({error:'feed'}); await enter(); await check(page.getByRole('alert')).toContainText('yüklenemedi'); await flags({error:''}); await page.getByRole('button',{name:'Yeniden dene'}).click(); await loadAll(); await check(cards()).toHaveCount(4);
    await flags({throws:true}); await page.evaluate(()=>window.library.replace()); await check(page.getByRole('alert')).toContainText('yüklenemedi'); await flags({throws:false}); await page.getByRole('button',{name:'Yeniden dene'}).click(); await settle();
    await page.evaluate(()=>{window.library.reset('empty');window.library.replace();}); await check(page.getByRole('heading',{name:'Henüz yayınlanmış sunum yok'})).toBeVisible();
    await flags({holdReads:true}); await page.evaluate(()=>window.library.replace()); await check(page.getByText('Sunumlar yükleniyor…',{exact:true})).toBeAttached(); await role('unauthenticated'); await release('reads');
    report('loading/result-error/thrown-error/retry/empty',await metrics());
  });
  it('shows only current UID, all own statuses/notes and edit/view links, confirms eligible deletion with keyboard focus restore',async()=>{
    await enter('my'); await loadAll(); await check(cards()).toHaveCount(8); expect((await metrics()).reads.every(r=>r.kind==='own' && r.uid==='member')).toBe(true); await check(card('other-p')).toHaveCount(0);
    await check(card('rejected')).toContainText('Ret notu: Kaynakları ve sonuçları ayrıntılandırın.'); await check(card('unpublished')).toContainText('Yayından Kaldırıldı'); await check(card('p-old')).toContainText('Onay Bekliyor');
    await check(card('published').getByRole('button',{name:'Sil',exact:true})).toHaveCount(0);
    await check(card('rejected').getByRole('link',{name:'Düzenle'})).toHaveAttribute('href','/duzenle/rejected'); await check(card('rejected').getByRole('link',{name:'Önizle'})).toHaveAttribute('href','/s/rejected');
    const trigger=card('rejected').getByRole('button',{name:'Sil',exact:true}); await trigger.focus(); await page.keyboard.press('Enter'); await check(dialog()).toBeVisible(); await check(dialog().getByRole('button',{name:'Vazgeç'})).toBeFocused(); await page.keyboard.press('Escape'); await check(dialog()).toHaveCount(0); await check(trigger).toBeFocused();
    await trigger.click(); await flags({error:'mutation'}); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); await check(dialog().getByRole('alert')).toContainText('yeniden deneyin'); await flags({error:''}); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); await check(dialog()).toHaveCount(0); await loadAll(); await check(card('rejected')).toHaveCount(0);
    report('own UID statuses notes links owner published restriction confirm/error/retry/delete',await metrics());
  });
  it('approves oldest pending, validates required and max1000 trimmed reject note, and refreshes count/lists',async()=>{
    await enter('admin','admin'); await settle(); await check(cards()).toHaveCount(2); expect(await cards().locator('h2').allTextContents()).toEqual(['İlk Bekleyen Sunum','Yeni Bekleyen Sunum']); await check(page.getByText('Onay bekleyen 3 sunum var.',{exact:true})).toBeAttached();
    await card('p-old').getByRole('button',{name:'Onayla',exact:true}).click(); await check(card('p-old')).toHaveCount(0); await check(page.getByText('Onay bekleyen 2 sunum var.',{exact:true})).toBeAttached();
    const trigger=card('p-new').getByRole('button',{name:'Reddet',exact:true}); await trigger.click(); const note=dialog().getByRole('textbox',{name:'Ret gerekçesi (zorunlu)'}); await check(note).toBeFocused(); await dialog().getByRole('button',{name:'Reddet',exact:true}).click(); await check(dialog().getByRole('alert')).toHaveText('Ret gerekçesi zorunludur.'); await check(note).toBeFocused();
    await note.fill('x'.repeat(1001)); await dialog().getByRole('button',{name:'Reddet',exact:true}).click(); await check(dialog().getByRole('alert')).toContainText('en fazla 1000'); expect((await metrics()).mutations).toHaveLength(1);
    await note.fill('  Kaynakları açıklayın.  '); await flags({error:'mutation'}); await dialog().getByRole('button',{name:'Reddet',exact:true}).click(); await check(dialog().getByRole('alert')).toContainText('İşlem tamamlanamadı'); await check(note).toHaveValue('  Kaynakları açıklayın.  ');
    await flags({error:''}); await dialog().getByRole('button',{name:'Reddet',exact:true}).click(); await check(dialog()).toHaveCount(0); await check(card('p-new')).toHaveCount(0); await check(page.getByText('Onay bekleyen 1 sunum var.',{exact:true})).toBeAttached();
    const m=await metrics(); expect(m.mutations.slice(1).every(action=>action.note==='Kaynakları açıklayın.')).toBe(true); expect(m.reads.filter(r=>r.kind==='all').length).toBeGreaterThan(1); report('approve/reject required/max1000/trim/error/retry/oldest refresh/count',m);
  });
  it('paginates all statuses and confirms unpublish/delete, reapproves rejected and unpublished, prevents duplicate calls',async()=>{
    await enter('admin','admin'); await settle(); await page.getByRole('button',{name:'Tüm Sunumlar',exact:true}).click(); await loadAll(); await check(cards()).toHaveCount(9);
    await card('published').getByRole('button',{name:'Yayından kaldır',exact:true}).click(); await check(dialog()).toBeVisible(); await page.keyboard.press('Escape'); await check(dialog()).toHaveCount(0); expect((await metrics()).mutations).toHaveLength(0);
    await card('published').getByRole('button',{name:'Yayından kaldır',exact:true}).click(); await flags({throws:true}); await dialog().getByRole('button',{name:'Yayından kaldır',exact:true}).click(); await check(dialog().getByRole('alert')).toContainText('İşlem tamamlanamadı'); await flags({throws:false}); await dialog().getByRole('button',{name:'Yayından kaldır',exact:true}).click(); await check(dialog()).toHaveCount(0); await loadAll(); await check(card('published')).toContainText('Yayından Kaldırıldı');
    for (const id of ['rejected','unpublished']) { await card(id).getByRole('button',{name:'Yeniden onayla',exact:true}).click(); await loadAll(); await check(card(id)).toContainText('Yayında'); }
    await flags({holdMutations:true}); await card('pub-4').getByRole('button',{name:'Sil',exact:true}).click(); const submit=dialog().getByRole('button',{name:'Sunumu sil',exact:true});
    await submit.evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();}); await check(dialog().getByRole('button',{name:'İşleniyor…'})).toBeDisabled(); expect((await metrics()).mutations.filter(m=>m.id==='pub-4')).toHaveLength(1);
    await flags({holdMutations:false}); await release('mutations'); await check(dialog()).toHaveCount(0); await loadAll(); await check(card('pub-4')).toHaveCount(0);
    expect((await metrics()).mutations.map(m=>m.action)).toEqual(['unpublish','unpublish','reapprove','reapprove','delete']); report('all pagination statuses unpublish confirm cancel reapprove published delete duplicate lock',await metrics());
  });
  it('allows an administrator to delete an own published deck while owner controls remain gated',async()=>{
    await enter('my','admin'); await settle(); await check(card('pub-4').getByRole('button',{name:'Sil',exact:true})).toBeVisible(); await card('pub-4').getByRole('button',{name:'Sil',exact:true}).click(); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); await check(dialog()).toHaveCount(0); await loadAll(); await check(card('pub-4')).toHaveCount(0); report('own published deletion admin-only through frozen delete service',await metrics());
  });
  it('provides reusable live count, immediate updates, recoverable errors and disposal on role/service/unmount',async()=>{
    await screen('badge'); await role('member'); expect((await metrics()).subscriptions).toBe(0); await role('admin'); await check(page.getByText('3 sunum onay bekliyor',{exact:true})).toBeVisible();
    const subscriptionCount=(await metrics()).subscriptions;
    await page.evaluate(()=>window.library.count(53)); await check(page.getByText('53 sunum onay bekliyor',{exact:true})).toBeVisible(); await page.evaluate(()=>window.library.count(52)); await check(page.getByText('52 sunum onay bekliyor',{exact:true})).toBeVisible(); expect((await metrics()).subscriptions).toBe(subscriptionCount);
    await page.evaluate(()=>window.library.countError()); await check(page.getByRole('status')).toContainText('alınamadı'); await page.getByRole('button',{name:'Sayımı yeniden dene'}).click(); await check(page.getByText('3 sunum onay bekliyor',{exact:true})).toBeVisible(); expect((await metrics()).active).toBe(1);
    await page.evaluate(()=>window.library.replace()); await check(page.getByText('3 sunum onay bekliyor',{exact:true})).toBeVisible(); expect((await metrics()).active).toBe(1); await role('member'); await check(page.locator('.vektor-pending-badge')).toHaveCount(0); expect((await metrics()).active).toBe(0);
    await role('admin'); await screen('library'); await check(page.locator('.vektor-pending-badge')).toHaveCount(0); expect((await metrics()).active).toBe(0);
    await screen('badge'); await check(page.locator('.vektor-pending-badge')).toBeVisible(); await page.evaluate(()=>window.library.mount(false)); await check(page.locator('.vektor-pending-badge')).toHaveCount(0); expect((await metrics()).active).toBe(0); report('reusable hook/badge full contextual live updates error retry stable subscription disposal',await metrics());
  });
  it('discards delayed reads on logout/UID/service and mutations on role loss without late refresh',async()=>{
    await flags({holdReads:true}); await enter(); await check(page.getByText('Sunumlar yükleniyor…',{exact:true})).toBeAttached(); await role('unauthenticated'); expect(await cards().count()).toBe(0); const reads=(await metrics()).reads.length; await flags({holdReads:false}); await release('reads'); await check(page.getByRole('heading',{name:'Ekibin sunumlarını keşfedin'})).toBeVisible(); expect((await metrics()).reads).toHaveLength(reads);
    await flags({holdReads:true}); await enter('my'); await page.evaluate(()=>window.library.replace()); await role('member2'); expect(await cards().count()).toBe(0); await flags({holdReads:false}); await release('reads'); await check(page.getByRole('heading',{name:'Henüz sunum yüklemediniz'})).toBeVisible(); await check(cards()).toHaveCount(0);
    await enter('admin','admin'); await settle(); await card('p-old').getByRole('button',{name:'Reddet',exact:true}).click(); await role('member'); expect(await dialog().count()).toBe(0); expect((await metrics()).active).toBe(0);
    await role('admin'); await settle(); await flags({holdMutations:true}); await card('p-old').getByRole('button',{name:'Onayla',exact:true}).click(); await check(card('p-old').getByRole('button',{name:'Onayla',exact:true})).toBeDisabled(); const count=(await metrics()).reads.length; await role('member'); expect(await cards().count()).toBe(0); await flags({holdMutations:false}); await release('mutations'); await check(page.getByRole('heading',{name:'Yönetici erişimi gerekiyor'})).toBeVisible(); expect((await metrics()).reads).toHaveLength(count); expect((await metrics()).active).toBe(0);
    report('commit-time logout/UID/service guard and open/pending admin role races no late refresh',await metrics());
  });
  it('invalidates an open own dialog and late mutation on service replacement and logout',async()=>{
    await enter('my'); await loadAll(); await card('unpublished').getByRole('button',{name:'Sil',exact:true}).click(); const immediate=await page.evaluate(()=>{window.library.replace();return {cards:document.querySelectorAll('.deck-grid article').length,dialogs:document.querySelectorAll('dialog').length};}); expect(immediate).toEqual({cards:0,dialogs:0}); expect(await dialog().count()).toBe(0); await loadAll();
    await card('rejected').getByRole('button',{name:'Sil',exact:true}).click(); await flags({holdMutations:true}); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); await check(dialog().getByRole('button',{name:'Siliniyor…'})).toBeDisabled(); await page.evaluate(()=>window.library.replace()); expect(await dialog().count()).toBe(0); await settle(); const before=(await metrics()).reads.length; await flags({holdMutations:false}); await release('mutations'); await check(cards()).toHaveCount(2); expect((await metrics()).reads).toHaveLength(before);
    await loadAll(); await card('unpublished').getByRole('button',{name:'Sil',exact:true}).click(); await flags({holdMutations:true}); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); const reads=(await metrics()).reads.length; await role('unauthenticated'); expect(await dialog().count()).toBe(0); expect(await cards().count()).toBe(0); await flags({holdMutations:false}); await release('mutations'); await check(page.getByRole('heading',{name:'Ekibin sunumlarını keşfedin'})).toBeVisible(); expect((await metrics()).reads).toHaveLength(reads);
    report('own open dialog service change and pending mutation service/logout discard',await metrics());
  });
  it('rejects stale pagination when a successful own mutation refreshes the list',async()=>{
    await enter('my'); await settle(); await page.getByRole('button',{name:'Daha fazla göster'}).click(); await settle(); await page.getByRole('button',{name:'Daha fazla göster'}).click(); await settle(); await check(card('rejected')).toBeVisible();
    await flags({holdReads:true}); await page.getByRole('button',{name:'Daha fazla göster'}).click(); await check(page.getByText('Sunumlar yükleniyor…',{exact:true})).toBeAttached(); await card('rejected').getByRole('button',{name:'Sil',exact:true}).click(); await flags({holdReads:false}); await dialog().getByRole('button',{name:'Sunumu sil',exact:true}).click(); await check(dialog()).toHaveCount(0); await settle(); await check(cards()).toHaveCount(2); await release('reads'); await check(cards()).toHaveCount(2); await loadAll(); await check(card('rejected')).toHaveCount(0); report('generation rejects late page after mutation refresh',await metrics());
  });
  it('captures library/my/admin/reject/confirm at375/1280 light/dark with long content, no overflow and keyboard modal trap',async()=>{
    const artifacts=[];
    for (const theme of ['light','dark'] as const) for (const width of [375,1280]) {
      await page.setViewportSize({width,height:900}); await page.evaluate(theme=>{window.library.theme(theme);window.library.reset();window.library.replace();},theme);
      await check(page.locator('html')).toHaveAttribute('data-theme',theme);
      if (await page.locator('.vektor-theme-controls:not([open])').count()) await page.getByLabel('Tema seçenekleri').click(); await check(page.getByRole('button',{name:theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç'})).toBeVisible();
      for (const view of ['library','my','admin']) {
        await enter(view,view==='admin'?'admin':'member'); await settle();
        const path=join(evidence,`${view}-${width}-${theme}.png`); await page.screenshot({path,fullPage:true}); artifacts.push(path);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth); expect(overflow).toBe(false);
        await page.evaluate(()=>{window.library.reset('long');window.library.replace();}); await settle(); if (view === 'my') { await loadAll(); await check(card('rejected')).toContainText('RetGerekçesi'); } expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
        await page.evaluate(()=>{window.library.reset();window.library.replace();}); await settle();
      }
      await page.evaluate(()=>{window.library.reset('long');window.library.replace();}); await settle();
      await card('p-old').getByRole('button',{name:'Reddet',exact:true}).click(); await check(dialog()).toBeVisible(); await dialog().getByRole('textbox').fill('Lütfen örnekleri ve sonuçları ayrıntılandırın.');
      await dialog().getByRole('button',{name:'Reddet',exact:true}).focus(); await page.keyboard.press('Tab'); await check(dialog().getByRole('button',{name:'Pencereyi kapat'})).toBeFocused(); await page.keyboard.press('Shift+Tab'); await check(dialog().getByRole('button',{name:'Reddet',exact:true})).toBeFocused();
      const rejectPath=join(evidence,`reject-${width}-${theme}.png`); await page.screenshot({path:rejectPath}); artifacts.push(rejectPath); expect(await dialog().evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false); await page.keyboard.press('Escape');
      await card('p-old').getByRole('button',{name:'Sil',exact:true}).click(); await check(dialog().getByRole('button',{name:'Vazgeç'})).toBeFocused(); const confirmPath=join(evidence,`confirm-${width}-${theme}.png`); await page.screenshot({path:confirmPath}); artifacts.push(confirmPath); expect(await dialog().evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false); await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:812,height:375}); expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
    await page.evaluate(()=>{document.documentElement.style.fontSize='24px';}); expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false); await card('p-old').getByRole('button',{name:'Sil',exact:true}).click(); await check(dialog()).toBeVisible(); expect(await dialog().evaluate(node=>node.scrollWidth>node.clientWidth)).toBe(false); await page.keyboard.press('Escape');
    report('20 actual screenshots both themes375/1280 long text modal focus trap reduced motion landscape text enlargement no overflow',{artifacts});
  });
});
