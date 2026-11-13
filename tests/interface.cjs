const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
const mock = vm.runInNewContext(source.slice(0, source.lastIndexOf('(async () => {')) + '\nmock', {
  require,
  process,
});
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const pid = '20000000-0000-4000-8000-000000000001';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.waitForFunction(
      () => document.querySelector('#app').getAttribute('aria-busy') === 'false'
    );
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => setTheme(theme), theme);
      for (const width of [360, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const route of [
          'admin',
          'outils/' + pid + '?section=documents',
          'outils/' + pid + '?section=debrief',
        ]) {
          await page.goto(base + '/#/' + route);
          await page.waitForFunction(
            () => document.querySelector('#app').getAttribute('aria-busy') === 'false'
          );
          assert.ok(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            `${theme},${width},${route}: page overflow`
          );
        }
      }
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
    assert.equal(await page.locator('#menu-scrim').isVisible(), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-toggle');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.closest('#nav') !== null), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menu-scrim').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-toggle');
    await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
    await page.locator('#menu-scrim').click({ position: { x: 350, y: 200 } });
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'), 'false');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    await page.goto(base + '/#/outils/' + pid + '?section=debrief');
    await page.locator('.tool-tabs a.active').waitFor();
    assert.equal(
      await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length
      ),
      0
    );
    const bounds = await page.locator('.tool-tabs a.active').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375, 'Selected tool stays visible');
    await page.evaluate(() => window.scrollTo(0, 350));
    const top = await page.locator('.tool-tabs').evaluate((el) => el.getBoundingClientRect().top);
    assert.ok(top >= 60, 'Sticky tabs clear header');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    const contrast = await page.evaluate(() => {
      const rgb = getComputedStyle(document.querySelector('.page-head p:last-child'))
        .color.match(/\d+/g)
        .slice(0, 3)
        .map(Number);
      const bg = getComputedStyle(document.body)
        .backgroundColor.match(/\d+/g)
        .slice(0, 3)
        .map(Number);
      const lum = (rgb) =>
        rgb
          .map((n) => {
            const v = n / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      return (Math.max(lum(rgb), lum(bg)) + 0.05) / (Math.min(lum(rgb), lum(bg)) + 0.05);
    });
    assert.ok(contrast >= 4.5, 'Secondary text meets normal-text contrast');
    if (process.env.SCREENSHOT_DIR) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => setTheme(t), theme);
        await page.waitForTimeout(350);
        await page.screenshot({
          path: process.env.SCREENSHOT_DIR + '/workspace-' + theme + '.png',
          fullPage: true,
        });
      }
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(base + '/#/outils/' + pid + '?section=contacts');
    await page.locator('.tool-tabs').waitFor();
    assert.ok(
      await page.evaluate(() =>
        document.getAnimations().some((animation) => animation.playState === 'running')
      ),
      'Page transitions animate when motion is enabled'
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    assert.equal(
      await page.evaluate(
        () =>
          document.getAnimations().filter((animation) => animation.playState === 'running').length
      ),
      0,
      'Changing motion preference cancels animations'
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: light/dark layouts at 360–1440px, keyboard/overlay mobile menu, reduced motion, visible active tabs, sticky navigation, loading completion and readable text contrast'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
