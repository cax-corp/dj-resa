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
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.evaluate(() => {
      window.testState.db.settings = [{ id: 1, data: {} }];
      window.testState.db.rate_plans = [
        { id: 'general', name: 'Normal', amount: 25, unit: 'heure', event_type: null },
        { id: 'family', name: 'Famille', amount: 150, unit: 'forfait', event_type: null },
        {
          id: 'wedding',
          name: 'Mariage — Base horaire',
          amount: 25,
          unit: 'heure',
          event_type: 'mariage',
        },
        {
          id: 'birthday',
          name: 'Anniversaire — Base horaire',
          amount: 30,
          unit: 'heure',
          event_type: 'anniversaire',
        },
      ];
      window.testState.db.project_payments = [
        {
          id: 'old',
          project_id: '20000000-0000-4000-8000-000000000001',
          label: 'Ancien devis',
          amount: 750,
          is_base: true,
        },
      ];
    });
    await page.goto(base + '/#/admin/nouveau');
    const form = page.locator('#new-project');
    await form.locator('[name=title]').fill('Mariage 2027 ou 2028');
    await form.getByRole('button', { name: 'Créer le projet' }).click();
    assert.equal(await page.evaluate(() => window.testState.db.projects.length), 2);
    await form.locator('[name=event_type]').selectOption('mariage');
    await form.getByRole('button', { name: 'Créer le projet' }).click();
    await page.getByRole('heading', { name: 'Mariage 2027 ou 2028', exact: true }).waitFor();
    const pid = await page.evaluate(() => window.testState.db.projects.at(-1).id);
    const created = await page.evaluate(() => window.testState.db.projects.at(-1));
    assert.equal(created.event_type, 'mariage');
    assert.ok(!created.event_date);
    assert.equal(await page.locator('#edit-form [name=event_type]').inputValue(), 'mariage');
    assert.equal(await page.locator('#rate-form option[value=birthday]').count(), 0);
    assert.equal(await page.locator('#rate-form option[value=wedding]').count(), 1);
    assert.equal(await page.locator('#rate-form option[value=general]').count(), 1);
    await page.evaluate(
      (pid) =>
        (window.testState.db.schedule_items = [
          { project_id: pid, start_time: '18:00', end_time: '20:00', day_offset: 0 },
          { project_id: pid, start_time: '10:00', end_time: '12:00', day_offset: 1 },
        ]),
      pid
    );
    await page.goto(base + '/#/admin');
    await page.goto(base + '/#/admin/projets/' + pid);
    const rate = page.locator('#rate-form');
    await rate.locator('[name=plan]').selectOption('wedding');
    await page.locator('#use-planning-hours').click();
    assert.equal(await rate.locator('[name=qty]').inputValue(), '4');
    await rate.getByRole('button', { name: 'Appliquer à ce projet' }).click();
    await page.waitForFunction(
      (pid) =>
        window.testState.db.project_payments.some((x) => x.project_id === pid && x.amount === 100),
      pid
    );
    const edit = page.locator('#edit-form');
    await edit.locator('[name=event_type]').selectOption('anniversaire');
    await edit.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.waitForFunction(
      (pid) => window.testState.db.projects.find((x) => x.id === pid).event_type === 'anniversaire',
      pid
    );
    await page.locator('#rate-form option[value=birthday]').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#rate-form option[value=wedding]').count(), 0);
    assert.equal(
      await page.evaluate(
        () => window.testState.db.project_payments.find((x) => x.id === 'old').amount
      ),
      750
    );
    assert.equal(
      await page.evaluate(
        (pid) => window.testState.db.project_payments.find((x) => x.project_id === pid).amount,
        pid
      ),
      100
    );
    await page.goto(base + '/#/compte?type=mariage');
    await page.locator('#rate-new').waitFor();
    assert.equal(await page.locator('#rate-new [name=event_type]').inputValue(), 'mariage');
    assert.equal(await page.locator('.event-rate-card').count(), 6);
    const newRate = page.locator('#rate-new');
    await newRate.locator('[name=name]').fill('Mariage test forfait');
    await newRate.locator('[name=amount]').fill('500');
    await newRate.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.waitForFunction(() =>
      window.testState.db.rate_plans.some(
        (x) => x.name === 'Mariage test forfait' && x.event_type === 'mariage'
      )
    );
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: required project type, unknown wedding date, scoped/general rates, explicit planning hours, editable price grid, preserved old/applied prices, compatible type changes and mobile'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
