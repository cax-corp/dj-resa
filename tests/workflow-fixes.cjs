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
    const go = async (path) => {
      await page.goto(base + '/#/' + path);
      if (path === 'materiel')
        await page.getByRole('heading', { name: 'Mon matériel', exact: true }).waitFor();
      if (path === 'lieux')
        await page.getByRole('heading', { name: 'Lieux', exact: true }).waitFor();
    };
    const tool = async (section) => {
      await go('outils/' + pid + '?section=' + section);
      await page.locator('.tool-tabs a.active[href$="section=' + section + '"]').waitFor();
    };
    const editor = async () => {
      await page.locator('#tool-editor').evaluate((el) => (el.open = true));
      return page.locator('#tool-editor-form');
    };
    await go('materiel');
    let form = await editor();
    await form.locator('[name=name]').fill('Enceinte brouillon');
    await form.locator('[name=units]').fill('2');
    await form.locator('[name=notes]').fill('Câbles inclus');
    await page.evaluate(() =>
      window.testState.authCallback('SIGNED_IN', { user: { id: 'admin' } })
    );
    assert.equal(await form.locator('[name=name]').inputValue(), 'Enceinte brouillon');
    await go('lieux');
    form = await editor();
    await form.locator('[name=name]').fill('Salle brouillon');
    await form.locator('[name=address]').fill('12 rue des Lilas');
    await go('materiel');
    form = page.locator('#tool-editor-form');
    await form.waitFor();
    await page.waitForFunction(
      () => document.querySelector('#tool-editor-form [name=name]').value === 'Enceinte brouillon'
    );
    assert.equal(await form.locator('[name=notes]').inputValue(), 'Câbles inclus');
    assert.equal(await page.locator('#tool-editor').evaluate((el) => el.open), true);
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Enceinte brouillon', { exact: true }).waitFor();
    await go('lieux');
    form = page.locator('#tool-editor-form');
    await page.waitForFunction(
      () => document.querySelector('#tool-editor-form [name=name]')?.value === 'Salle brouillon'
    );
    assert.equal(await form.locator('[name=address]').inputValue(), '12 rue des Lilas');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Salle brouillon', { exact: true }).waitFor();
    await go('materiel');
    form = await editor();
    assert.equal(await form.locator('[name=name]').inputValue(), '');
    // Venue uses the directory everywhere, including project creation.
    await go('admin/projets/' + pid);
    await page.locator('#edit-form').waitFor();
    assert.equal(await page.locator('#edit-form input[name=location]').count(), 0);
    await page
      .locator('#edit-form select[name=venue_id]')
      .selectOption({ label: 'Salle brouillon · 12 rue des Lilas' });
    await page.locator('#edit-form button.primary').click();
    await page.waitForFunction(
      () => window.testState.db.projects[0].location === 'Salle brouillon, 12 rue des Lilas'
    );
    await tool('venue');
    await page.getByRole('heading', { name: 'Salle brouillon' }).waitFor();
    await go('admin/nouveau');
    await page.locator('#new-project').waitFor();
    assert.equal(await page.locator('#new-project input[name=location]').count(), 0);
    await page.locator('#new-project [name=title]').fill('Projet lieu catalogue');
    await page
      .locator('#new-project [name=venue_id]')
      .selectOption({ label: 'Salle brouillon · 12 rue des Lilas' });
    await page.locator('#new-project button').click();
    await page.getByRole('heading', { name: 'Projet lieu catalogue', exact: true }).waitFor();
    // QR downloads are actual PNG images.
    await tool('requests');
    await page.getByRole('button', { name: 'Créer un lien invité' }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger le QR en PNG' }).click();
    const png = fs.readFileSync(await (await downloadEvent).path());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    // Bulk CSV: 160 editable rows, quoted delimiters and a multi-line cell.
    await tool('guests');
    await page.locator('.guest-bulk').evaluate((el) => (el.open = true));
    const text =
      'Nom;Prénom;Email;Accompagnants;Réponse;Table;Allergies;Notes\r\n' +
      Array.from(
        { length: 160 },
        (_, i) =>
          `Test${i};Camille${i};camille${i}@example.test;0;Oui;Table ${i % 10};;${i === 0 ? '"Message avec ; et\nretour à la ligne"' : ''}`
      ).join('\r\n');
    await page
      .locator('#guest-csv')
      .setInputFiles({ name: '160-invites.csv', mimeType: 'text/csv', buffer: Buffer.from(text) });
    await page.waitForFunction(
      () => document.querySelectorAll('#guest-import-preview tbody tr').length === 160
    );
    await page
      .locator('#guest-import-preview [data-col=full_name]')
      .first()
      .fill('Camille corrigée');
    await page.locator('#guest-import-save').click();
    await page.waitForFunction(() => window.testState.db.project_guests.length === 160);
    assert.equal(
      await page.evaluate(() => window.testState.db.project_guests[0].full_name),
      'Camille corrigée'
    );
    assert.ok(
      (await page.evaluate(() => window.testState.db.project_guests[0].notes)).includes('\n')
    );
    // Print sheets expose only paper content and real checkboxes.
    await page.evaluate(() => {
      window.print = () => {
        window.testState.printed = true;
      };
    });
    await page.getByRole('button', { name: 'Imprimer la liste', exact: true }).click();
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#print-sheet tbody tr').count(), 160);
    assert.equal(await page.locator('.topbar').isVisible(), false);
    assert.equal(await page.locator('#app').isVisible(), false);
    assert.equal(await page.locator('#print-sheet').isVisible(), true);
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.emulateMedia({ media: 'screen' });
    await tool('equipment');
    await page.locator('#gear-selection-form button').click();
    await page.locator('[data-gear-ready]').waitFor();
    await page.getByRole('button', { name: 'Imprimer les cases à cocher' }).click();
    assert.equal(await page.locator('#print-sheet .paper-checkbox').count(), 1);
    assert.ok((await page.locator('#print-sheet').innerText()).includes('Enceinte brouillon'));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    // Accepting copies to must-play exactly once; refusing does not ban it.
    await page.evaluate(
      (pid) =>
        window.testState.db.guest_music_requests.push({
          id: 'request1',
          project_id: pid,
          title: 'September',
          artist: 'Earth, Wind & Fire',
          status: 'pending',
          created_at: '2026-11-13T12:00:00Z',
        }),
      pid
    );
    await tool('requests');
    await page.locator('[data-request]').selectOption('accepted');
    await page.waitForFunction(() => window.testState.db.project_tracks.length === 1);
    await page.locator('[data-request]').selectOption('rejected');
    await page.waitForFunction(
      () => window.testState.db.guest_music_requests[0].status === 'rejected'
    );
    assert.equal(
      await page.evaluate(
        () => window.testState.db.project_tracks.filter((x) => x.kind === 'do_not_play').length
      ),
      0
    );
    await page.locator('[data-request]').selectOption('accepted');
    await page.waitForFunction(
      () => window.testState.db.guest_music_requests[0].status === 'accepted'
    );
    assert.equal(await page.evaluate(() => window.testState.db.project_tracks.length), 1);
    await go('admin/projets/' + pid);
    await page.locator('#print-must-play').click();
    assert.equal(await page.locator('#print-sheet tbody tr').count(), 1);
    assert.ok((await page.locator('#print-sheet').innerText()).includes('September'));
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    // Review link and five-star form work without an account, then appear in Bilan.
    await tool('debrief');
    await page.getByRole('button', { name: 'Créer un lien de retour' }).click();
    const reviewURL = await page.getByRole('textbox', { name: 'Lien du formulaire' }).inputValue();
    assert.ok(reviewURL.includes('#/avis/'));
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(reviewURL);
    await page.locator('#public-feedback-form').waitFor();
    await page.locator('.rating-stars label').nth(3).click();
    await page.locator('[name=respondent]').fill('Camille');
    await page.locator('[name=comment]').fill('Une très belle soirée !');
    await page.getByRole('button', { name: 'Envoyer mon avis' }).click();
    await page.getByText('Merci ! Votre avis a bien été enregistré.').waitFor();
    await page.evaluate(() => (window.testState.signedIn = true));
    await tool('debrief');
    await page.getByText('Une très belle soirée !', { exact: true }).waitFor();
    assert.ok((await page.locator('.feedback-panel').innerText()).includes('4.0'));
    // Only an explicitly chosen unused client is removed; projects survive.
    const count = await page.evaluate(() => window.testState.db.projects.length);
    await page.evaluate(() =>
      window.testState.db.profiles.push({
        id: 'unused-test',
        role: 'client',
        full_name: 'Unused test client',
        email: 'unused@example.test',
        created_at: '2026-11-13T12:00:00Z',
      })
    );
    await go('admin/clients/unused-test');
    await page.getByRole('button', { name: 'Supprimer le client' }).waitFor();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Supprimer le client' }).click();
    await page.waitForURL('**/#/admin/clients');
    assert.equal(
      await page.evaluate(() => window.testState.db.profiles.some((x) => x.id === 'unused-test')),
      false
    );
    assert.equal(await page.evaluate(() => window.testState.db.projects.length), count);
    await page.evaluate(()=>window.testState.db.profiles.push({id:'unused-2',role:'client',full_name:'Unused two'},{id:'unused-3',role:'client',full_name:'Unused three'}));
    await go('admin/clients');
    await page.evaluate(()=>route());
    await page.waitForFunction(()=>document.querySelectorAll('[data-delete-client]').length===3);
    await page.locator('#select-unused-clients').check();
    assert.equal(await page.locator('[data-delete-client]:checked').count(),2);
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#batch-delete-clients').click();
    await page.waitForFunction(()=>!window.testState.db.profiles.some(x=>x.id==='unused-2'||x.id==='unused-3'));
    assert.equal(await page.evaluate(()=>window.testState.db.projects.length),count);
    await go('admin/clients/client');
    await page.getByRole('button', { name: 'Supprimer le client' }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Supprimer le client' }).isDisabled(),
      true
    );
    await page.setViewportSize({ width: 375, height: 812 });
    await tool('guests');
    await page.locator('.guest-bulk').evaluate((el) => (el.open = true));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log(
      'PASS: drafts across tabs and auth focus, directory-only venues, PNG QR downloads, 160-row CSV import, clean paper lists, accepted music, public star reviews and protected client deletion'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
