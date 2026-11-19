const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require('playwright');const root=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='syntra.test')return r.abort();if(u.pathname.endsWith('.js')&&!['/brand-motion.js','/screensaver.js'].includes(u.pathname))return r.fulfill({contentType:'application/javascript',body:''});const f=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));return fs.existsSync(f)?r.fulfill({path:f}):r.abort();});
 await p.goto('http://syntra.test/#/compte');await p.evaluate(()=>{
  document.getElementById('app').innerHTML='<input id="draft" value="Projet intact">'+BrandMotion.settings();
  document.getElementById('syntra-screensaver').requestFullscreen=()=>Promise.reject(new Error('Unsupported'));
 });
 assert.equal(await p.locator('[data-brand-motion="favicon"][value="immersive"]').count(),0);
 assert.equal(await p.locator('[data-brand-motion="screensaver"][value="immersive"]').count(),1);
 await p.evaluate(()=>{BrandMotion.set('favicon','immersive')});assert.equal(await p.evaluate(()=>BrandMotion.get('favicon')),'sheen');
 await p.locator('[data-brand-motion="screensaver"][value="immersive"]').check();
 for(const size of [{width:1440,height:900},{width:390,height:844}]){
  await p.setViewportSize(size);await p.locator('[data-test-screensaver]').click();
  const image=p.locator('.syntra-screensaver-logo');await image.evaluate(i=>i.decode());await p.waitForTimeout(400);
  const box=await image.boundingBox();assert.equal(box.width,size.width);assert.equal(box.height,size.height);
  await p.mouse.move(2,2);assert(await p.locator('#syntra-screensaver').isVisible());
  await p.screenshot({path:`/workspace/work/immersive-live-${size.width}.png`});
  await p.mouse.click(size.width/2,size.height/2);assert(!(await p.locator('#syntra-screensaver').isVisible()));
  assert.equal(await p.locator('#draft').inputValue(),'Projet intact');assert(p.url().endsWith('#/compte'));
 }
 await p.evaluate(()=>BrandMotion.set('screensaver','sheen'));await p.click('#screensaver-toggle');
 assert.equal(await p.locator('#syntra-screensaver').getAttribute('data-scene'),'logo');
 assert((await p.locator('.syntra-screensaver-logo').boundingBox()).width<300);await p.keyboard.press('Escape');
 // The same vector asset provides a composed static scene for reduced motion.
 await p.setViewportSize({width:900,height:600});await p.setContent(fs.readFileSync(path.join(root,'assets/motion/immersive-logo.svg'),'utf8'));
 const svg=p.locator('svg').first();await svg.evaluate(s=>{s.pauseAnimations();s.setCurrentTime(0)});const before=await p.screenshot();
 await svg.evaluate(s=>s.setCurrentTime(12));const after=await p.screenshot();assert(!before.equals(after),'Ribbons must move');
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.scene-live').evaluate(e=>getComputedStyle(e).display),'none');
 assert.notEqual(await p.locator('.scene-static').evaluate(e=>getComputedStyle(e).display),'none');assert.deepEqual(errors,[]);
 console.log('Immersive screensaver: screensaver-only preference, full viewport on desktop/mobile, animated ribbons, click exit, unchanged draft/route, return to logo styles and reduced motion verified.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
