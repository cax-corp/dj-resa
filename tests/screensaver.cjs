const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:'/usr/bin/chromium'});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.route('**/*', route=>{
      const url = new URL(route.request().url());
      if(url.hostname!=='syntra.test') return route.abort();
      if(url.pathname.endsWith('.js') && !['/screensaver.js','/brand-motion.js'].includes(url.pathname)) return route.fulfill({contentType:'application/javascript',body:''});
      const file=path.join(root,url.pathname==='/'?'index.html':url.pathname.slice(1));
      return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
    });
    await page.goto('http://syntra.test/#/projet/test?section=planning');
    await page.evaluate(()=>{
      document.body.dataset.workspace='true';
      document.querySelector('#app').innerHTML='<h1>Projet de test</h1><input id="draft" aria-label="Brouillon"><div style="height:2200px"></div>';
      document.querySelector('#logout').classList.remove('hidden');
      document.querySelector('#theme-toggle').textContent='☾';
    });
    await page.locator('#draft').fill('Saisie non enregistrée');
    const appNode=await page.locator('#app').elementHandle();
    const url=page.url();
    await page.evaluate(()=>window.scrollTo(0,600));
    const scroll=await page.evaluate(()=>scrollY);
    await page.click('#screensaver-toggle');
    await page.waitForFunction(()=>!document.getElementById('syntra-screensaver').hidden);
    await page.waitForTimeout(450);
    assert.equal(await page.locator('#syntra-screensaver').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
    assert.equal(await page.locator('#app').evaluate(e=>e.inert),true);
    await page.mouse.move(20,20); await page.waitForTimeout(150);
    assert.equal(await page.locator('#syntra-screensaver').isVisible(),true,'Hover must not close');
    await page.screenshot({path:'/workspace/work/screensaver-desktop.png'});
    const bounds=await page.locator('.syntra-screensaver-logo').boundingBox();
    const view=page.viewportSize();
    assert(Math.abs(bounds.x+bounds.width/2-view.width/2)<2);
    assert(Math.abs(bounds.y+bounds.height/2-view.height/2)<2);
    assert(bounds.width<=248);
    await page.mouse.click(25,25);
    await page.waitForFunction(()=>document.fullscreenElement===null && document.getElementById('syntra-screensaver').hidden);
    assert.equal(page.url(),url);
    assert.equal(await page.locator('#draft').inputValue(),'Saisie non enregistrée');
    assert.equal(await appNode.evaluate(e=>e===document.getElementById('app')),true);
    assert.equal(await page.locator('#app').evaluate(e=>e.inert),false);
    await page.waitForFunction(()=>document.activeElement.id==='screensaver-toggle');
    await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>scrollY),scroll);
    // Native fullscreen exit also restores the underlying page.
    await page.click('#screensaver-toggle');
    await page.waitForFunction(()=>document.fullscreenElement!==null);
    const before = await page.locator('.syntra-screensaver-logo').screenshot();
    await page.waitForTimeout(2100);
    const after = await page.locator('.syntra-screensaver-logo').screenshot();
    assert(!before.equals(after), 'The vector sheen must animate');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>document.getElementById('syntra-screensaver').hidden);
    // Keyboard exit and a browser without native fullscreen.
    await page.evaluate(()=>{ document.getElementById('syntra-screensaver').requestFullscreen=()=>Promise.reject(new Error('Unsupported')); });
    await page.click('#screensaver-toggle'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#syntra-screensaver').isVisible(),false);
    await page.setViewportSize({width:390,height:844});
    for (const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.click('#screensaver-toggle');
      await page.waitForTimeout(400);
      assert.equal(await page.locator('#syntra-screensaver').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
      const box=await page.locator('#screensaver-toggle').boundingBox();assert(box.x+box.width<=390);
      await page.screenshot({path:`/workspace/work/screensaver-mobile-${theme}.png`});
      await page.locator('#syntra-screensaver').click({position:{x:12,y:12}});
      assert.equal(page.url(),url);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.click('#screensaver-toggle');
    assert.equal(await page.locator('#syntra-screensaver').evaluate(e=>getComputedStyle(e).animationName),'none');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),'syntra-screensaver');
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#syntra-screensaver').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('Screensaver: native fullscreen and fallback, black light/dark/mobile, centered vector logo, click/Escape exit, hover ignored, draft/route/scroll/focus preserved, reduced motion verified.');
  } finally { await browser.close(); }
})().catch(e=>{ console.error(e); process.exitCode=1; });
