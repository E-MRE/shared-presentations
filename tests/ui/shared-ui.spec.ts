import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { chromium, expect as browserExpect, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ThemePreference } from '../../src/theme';
import type { ToastInput } from '../../src/components';
interface HarnessWindow extends Window {
  ui: { setAuth: (role:string)=>void; setPending:(count:number)=>void; setBackdrop:(value:boolean)=>void; setMounted:(value:boolean)=>void; setCards:(value:boolean)=>void; setBytes:(value:number[])=>void; notify:(toast:ToastInput)=>string; dismiss:(id:string)=>void; setPreference:(theme:ThemePreference)=>void; };
  unmountUI:()=>void;
  prepaintTheme:string;
  metrics:{ urls:string[]; revoked:string[]; timers:Set<number>; storage:number; media:number; };
}
const evidence = process.env.EVIDENCE_DIR || 'test-results/unit';
let server:ViteDevServer;
let browser:Browser;
let context:BrowserContext;
let page:Page;
let url:string;
let errors:string[]=[];
const reports:object[]=[];
async function ready() { await browserExpect(page.locator('#theme-state')).toBeVisible(); }
async function role(value:string) { await page.evaluate(value=>(window as unknown as HarnessWindow).ui.setAuth(value),value); }
async function theme(value:ThemePreference) { await page.evaluate(value=>(window as unknown as HarnessWindow).ui.setPreference(value),value); await browserExpect(page.locator('#theme-state')).toContainText(value+'/'); }
async function syncTheme(value:string) { await browserExpect(page.locator('html')).toHaveAttribute('data-theme',value); expect(await page.locator('html').evaluate(node=>(node as HTMLElement).style.colorScheme)).toBe(value); }
beforeAll(async()=>{
  mkdirSync(evidence,{recursive:true});
  server=await createServer({root:process.cwd(),server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  const address=server.httpServer!.address();
  url=`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5173}/tests/ui/harness.html`;
  browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
},30000);
beforeEach(async()=>{
  if(context) await context.close();
  context=await browser.newContext({viewport:{width:1280,height:900},colorScheme:'dark'});
  await context.addInitScript(()=>{
    const metrics={urls:[] as string[],revoked:[] as string[],timers:new Set<number>(),storage:0,media:0};
    Object.assign(window,{metrics});
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=(object)=>{const result=create(object);metrics.urls.push(result);return result;};
    URL.revokeObjectURL=(value)=>{metrics.revoked.push(value);revoke(value);};
    const set=window.setTimeout.bind(window),clear=window.clearTimeout.bind(window);
    window.setTimeout=((handler:TimerHandler,timeout?:number,...args:unknown[])=>{
      if(typeof handler !== 'function' || (timeout !== 4000 && timeout !== 350)) return set(handler,timeout,...args);
      const id=set(()=>{metrics.timers.delete(id);handler(...args);},timeout);metrics.timers.add(id);return id;
    }) as typeof window.setTimeout;
    window.clearTimeout=(id)=>{if(id!==undefined)metrics.timers.delete(id);clear(id);};
    const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
    window.addEventListener=((type:string,...args:unknown[])=>{if(type==='storage')metrics.storage++;return (add as Function)(type,...args);}) as typeof add;
    window.removeEventListener=((type:string,...args:unknown[])=>{if(type==='storage')metrics.storage--;return (remove as Function)(type,...args);}) as typeof remove;
    const match=window.matchMedia.bind(window);
    window.matchMedia=(query)=>{const result=match(query);const a=result.addEventListener.bind(result),r=result.removeEventListener.bind(result);result.addEventListener=((...args:unknown[])=>{metrics.media++;return (a as Function)(...args);}) as typeof a;result.removeEventListener=((...args:unknown[])=>{metrics.media--;return (r as Function)(...args);}) as typeof r;return result;};
  });
  page=await context.newPage();page.setDefaultTimeout(5000);errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await ready();
});
afterAll(async()=>{
  writeFileSync(join(evidence,'browser-assertions.json'),JSON.stringify({reports},null,2));
  if(context)await context.close();if(browser)await browser.close();if(server)await server.close();
});
describe('shared UI in real Chromium',{timeout:20_000},()=>{
  it('uses semantic layout, safe navigation for all roles, active links, callbacks and contextual counts',async()=>{
    await browserExpect(page.getByRole('banner')).toBeVisible();await browserExpect(page.getByRole('main')).toBeVisible();await browserExpect(page.getByRole('contentinfo')).toBeVisible();
    for(const state of ['loading','unauthenticated','unverified','member','admin']){
      await role(state);
      const member=state==='member'||state==='admin';
      await browserExpect(page.getByRole('navigation',{name:'Ana gezinme'})).toHaveCount(member?1:0);
      await browserExpect(page.getByRole('link',{name:'Onay Masası'})).toHaveCount(state==='admin'?1:0);
      if(state==='loading')await browserExpect(page.getByRole('status').filter({hasText:'Oturum yükleniyor'})).toBeVisible();
    }
    await browserExpect(page.getByRole('link',{name:'Sunum Arşivi',exact:true})).not.toHaveAttribute('aria-current','page');
    await page.getByRole('link',{name:'Benim Sunumlarım',exact:true}).click();
    await browserExpect(page.getByRole('link',{name:'Benim Sunumlarım',exact:true})).toHaveAttribute('aria-current','page');
    await page.getByRole('link',{name:'Sunum Arşivi',exact:true}).click();
    await browserExpect(page.getByRole('link',{name:'Sunum Arşivi',exact:true})).toHaveAttribute('aria-current','page');
    await page.getByLabel('Hesap menüsü').click(); await page.getByRole('button',{name:'Çıkış Yap'}).focus();await page.evaluate(()=>(window as unknown as HarnessWindow).ui.setPending(7));
    await browserExpect(page.getByRole('status').filter({hasText:'Onay bekleyen 7 sunum var.'})).toHaveCount(1);
    await browserExpect(page.getByRole('button',{name:'Çıkış Yap'})).toBeFocused();await page.keyboard.press('Enter');await browserExpect(page.locator('#calls')).toHaveText('signout');
    await role('unauthenticated');await page.getByRole('button',{name:'Giriş Yap'}).click();await browserExpect(page.locator('#calls')).toHaveText('signin');
    const skipGeometry=[];
    await role('admin');
    for(const width of [1280,375]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.getByRole('link',{name:'Ana içeriğe geç'}).focus();await page.keyboard.press('Enter');await browserExpect(page.getByRole('main')).toBeFocused();
      await browserExpect.poll(()=>page.evaluate(()=>{const banner=document.querySelector('header')!.getBoundingClientRect(),heading=document.querySelector('main h1')!.getBoundingClientRect();return heading.top>=Math.max(0,banner.bottom) && heading.bottom<=innerHeight;})).toBe(true);
      skipGeometry.push(await page.evaluate(()=>({width:innerWidth,headerBottom:document.querySelector('header')!.getBoundingClientRect().bottom,headingTop:document.querySelector('main h1')!.getBoundingClientRect().top,headingBottom:document.querySelector('main h1')!.getBoundingClientRect().bottom,scrollY})));
    }
    reports.push({check:'keyboard skip keeps main heading unobscured with measured banner offset',skipGeometry,passed:true});
    reports.push({check:'layout/auth roles, route active state, callbacks, pending announcements, skip link',passed:true});expect(errors).toEqual([]);
  });
  it('renders safe card metadata and keyboard actions, recovers failed binary covers and revokes URLs',async()=>{
    const cards=page.getByRole('article');await browserExpect(cards).toHaveCount(4);
    for(const text of ['Yayında','Onay Bekliyor','Reddedildi','Yayından Kaldırıldı'])await browserExpect(cards.getByText(text,{exact:true})).toBeVisible();
    await browserExpect(cards.getByText('PPTX',{exact:true})).toBeVisible();await browserExpect(cards.getByText('Ret notu: <b>İçeriği güncelleyin</b>',{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>Reflect.get(window,'untrusted'))).toBeUndefined();expect(await page.locator('iframe').count()).toBe(0);
    await cards.first().getByRole('button',{name:'Düzenle'}).focus();await page.keyboard.press('Enter');await browserExpect(page.locator('#calls')).toHaveText('edit');
    await cards.first().locator('h2').getByRole('link').focus();expect(await cards.first().locator('h2').getByRole('link').evaluate(node=>getComputedStyle(node).outlineWidth)).toBe('2px');await page.keyboard.press('Enter');await browserExpect(page).toHaveURL(/\/s\/test-deck$/);
    await browserExpect(cards.first().getByRole('img')).toHaveAttribute('src',/^data:image/);
    const binary=cards.last();const height=await binary.locator('.card-stage').evaluate(node=>node.getBoundingClientRect().height);
    await page.evaluate(()=>(window as unknown as HarnessWindow).ui.setBytes([1,2,3]));
    // Wait for the effect to actually attempt the corrupt binary, rather than
    // accepting a transient fallback before React commits the object URL.
    await browserExpect.poll(()=>page.evaluate(()=>(window as unknown as HarnessWindow).metrics.urls.length)).toBe(1);
    await browserExpect(binary.getByRole('img',{name:/kapak görseli yok/})).toBeVisible();
    await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;const ctx=canvas.getContext('2d')!;ctx.fillStyle='blue';ctx.fillRect(0,0,10,10);const raw=atob(canvas.toDataURL('image/webp').split(',')[1]);(window as unknown as HarnessWindow).ui.setBytes(Array.from(raw,c=>c.charCodeAt(0)));});
    await browserExpect(binary.locator('img')).toBeVisible();await browserExpect(binary.locator('img')).not.toHaveAttribute('aria-hidden','true');
    expect(await binary.locator('img').evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(10);
    expect(await binary.locator('.card-stage').evaluate(node=>node.getBoundingClientRect().height)).toBe(height);
    await page.evaluate(()=>(window as unknown as HarnessWindow).ui.setCards(false));await browserExpect(cards).toHaveCount(0);
    const counts=await page.evaluate(()=>{const m=(window as unknown as HarnessWindow).metrics;return{created:m.urls.length,revoked:m.revoked.length};});expect(counts).toEqual({created:2,revoked:2});reports.push({check:'cards and fail→valid cover replacement/unmount',counts,passed:true});expect(errors).toEqual([]);
  });
  it('contains modal focus in both directions, blocks background/scroll, distinguishes backdrop, restores trigger and cleans unmount',async()=>{
    const trigger=page.locator('#modal-trigger');await trigger.click();
    const dialog=page.getByRole('dialog',{name:'Sunumu gözden geçir'});await browserExpect(dialog).toBeVisible();await browserExpect(page.locator('#note')).toBeFocused();
    await browserExpect(dialog).toHaveAttribute('aria-describedby',/.+/);
    await page.locator('#modal-last').focus();await page.keyboard.press('Tab');await browserExpect(page.getByRole('button',{name:'Pencereyi kapat'})).toBeFocused();await page.keyboard.press('Shift+Tab');await browserExpect(page.locator('#modal-last')).toBeFocused();
    expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
    await page.evaluate(()=>document.querySelector<HTMLElement>('#toast-trigger')!.focus());expect(await page.evaluate(()=>document.activeElement?.id)).not.toBe('toast-trigger');
    await dialog.locator('.modal-header').click();await browserExpect(dialog).toBeVisible();await page.mouse.click(5,5);await browserExpect(dialog).toBeVisible();
    await page.keyboard.press('Escape');await browserExpect(dialog).toHaveCount(0);await browserExpect(trigger).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
    await page.evaluate(()=>(window as unknown as HarnessWindow).ui.setBackdrop(true));await trigger.click();await dialog.locator('.modal-header').click();await browserExpect(dialog).toBeVisible();await page.mouse.click(5,5);await browserExpect(dialog).toHaveCount(0);await browserExpect(trigger).toBeFocused();
    await page.evaluate(()=>document.body.style.overflow='auto');await trigger.click();await page.evaluate(()=>(window as unknown as HarnessWindow).ui.setMounted(false));await browserExpect(dialog).toHaveCount(0);await browserExpect(trigger).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).toBe('auto');
    reports.push({check:'modal focus, native background exclusion, backdrop/Escape and unmount cleanup',passed:true});expect(errors).toEqual([]);
  });
  it('announces multiple stable toasts without focus theft, pauses on hover/focus, preserves errors and clears timers',async()=>{
    const trigger=page.locator('#toast-trigger');await trigger.focus();
    const ids=await page.evaluate(()=>{const api=(window as unknown as HarnessWindow).ui;return [api.notify({message:'Otomatik mesaj',kind:'info',duration:1500}),api.notify({message:'Kalıcı hata',kind:'error',duration:350})];});expect(new Set(ids).size).toBe(2);
    const info=page.locator(`[data-toast-id="${ids[0]}"]`),error=page.locator(`[data-toast-id="${ids[1]}"]`);
    await browserExpect(trigger).toBeFocused();await browserExpect(info.getByRole('status')).toHaveText('Bilgi: Otomatik mesaj');await browserExpect(error.getByRole('alert')).toHaveText('Hata: Kalıcı hata');
    await info.hover();await page.waitForTimeout(1800);await browserExpect(info).toBeVisible();await info.getByRole('button').focus();await page.mouse.move(0,0);await page.waitForTimeout(1800);await browserExpect(info).toBeVisible();
    await trigger.focus();await browserExpect(info).toHaveCount(0,{timeout:3000});await browserExpect(error).toBeVisible();await error.getByRole('button').click();await browserExpect(error).toHaveCount(0);
    await trigger.click();await browserExpect(page.getByRole('status').filter({hasText:'Başarılı: Sunum kaydedildi'})).toBeVisible();
    expect(await page.evaluate(()=>(window as unknown as HarnessWindow).metrics.timers.size)).toBe(1);
    await page.evaluate(()=>(window as unknown as HarnessWindow).unmountUI());expect(await page.evaluate(()=>(window as unknown as HarnessWindow).metrics.timers.size)).toBe(0);
    reports.push({check:'toast announcements, stable IDs, pauses, auto-dismiss, error persistence and timer cleanup',passed:true});expect(errors).toEqual([]);
  });
  it('follows system, persists explicit theme across reload, synchronizes storage and removes listeners',async()=>{
    await syncTheme('dark');expect(await page.evaluate(()=>(window as unknown as HarnessWindow).prepaintTheme)).toBe('dark');
    await page.emulateMedia({colorScheme:'light'});await syncTheme('light');await theme('dark');await page.emulateMedia({colorScheme:'dark'});await page.emulateMedia({colorScheme:'light'});await syncTheme('dark');
    await page.reload();await ready();await syncTheme('dark');expect(await page.evaluate(()=>(window as unknown as HarnessWindow).prepaintTheme)).toBe('dark');
    const sibling=await context.newPage();await sibling.goto(url);await sibling.evaluate(()=>localStorage.setItem('vektor-theme','light'));await syncTheme('light');await sibling.close();
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'vektor-theme',newValue:'invalid'})));await browserExpect(page.locator('#theme-state')).toHaveText('system/light');
    await page.evaluate(()=>localStorage.setItem('vektor-theme','invalid'));await page.reload();await ready();await syncTheme('light');expect(await page.evaluate(()=>(window as unknown as HarnessWindow).prepaintTheme)).toBe('light');
    await page.getByRole('button',{name:'Koyu temaya geç'}).click();await syncTheme('dark');await theme('system');await syncTheme('light');expect(await page.evaluate(()=>localStorage.getItem('vektor-theme'))).toBeNull();
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:null})));await syncTheme('light');
    await page.evaluate(()=>(window as unknown as HarnessWindow).unmountUI());
    const listeners=await page.evaluate(()=>{const m=(window as unknown as HarnessWindow).metrics;return {storage:m.storage,media:m.media};});expect(listeners).toEqual({storage:0,media:0});
    await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'vektor-theme',newValue:'dark'})));await syncTheme('light');
    reports.push({check:'theme system/explicit/reload/storage changes/listener cleanup',listeners,passed:true});expect(errors).toEqual([]);
  });
  it('survives denied storage reads/writes including an external event',async()=>{
    await context.addInitScript(()=>Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Denied','SecurityError');}}));
    await page.reload();await ready();await syncTheme('dark');await theme('light');await syncTheme('light');await page.emulateMedia({colorScheme:'dark'});await syncTheme('light');
    await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'vektor-theme',newValue:'dark',storageArea:sessionStorage})));await syncTheme('dark');await theme('system');await syncTheme('dark');
    reports.push({check:'storage SecurityError guard, in-memory preference and external event',passed:true});expect(errors).toEqual([]);
  });
  it('captures implemented UI at 375px and desktop in both themes, modal/landscape/reduced-motion and contrast',async()=>{
    const contrastResults:object[]=[];
    for(const width of [375,1280])for(const mode of ['light','dark'] as const){
      await page.setViewportSize({width,height:900});await theme(mode);await syncTheme(mode);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      const bannerBounds=await page.getByRole('banner').evaluate(node=>{const parent=node.getBoundingClientRect();return Array.from(node.querySelectorAll('a,button,.vektor-user')).filter(child => child.getClientRects().length > 0 && !child.closest('.theme-menu-panel, .account-menu-panel')).every(child=>{const box=child.getBoundingClientRect();return box.top>=parent.top && box.bottom<=parent.bottom;});});expect(bannerBounds).toBe(true);
      if (await page.locator('.account-menu:not([open])').count()) await page.getByLabel('Hesap menüsü').click(); await browserExpect(page.locator('.vektor-user')).toHaveAttribute('title','UzunKullanıcıAdı'.repeat(12));
      const userGeometry=await page.locator('.vektor-user').evaluate(node=>({height:node.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(node).lineHeight),clipped:node.scrollWidth>node.clientWidth,headerHeight:document.querySelector('header')!.getBoundingClientRect().height,singleRowHeaderHeight:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'))}));
      expect(userGeometry.height).toBeLessThanOrEqual(userGeometry.lineHeight);expect(userGeometry.clipped).toBe(true);
      if(width===1280)expect(userGeometry.headerHeight).toBeLessThanOrEqual(userGeometry.singleRowHeaderHeight + 16);
      expect(await page.evaluate(()=>document.querySelector('main')!.getBoundingClientRect().top>=document.querySelector('header')!.getBoundingClientRect().bottom)).toBe(true);
      for(const control of await page.getByRole('banner').getByRole('button').all())expect(await control.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      const contrast=await page.locator('.card-status-badge, .vektor-cover-fallback').evaluateAll(nodes=>nodes.map(node=>{
        const c=getComputedStyle(node);const rgba=(value:string)=>value.match(/[\d.]+/g)!.map(Number);const fg=rgba(c.color);let alpha=0;const rgb=[0,0,0];for(let ancestor:Element|null=node;ancestor&&alpha<1;ancestor=ancestor.parentElement){const bg=rgba(getComputedStyle(ancestor).backgroundColor),a=bg[3]??1;for(let i=0;i<3;i++)rgb[i]+=bg[i]*a*(1-alpha);alpha+=a*(1-alpha);}const lum=(values:number[])=>values.slice(0,3).map(v=>{const x=v/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);const a=lum(fg),b=lum(rgb);return{label:node.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
      }));for(const item of contrast)expect(item.ratio).toBeGreaterThanOrEqual(4.5);contrastResults.push({width,mode,contrast,userGeometry});
      await page.screenshot({path:join(evidence,`ui-${width}-${mode}.png`),fullPage:true});
    }
    await page.setViewportSize({width:375,height:667});await page.locator('#modal-trigger').click();await browserExpect(page.getByRole('dialog')).toBeVisible();
    expect(await page.locator('.modal-body').evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);await page.screenshot({path:join(evidence,'ui-modal-375-dark.png'),fullPage:true});await page.keyboard.press('Escape');
    await page.setViewportSize({width:667,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.emulateMedia({reducedMotion:'reduce'});const duration=await page.locator('.deck-card').first().evaluate(node=>getComputedStyle(node).transitionDuration);expect(duration.split(',').every(v=>parseFloat(v)<=.00001)).toBe(true);
    reports.push({check:'four screenshots, modal scrolling, no overflow, targets, landscape, reduced motion, AA status/fallback text, banner containment/main separation',contrastResults,passed:true});expect(errors).toEqual([]);
  });
});
