const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright');
const WorkHours = vm.runInNewContext(
  fs.readFileSync(__dirname + '/../work-hours.js', 'utf8') + '\nWorkHours'
);
const slot = (day_offset, start_time, end_time) => ({ day_offset, start_time, end_time });
assert.equal(
  WorkHours.summary([slot(0, '11:50', '13:00'), slot(1, '10:00', '12:00')]).minutes,
  190
);
assert.equal(
  WorkHours.summary([slot(0, '10:00', '12:00'), slot(1, '10:00', '12:00')]).minutes,
  240
);
assert.equal(
  WorkHours.summary([slot(0, '23:00', '02:00'), slot(1, '01:00', '03:00')]).minutes,
  240
);
assert.equal(
  WorkHours.summary([slot(-1, '23:00', '02:00'), slot(0, '01:00', '03:00')]).minutes,
  240
);
assert.deepEqual(
  Array.from(
    WorkHours.sort([slot(1, '10:00', '12:00'), slot(0, '11:50', '13:00')]),
    (s) => s.day_offset
  ),
  [0, 1]
);
const original = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
let mock = vm.runInNewContext(
  original.slice(0, original.lastIndexOf('(async () => {')) + '\nmock',
  { require, process }
);
mock += `\nconst originalCreate=window.supabase.createClient;window.supabase.createClient=(...args)=>{const c=originalCreate(...args);const rpc=c.rpc;c.rpc=async(name,args)=>name==='get_shared_project'?{data:{title:'Soirée',event_date:'2026-11-14',schedule:window.testState.db.schedule_items.filter(x=>x.project_id==='20000000-0000-4000-8000-000000000001')},error:null}:rpc(name,args);return c};`;
const pid = '20000000-0000-4000-8000-000000000001';
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    args: ['--no-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    const planning = base + '/#/outils/' + pid + '?section=conductor';
    await page.goto(planning);
    await page.locator('#tool-editor').waitFor();
    const add = async (title, day, start, end) => {
      await page.locator('#tool-editor').evaluate((el) => (el.open = true));
      const f = page.locator('#tool-editor-form');
      await f.locator('[name=day_offset]').selectOption(String(day));
      await f.locator('[name=start_time]').fill(start);
      await f.locator('[name=end_time]').fill(end);
      await f.locator('[name=title]').fill(title);
      await f.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await page.locator('.conductor-step > strong').filter({ hasText: title }).waitFor();
    };
    await add('Installation', 0, '11:50', '13:00');
    await add('Rangement', 1, '10:00', '12:00');
    assert.deepEqual(await page.locator('.conductor-step > strong').allTextContents(), [
      'Installation',
      'Rangement',
    ]);
    await page.locator('[data-work-minutes="190"]').waitFor();
    await page.goto(base + '/#/admin/projets/' + pid);
    await page.locator('#project-finance [data-work-minutes="190"]').waitFor();
    assert.deepEqual(await page.locator('.timeline .tl-body > strong').allTextContents(), [
      'Installation',
      'Rangement',
    ]);
    const form = page.locator('#schedule-form');
    await form.locator('[name=day_offset]').selectOption('2');
    await form.locator('[name=start_time]').fill('09:00');
    await form.locator('[name=end_time]').fill('10:00');
    await form.locator('[name=title]').fill('Retour matériel');
    await form.getByRole('button', { name: 'Ajouter au planning' }).click();
    await page.locator('#project-finance [data-work-minutes="250"]').waitFor();
    await page.goto(planning);
    const row = page.locator('.tool-row').filter({ hasText: 'Rangement' });
    await row.getByRole('button', { name: 'Modifier', exact: true }).click();
    assert.equal(await page.locator('#tool-editor-form [name=day_offset]').inputValue(), '1');
    await page.locator('#tool-editor-form [name=day_offset]').selectOption('3');
    await page
      .locator('#tool-editor-form')
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await page.waitForFunction(
      () => window.testState.db.schedule_items.find((x) => x.title === 'Rangement').day_offset === 3
    );
    await page.waitForFunction(
      () => document.querySelector('#tool-editor-form [name=record_id]')?.value === ''
    );
    assert.deepEqual(await page.locator('.conductor-step > strong').allTextContents(), [
      'Installation',
      'Retour matériel',
      'Rangement',
    ]);
    await page.evaluate(() => {
      window.testState.db.schedule_items.push({
        id: 'legacy',
        project_id: '20000000-0000-4000-8000-000000000001',
        title: 'Ancien créneau',
        start_time: '18:00',
        end_time: '19:00',
        day_offset: null,
      });
      window.testState.signedIn = false;
    });
    await page.goto(base + '/#/partage/10000000-0000-4000-8000-000000000001');
    await page.getByText('Ancien créneau', { exact: true }).waitFor();
    assert.deepEqual(await page.locator('.timeline .tl-body > strong').allTextContents(), [
      'Installation',
      'Ancien créneau',
      'Retour matériel',
      'Rangement',
    ]);
    await page
      .getByText(/jour à confirmer/)
      .first()
      .waitFor();
    assert.equal(await page.locator('#auth-form').count(), 0);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: next-day cleanup after installation, same hours on different days, midnight overlap, legacy day warning, both editors, persistence, public chronology, finance hours and mobile'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
