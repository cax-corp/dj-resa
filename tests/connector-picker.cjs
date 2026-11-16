const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { mock, pid, sourceId } = require("./production-mock.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 960 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    const open = async () => {
      await page.goto("http://127.0.0.1:8000/#/materiel");
      await page.locator(`[data-audio-catalog="${sourceId}"]`).click();
    };
    await open();
    let form = page.locator("#audio-catalog-dialog form");
    assert.equal(await form.locator("select[name=connector]").count(), 0);
    assert.equal(await form.locator("input[name=channels]").isVisible(), false);
    await form.locator("[name=name]").fill("Sortie ampli gauche");
    await form.locator("[name=direction]").selectOption("out");
    await page.locator("#choose-audio-connector").click();
    assert.equal(
      await page.locator("#connector-picker .connector-card").count(),
      35,
    );
    assert.equal(
      await page.locator("#connector-picker .connector-card svg").count(),
      35,
    );
    await page.locator("#connector-picker input").fill("cuivre");
    assert.equal(
      await page.locator("#connector-picker .connector-card").count(),
      1,
    );
    await page
      .locator("#connector-picker [data-connector=binding_post]")
      .click();
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /Bornier HP à vis/,
    );
    assert.equal(await form.locator("[name=gender]").isVisible(), false);
    assert.equal(await form.locator("[name=signal]").inputValue(), "speaker");
    await page.locator("#close-audio-catalog").click();
    await page.goto("http://127.0.0.1:8000/#/");
    await open();
    form = page.locator("#audio-catalog-dialog form");
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /Bornier HP à vis/,
    );
    assert.equal(
      await form.locator("[name=name]").inputValue(),
      "Sortie ampli gauche",
    );
    await form
      .getByRole("button", { name: "Enregistrer le port", exact: true })
      .click();
    await page
      .locator("#audio-catalog-dialog strong")
      .getByText("Sortie ampli gauche", { exact: true })
      .waitFor();
    const port = await page.evaluate(
      () => window.testState.db.equipment_audio_ports[0],
    );
    assert.equal(port.connector, "binding_post");
    assert.equal(port.gender, "none");
    assert.equal(port.channels, 1);
    await page.locator("[data-port-edit]").click();
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /Bornier HP à vis/,
    );
    await page.locator("#choose-audio-connector").click();
    await page.locator("#connector-picker [data-connector=rca_pair]").click();
    assert.equal(await form.locator("[name=channels]").inputValue(), "2");
    assert.equal(await form.locator("[name=gender]").isVisible(), true);
    await page.locator("#new-audio-port").click();
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /XLR 3/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#choose-audio-connector").click();
    await page.locator("#connector-picker input").fill("vis");
    await page.screenshot({
      path: "/workspace/work/connector-picker-mobile.png",
    });
    assert.equal(
      await page
        .locator("#connector-picker")
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    await page.keyboard.press("Escape");
    await page.locator("#connector-picker").waitFor({ state: "detached" });
    await page.locator("#close-audio-catalog").click();
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    const zone = page.locator("#setup-zone");
    await zone.waitFor();
    assert.equal(
      await zone.locator("[name=w],[name=h],[name=x],[name=y]").count(),
      0,
    );
    await zone.locator("[name=name]").fill("Scène");
    await zone.locator("[name=size]").selectOption("large");
    await zone
      .getByRole("button", { name: "Ajouter la zone", exact: true })
      .click();
    const z = page.locator('#setup-stage [aria-label="Zone Scène"]');
    await z.waitFor();
    await z.focus();
    await page.keyboard.press("ArrowRight");
    await page.locator("#save-setup").click();
    await page.waitForFunction(
      () => window.testState.db.project_setups[0]?.revision === 1,
    );
    const saved = await page.evaluate(
      () => window.testState.db.project_setups[0].layout.zones[0],
    );
    assert.equal(saved.w, 60);
    assert.equal(saved.x, 11);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 35 illustrated choices, search, stripped-wire defaults, hidden automatic formats, draft/edit/reset, mobile popup, Escape and draggable preset zones",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
