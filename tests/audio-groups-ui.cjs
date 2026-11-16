const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { mock, pid, sourceId, speakerId } = require("./audio-groups-mock.cjs");
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
    const ids = await page.evaluate(
      ({ sourceId, speakerId }) => {
        const p = (equipment_id, name, direction, connector, channels = 1) => ({
          id: crypto.randomUUID(),
          equipment_id,
          name,
          direction,
          connector,
          channels,
          signal: "line",
          gender: "female",
          alternatives: [],
          group_name: "",
          audio_role: "independent",
        });
        const db = window.testState.db;
        db.equipment_audio_ports = [
          p(sourceId, "MASTER RCA stéréo", "out", "rca_pair", 2),
          p(sourceId, "Source mono", "out", "jack_ts"),
          p(sourceId, "Source droite", "out", "jack_ts"),
          p(speakerId, "Entrée 3 L/Mono", "in", "jack_ts"),
          p(speakerId, "Entrée 4 R", "in", "jack_ts"),
        ];
        db.equipment_reservations.forEach((r) => (r.quantity = 1));
        return db.equipment_audio_ports.map((p) => p.id);
      },
      { sourceId, speakerId },
    );
    await page.locator(`[data-audio-catalog="${speakerId}"]`).click();
    await page.locator("#group-existing-ports").click();
    let popup = page.locator("#equipment-group-dialog");
    await popup.locator("[name=group_label]").fill("CH 3 / 4");
    await popup.locator("[name=left_id]").selectOption(ids[3]);
    await popup.locator("[name=right_id]").selectOption(ids[4]);
    await popup
      .getByRole("button", { name: "Enregistrer le groupe", exact: true })
      .click();
    await popup.waitFor({ state: "detached" });
    assert.equal(await page.locator(".audio-port-group").count(), 1);
    assert.equal(await page.locator(".audio-group-sockets > div").count(), 2);
    assert.match(
      await page.locator(".audio-port-group").innerText(),
      /L \/ Mono seule → mono/,
    );
    assert.equal(await page.locator("[data-port-edit]").count(), 2);
    assert.deepEqual(
      await page.evaluate(() =>
        window.testState.db.equipment_audio_ports
          .filter(
            (p) => p.equipment_id === "70000000-0000-4000-8000-000000000002",
          )
          .map((p) => p.id),
      ),
      ids.slice(3),
    );
    await page
      .locator("#audio-catalog-dialog")
      .evaluate((d) => (d.scrollTop = 0));
    await page.screenshot({
      path: "/workspace/work/equipment-stereo-groups.png",
    });
    // New pair chooses its own connector, independent of the default XLR individual form.
    await page.locator("#add-stereo-pair").click();
    popup = page.locator("#stereo-pair-dialog");
    await popup.locator("[name=group]").fill("AUX");
    assert.equal(
      await popup.locator("[name=pair_connector]").inputValue(),
      "jack_ts",
    );
    await popup
      .getByRole("button", { name: "Ajouter les deux prises", exact: true })
      .click();
    await popup.waitFor({ state: "detached" });
    assert.equal(await page.locator(".audio-port-group").count(), 2);
    await page.locator("#close-audio-catalog").click();
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-add-all").click();
    const f = page.locator("#setup-wire");
    const option = async (name, text) =>
      f
        .locator(`[name=${name}] option`)
        .filter({ hasText: text })
        .getAttribute("value");
    const from = await option("from", "MASTER RCA stéréo"),
      group = await option("to", "CH 3 / 4 — Stéréo");
    await f.locator("[name=from]").selectOption(from);
    await f.locator("[name=to]").selectOption(group);
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.equal(
      await f.locator("[name=to]").inputValue(),
      "",
      "An occupied group must not turn into another available group",
    );
    assert.equal(await page.locator("#stereo-cable-dialog").count(), 0);
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    assert.match(
      await page.locator("#setup-cable-summary").innerText(),
      /2 RCA mâles → 2 × Jack 6,35 TS mâle/,
    );
    assert.match(
      await page
        .locator(".setup-group-state")
        .filter({ hasText: "CH 3 / 4" })
        .innerText(),
      /Stéréo · L \+ R/,
    );
    await page.locator("[data-remove-wire]").click();
    const l = await option("to", "Entrée 3 L/Mono"),
      r = await option("to", "Entrée 4 R");
    await f
      .locator("[name=from]")
      .selectOption(await option("from", "Source mono"));
    await f.locator("[name=to]").selectOption(l);
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.match(
      await page
        .locator(".setup-group-state")
        .filter({ hasText: "CH 3 / 4" })
        .innerText(),
      /Mono · L\/Mono seule/,
    );
    await f
      .locator("[name=from]")
      .selectOption(await option("from", "Source droite"));
    await f.locator("[name=to]").selectOption(r);
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.match(
      await page
        .locator(".setup-group-state")
        .filter({ hasText: "CH 3 / 4" })
        .innerText(),
      /Stéréo · L \+ R/,
    );
    await page.locator("[data-remove-wire]").last().click();
    assert.match(
      await page
        .locator(".setup-group-state")
        .filter({ hasText: "CH 3 / 4" })
        .innerText(),
      /Mono · L\/Mono seule/,
    );
    await page.locator("#save-setup").click();
    await page.waitForFunction(
      () => window.testState.db.project_setups[0]?.revision === 1,
    );
    const snapshot = await page.evaluate(() =>
      JSON.stringify(window.testState.db.project_setups[0]),
    );
    await page.goto("http://127.0.0.1:8000/#/materiel");
    await page.locator(`[data-audio-catalog="${speakerId}"]`).click();
    page.once("dialog", (d) => d.accept());
    await page.locator("[data-ungroup-audio]").first().click();
    assert.equal(await page.locator("[data-port-edit]").count(), 4);
    assert.equal(await page.locator(".audio-port-group").count(), 1);
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(window.testState.db.project_setups[0]),
      ),
      snapshot,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page
        .locator("#audio-catalog-dialog")
        .evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: equipment-level existing socket grouping, two-socket stereo card, independent pair creator, direct stereo group wiring, automatic mono/stereo state, right disconnection fallback, saved plan preservation, dissociation and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
