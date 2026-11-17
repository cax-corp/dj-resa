const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
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
    async function importModel(id, query, title, count) {
      await page.locator(`[data-audio-catalog="${id}"]`).click();
      await page.locator("#search-audio-model").click();
      const search = page.locator("#audio-model-search");
      await search.locator("input[type=search]").fill(query);
      await search
        .locator("article")
        .filter({ has: page.getByText(title, { exact: true }) })
        .getByRole("button", { name: "Voir les prises" })
        .click();
      assert.equal(
        await search.locator("[data-import-port]:checked").count(),
        count,
      );
      await search
        .getByRole("link", { name: "Consulter la source constructeur" })
        .waitFor();
      await search
        .getByRole("button", {
          name: "Ajouter les prises cochées",
          exact: true,
        })
        .click();
      await search.waitFor({ state: "detached" });
      await page.locator("#close-audio-catalog").click();
    }
    await page.locator(`[data-audio-catalog="${sourceId}"]`).click();
    await page.locator("#search-audio-model").click();
    await page
      .locator("#audio-model-search")
      .getByText(/Modèle absent du catalogue/)
      .waitFor();
    await page.locator("#audio-model-search [data-close-model]").click();
    await page.locator("#close-audio-catalog").click();
    await importModel(sourceId, "flx6 gt", "Pioneer DJ DDJ-FLX6-GT", 8);
    await importModel(speakerId, "mg06x", "Yamaha MG06X", 11);
    // An existing equipment configuration remains available for reuse; importing never silently replaces it.
    await page.locator(`[data-audio-catalog="${sourceId}"]`).click();
    await page.locator("#search-audio-model").click();
    const search = page.locator("#audio-model-search");
    await search.locator("input[type=search]").fill("flx6gt");
    await search
      .locator("article")
      .filter({
        has: page.getByText("Pioneer DJ DDJ-FLX6-GT", { exact: true }),
      })
      .getByRole("button", { name: "Voir les prises" })
      .click();
    assert.equal(await search.locator("[data-import-port]:checked").count(), 0);
    assert.equal(
      await search.locator("[data-import-port]:disabled").count(),
      8,
    );
    await search.locator("[data-close-model]").click();
    await page.locator("#close-audio-catalog").click();
    await page.evaluate(() =>
      window.testState.db.equipment_reservations.forEach(
        (r) => (r.quantity = 1),
      ),
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-add-all").click();
    await page.locator("#add-stereo-cable").click();
    let popup = page.locator("#stereo-cable-dialog");
    let src = await popup
      .locator("[name=source] option")
      .filter({ hasText: "MASTER · L →" })
      .first()
      .getAttribute("value");
    let dst = await popup
      .locator("[name=target] option")
      .filter({ hasText: "CH 3 / 4" })
      .first()
      .getAttribute("value");
    await popup.locator("[name=source]").selectOption(src);
    await popup.locator("[name=target]").selectOption(dst);
    await popup.locator("[name=cable_length]").fill("5");
    await popup
      .getByRole("button", { name: "Ajouter le cordon", exact: true })
      .click();
    await popup.waitFor({ state: "detached" });
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    assert.equal(
      await page.locator("#setup-cable-summary tbody tr").count(),
      1,
    );
    assert.equal(
      await page.locator("#setup-cable-summary tbody tr td").last().innerText(),
      "1",
    );
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /2 × RCA mono mâle → 2 × Jack 6,35 TS mâle/,
    );
    assert.equal(
      await page
        .locator("#setup-wire [name=to] option")
        .filter({ hasText: "CH 4 · R" })
        .count(),
      0,
    );
    assert.match(
      await page.locator("#setup-alerts").innerText(),
      /gauche et droite raccordées/,
    );
    await page.locator("[data-remove-wire]").click();
    // Reproduce the user's pre-existing stereo RCA entry, without rebuilding any target sockets.
    await page.evaluate(
      ({ sourceId }) => {
        window.testState.db.equipment_audio_ports =
          window.testState.db.equipment_audio_ports.filter(
            (p) => p.equipment_id !== sourceId,
          );
        window.testState.db.equipment_audio_ports.push({
          id: crypto.randomUUID(),
          equipment_id: sourceId,
          name: "Master existant",
          connector: "rca_pair",
          gender: "female",
          signal: "line",
          direction: "out",
          channels: 2,
        });
      },
      { sourceId },
    );
    const node = await page
      .locator("#setup-node [name=node] option")
      .filter({ hasText: "Controller" })
      .first()
      .getAttribute("value");
    await page.locator("#setup-node [name=node]").selectOption(node);
    page.once("dialog", (d) => d.accept());
    await page.locator("#refresh-node-ports").click();
    const wire = page.locator("#setup-wire");
    src = await wire
      .locator("[name=from] option")
      .filter({ hasText: "Master existant" })
      .getAttribute("value");
    dst = await wire
      .locator("[name=to] option")
      .filter({ hasText: "CH 3 · L / Mono" })
      .getAttribute("value");
    await wire.locator("[name=from]").selectOption(src);
    await wire.locator("[name=to]").selectOption(dst);
    assert.ok(
      (await wire.locator("[name=to]").inputValue()).startsWith("group:"),
      "Selecting a mono member for stereo must select its pair",
    );
    await page.locator("#add-stereo-cable").click();
    popup = page.locator("#stereo-cable-dialog");
    await popup.waitFor();
    assert.notEqual(await popup.locator("[name=source]").inputValue(), "");
    assert.notEqual(await popup.locator("[name=target]").inputValue(), "");
    // Manual L/R selection also works for old jack ports that have no group metadata.
    await popup.locator("[name=target]").selectOption("manual");
    let l = await popup
      .locator("[name=target_left] option")
      .filter({ hasText: "CH 3 · L / Mono" })
      .getAttribute("value");
    await popup.locator("[name=target_left]").selectOption(l);
    let r = await popup
      .locator("[name=target_right] option")
      .filter({ hasText: "CH 4 · R" })
      .getAttribute("value");
    await popup.locator("[name=target_right]").selectOption(r);
    await popup.locator("[name=cable_length]").fill("3");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await popup.evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    await page.screenshot({ path: "/workspace/work/stereo-cable-mobile.png" });
    await popup
      .getByRole("button", { name: "Ajouter le cordon", exact: true })
      .click();
    await popup.waitFor({ state: "detached" });
    assert.match(
      await page.locator("#setup-connections").innerText(),
      /2 RCA mâles → 2 × Jack 6,35 TS mâle/,
    );
    await page.locator("#save-setup").click();
    await page.waitForFunction(
      () => window.testState.db.project_setups[0]?.revision === 1,
    );
    const saved = await page.evaluate(
      () => window.testState.db.project_setups[0].layout.edges[0],
    );
    assert.equal(saved.stereo, true);
    assert.ok(saved.to_right_port);
    assert.equal(saved.length, 3);
    await page.evaluate(() => (window.print = () => {}));
    await page.locator("#print-cables").click();
    assert.equal(await page.locator("#print-sheet tbody tr").count(), 1);
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    const dl = page.waitForEvent("download");
    await page.locator("#setup-svg").click();
    const file = await dl;
    const svg = fs.readFileSync(await file.path(), "utf8");
    assert.match(svg, /CH 3/);
    assert.match(svg, /CH 4/);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: sourced searchable models, selective/no-overwrite import, atomic stereo RCA-to-dual-jack and paired cables, automatic mismatch handoff, manual L/R, port occupancy, one-cable packing/print, SVG, persistence and mobile",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
