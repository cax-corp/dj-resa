const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { mock, pid } = require("./event-companion-mock.cjs");
const ctx = vm.createContext({});
vm.runInContext(
  fs.readFileSync(__dirname + "/../project-operations.js", "utf8") +
    "\n" +
    fs.readFileSync(__dirname + "/../event-companion.js", "utf8"),
  ctx,
);
const config = vm.runInContext(
  "({tools:EventCompanion.recordTools,fields:Object.fromEntries(Object.keys(EventCompanion.recordTools).map(k=>[k,ProjectOperations.fieldsFor(k)]))})",
  ctx,
);
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [];
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", (d) => d.accept());
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    await page.route("**/functions/v1/read-document", (r) =>
      r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6dYsAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    const tool = async (key) => {
      await page.goto(
        "http://127.0.0.1:8000/#/outils/" + pid + "?section=" + key,
      );
      await page.locator(".tool-current").waitFor();
      await page.waitForFunction(
        () =>
          document.getElementById("app").getAttribute("aria-busy") === "false",
      );
      assert.equal(
        await page
          .locator("#app")
          .getByText(/^Erreur :/)
          .count(),
        0,
        "Route " + key,
      );
    };
    await page.goto("http://127.0.0.1:8000/#/admin/projets/" + pid);
    await page.locator("#edit-form").waitFor();
    await page.locator("[data-browse-tools]").click();
    assert.equal(await page.locator("#project-tools-groups a").count(), 68);
    await page.keyboard.press("Escape");
    // Each of the 30 record types creates a persisted, project-scoped, editable row.
    for (const key of Object.keys(config.tools)) {
      await tool(key);
      await page.locator("#ops-editor").evaluate((e) => (e.open = true));
      const f = page.locator("#ops-form");
      await f.locator("[name=label]").fill("Essai " + key);
      for (const field of config.fields[key]) {
        const input = f.locator("[name=" + field.key + "]");
        if (field.type === "select")
          await input.selectOption(Object.keys(field.options)[0]);
        else if (field.key === "document_id" || field.key === "supply_id")
          continue;
        else if (field.type === "number")
          await input.fill(
            String(field.value ?? (field.required ? field.min || 1 : "")),
          );
        else if (field.type === "date" || field.type === "datetime-local")
          continue;
        else if (field.type === "url")
          await input.fill("https://example.org/support");
        else await input.fill("Test " + field.key);
      }
      await f.getByRole("button", { name: "Enregistrer", exact: true }).click();
      await page
        .locator("[data-ops-item]")
        .filter({ hasText: "Essai " + key })
        .waitFor();
      assert.equal(
        await page.evaluate(
          (k) =>
            window.testState.db.project_companion_items.filter(
              (x) => x.tool === k,
            ).length,
          key,
        ),
        1,
        key,
      );
    }
    console.log("PASS 30 record workspaces create and persist");
    // Actions survive filtering and are idempotent.
    await tool("issues");
    await page.locator("#ops-search").fill("Essai");
    await page
      .getByRole("button", { name: "Créer une tâche", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Créer une tâche", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_tasks.filter(
            (x) => x.label === "Essai issues",
          ).length,
      ),
      1,
    );
    await page
      .getByRole("button", { name: "Consigner au journal", exact: true })
      .click();
    assert.ok(
      await page.evaluate(() =>
        window.testState.db.project_companion_items.some(
          (x) => x.tool === "logbook" && x.label === "Essai issues",
        ),
      ),
    );
    await tool("opening_checks");
    await page.locator("#companion-seed").click();
    await page
      .getByText("Contrôle importé opening_checks", { exact: true })
      .waitFor();
    await page.locator("#companion-seed").click();
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_companion_items.filter(
            (x) => x.source_key === "seed:opening_checks",
          ).length,
      ),
      1,
    );
    await page.evaluate(() => {
      const i = window.testState.db.project_companion_items.find(
        (x) => x.tool === "changes",
      );
      i.status = "published";
    });
    await tool("changes");
    await page.getByRole("button", { name: "Confirmer ma lecture" }).click();
    await page.getByRole("button", { name: "Lecture confirmée" }).waitFor();
    // Clock, fixed-time preview, cross-midnight shift and actual persisted commands.
    await tool("regie_clock");
    await page.getByRole("button", { name: "Démarrer / reprendre" }).click();
    await page.waitForFunction(
      () => window.testState.db.project_regie_clocks.length === 1,
    );
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.waitForFunction(
      () => !window.testState.db.project_regie_clocks[0].running_since,
    );
    await tool("schedule_shift");
    await page.locator("#shift-form [name=delta]").fill("45");
    await page.locator("#shift-form input[value=fixed]").check();
    await page
      .getByRole("button", { name: "Prévisualiser", exact: true })
      .click();
    assert.ok(
      await page
        .locator("#shift-preview")
        .getByText(/chevauche/)
        .count(),
    );
    assert.equal(await page.locator("#apply-shift").isDisabled(), true);
    await page.locator("#shift-form input[value=fixed]").uncheck();
    await page
      .getByRole("button", { name: "Prévisualiser", exact: true })
      .click();
    await page.locator("#apply-shift").click();
    await page.waitForFunction(
      () =>
        window.testState.db.schedule_items[0].day_offset === 1 &&
        window.testState.db.schedule_items[0].start_time === "00:15",
    );
    // Person brief derives from existing assignments; technical references/calculators work.
    await tool("briefs");
    await page.locator("[name=person]").fill("Alex");
    await page.getByRole("button", { name: "Préparer le brief" }).click();
    await page
      .locator("#person-brief")
      .getByText(/Préparer micro/)
      .waitFor();
    await tool("tech_tools");
    assert.ok(
      (await page.locator(".companion-connectors article").count()) > 30,
    );
    await page.locator("#connector-reference-search").fill("RCA");
    assert.ok(
      (await page.locator(".companion-connectors article").count()) > 0,
    );
    await tool("setup_check");
    await tool("labels");
    await tool("live");
    // Guided diagnostic prepares a saved report; media checker remains bound after document controls.
    await tool("diagnostics");
    await page.getByRole("button", { name: "Vérifié, étape suivante" }).click();
    await page.getByRole("button", { name: "Le problème est résolu" }).click();
    assert.equal(
      await page.locator("#ops-form [name=status]").inputValue(),
      "resolved",
    );
    await tool("media_checks");
    await page.locator("#media-check-start").click();
    await page.locator("#prepare-media-check").waitFor();
    await page.locator("#prepare-media-check").click();
    assert.equal(
      await page.locator("#ops-form [name=status]").inputValue(),
      "checked",
    );
    // Potards: hardware templates, pointer/range/keyboard, custom ranges, persistence and draft restoration.
    await tool("settings");
    await page
      .locator("#equipment-setting-form [name=name]")
      .fill("Balance principale");
    await page.locator("#settings-template").selectOption("mg06x");
    await page.locator("#apply-setting-template").click();
    assert.equal(await page.locator("[data-setting-control]").count(), 20);
    let knob = page.locator("[data-setting-control]").first(),
      slider = knob.locator("input[type=range]");
    await slider.fill("73");
    await slider.press("ArrowRight");
    assert.equal(await slider.inputValue(), "74");
    await page
      .locator("#equipment-setting-form")
      .getByRole("button", { name: "Enregistrer la configuration" })
      .click();
    await page.waitForFunction(
      () => window.testState.db.equipment_setting_presets.length === 1,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.equipment_setting_presets[0].controls[0].value,
      ),
      74,
    );
    await page.locator("[data-load-preset]").click();
    knob = page.locator("[data-setting-control]").first();
    await knob.locator("[data-configure-control]").click();
    let popup = page.locator(".settings-control-dialog");
    await popup.locator("[name=label]").fill("Gain personnalisé");
    await popup.locator("[name=min]").fill("-12");
    await popup.locator("[name=max]").fill("12");
    await popup.locator("[name=value]").fill("3");
    await popup.locator("[name=unit]").fill("dB");
    await popup.getByRole("button", { name: "Appliquer", exact: true }).click();
    await page
      .locator("#equipment-setting-form [name=name]")
      .fill("Balance brouillon");
    await tool("live");
    await tool("settings");
    assert.equal(
      await page.locator("#equipment-setting-form [name=name]").inputValue(),
      "Balance brouillon",
    );
    assert.ok(
      (await page.locator("#virtual-control-board").innerText()).includes(
        "Gain personnalisé",
      ),
    );
    await page
      .locator("#equipment-setting-form")
      .getByRole("button", { name: "Enregistrer la configuration" })
      .click();
    await page.waitForFunction(
      () =>
        window.testState.db.equipment_setting_presets[0].name ===
        "Balance brouillon",
    );
    await page.locator("[data-load-preset]").click();
    await page.locator("#virtual-control-board").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/workspace/work/virtual-knobs-desktop.png",
    });
    // Search crosses records, guests, documents and presets. Preferences hide tools without deleting data.
    await tool("project_search");
    await page.locator("[name=query]").fill("Balance brouillon");
    await page
      .locator("#event-search-results")
      .getByText("Balance brouillon", { exact: true })
      .waitFor();
    await page.goto("http://127.0.0.1:8000/#/recherche");
    await page.locator("#event-search-form").waitFor();
    await page.locator("[name=query]").fill("Essai issues");
    await page
      .locator("#event-search-results")
      .getByText("Essai issues", { exact: true })
      .first()
      .waitFor();
    await tool("live");
    await page.locator("[data-browse-tools]").click();
    await page.locator("#customize-project-tools").click();
    popup = page.locator("dialog").last();
    await popup.locator("[name=visible][value=signage]").uncheck();
    await popup.getByRole("button", { name: "Enregistrer mes outils" }).click();
    assert.equal(
      await page
        .locator('#project-tools-groups a[href$="section=signage"]')
        .count(),
      0,
    );
    await page.locator("#show-hidden-tools").check();
    assert.equal(
      await page
        .locator('#project-tools-groups a[href$="section=signage"]')
        .count(),
      1,
    );
    await page.keyboard.press("Escape");
    // Public practical page is a whitelist and can be closed.
    await page.evaluate(
      ({ pid }) => {
        window.testState.db.project_companion_items.push(
          {
            id: crypto.randomUUID(),
            project_id: pid,
            tool: "practical_info",
            label: "Entrée publique",
            status: "published",
            revision: 1,
            details: { audience: "public", body: "Entrée côté parking" },
          },
          {
            id: crypto.randomUUID(),
            project_id: pid,
            tool: "practical_info",
            label: "Consigne privée",
            status: "published",
            revision: 1,
            details: { audience: "private", body: "Secret" },
          },
        );
        window.testState.db.project_practical_links.push({
          id: crypto.randomUUID(),
          project_id: pid,
          token: "20000000-0000-4000-8000-000000000099",
          is_open: true,
        });
      },
      { pid },
    );
    await page.goto(
      "http://127.0.0.1:8000/#/infos/20000000-0000-4000-8000-000000000099",
    );
    await page.getByText("Entrée côté parking", { exact: true }).waitFor();
    assert.equal(await page.getByText("Secret", { exact: true }).count(), 0);
    await page.evaluate(
      () => (window.testState.db.project_practical_links[0].is_open = false),
    );
    await page.evaluate(() => route());
    await page.getByText("Lien indisponible", { exact: true }).waitFor();
    // Mobile/dark presets and viewer/client limits.
    await tool("settings");
    await page.locator("[data-load-preset]").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => setTheme("dark"));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.locator("#virtual-control-board").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/workspace/work/virtual-knobs-mobile.png" });
    await page.evaluate(() => {
      window.testState.role = "dj";
      window.testState.db.project_members = [
        {
          project_id: window.testState.db.projects[0].id,
          user_id: "team",
          access_role: "viewer",
        },
      ];
    });
    await page.evaluate(() => route());
    await page.locator("[data-load-preset]").click();
    assert.equal(await page.locator("[data-configure-control]").count(), 0);
    assert.equal(
      await page.locator("#equipment-setting-form [type=submit]").count(),
      0,
    );
    await page.locator("[data-browse-tools]").click();
    assert.equal(
      await page
        .locator('#project-tools-groups a[href$="section=urgent_expenses"]')
        .count(),
      0,
    );
    assert.equal(
      await page
        .locator('#project-tools-groups a[href$="section=extras"]')
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 38 tools + cross-project search, CRUD, additive imports, idempotent actions, acknowledgements, clock/shift, diagnostics/media checks, virtual controls/drafts, preferences/public whitelist, desktop/mobile/dark and viewer/private finance boundaries",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
