const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('</head>')[0] + '</head><body></body>';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testVisibility = 'visible';
      Object.defineProperty(document, 'visibilityState', { get: () => window.testVisibility });
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'syntra.test') return route.abort();
      if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname.endsWith('.js') && !['/brand-icons.js', '/favicon-clock.js'].includes(url.pathname)) return route.fulfill({ contentType: 'application/javascript', body: '' });
      const file = path.join(root, url.pathname.slice(1));
      return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
    });
    await page.goto('http://syntra.test/');
    const iconState = () => page.locator('link[rel="icon"]').evaluateAll(nodes => nodes.map(n => ({ href: n.getAttribute('href'), media: n.media })));
    const originals = await iconState();
    assert.equal(originals.length, 3);
    const visibility = state => page.evaluate(value => {
      window.testVisibility = value;
      document.dispatchEvent(new Event('visibilitychange'));
    }, state);
    const waitAnimated = () => page.waitForFunction(() => document.querySelectorAll('link[rel="icon"]').length === 1 && document.querySelector('link[rel="icon"]').href.startsWith('data:image/png'));
    await visibility('hidden');
    await waitAnimated();
    await page.evaluate(() => {
      window.frameChanges = [];
      new MutationObserver(events => {
        for (const event of events) if (event.attributeName === 'href') window.frameChanges.push(performance.now());
      }).observe(document.querySelector('link[rel="icon"]'), { attributes: true });
    });
    const first = (await iconState())[0].href;
    await page.waitForFunction(old => document.querySelector('link[rel="icon"]').href !== old, first);
    async function pixelColour() {
      return page.evaluate(async () => {
        const image = new Image(); image.src = document.querySelector('link[rel="icon"]').href; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, 32, 32).data;
        let coloured = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 30) { coloured++; if (pixels[i] !== pixels[i + 1] || pixels[i] !== pixels[i + 2]) throw Error('Non-monochrome icon'); }
        const first = [...pixels].findIndex((_, i) => i % 4 === 3 && pixels[i] > 30) - 3;
        return { rgb: [...pixels.slice(first, first + 3)], transparentCorner: pixels[3] === 0, coloured };
      });
    }
    await page.waitForFunction(() => window.frameChanges.length >= 7);
    const cadence = await page.evaluate(() => {
      const t = window.frameChanges;
      return (t[t.length - 1] - t[0]) / (t.length - 1);
    });
    assert(cadence < 220, `Worker cadence too slow: ${cadence} ms`);
    console.log(`Worker cadence in Chromium test: ${Math.round(cadence)} ms between frame updates.`);
    let pixels = await pixelColour();
    assert.deepEqual(pixels.rgb, [0, 0, 0]); assert(pixels.transparentCorner && pixels.coloured > 40);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.getElementById('syntra-touch-icon').href.includes('-dark-180'));
    await waitAnimated();
    pixels = await pixelColour(); assert.deepEqual(pixels.rgb, [255, 255, 255]);
    assert((await page.locator('#syntra-touch-icon').getAttribute('href')).includes('-dark-180'));
    await visibility('visible'); assert.deepEqual(await iconState(), originals);
    await page.waitForTimeout(40); assert.equal(page.workers().length, 0, 'Clock must stop on return');
    await page.waitForTimeout(450); assert.deepEqual(await iconState(), originals);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await visibility('hidden');
    await page.waitForTimeout(250); assert.deepEqual(await iconState(), originals);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await waitAnimated();
    await page.evaluate(() => dispatchEvent(new Event('pagehide'))); assert.deepEqual(await iconState(), originals);
    await page.evaluate(() => dispatchEvent(new Event('pageshow'))); await waitAnimated();
    await visibility('visible');
    // A failed sprite load must leave all original favicon fallbacks intact.
    await page.route('**/favicon-contour-sprite.png*', route => route.abort());
    await page.reload(); await visibility('hidden'); await page.waitForTimeout(300);
    assert.deepEqual(await iconState(), originals);
    await page.unroute('**/favicon-contour-sprite.png*');
    await page.route('**/favicon-clock.js*', route => route.abort());
    await page.reload(); await visibility('hidden'); await waitAnimated();
    const fallbackFirst = (await iconState())[0].href;
    await page.waitForFunction(previous => document.querySelector('link[rel="icon"]').href !== previous, fallbackFirst, { timeout: 3500 });
    await visibility('visible'); assert.deepEqual(await iconState(), originals);
    assert.deepEqual(errors, []);
    console.log('Favicon motion: frames change; light/dark colours and alpha correct; return restores static icons; reduced motion, page lifecycle and load failure verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
