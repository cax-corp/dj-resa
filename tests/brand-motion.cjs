const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const b=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});
 try{
  const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{window.testVisibility='visible';Object.defineProperty(document,'visibilityState',{get:()=>window.testVisibility});});
  await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='syntra.test')return r.abort();if(u.pathname.endsWith('.js')&&!['/brand-motion.js','/brand-icons.js','/favicon-clock.js','/screensaver.js'].includes(u.pathname))return r.fulfill({contentType:'application/javascript',body:''});const f=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));return fs.existsSync(f)?r.fulfill({path:f}):r.abort();});
  const mount=()=>p.evaluate(()=>{
   document.body.dataset.workspace='true';document.getElementById('app').innerHTML='<h1>Mon compte</h1><input id="draft" value="Brouillon intact">'+BrandMotion.settings();
   document.getElementById('syntra-screensaver').requestFullscreen=()=>Promise.reject(new Error('Test fallback'));
  });
  await p.goto('http://syntra.test/#/compte');await mount();
  assert.equal(await p.locator('[data-brand-motion]').count(),21);
  assert.equal(await p.locator('[data-brand-motion]:checked').count(),2);
  const modes=['sheen','contour','breathe','scan','duet','reveal','line-draw','line-flow','line-build','line-wave'];
  for(const mode of modes){
   await p.locator(`[data-brand-motion="favicon"][value="${mode}"]`).check();
   assert.equal(await p.evaluate(()=>BrandMotion.get('screensaver')),'sheen','Selections must be independent');
   await p.evaluate(()=>{window.testVisibility='hidden';document.dispatchEvent(new Event('visibilitychange'));});
   await p.waitForFunction(()=>document.querySelectorAll('link[rel="icon"]').length===1&&document.querySelector('link[rel="icon"]').href.startsWith('data:image/png'));
   await p.evaluate(()=>{window.testVisibility='visible';document.dispatchEvent(new Event('visibilitychange'));});
   assert.equal(await p.locator('link[rel="icon"]').count(),3);
  }
  for(const mode of [...modes,'immersive']){
   await p.locator(`[data-brand-motion="screensaver"][value="${mode}"]`).check();
   await p.locator('[data-test-screensaver]').click();
   assert(await p.locator('#syntra-screensaver').isVisible());
   assert((await p.locator('.syntra-screensaver-logo').getAttribute('src')).includes(`/${mode}-logo.svg`));
   assert.equal(await p.locator('#syntra-screensaver').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
   await p.locator('#syntra-screensaver').click({position:{x:5,y:5}});
  }
  assert.equal(await p.locator('#draft').inputValue(),'Brouillon intact');
  await p.reload();await mount();
  assert.equal(await p.locator('[data-brand-motion="favicon"]:checked').inputValue(),'line-wave');
  assert.equal(await p.locator('[data-brand-motion="screensaver"]:checked').inputValue(),'immersive');
  await p.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'syntra.motion.screensaver',newValue:'contour'})));
  assert.equal(await p.locator('[data-brand-motion="screensaver"]:checked').inputValue(),'contour');
  await p.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'syntra.motion.favicon',newValue:'invalid'})));
  assert.equal(await p.evaluate(()=>BrandMotion.get('favicon')),'sheen');
  await p.setViewportSize({width:390,height:844});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.evaluate(()=>document.documentElement.dataset.theme='dark');
  await p.screenshot({path:'/workspace/work/brand-motion-settings-mobile.png',fullPage:true});
  await p.setViewportSize({width:1440,height:1100});await p.evaluate(()=>window.scrollTo(0,0));
  await p.screenshot({path:'/workspace/work/brand-motion-settings-desktop.png',fullPage:true});
  await p.evaluate(()=>Object.defineProperty(Storage.prototype,'setItem',{value(){throw Error('Storage disabled')}}));
  await p.locator('[data-brand-motion="favicon"][value="scan"]').check();
  assert.equal(await p.evaluate(()=>BrandMotion.get('favicon')),'scan');
  assert((await p.locator('#brand-motion-status').textContent()).includes('session'));
  assert.deepEqual(errors,[]);
  console.log('Brand motion: ten choices per use, all favicon sprites load, all screensaver modes open, independent persistence, storage sync/failure, intact draft and mobile layout verified.');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
