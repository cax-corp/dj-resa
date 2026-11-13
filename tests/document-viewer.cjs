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
const fixtures = {
  docx: 'UEsDBBQAAAAAAPiIbV33S4B1dgEAAHYBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbDxUeXBlcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9jb250ZW50LXR5cGVzIj48RGVmYXVsdCBFeHRlbnNpb249InJlbHMiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtcGFja2FnZS5yZWxhdGlvbnNoaXBzK3htbCIvPjxEZWZhdWx0IEV4dGVuc2lvbj0ieG1sIiBDb250ZW50VHlwZT0iYXBwbGljYXRpb24veG1sIi8+PE92ZXJyaWRlIFBhcnROYW1lPSIvd29yZC9kb2N1bWVudC54bWwiIENvbnRlbnRUeXBlPSJhcHBsaWNhdGlvbi92bmQub3BlbnhtbGZvcm1hdHMtb2ZmaWNlZG9jdW1lbnQud29yZHByb2Nlc3NpbmdtbC5kb2N1bWVudC5tYWluK3htbCIvPjwvVHlwZXM+UEsDBBQAAAAAAPiIbV1hey9D8gAAAPIAAAALAAAAX3JlbHMvLnJlbHM8UmVsYXRpb25zaGlwcyB4bWxucz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3BhY2thZ2UvMjAwNi9yZWxhdGlvbnNoaXBzIj48UmVsYXRpb25zaGlwIElkPSJySWQxIiBUeXBlPSJodHRwOi8vc2NoZW1hcy5vcGVueG1sZm9ybWF0cy5vcmcvb2ZmaWNlRG9jdW1lbnQvMjAwNi9yZWxhdGlvbnNoaXBzL29mZmljZURvY3VtZW50IiBUYXJnZXQ9IndvcmQvZG9jdW1lbnQueG1sIi8+PC9SZWxhdGlvbnNoaXBzPlBLAwQUAAAAAAD4iG1dQMs+trkAAAC5AAAAEQAAAHdvcmQvZG9jdW1lbnQueG1sPHc6ZG9jdW1lbnQgeG1sbnM6dz0iaHR0cDovL3NjaGVtYXMub3BlbnhtbGZvcm1hdHMub3JnL3dvcmRwcm9jZXNzaW5nbWwvMjAwNi9tYWluIj48dzpib2R5Pjx3OnA+PHc6cj48dzp0PkRvY3VtZW50IFdvcmQgw6AgY29uc3VsdGVyIGRhbnMgbGUgc2l0ZTwvdzp0PjwvdzpyPjwvdzpwPjwvdzpib2R5Pjwvdzpkb2N1bWVudD5QSwECFAMUAAAAAAD4iG1d90uAdXYBAAB2AQAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAAAPiIbV1hey9D8gAAAPIAAAALAAAAAAAAAAAAAACAAacBAABfcmVscy8ucmVsc1BLAQIUAxQAAAAAAPiIbV1Ayz62uQAAALkAAAARAAAAAAAAAAAAAACAAcICAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAAAwADALkAAACqAwAAAAA=',
  xlsx: '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',
};
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    const bytes = {
      txt: Buffer.from('Texte à lire <script>window.hacked=true</script>'),
      csv: Buffer.from('Nom,Table\nJulie,3\n<script>,4'),
      png: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64'
      ),
      docx: Buffer.from(fixtures.docx, 'base64'),
      xlsx: Buffer.from(fixtures.xlsx, 'base64'),
      pdf: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'),
      doc: Buffer.from('legacy'),
    };
    const types = {
      txt: 'text/plain',
      csv: 'text/csv',
      png: 'image/png',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      doc: 'application/msword',
    };
    const docs = Object.keys(bytes).map((ext, i) => ({
      id: '30000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
      project_id: pid,
      name: 'Lecture.' + ext,
      mime_type: types[ext],
      size_bytes: bytes[ext].length,
      client_visible: false,
      created_at: '2026-11-13T12:00:00Z',
    }));
    await page.route('**/functions/v1/read-document', async (r) => {
      const body = r.request().postDataJSON();
      const state = await page.evaluate(() => window.testState);
      const link = state.db.document_read_links?.find(
        (x) => x.token === body.share_token && x.active
      );
      const doc = docs.find(
        (d) => d.id === (body.share_token ? link?.document_id : body.document_id)
      );
      if (!doc || (!body.share_token && !state.signedIn)) {
        await r.fulfill({ status: 404, json: { error: 'Document indisponible' } });
        return;
      }
      if (body.metadata)
        await r.fulfill({
          json: {
            name: doc.name,
            mime_type: doc.mime_type,
            size_bytes: doc.size_bytes,
            ...(!body.share_token ? { project_id: pid } : {}),
          },
        });
      else await r.fulfill({ contentType: doc.mime_type, body: bytes[doc.name.split('.').pop()] });
    });
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.evaluate((docs) => (window.testState.db.project_documents = docs), docs);
    const open = async (ext) => {
      await page.goto(base + '/#/document/' + docs.find((d) => d.name === 'Lecture.' + ext).id);
      await page.locator('#document-download:not([disabled])').waitFor();
    };
    await open('txt');
    await page
      .getByText('Texte à lire <script>window.hacked=true</script>', { exact: true })
      .waitFor();
    assert.equal(await page.evaluate(() => window.hacked), undefined);
    let dl = page.waitForEvent('download');
    await page.locator('#document-download').click();
    assert.equal((await dl).suggestedFilename(), 'Lecture.txt');
    await open('csv');
    await page.locator('.document-table').waitFor();
    assert.equal(await page.locator('.document-table tbody tr').count(), 3);
    await open('png');
    await page.waitForFunction(() => document.querySelector('.document-image')?.naturalWidth === 1);
    await open('pdf');
    await page.locator('.document-pdf').waitFor();
    assert.match(await page.locator('.document-pdf').getAttribute('src'), /^blob:/);
    await open('docx');
    await page.locator('.document-text').waitFor();
    assert.match(await page.locator('.document-text').innerText(), /Document Word/);
    await open('xlsx');
    await page.locator('.document-table').waitFor();
    assert.ok((await page.locator('.document-table td').count()) > 0);
    assert.ok((await page.locator('.document-sheet-choice option').count()) >= 1);
    await open('doc');
    await page.getByText(/Ce format ancien/).waitFor();
    await page.goto(base + '/#/outils/' + pid + '?section=documents');
    await page.getByRole('link', { name: 'Consulter', exact: true }).first().waitFor();
    await page
      .getByRole('button', { name: 'Partager un lien de lecture', exact: true })
      .first()
      .click();
    const url = await page
      .getByRole('textbox', { name: 'Lien de lecture du document' })
      .inputValue();
    assert.ok(url.startsWith(base + '/#/lecture/'));
    assert.ok(!url.includes('supabase'));
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(url);
    await page.locator('.document-text').waitFor();
    assert.equal(await page.locator('#auth-form').count(), 0);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.evaluate(() => (window.testState.signedIn = true));
    await page.goto(base + '/#/outils/' + pid + '?section=documents');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Révoquer le lien', exact: true }).click();
    await page.waitForFunction(() =>
      window.testState.db.document_read_links.every((x) => !x.active)
    );
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(url);
    await page.getByRole('heading', { name: 'Document indisponible' }).waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.project_documents.length),
      docs.length
    );
    await page.goto(base + '/#/document/' + docs[0].id);
    await page.locator('#auth-form').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: private reader, PDF/image/text/CSV/DOCX/XLSX previews, download, safe text, clean anonymous share, revoke, mobile, login and document preservation'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
