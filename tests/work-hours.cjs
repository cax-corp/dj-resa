const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');
const WorkHours = vm.runInNewContext(
  fs.readFileSync(__dirname + '/../work-hours.js', 'utf8') + '\nWorkHours'
);
const slot = (start_time, end_time) => ({ start_time, end_time });
assert.equal(WorkHours.summary([]).minutes, 0);
assert.equal(WorkHours.duration(slot('18:00', '20:15')), 135);
assert.equal(WorkHours.duration(slot('23:00:00', '02:00:00')), 180);
assert.equal(WorkHours.summary([slot('18:00', '20:00'), slot('21:00', '22:00')]).minutes, 180);
assert.equal(
  WorkHours.summary([slot('18:00', '21:00'), slot('19:00', '20:00'), slot('20:00', '22:00')])
    .minutes,
  240
);
assert.equal(WorkHours.summary([slot('23:00', '02:00'), slot('00:30', '03:00')]).minutes, 240);
assert.equal(WorkHours.summary([slot('20:00', '00:00'), slot('00:00', '02:00')]).minutes, 360);
assert.equal(
  WorkHours.summary([slot('20:00', null), slot('21:00', '21:00'), slot('invalid', '23:00')])
    .incomplete,
  3
);
assert.equal(WorkHours.format(135), '2 h 15');
const original = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
const mock = vm.runInNewContext(
  original.slice(0, original.lastIndexOf('(async () => {')) + '\nmock',
  { require, process }
);
const pid = '20000000-0000-4000-8000-000000000001';
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    const planning = base + '/#/outils/' + pid + '?section=conductor';
    await page.goto(planning);
    await page.getByRole('heading', { name: 'Planning de l’événement' }).waitFor();
    assert.equal(await page.locator('.tool-tabs a.active').textContent(), 'Planning');
    const add = async (title, start, end) => {
      await page.locator('#tool-editor').evaluate((el) => (el.open = true));
      const form = page.locator('#tool-editor-form');
      await form.locator('[name=title]').fill(title);
      await form.locator('[name=start_time]').fill(start);
      if (end) await form.locator('[name=end_time]').fill(end);
      await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await page.getByText(title, { exact: true }).waitFor();
    };
    await add('Montage', '18:00', '20:00');
    await add('Sonorisation', '19:00', '21:00');
    await add('Animation', '23:00', '02:00');
    await add('Séquence simultanée', '00:30', '01:00');
    await add('Démontage à préciser', '03:00', '');
    await page.locator('[data-work-minutes="360"]').waitFor();
    await page.getByText(/1 créneau non comptabilisé/).waitFor();
    await page.evaluate(
      (pid) =>
        window.testState.db.project_payments.push({
          id: 'existing-rate',
          project_id: pid,
          label: 'Forfait existant',
          amount: 750,
          paid: false,
          is_base: true,
        }),
      pid
    );
    const before = await page.evaluate(() => ({
      projects: window.testState.db.projects,
      payments: window.testState.db.project_payments,
      invoices: window.testState.db.invoices,
    }));
    await page.goto(base + '/#/admin/projets/' + pid);
    await page.locator('#project-finance [data-work-minutes="360"]').waitFor();
    await page.getByRole('heading', { name: 'Tarification et facturation', exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => ({
        projects: window.testState.db.projects,
        payments: window.testState.db.project_payments,
        invoices: window.testState.db.invoices,
      })),
      before
    );
    await page
      .locator('#project-finance')
      .getByRole('link', { name: 'Ouvrir le planning' })
      .click();
    const row = page.locator('.tool-row').filter({ hasText: 'Démontage à préciser' });
    await row.getByRole('button', { name: 'Modifier', exact: true }).click();
    const form = page.locator('#tool-editor-form');
    await form.locator('[name=end_time]').fill('04:30');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.locator('[data-work-minutes="450"]').waitFor();
    assert.equal(await page.getByText(/créneau non comptabilisé/).count(), 0);
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .locator('.tool-row')
      .filter({ hasText: 'Démontage à préciser' })
      .getByRole('button', { name: 'Retirer', exact: true })
      .click();
    await page.locator('[data-work-minutes="360"]').waitFor();
    await page.goto(base + '/#/admin/projets/' + pid);
    await page.locator('#project-finance [data-work-minutes="360"]').waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: schedule durations, midnight, overlapping slots, gaps, missing ends, rename, CRUD totals, finance synchronization, unchanged prices/invoices and mobile'
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
