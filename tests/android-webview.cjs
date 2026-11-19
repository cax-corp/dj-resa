const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'});try{
 const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='backend.test'){const body=r.request().postDataJSON();return body.metadata?r.fulfill({json:{name:'Plan.pdf',mime_type:'application/pdf'}}):r.fulfill({contentType:'application/pdf',body:'%PDF-1.4 demo'});}return r.fulfill({contentType:'text/html',body:'<!doctype html><html data-theme="light"><body><main id="app"><input id="draft" value="Saisie intacte"></main><div id="syntra-screensaver" hidden></div></body></html>'});});
 await p.goto('https://cax-corp.github.io/dj-resa/#/projet/test');
 await p.addScriptTag({path:path.join(root,'android/app/src/main/assets/native.js')});
 await p.evaluate(()=>{
  window.nativeEvents=[];window.finished=[];window.transfers={};
  const channel=new MessageChannel();window.mockNative=channel.port1;
  channel.port1.onmessage=e=>{
   const m=JSON.parse(e.data);nativeEvents.push(m);
   if(m.type==='file-start')transfers[m.id]={...m,parts:[]};
   if(m.type==='file-chunk')transfers[m.id].parts.push(m.data);
   if(m.type==='file-end'){const f=transfers[m.id];f.content=f.parts.map(p=>atob(p)).join('');finished.push(f);}
   if(m.seq)channel.port1.postMessage(JSON.stringify({seq:m.seq}));
  };
  window.postMessage('syntra-native-connect',location.origin,[channel.port2]);
 });
 await p.waitForFunction(()=>nativeEvents.some(e=>e.type==='theme'));
 await p.evaluate(()=>{
  const a=document.createElement('a');a.download='invités.csv';a.href=URL.createObjectURL(new Blob(['Nom;Table\nLola;3'],{type:'text/csv'}));a.click();
 });
 await p.waitForFunction(()=>finished.length===1);
 let f=await p.evaluate(()=>finished[0]);assert.equal(f.name,'invités.csv');assert.equal(f.open,false);assert.equal(f.content,'Nom;Table\nLola;3');
 // Larger than two chunks; no lossy string conversion or truncated binary bytes.
 await p.evaluate(()=>{const bytes=new Uint8Array(500000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;window.__syntraOpenDocument(URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),'Gros plan.pdf')});
 await p.waitForFunction(()=>finished.length===2);
 f=await p.evaluate(()=>({name:finished[1].name,open:finished[1].open,length:finished[1].content.length,chunks:finished[1].parts.length,valid:[...finished[1].content].every((c,i)=>c.charCodeAt(0)===i%251)}));
 assert.deepEqual(f,{name:'Gros plan.pdf',open:true,length:500000,chunks:3,valid:true});
 await p.evaluate(()=>{document.documentElement.dataset.theme='dark';document.getElementById('syntra-screensaver').hidden=false;window.print()});
 await p.waitForFunction(()=>nativeEvents.some(e=>e.type==='screensaver'&&e.active)&&nativeEvents.some(e=>e.type==='print')&&nativeEvents.some(e=>e.type==='theme'&&e.dark));
 await p.evaluate(()=>navigator.clipboard.writeText('https://syntra.test/projet'));
 assert(await p.evaluate(()=>nativeEvents.some(e=>e.type==='clipboard'&&e.text==='https://syntra.test/projet')));
 assert.equal(await p.locator('#draft').inputValue(),'Saisie intacte');
 await p.evaluate(()=>{
  window.app=document.getElementById('app');window.esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  window.sb={auth:{getSession:async()=>({data:{session:null}})}};window.SUPABASE_URL='https://backend.test';window.SUPABASE_ANON_KEY='test';
 });
 await p.addScriptTag({path:path.join(root,'document-viewer.js')});
 await p.evaluate(()=>DocumentViewer.open({id:'doc'}));
 await p.waitForFunction(()=>finished.length===3);
 f=await p.evaluate(()=>finished[2]);assert.equal(f.name,'Plan.pdf');assert.equal(f.mime,'application/pdf');assert(f.open);assert.equal(f.content,'%PDF-1.4 demo');
 assert(p.url().startsWith('https://cax-corp.github.io/dj-resa/'),'Keep the authenticated site mounted');
 assert(await p.locator('#android-open-document').isVisible());
 await p.locator('#android-open-document').click();await p.waitForFunction(()=>finished.length===4);
 assert.deepEqual(errors,[]);
 console.log('Android web integration: detached downloads, UTF-8 names, binary chunk/ack transfers, native print, theme, screensaver and PDF open/reopen verified without navigating away.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
