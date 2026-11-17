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
        viewport: { width: 390, height: 844 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    await page.goto("http://127.0.0.1:8000/#/materiel");
    await page.evaluate(
      ({ pid, sourceId, speakerId }) => {
        const db = window.testState.db;
        db.equipment.find((g) => g.id === sourceId).name = "Yamaha MG06X";
        db.equipment.find((g) => g.id === speakerId).name = "Ibiza AMP 300";
        db.equipment_reservations.forEach((r) => (r.quantity = 1));
        const p = (
          id,
          equipment_id,
          name,
          direction,
          signal,
          group_name,
          audio_role,
        ) => ({
          id,
          equipment_id,
          name,
          direction,
          signal,
          group_name,
          audio_role,
          connector: "jack_ts",
          gender: "female",
          channels: 1,
          alternatives: [],
        });
        const outL = p(
          crypto.randomUUID(),
          sourceId,
          "MASTER OUT JACK L",
          "out",
          "line",
          "MASTER OUT JACK",
          "left",
        );
        const outR = p(
          crypto.randomUUID(),
          sourceId,
          "MASTER OUT JACK R",
          "out",
          "line",
          "MASTER OUT JACK",
          "right",
        );
        const inL = p(
          crypto.randomUUID(),
          speakerId,
          "IN Jack L",
          "in",
          "line",
          "IN Jack",
          "left",
        );
        const inR = p(
          crypto.randomUUID(),
          speakerId,
          "IN Jack R",
          "in",
          "line",
          "IN Jack",
          "right",
        );
        const hp = p(
          crypto.randomUUID(),
          speakerId,
          "OUT Cuivre",
          "out",
          "speaker",
          "",
          "independent",
        );
        hp.connector = "binding_post";
        hp.gender = "none";
        db.equipment_audio_ports = [outL, outR, inL, inR, hp];
        const oldL = { ...inL, signal: "speaker", audio_role: "right" },
          oldR = { ...inR, signal: "speaker", audio_role: "left" };
        db.project_setups = [
          {
            project_id: pid,
            revision: 3,
            layout: {
              width: 10,
              depth: 6,
              zones: [],
              nodes: [
                {
                  id: "source-node",
                  equipment_id: sourceId,
                  unit: 1,
                  label: "Yamaha MG06X #1",
                  x: 20,
                  y: 30,
                  ports: [outL, outR],
                },
                {
                  id: "amp-node",
                  equipment_id: speakerId,
                  unit: 1,
                  label: "Ibiza AMP 300 #1",
                  x: 70,
                  y: 30,
                  ports: [oldL, oldR, hp],
                },
              ],
              edges: [],
            },
          },
        ];
        window.initialSavedSetup = JSON.stringify(db.project_setups[0]);
      },
      { pid, sourceId, speakerId },
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#apply-catalogue-changes").waitFor();
    const wire = page.locator("#setup-wire");
    let from = await wire
      .locator("[name=from] option")
      .filter({ hasText: "MASTER OUT JACK — Stéréo" })
      .getAttribute("value");
    let to = await wire
      .locator("[name=to] option")
      .filter({ hasText: "IN Jack L" })
      .getAttribute("value");
    await wire.locator("[name=from]").selectOption(from);
    await wire.locator("[name=to]").selectOption(to);
    assert.match(
      await page.locator("#wire-selection-details").innerText(),
      /Puissance HP/,
    );
    await wire
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    await page
      .locator("#toast")
      .filter({ hasText: /Ibiza AMP 300 #1 · IN Jack L/ })
      .waitFor();
    assert.match(await page.locator("#toast").innerText(), /Puissance HP/);
    await page.locator("#apply-catalogue-changes").click();
    assert.equal(await page.locator("#apply-catalogue-changes").count(), 0);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.stringify(window.testState.db.project_setups[0]) ===
          window.initialSavedSetup,
      ),
      true,
    );
    from = await wire
      .locator("[name=from] option")
      .filter({ hasText: "MASTER OUT JACK — Stéréo" })
      .getAttribute("value");
    to = await wire
      .locator("[name=to] option")
      .filter({ hasText: "IN Jack — Stéréo" })
      .getAttribute("value");
    await wire.locator("[name=from]").selectOption(from);
    await wire.locator("[name=to]").selectOption(to);
    assert.equal(
      (await page.locator("#wire-selection-details").innerText()).includes(
        "Puissance HP",
      ),
      false,
    );
    assert.match(
      await page.locator("#wire-selection-details").innerText(),
      /IN Jack L.*Ligne/s,
    );
    await page.screenshot({ path: "/workspace/work/signal-fix-mobile.png" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await wire
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    // Catalogue refresh preserves even a newly incompatible cable in the draft rather than deleting it.
    await page.evaluate(
      ({ speakerId }) => {
        window.testState.db.equipment_audio_ports
          .filter((p) => p.equipment_id === speakerId && p.direction === "in")
          .forEach((p) => (p.signal = "speaker"));
      },
      { speakerId },
    );
    await page.goto(
      "http://127.0.0.1:8000/#/outils/" + pid + "?section=conductor",
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#apply-catalogue-changes").click();
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /Puissance HP/,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.stringify(window.testState.db.project_setups[0]) ===
          window.initialSavedSetup,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real signal-mismatch scenario, named port/level diagnostics, explicit catalogue-to-draft refresh, unchanged saved setup, valid mixer-to-amplifier stereo routing, no automatic cable deletion and mobile details",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
