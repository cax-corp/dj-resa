(() => {
  if (window.__syntraAndroidInstalled) return;
  window.__syntraAndroidInstalled = true;
  let port;
  const pending = new Map();
  const queued = [];
  const MAX = 64 * 1024 * 1024;
  let sequence = 0;
  function send(message) {
    return new Promise((resolve, reject) => {
      const seq = ++sequence;
      const timeout = setTimeout(() => { pending.delete(seq); reject(new Error('Android ne répond pas.')); }, 30000);
      pending.set(seq, { resolve, reject, timeout });
      message.seq = seq;
      const value = JSON.stringify(message);
      if (port) port.postMessage(value); else queued.push(value);
    });
  }
  function notify(message) { if (port) port.postMessage(JSON.stringify(message)); }
  function theme() { notify({ type:'theme', dark:document.documentElement.dataset.theme === 'dark' }); }
  function saver() { const screen=document.getElementById('syntra-screensaver'); notify({type:'screensaver',active:!!screen&&!screen.hidden}); }
  const screen=document.getElementById('syntra-screensaver');
  if(screen)new MutationObserver(saver).observe(screen,{attributes:true,attributeFilter:['hidden']});
  addEventListener('message', function connect(event) {
    if (event.data !== 'syntra-native-connect' || event.ports.length !== 1 || (event.source && event.source !== window)) return;
    if(port)port.close();
    port = event.ports[0];
    port.onmessage = e => {
      let result; try { result=JSON.parse(e.data); } catch { return; }
      const callback = pending.get(result.seq);
      if (!callback) return;
      clearTimeout(callback.timeout); pending.delete(result.seq);
      result.error ? callback.reject(new Error(result.error)) : callback.resolve(result);
    };
    for (const value of queued.splice(0)) port.postMessage(value);
    theme();saver();
  });
  new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  function fileName(url, mime) {
    if (mime.includes('pdf')) return 'document.pdf';
    if (mime.includes('png')) return 'image.png';
    if (mime.includes('csv')) return 'export.csv';
    try { const value = new URL(url).pathname.split('/').pop(); if(value && !url.startsWith('blob:')) return decodeURIComponent(value); } catch {}
    return 'document';
  }
  async function transfer(url, name, open) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Téléchargement indisponible.');
    const blob = await response.blob();
    if (blob.size > MAX) throw new Error('Ce fichier dépasse la limite de 64 Mo de l’application.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    await send({type:'file-start', id, name:name || fileName(url,blob.type), mime:blob.type || 'application/octet-stream', size:bytes.length, open:!!open});
    for (let start=0;start<bytes.length;start+=196608) {
      const chunk=bytes.subarray(start,start+196608);
      let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
      await send({type:'file-chunk',id,data:btoa(binary)});
    }
    await send({type:'file-end',id});
  }
  function start(url,name,open) {
    transfer(url,name,open).catch(error=>notify({type:'notice',message:error.message || 'Impossible de récupérer le fichier.'}));
  }
  // Used only by the app to intercept its own blob document navigations.
  window.__syntraOpenDocument = (url,name) => start(url,name||'',true);
  const originalClick = HTMLAnchorElement.prototype.click;
  function handle(anchor) {
    const url=anchor.href;
    if (anchor.hasAttribute('download') && (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('https:'))) {
      start(url,anchor.download,false); return true;
    }
    return false;
  }
  HTMLAnchorElement.prototype.click = function() { if(!handle(this))return originalClick.call(this); };
  document.addEventListener('click', event=>{
    const anchor=event.target.closest?.('a');
    if(anchor && handle(anchor)){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  try {
    const clipboard = navigator.clipboard || {};
    Object.defineProperty(clipboard,'writeText',{configurable:true,value:text=>send({type:'clipboard',text:String(text)})});
    if(!navigator.clipboard)Object.defineProperty(navigator,'clipboard',{configurable:true,value:clipboard});
  } catch {}
  window.print = () => notify({type:'print'});
  window.dispatchEvent(new Event('syntra:android-ready'));
})();
