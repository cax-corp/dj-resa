const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { mock, pid, sourceId, speakerId } = require("./production-mock.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    await page.goto("http://127.0.0.1:8000/#/materiel");
    await page.locator(`[data-audio-catalog="${sourceId}"]`).click();
    page.once("dialog", (d) => d.accept());
    await page.locator("#add-mg06x").click();
    await page.waitForFunction(
      () => window.testState.db.equipment_audio_ports.length === 11,
    );
    assert.equal(await page.locator("[data-port-edit]").count(), 11);
    page.once("dialog", (d) => d.accept());
    await page.locator("#add-mg06x").click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("[data-port-edit]").count(), 11);
    await page.locator("[data-port-edit]").first().click();
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /Combo/,
    );
    assert.equal(await page.locator(".audio-alternative").count(), 3);
    const form = page.locator("#audio-catalog-dialog form");
    await form.locator("[name=group_name]").fill("Entrées 1 / 2");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page
        .locator("#audio-catalog-dialog")
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    await page
      .locator("#audio-catalog-dialog")
      .evaluate((d) => (d.scrollTop = 0));
    await page.screenshot({ path: "/workspace/work/audio-combo-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await form
      .getByRole("button", { name: "Enregistrer le port", exact: true })
      .click();
    await page.locator("#new-audio-port").click();
    await form.locator("[name=name]").fill("Combo personnalisé");
    await page.locator("#choose-audio-connector").click();
    await page
      .locator("#connector-picker [data-connector=combo_xlr_jack]")
      .click();
    assert.equal(await page.locator(".audio-alternative").count(), 3);
    await page.locator("#close-audio-catalog").click();
    await page.locator(`[data-audio-catalog="${sourceId}"]`).click();
    assert.match(
      await page.locator("#choose-audio-connector").innerText(),
      /Combo/,
    );
    assert.equal(await page.locator(".audio-alternative").count(), 3);
    await form
      .getByRole("button", { name: "Enregistrer le port", exact: true })
      .click();
    await page.waitForFunction(
      () => window.testState.db.equipment_audio_ports.length === 12,
    );
    await page.locator("#choose-audio-connector").click();
    await page.locator("#connector-picker [data-connector=jack_ts]").click();
    await page.locator("#add-stereo-pair").click();
    const pair = page.locator("#stereo-pair-dialog");
    await pair.locator("[name=group]").fill("CH 7 / 8");
    await pair
      .getByRole("button", { name: "Ajouter les deux prises", exact: true })
      .click();
    await pair.waitFor({ state: "detached" });
    assert.equal(await page.locator("[data-port-edit]").count(), 14);
    await page.locator("#close-audio-catalog").click();
    // A line-level source with one physical TRS outlet, and a speaker line input.
    await page.evaluate(
      ({ speakerId }) => {
        window.testState.db.equipment_audio_ports.push(
          {
            id: crypto.randomUUID(),
            equipment_id: speakerId,
            name: "Line OUT",
            direction: "out",
            connector: "jack_trs",
            gender: "female",
            signal: "line",
            channels: 1,
          },
          {
            id: crypto.randomUUID(),
            equipment_id: speakerId,
            name: "Input",
            direction: "in",
            connector: "xlr3",
            gender: "female",
            signal: "line",
            channels: 1,
          },
        );
      },
      { speakerId },
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-add-all").click();
    const wire = page.locator("#setup-wire");
    const option = async (name, text) =>
      wire
        .locator(`[name=${name}] option`)
        .filter({ hasText: text })
        .first()
        .getAttribute("value");
    const from = await option("from", "Line OUT");
    const to = await option("to", "CH 1 / L · MIC/LINE · Jack 6,35 TRS");
    await wire.locator("[name=from]").selectOption(from);
    await wire.locator("[name=to]").selectOption(to);
    await wire
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /Jack 6,35 TRS mâle → Jack 6,35 TRS mâle/,
    );
    assert.equal(
      await wire
        .locator("[name=to] option")
        .filter({ hasText: "CH 1 / L · MIC/LINE" })
        .count(),
      0,
    );
    await page.locator("#save-setup").click();
    await page.waitForFunction(
      () => window.testState.db.project_setups[0]?.revision === 1,
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-connections article").waitFor();
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /Jack 6,35 TRS mâle → Jack 6,35 TRS mâle/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    // Unique hybrid matches may be proposed; all alternatives participate in ambiguity checks.
    await page.evaluate(
      ({ sourceId, speakerId }) => {
        const db = window.testState.db;
        const combo = db.equipment_audio_ports.find(
          (p) =>
            p.equipment_id === sourceId && p.name === "CH 1 / L · MIC/LINE",
        );
        const out = db.equipment_audio_ports.find(
          (p) => p.equipment_id === speakerId && p.name === "Line OUT",
        );
        db.equipment_audio_ports = [combo, out];
        db.project_setups = [];
        db.equipment_reservations.forEach((r) => (r.quantity = 1));
        sessionStorage.clear();
      },
      { sourceId, speakerId },
    );
    await page.goto(
      "http://127.0.0.1:8000/#/outils/" + pid + "?section=conductor",
    );
    await page
      .locator('.project-tool-launcher a.active[href$="section=conductor"]')
      .waitFor();
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-add-all").click();
    await page.locator("#suggest-wires").click();
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /Jack 6,35 TRS mâle → Jack 6,35 TRS mâle/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: additive/idempotent MG06X preset, custom combo and drafts, paired L/Mono–R creation, exact jack route, combo socket occupancy, save/reload and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
