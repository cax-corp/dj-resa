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
      ({ sourceId, speakerId }) => {
        const db = window.testState.db,
          p = (equipment_id, name, direction, group_name, audio_role) => ({
            id: crypto.randomUUID(),
            equipment_id,
            name,
            direction,
            group_name,
            audio_role,
            connector: "jack_ts",
            gender: "female",
            signal: "line",
            channels: 1,
            alternatives: [],
          });
        db.equipment_audio_ports = [
          p(sourceId, "Master L Jack", "out", "MASTER OUT JACK", "left"),
          p(sourceId, "Master R Jack", "out", "MASTER OUT JACK", "right"),
          p(sourceId, "Source mono", "out", "", "independent"),
          p(speakerId, "IN Jack L", "in", "IN Jack", "left"),
          p(speakerId, "IN Jack R", "in", "IN Jack", "right"),
          p(speakerId, "Entrée seule", "in", "", "independent"),
        ];
        db.equipment.find((g) => g.id === sourceId).name = "Yamaha MG06X";
        db.equipment.find((g) => g.id === speakerId).name = "Ibiza AMP 300";
        db.equipment_reservations.forEach((r) => (r.quantity = 1));
      },
      { sourceId, speakerId },
    );
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#setup-add-all").click();
    const f = page.locator("#setup-wire"),
      option = async (key, text) =>
        f
          .locator(`[name=${key}] option`)
          .filter({ hasText: text })
          .getAttribute("value");
    const stereoOut = await option("from", "MASTER OUT JACK — Stéréo"),
      leftOut = await option("from", "Master L Jack"),
      monoOut = await option("from", "Source mono");
    const stereoIn = await option("to", "IN Jack — Stéréo"),
      leftIn = await option("to", "IN Jack L"),
      rightIn = await option("to", "IN Jack R"),
      singleIn = await option("to", "Entrée seule");
    await f.locator("[name=from]").selectOption(stereoOut);
    await f.locator("[name=to]").selectOption(leftIn);
    assert.equal(await f.locator("[name=to]").inputValue(), stereoIn);
    assert.match(
      await page.locator("#wire-selection-details").innerText(),
      /Entrée : Ibiza AMP 300 #1.*2 prises L \+ R.*IN Jack L.*IN Jack R/s,
    );
    assert.match(
      await page.locator("#wire-pairing-help").innerText(),
      /groupe stéréo complet/,
    );
    await f.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/workspace/work/stereo-selection-mobile.png",
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    assert.equal(
      await page.evaluate(() => window.testState.db.project_setups.length),
      0,
      "Selections do not modify a saved project",
    );
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    assert.equal(await page.locator("#stereo-cable-dialog").count(), 0);
    assert.equal(
      await page.locator("#setup-cable-summary tbody tr td").last().innerText(),
      "1",
    );
    assert.equal(
      await f
        .locator("[name=to] option")
        .filter({ hasText: "IN Jack R" })
        .count(),
      0,
    );
    await page.locator("[data-remove-wire]").click();
    // Selecting the member first, or selecting R instead of L, still chooses the same physical pair.
    await f.locator("[name=from]").selectOption("");
    await f.locator("[name=to]").selectOption(rightIn);
    await f.locator("[name=from]").selectOption(stereoOut);
    assert.equal(await f.locator("[name=to]").inputValue(), stereoIn);
    // The reverse direction (two source sockets into a stereo target) is handled symmetrically.
    await f.locator("[name=from]").selectOption("");
    await f.locator("[name=to]").selectOption(stereoIn);
    await f.locator("[name=from]").selectOption(leftOut);
    assert.equal(await f.locator("[name=from]").inputValue(), stereoOut);
    // Mono on both ends remains mono, without capturing a spare R port.
    await page.locator("[data-reset-mono]").click();
    await f.locator("[name=from]").selectOption(monoOut);
    await f.locator("[name=to]").selectOption(leftIn);
    assert.equal(await f.locator("[name=to]").inputValue(), leftIn);
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    assert.equal(await page.locator("#setup-connections article").count(), 1);
    await page.locator("[data-remove-wire]").click();
    // An ungrouped socket is never paired with an arbitrary neighbouring socket.
    await f.locator("[name=from]").selectOption(stereoOut);
    await f.locator("[name=to]").selectOption(singleIn);
    assert.equal(await f.locator("[name=to]").inputValue(), singleIn);
    assert.match(
      await page.locator("#wire-pairing-help").innerText(),
      /manuellement/,
    );
    await f
      .getByRole("button", { name: "Ajouter la liaison", exact: true })
      .click();
    const popup = page.locator("#stereo-cable-dialog");
    await popup.waitFor();
    assert.equal(await popup.locator("[name=target]").inputValue(), "manual");
    assert.notEqual(await popup.locator("[name=target_left]").inputValue(), "");
    await popup.locator("[data-close-stereo]").click();
    assert.equal(await page.locator("#setup-connections article").count(), 0);
    // Several accepted right plugs are a real choice, not a reason to guess the first pair.
    await page.evaluate(
      ({ speakerId }) => {
        const r = window.testState.db.equipment_audio_ports.find(
          (p) => p.equipment_id === speakerId && p.name === "IN Jack R",
        );
        r.alternatives = [
          {
            id: crypto.randomUUID(),
            connector: "jack_trs",
            signal: "line",
            gender: "female",
            channels: 1,
          },
        ];
      },
      { speakerId },
    );
    await page.goto(
      "http://127.0.0.1:8000/#/outils/" + pid + "?section=conductor",
    );
    await page
      .locator('.project-tool-launcher a.active[href$="section=conductor"]')
      .waitFor();
    await page.goto("http://127.0.0.1:8000/#/outils/" + pid + "?section=setup");
    await page.locator("#apply-catalogue-changes").click();
    await f.locator("[name=from]").selectOption(stereoOut);
    await f.locator("[name=to]").selectOption(leftIn);
    assert.equal(await f.locator("[name=to]").inputValue(), leftIn);
    assert.equal(await page.locator("[data-pair-choice]").count(), 2);
    await page.locator("[data-pair-choice]").last().click();
    assert.ok((await f.locator("[name=to]").inputValue()).startsWith("group:"));
    assert.match(
      await page.locator("#wire-selection-details").innerText(),
      /IN Jack R · Jack 6,35 TRS/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: screenshot stereo-to-mono-member selection promotes the exact free L/R pair, both selection orders and directions, full mobile details, unchanged saved projects, stereo cable count/occupancy, mono preservation and explicit manual fallback",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
