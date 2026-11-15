const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const original = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
const mock = vm.runInNewContext(
  original.slice(0, original.lastIndexOf('(async () => {')) + '\nmock',
  { require, process }
);
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const pid = '20000000-0000-4000-8000-000000000001';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
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
    const bilan = base + '/#/outils/' + pid + '?section=debrief';
    await page.goto(bilan);
    await page.getByRole('button', { name: 'Créer un lien de retour' }).click();
    const url = await page.getByRole('textbox', { name: 'Lien du formulaire' }).inputValue();
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(url);
    const form = page.locator('#public-feedback-form');
    await form.waitFor();
    assert.equal(await page.locator('[name=audience]').count(), 0);
    assert.equal(await page.locator('#auth-form').count(), 0);
    assert.equal(await form.locator('select').count(), 4);
    await form.getByRole('button', { name: 'Envoyer mon avis' }).click();
    assert.equal(await page.evaluate(() => window.testState.submissions.length), 0);
    await page.locator('[name=rating][value="4"]').check();
    await form.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await page.getByText('Merci ! Votre avis a bien été enregistré.').waitFor();
    const first = await page.evaluate(() => window.testState.submissions[0].fields);
    assert.equal(first.rating, 4);
    assert.equal(first.respondent, '');
    assert.ok(!('audience' in first));
    assert.ok(!('music_rating' in first));
    await page.goto(bilan);
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(url);
    await form.waitFor();
    await page.locator('[name=rating][value="5"]').check();
    await page.locator('[name=music_rating]').selectOption('5');
    await page.locator('[name=sound_rating]').selectOption('2');
    await page.locator('[name=organization_rating]').selectOption('4');
    await page.locator('[name=first_name]').fill(' Camille ');
    await page.locator('[name=last_name]').fill(' Martin ');
    await page.locator('[name=comment]').fill('Belle soirée <script>window.bad=true</script>');
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: process.env.SCREENSHOT_DIR + '/feedback-form.png',
        fullPage: true,
      });
    await form.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await page.getByText('Merci ! Votre avis a bien été enregistré.').waitFor();
    const second = await page.evaluate(() => window.testState.submissions[1].fields);
    assert.equal(second.respondent, 'Camille Martin');
    assert.equal(second.music_rating, 5);
    assert.equal(second.sound_rating, 2);
    assert.ok(!('atmosphere_rating' in second));
    await page.evaluate(() => (window.testState.signedIn = true));
    await page.goto(bilan);
    await page.getByRole('heading', { name: 'Retours après l’événement' }).waitFor();
    await page.getByText('Camille Martin', { exact: false }).waitFor();
    const panel = page.locator('.feedback-panel');
    assert.ok((await panel.innerText()).includes('4.5'));
    assert.equal(await panel.locator('.feedback-scores').count(), 1);
    assert.equal(await panel.locator('.feedback-scores > div').count(), 3);
    assert.equal(await page.evaluate(() => window.bad), undefined);
    assert.ok(!(await panel.innerText()).includes('Client / organisateur'));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: logical rating questions, required overall only, optional names and criteria, anonymous submission, no audience classification, saved details in Bilan, safe comments, mobile and unchanged review links'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
