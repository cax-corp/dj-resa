const { chromium } = require('playwright');
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const original = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
const mock = vm.runInNewContext(
  original.slice(0, original.lastIndexOf('(async () => {')) + '\nmock',
  { require, process }
);
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const pid = '20000000-0000-4000-8000-000000000001';
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.evaluate(
      (pid) =>
        window.testState.db.project_guests.push({
          id: crypto.randomUUID(),
          project_id: pid,
          full_name: 'Alice',
          email: 'alice@example.test',
          phone: '',
          companions: 0,
          response: 'pending',
          table_name: '',
          dietary: '',
          notes: '',
        }),
      pid
    );
    const open = async () => {
      await page.goto(base + '/#/outils/' + pid + '?section=guests');
      await page.locator('#guest-sheet-form').waitFor();
    };
    await open();
    assert.equal(await page.locator('#guest-sheet-form').isVisible(), true);
    assert.equal(await page.locator('.guest-sheet-table tbody tr').count(), 4);
    let cells = page.locator('.guest-sheet-table [data-col=full_name]');
    await cells.nth(0).fill('Alicia');
    await cells.nth(1).fill('Bob');
    await cells.nth(1).press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.closest('tr').rowIndex), 3);
    const pasted = Array.from(
      { length: 160 },
      (_, i) => 'Camille ' + i + '\tcamille' + i + '@example.test'
    ).join('\n');
    await cells.nth(1).evaluate((el, text) => {
      const data = new DataTransfer();
      data.setData('text/plain', text);
      el.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      );
    }, pasted);
    assert.equal(
      await page.locator('.guest-sheet-table [data-col=full_name]').nth(160).inputValue(),
      'Camille 159'
    );
    // Unsaved rows and edits survive navigation, including their stable IDs.
    await page.goto(base + '/#/lieux');
    await page.getByRole('heading', { name: 'Lieux', exact: true }).waitFor();
    await open();
    await page.waitForFunction(
      () => document.querySelector('.guest-sheet-table [data-col=full_name]').value === 'Alicia'
    );
    assert.equal(
      await page.locator('.guest-sheet-table [data-col=full_name]').nth(160).inputValue(),
      'Camille 159'
    );
    await page.evaluate(() => {
      window.print = () => {};
    });
    await page.getByRole('button', { name: 'Imprimer la liste', exact: true }).click();
    assert.equal(await page.locator('#print-sheet tbody tr').count(), 161);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.locator('#sheet-save').click();
    await page.waitForFunction(() => window.testState.db.project_guests.length === 161);
    await page.waitForFunction(() => document.getElementById('sheet-save').disabled);
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].full_name),
      'Alicia'
    );
    // Add rows directly from the UI, without a file or any pasted content.
    await page.locator('#sheet-add-count').fill('2');
    const before = await page.locator('.guest-sheet-table tbody tr').count();
    await page.locator('#sheet-add').click();
    assert.equal(await page.locator('.guest-sheet-table tbody tr').count(), before + 2);
    let rows = page.locator('.guest-sheet-table tbody tr');
    await rows.nth(before).locator('[data-col=full_name]').fill('Invité saisi directement');
    await rows.nth(before).locator('[data-col=companions]').fill('2');
    await rows.nth(before).locator('[data-col=response]').selectOption('confirmed');
    await rows.nth(before).locator('[data-col=notes]').fill('Note écrite dans le tableau');
    await page.locator('#sheet-save').click();
    await page.waitForFunction(() =>
      window.testState.db.project_guests.some(
        (x) => x.full_name === 'Invité saisi directement' && x.companions === 2
      )
    );
    // Existing rows have an explicit, reversible removal mark, confirmed on save.
    const count = await page.evaluate(() => window.testState.db.project_guests.length);
    await page.locator('.guest-sheet-table [data-remove-row]').first().click();
    assert.equal(await page.locator('.sheet-row-deleted').count(), 1);
    await page.locator('.sheet-row-deleted button').click();
    assert.equal(await page.locator('.sheet-row-deleted').count(), 0);
    await page.locator('.guest-sheet-table [data-remove-row]').first().click();
    page.once('dialog', (d) => d.accept());
    await page.locator('#sheet-save').click();
    await page.waitForFunction((n) => window.testState.db.project_guests.length === n - 1, count);
    await page.getByRole('button', { name: 'Vue fiches', exact: true }).click();
    assert.equal(await page.locator('#guest-sheet-form').isVisible(), false);
    assert.ok((await page.locator('.tool-list .tool-row:visible').count()) > 0);
    await page.getByRole('button', { name: 'Vue tableau', exact: true }).click();
    // Validation does not partially save a row with a missing name.
    const currentName = await page
      .locator('.guest-sheet-table [data-col=full_name]')
      .first()
      .inputValue();
    await page.locator('.guest-sheet-table [data-col=full_name]').first().fill('');
    await page.locator('#sheet-save').click();
    await page
      .getByText(/Vérifiez les cellules de la ligne 1/)
      .first()
      .waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].full_name),
      currentName
    );
    await page.locator('.guest-sheet-table [data-col=full_name]').first().fill(currentName);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(
      await page.locator('.guest-sheet-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)
    );
    // A completed project is still readable by the client, but not editable.
    await page.evaluate(() => {
      window.testState.role = 'client';
      window.testState.db.projects[0].status = 'termine';
    });
    await page.evaluate(() => route());
    await page.waitForFunction(
      () =>
        document.querySelectorAll('#guest-sheet-form input[data-col]:not(:disabled)').length === 0
    );
    assert.equal(await page.locator('#sheet-save').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'PASS: native guest table, direct cell editing, keyboard navigation, 160-row paste, draft restoration, bulk save, new rows, explicit deletion, validation, printable unsaved rows, mobile and read-only access'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
