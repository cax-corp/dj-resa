/* Browser chrome follows the browser colour scheme, independently of the page theme. */
(() => {
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const staticIcons = [...document.querySelectorAll('link[rel="icon"]')];
  const animatedIcon = document.createElement('link');
  animatedIcon.rel = 'icon';
  animatedIcon.type = 'image/png';
  animatedIcon.sizes = '32x32';

  const frameCount = 64;
  const cycleMs = 8000;
  const framesPromises = new Map();
  let timer;
  let clock;
  let generation = 0;
  let suspended = false;
  let startedAt = 0;

  function update() {
    const theme = scheme.matches ? 'dark' : 'light';
    document.getElementById('syntra-touch-icon').href = `assets/syntra-icon-${theme}-180.png?v=3`;
    document.getElementById('syntra-manifest').href = scheme.matches ? 'site-dark.webmanifest?v=3' : 'site.webmanifest?v=3';
  }

  // Decode a small sprite once, then cache both colours. No canvas work in the timer.
  function prepareFrames(mode) {
    if (!framesPromises.has(mode)) {
      const promise = (async () => {
        const sprite = new Image();
        sprite.src = new URL(`assets/motion/${mode}-sprite.png?v=1`, document.baseURI).href;
        await sprite.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        const frames = { light: [], dark: [] };
        for (const theme of ['light', 'dark']) {
          for (let frame = 0; frame < frameCount; frame++) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, 32, 32);
            ctx.drawImage(sprite, frame * 32, 0, 32, 32, 0, 0, 32, 32);
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = theme === 'dark' ? '#ffffff' : '#000000';
            ctx.fillRect(0, 0, 32, 32);
            frames[theme].push(canvas.toDataURL('image/png'));
          }
        }
        return frames;
      })().catch(error => {
        framesPromises.delete(mode);
        throw error;
      });
      framesPromises.set(mode, promise);
    }
    return framesPromises.get(mode);
  }

  function shouldAnimate() {
    return document.visibilityState === 'hidden' && !reducedMotion.matches && !suspended;
  }

  function stop() {
    generation++;
    clearInterval(timer);
    if (clock) { clock.terminate(); clock = undefined; }
    timer = undefined;
    animatedIcon.remove();
    // Preserve the original SVG and PNG fallbacks, including their media queries.
    for (const icon of staticIcons) {
      if (!icon.isConnected) document.head.append(icon);
    }
  }

  async function sync() {
    stop();
    if (!shouldAnimate()) return;
    const token = generation;
    try {
      const mode = typeof BrandMotion === 'undefined' ? 'sheen' : BrandMotion.get('favicon');
      const frames = await prepareFrames(mode);
      if (token !== generation || !shouldAnimate()) return;
      startedAt = performance.now();
      function tick() {
        if (token !== generation || !shouldAnimate()) return;
        const frame = Math.floor(((performance.now() - startedAt) % cycleMs) / (cycleMs / frameCount));
        animatedIcon.href = frames[scheme.matches ? 'dark' : 'light'][frame];
        if (!animatedIcon.isConnected) {
          for (const icon of staticIcons) icon.remove();
          document.head.append(animatedIcon);
        }
      }
      tick();
      // Main-thread timers are clamped to ~1 Hz in background Chrome tabs.
      // A small dedicated clock keeps normal tab switches smoother; the browser
      // may still suspend workers when saving energy or freezing the page.
      try {
        clock = new Worker(new URL('favicon-clock.js?v=1', document.baseURI));
        clock.onmessage = () => tick();
        clock.onerror = event => {
          event.preventDefault();
          if (token !== generation) return;
          clock.terminate();
          clock = undefined;
          timer = setInterval(tick, 1000);
        };
        clock.postMessage('start');
      } catch {
        timer = setInterval(tick, 1000);
      }
    } catch {
      if (token === generation) stop();
    }
  }

  document.addEventListener('syntra:motion-change', event => { if(event.detail.scope === 'favicon') sync(); });
  update();
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  scheme.addEventListener('change', () => { update(); sync(); });
  addEventListener('pagehide', () => { suspended = true; stop(); });
  addEventListener('pageshow', () => { suspended = false; sync(); });
  sync();
})();
