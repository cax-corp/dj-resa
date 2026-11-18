const { chromium } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs');
const { mock, pid, sourceId, speakerId } = require('./production-mock.cjs');
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    const tool = async (section) => {
      await page.goto(base + '/#/outils/' + pid + '?section=' + section);
      await page.locator('.project-tool-launcher a.active[href$="section=' + section + '"]').waitFor();
    };
    await page.goto(base + '/#/materiel');
    await page.locator('[data-audio-catalog="' + sourceId + '"]').click();
    let dialog = page.locator('#audio-catalog-dialog');
    const addPort = async (name, direction, gender) => {
      const f = dialog.locator('form');
      await f.locator('[name=name]').fill(name);
      await f.locator('[name=direction]').selectOption(direction);
      await f.locator('#choose-audio-connector').click();
      await page.locator('#connector-picker [data-connector=xlr3]').click();
      await f.locator('[name=gender]').selectOption(gender);
      await f.locator('[name=signal]').selectOption('line');
      await f.getByRole('button', { name: 'Enregistrer le port', exact: true }).click();
      await dialog.getByText(name, { exact: true }).waitFor();
    };
    await addPort('Master L', 'out', 'male');
    await addPort('Master R', 'out', 'male');
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.locator('[data-audio-catalog="' + speakerId + '"]').click();
    dialog = page.locator('#audio-catalog-dialog');
    await addPort('Input', 'in', 'female');
    await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
    await tool('setup');
    await page.getByRole('button', { name: 'Ajouter les appareils avec connectique' }).click();
    assert.equal(await page.locator('#setup-stage [data-stage-id]').count(), 3);
    await page.getByRole('button', { name: 'Relier les correspondances uniques' }).click();
    assert.equal(
      await page.locator('#setup-connections article').count(),
      0,
      'Ambiguous stereo routing must remain manual'
    );
    const connect = async (out, speaker) => {
      const f = page.locator('#setup-wire');
      const from = await f
        .locator('[name=from] option')
        .filter({ hasText: out })
        .getAttribute('value');
      const to = await f
        .locator('[name=to] option')
        .filter({ hasText: speaker })
        .getAttribute('value');
      await f.locator('[name=from]').selectOption(from);
      await f.locator('[name=to]').selectOption(to);
      await f.locator('[name=cable_length]').fill('5');
      await f.getByRole('button', { name: 'Ajouter la liaison', exact: true }).click();
    };
    await connect('Master L', 'Speaker #1');
    await connect('Master R', 'Speaker #2');
    assert.equal(await page.locator('#setup-cable-summary tbody tr').count(), 1);
    assert.equal(await page.locator('#setup-cable-summary tbody tr td').last().innerText(), '2');
    const zone = page.locator('#setup-zone');
    await zone.locator('[name=name]').fill('Cabine DJ');
    await zone.getByRole('button', { name: 'Ajouter la zone', exact: true }).click();
    await page.locator('#save-setup').click();
    await page.waitForFunction(() => window.testState.db.project_setups[0]?.revision === 1);
    await page.locator('#setup-stage [data-stage-id]').first().waitFor();
    let dl = page.waitForEvent('download');
    await page.locator('#setup-svg').click();
    const svg = await dl;
    assert.equal(svg.suggestedFilename(), 'setup-audio.svg');
    assert.match(fs.readFileSync(await svg.path(), 'utf8'), /Master L/);
    await page.evaluate(
      () =>
        (window.print = () => {
          window.printCalled = true;
        })
    );
    await page.locator('#print-cables').click();
    assert.equal(await page.locator('#print-sheet tbody tr').count(), 1);
    assert.match(await page.locator('#print-sheet').innerText(), /5 m/);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    const nodeForm = page.locator('#setup-node');
    await nodeForm.locator('[name=label]').fill('Brouillon de placement');
    await tool('conductor');
    await tool('setup');
    assert.equal(
      await page.locator('#setup-node [name=label]').inputValue(),
      'Brouillon de placement'
    );
    assert.ok(
      !(
        await page.evaluate(() =>
          window.testState.db.project_setups[0].layout.nodes.map((n) => n.label)
        )
      ).includes('Brouillon de placement')
    );
    page.once('dialog', (d) => d.accept());
    await page.locator('#discard-setup').click();
    await page.locator('#setup-status').getByText('Setup enregistré', { exact: true }).waitFor();
    await tool('seating');
    const add = page.locator('#seating-add');
    await add.locator('[name=name]').fill('Table A');
    await add.locator('[name=seats]').fill('2');
    await add.getByRole('button', { name: 'Ajouter une table', exact: true }).click();
    const assignment = page.locator('#seat-assignment');
    for (const name of ['Alice', 'Bob']) {
      const id = await assignment
        .locator('[name=guest] option')
        .filter({ hasText: name })
        .getAttribute('value');
      await assignment.locator('[name=guest]').selectOption(id);
      const tableId = await assignment
        .locator('[name=table] option')
        .filter({ hasText: 'Table A' })
        .getAttribute('value');
      await assignment.locator('[name=table]').selectOption(tableId);
      await assignment.getByRole('button', { name: 'Appliquer au brouillon', exact: true }).click();
    }
    await page.getByText(/Capacité dépassée/).waitFor();
    await page.locator('#save-seating').click();
    await page.waitForFunction(() =>
      window.testState.db.project_guests.every((g) => g.table_name === 'Table A')
    );
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].dietary),
      'Initial needs'
    );
    await tool('rsvp');
    await page.locator('#create-rsvp-links').click();
    await page.getByRole('textbox', { name: 'Invitation Alice', exact: true }).waitFor();
    const invitation = await page
      .getByRole('textbox', { name: 'Invitation Alice', exact: true })
      .inputValue();
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(invitation);
    await page.locator('#public-rsvp-form').waitFor();
    assert.equal(await page.getByText('Bob', { exact: true }).count(), 0);
    await page.locator('[name=response]').selectOption('declined');
    await page.locator('[name=dietary]').fill('Updated needs');
    await page.getByRole('button', { name: 'Envoyer ma réponse', exact: true }).click();
    await page.getByText('Merci ! Votre réponse a bien été enregistrée.').waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].response),
      'declined'
    );
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].table_name),
      'Table A'
    );
    await page.evaluate(() => (window.testState.signedIn = true));
    await tool('rsvp');
    const alice = page
      .locator('.tool-list article')
      .filter({ has: page.getByRole('heading', { name: 'Alice', exact: true }) });
    await alice.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.waitForFunction(() => !window.testState.db.guest_rsvp_links[0].is_open);
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(invitation);
    await page.getByRole('heading', { name: 'Invitation indisponible' }).waitFor();
    await page.evaluate(() => (window.testState.signedIn = true));
    await tool('profit');
    const cost = page.locator('#cost-form');
    await cost.locator('[name=label]').fill('Déplacement');
    await cost.locator('[name=amount]').fill('100');
    await cost.getByRole('button', { name: 'Ajouter les frais', exact: true }).click();
    await page.locator('#profit-hours [name=hourly]').fill('20');
    await page
      .locator('#profit-hours')
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    await page.waitForFunction(
      () => window.testState.db.project_profit_settings[0]?.hourly_cost === 20
    );
    await page
      .locator('.production-metrics .card')
      .filter({ hasText: 'Marge prévisionnelle' })
      .getByText(/860/)
      .waitFor();
    assert.equal(await page.evaluate(() => window.testState.db.project_payments[0].amount), 1000);
    await tool('music_import');
    const file = page.locator('#music-csv-form [name=file]');
    await file.setInputFiles({
      name: 'spotify.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'Track Name,Artist Name(s),Track URI\nSeptember,Earth Wind & Fire,spotify:track:0123456789012345678901\nSeptember,Earth Wind & Fire,spotify:track:0123456789012345678901'
      ),
    });
    await page.getByRole('button', { name: 'Prévisualiser le CSV', exact: true }).click();
    await page.locator('#confirm-music-import').click();
    await page.waitForFunction(() => window.testState.db.project_tracks.length === 1);
    await tool('team');
    await page.locator('#member-form [name=user_id]').selectOption('team');
    await page
      .locator('#member-form')
      .getByRole('button', { name: 'Donner accès', exact: true })
      .click();
    await page.waitForFunction(() => window.testState.db.project_members.length === 1);
    await page.evaluate(() => {
      window.testState.role = 'dj';
      window.testState.calls = [];
    });
    await page.goto(base + '/#/projets/' + pid);
    await page.getByRole('heading', { name: 'Mariage test', exact: true }).waitFor();
    assert.equal(await page.locator('#project-finance').count(), 0);
    assert.equal(
      await page.evaluate(() =>
        window.testState.calls.some((c) =>
          ['project_payments', 'invoices', 'project_costs'].includes(c.table)
        )
      ),
      false
    );
    await tool('conductor');
    assert.equal(await page.locator('[data-step]').count(), 0);
    await tool('setup');
    assert.equal(await page.locator('#save-setup').count(), 0);
    await tool('documents');
    await page.getByText('Shared document.pdf', { exact: true }).waitFor();
    assert.equal(await page.getByText('Private document.pdf', { exact: true }).count(), 0);
    await page.evaluate(() => (window.testState.role = 'admin'));
    await tool('team');
    await page.locator('[data-member-role]').selectOption('editor');
    await page.waitForFunction(
      () => window.testState.db.project_members[0].access_role === 'editor'
    );
    await page.evaluate(() => (window.testState.role = 'dj'));
    await tool('setup');
    await page.locator('#save-setup').waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.SCREENSHOT_DIR) {
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(250);
      await page.screenshot({
        path: process.env.SCREENSHOT_DIR + '/setup-mobile.png',
        fullPage: true,
      });
    }
    await page.locator('#setup-node [name=label]').fill('Unsaved editor draft');
    await page.evaluate(()=>window.testState.db.project_members[0].access_role='viewer');
    await tool('conductor');await tool('setup');
    assert.equal(await page.locator('#save-setup').count(),0);
    assert.ok(!(await page.locator('#setup-stage').textContent()).includes('Unsaved editor draft'));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: audio catalog, selected stock instances, explicit stereo routing/cable quantities, setup persistence/drafts/SVG/print, seating and capacity, personalized RSVP and closure, margin, CSV deduplication, team permissions, document visibility and mobile'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
