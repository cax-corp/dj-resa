const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const{chromium}=require('playwright');const root=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});try{
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='syntra.test')return r.abort();if(u.pathname.endsWith('.js')&&!['/brand-motion.js','/screensaver.js'].includes(u.pathname))return r.fulfill({contentType:'application/javascript',body:''});const f=path.join(root,u.pathname==='/'?'index.html':u.pathname.slice(1));return fs.existsSync(f)?r.fulfill({path:f}):r.abort();});
 await p.goto('http://syntra.test/#/compte');await p.evaluate(()=>{
  document.getElementById('app').innerHTML='<input id="draft" value="Projet intact">'+BrandMotion.settings();
  document.getElementById('syntra-screensaver').requestFullscreen=()=>Promise.reject(new Error('Unsupported'));
 });
 assert.equal(await p.locator('[data-brand-motion="favicon"][value="kinetic"]').count(),0);
 assert.equal(await p.locator('[data-brand-motion="screensaver"][value="kinetic"]').count(),1);
 await p.evaluate(()=>{BrandMotion.set('favicon','kinetic')});assert.equal(await p.evaluate(()=>BrandMotion.get('favicon')),'sheen');
 await p.locator('[data-brand-motion="screensaver"][value="kinetic"]').check();
 for(const size of [{width:1440,height:900},{width:390,height:844}]){
  await p.setViewportSize(size);await p.locator('[data-test-screensaver]').click();
  const image=p.locator('.syntra-screensaver-logo');await image.evaluate(i=>i.decode());await p.waitForTimeout(400);
  const box=await image.boundingBox();assert.equal(box.width,size.width);assert.equal(box.height,size.height);
  await p.mouse.move(2,2);assert(await p.locator('#syntra-screensaver').isVisible());
  await p.screenshot({path:`/workspace/work/kinetic-live-${size.width}.png`});
  await p.mouse.click(size.width/2,size.height/2);assert(!(await p.locator('#syntra-screensaver').isVisible()));
  assert.equal(await p.locator('#draft').inputValue(),'Projet intact');assert(p.url().endsWith('#/compte'));
 }
 await p.evaluate(()=>BrandMotion.set('screensaver','sheen'));await p.click('#screensaver-toggle');
 assert.equal(await p.locator('#syntra-screensaver').getAttribute('data-scene'),'logo');
 assert((await p.locator('.syntra-screensaver-logo').boundingBox()).width<300);await p.keyboard.press('Escape');
 // The same vector asset provides a composed static scene for reduced motion.
 await p.setViewportSize({width:900,height:600});await p.setContent(fs.readFileSync(path.join(root,'assets/motion/kinetic-logo.svg'),'utf8'));
 const svg=p.locator('svg').first();await svg.evaluate(s=>{s.pauseAnimations();s.setCurrentTime(0)});const before=await p.screenshot();
 await svg.evaluate(s=>s.setCurrentTime(7.5));const mosaic=await p.screenshot();
 await svg.evaluate(s=>s.setCurrentTime(13.5));const diagonals=await p.screenshot();
 assert(!before.equals(mosaic)&&!mosaic.equals(diagonals),'The compositions must differ');
 await svg.evaluate(s=>s.setCurrentTime(19.5));const waves=await p.screenshot();
 assert(!diagonals.equals(waves),'Fourth pattern must differ');
 await svg.evaluate(s=>s.setCurrentTime(.8));const moving=await p.screenshot();
 assert(!before.equals(moving),'Movement must begin in the first second');
 await svg.evaluate(s=>s.setCurrentTime(24));const loop=await p.screenshot();
 assert(before.equals(loop),'The 24-second loop must return to its initial composition');
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.kinetic-live').evaluate(e=>getComputedStyle(e).display),'none');
 assert.notEqual(await p.locator('.kinetic-static').evaluate(e=>getComputedStyle(e).display),'none');assert.deepEqual(errors,[]);
 console.log('Kinetic screensaver: screensaver-only preference, full viewport on desktop/mobile, four patterns and seamless 24-second loop, click exit, unchanged draft/route, return to logo styles and reduced motion verified.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
