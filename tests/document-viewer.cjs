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
const id = '30000000-0000-4000-8000-000000000001';
// A valid, small PDF so Chromium can exercise its native PDF viewer.
function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(text));
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const offset = Buffer.byteLength(text);
  text += 'xref\n0 4\n0000000000 65535 f \n';
  offsets.slice(1).forEach((n) => (text += String(n).padStart(10, '0') + ' 00000 n \n'));
  return Buffer.from(text + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
    headless: true,
  });
  try {
    const context = await browser.newContext();
    const bytes = pdfFixture();
    const doc = {
      id,
      project_id: pid,
      name: 'Plan.pdf',
      mime_type: 'application/pdf',
      size_bytes: bytes.length,
      client_visible: false,
      created_at: '2026-11-13T12:00:00Z',
    };
    await context.addInitScript({
      content: mock + `\nwindow.testState.db.project_documents=${JSON.stringify([doc])};`,
    });
    await context.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: '' })
    );
    let token = null,
      active = true;
    await context.route('**/functions/v1/read-document', async (r) => {
      const body = r.request().postDataJSON();
      if (body.share_token && (!active || body.share_token !== token))
        return r.fulfill({ status: 404, json: { error: 'Indisponible' } });
      if (body.metadata) return r.fulfill({ json: doc });
      return r.fulfill({ contentType: 'application/pdf', body: bytes });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.goto(base + '/#/outils/' + pid + '?section=documents');
    const link = page.getByRole('link', { name: 'Ouvrir', exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute('target'), '_blank');
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await popup.waitForURL(/^blob:/);
    assert.equal(await popup.locator('#app').count(), 0, 'No site reader surrounds the PDF');
    assert.equal(await popup.locator('.document-pdf').count(), 0, 'No PDF iframe in site UI');
    assert.ok(page.url().endsWith('?section=documents'), 'Project tab stays open');
    await popup.close();
    const dlPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Télécharger', exact: true }).click();
    const dl = await dlPromise;
    assert.equal(dl.suggestedFilename(), 'Plan.pdf');
    assert.deepEqual(fs.readFileSync(await dl.path()), bytes);
    await page.getByRole('button', { name: 'Partager un lien de lecture', exact: true }).click();
    const url = await page
      .getByRole('textbox', { name: 'Lien de lecture du document' })
      .inputValue();
    token = url.split('/').pop();
    assert.ok(url.startsWith(base + '/#/lecture/'));
    // An anonymous recipient follows the already-created link.
    const shared = await context.newPage();
    await shared.addInitScript(() => (window.testState.signedIn = false));
    await shared.goto(url);
    await shared.waitForURL(/^blob:/);
    assert.equal(await shared.locator('#auth-form').count(), 0);
    await shared.close();
    // The existing link is still revocable; no files are changed.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Révoquer le lien', exact: true }).click();
    await page.waitForFunction(() =>
      window.testState.db.document_read_links.every((l) => !l.active)
    );
    active = false;
    const revoked = await context.newPage();
    await revoked.goto(url);
    await revoked.getByRole('heading', { name: 'Document indisponible' }).waitFor();
    assert.equal(await page.evaluate(() => window.testState.db.project_documents.length), 1);
    console.log(
      'PASS: PDF opens in the native browser tab without site UI; project stays open, original download, anonymous link, revocation and existing document preserved'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
