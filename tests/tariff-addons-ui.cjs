const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
const { mock: baseMock, pid } = require("./production-mock.cjs");
const mock =
  baseMock +
  `\nObject.assign(window.testState.db,{settings:[{id:1,data:{company_name:'Test issuer'}}],rate_addons:[{id:'syntra',name:'Accès au logiciel Syntra',amount:null,unit:'forfait',event_type:null,description:'Espace projet partagé',active:true},{id:'birthday-only',name:'Option anniversaire',amount:20,unit:'forfait',event_type:'anniversaire',description:'',active:true},{id:'inactive',name:'Option inactive',amount:99,unit:'forfait',active:false}]});window.testState.db.projects[0].event_type='mariage';`;
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
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(10000);
    page.on("dialog", (d) => d.accept());
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    const account = async () => {
      await page.goto("http://127.0.0.1:8000/#/compte");
      await page
        .locator("[data-addon-catalog=syntra]")
        .waitFor({ state: "attached" });
    };
    const project = async () => {
      await page.goto("http://127.0.0.1:8000/#/admin/projets/" + pid);
      await page.locator("#project-addon-form").waitFor({ state: "attached" });
      await page
        .locator("#project-addon-editor")
        .evaluate((e) => (e.open = true));
    };
    await account();
    let catalog = page.locator("[data-addon-catalog=syntra]");
    await catalog.locator("..").evaluate((e) => (e.open = true));
    await catalog.locator("[name=amount]").fill("60");
    await catalog
      .getByRole("button", { name: "Enregistrer l’option", exact: true })
      .click();
    await page.waitForFunction(
      () => window.testState.db.rate_addons[0].amount === 60,
    );
    await page.locator(".addon-new").evaluate((e) => (e.open = true));
    let form = page.locator("#addon-catalog-new");
    await form.locator("[name=name]").fill("Accueil personnalisé");
    await form.locator("[name=amount]").fill("15");
    await form.locator("[name=unit]").selectOption("unite");
    await form.locator("[name=event_type]").selectOption("mariage");
    await form
      .getByRole("button", { name: "Créer l’option", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.testState.db.rate_addons.some(
        (x) => x.name === "Accueil personnalisé",
      ),
    );
    await project();
    form = page.locator("#project-addon-form");
    assert.equal(await form.locator("option[value=birthday-only]").count(), 0);
    assert.equal(await form.locator("option[value=inactive]").count(), 0);
    await form.locator("[name=catalog]").selectOption("syntra");
    assert.equal(await form.locator("[name=unit_price]").inputValue(), "60");
    await form.locator("[name=quantity]").fill("2");
    await form
      .getByRole("button", { name: "Enregistrer l’option au projet" })
      .click();
    await page.waitForFunction(() =>
      window.testState.db.project_payments.some(
        (x) => x.is_addon && x.amount === 120,
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_payments.filter((x) => x.is_base).length,
      ),
      1,
    );
    // Catalogue changes cannot reprice a saved project.
    await account();
    catalog = page.locator("[data-addon-catalog=syntra]");
    await catalog.locator("..").evaluate((e) => (e.open = true));
    await catalog.locator("[name=amount]").fill("90");
    await catalog
      .getByRole("button", { name: "Enregistrer l’option", exact: true })
      .click();
    await page.waitForFunction(
      () => window.testState.db.rate_addons[0].amount === 90,
    );
    await project();
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_payments.find((x) => x.is_addon).amount,
      ),
      120,
    );
    await page.locator("[data-edit-addon]").click();
    form = page.locator("#project-addon-form");
    await form.locator("[name=quantity]").fill("1");
    await form.locator("[name=unit_price]").fill("70");
    await form
      .getByRole("button", { name: "Enregistrer l’option au projet" })
      .click();
    await page.waitForFunction(
      () =>
        window.testState.db.project_payments.find((x) => x.is_addon).amount ===
        70,
    );
    // Correct money rounding and an explicitly offered option.
    for (const [label, quantity, price, expected] of [
      ["Temps complémentaire", "1.5", "0.67", 1.01],
      ["Option offerte", "1", "0", 0],
    ]) {
      await page
        .locator("#project-addon-editor")
        .evaluate((e) => (e.open = true));
      form = page.locator("#project-addon-form");
      await form.locator("[name=catalog]").selectOption("custom");
      await form.locator("[name=label]").fill(label);
      await form.locator("[name=quantity]").fill(quantity);
      await form.locator("[name=unit_price]").fill(price);
      await form
        .getByRole("button", { name: "Enregistrer l’option au projet" })
        .click();
      await page.waitForFunction(
        ({ label, expected }) =>
          window.testState.db.project_payments.some(
            (x) => x.label === label && x.amount === expected,
          ),
        { label, expected },
      );
    }
    // Draft survives a visit to another project section without adding a line.
    await page
      .locator("#project-addon-editor")
      .evaluate((e) => (e.open = true));
    await page
      .locator("#project-addon-form [name=catalog]")
      .selectOption("custom");
    await page
      .locator("#project-addon-form [name=label]")
      .fill("Option en cours de saisie");
    await page.goto(
      "http://127.0.0.1:8000/#/outils/" + pid + "?section=conductor",
    );
    await page.locator("#tool-content").waitFor();
    await project();
    assert.equal(
      await page.locator("#project-addon-form [name=label]").inputValue(),
      "Option en cours de saisie",
    );
    await page.locator("#reset-project-addon").click();
    await page.locator("#project-addons").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/workspace/work/tariff-addons-desktop.png",
    });
    // Existing invoice generation snapshots all options, totals, quantities and descriptions.
    await page.locator("#new-invoice").click();
    await page.locator(".inv-table").waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.invoices[0].total),
      1071.01,
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.invoices[0].lines.find(
            (x) => x.label === "Accès au logiciel Syntra",
          ).description,
      ),
      "Espace projet partagé",
    );
    assert.equal(
      await page
        .locator(".inv-table")
        .getByText("Option offerte", { exact: false })
        .count(),
      1,
    );
    const snapshot = await page.evaluate(() =>
      JSON.stringify(window.testState.db.invoices[0]),
    );
    await project();
    const optionId = await page.evaluate(
      () =>
        window.testState.db.project_payments.find(
          (x) => x.label === "Option offerte",
        ).id,
    );
    await page.locator('[data-pdel="' + optionId + '"]').click();
    await page.waitForFunction(
      (id) => !window.testState.db.project_payments.some((x) => x.id === id),
      optionId,
    );
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(window.testState.db.invoices[0]),
      ),
      snapshot,
    );
    await page.goto(
      "http://127.0.0.1:8000/#/outils/" + pid + "?section=profit",
    );
    await page.getByText("Recettes prévues", { exact: true }).waitFor();
    assert.ok(
      (await page.locator(".production-metrics").innerText()).includes(
        "1 071,01",
      ),
    );
    await project();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => setTheme("dark"));
    await page.locator("#project-addons").scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({ path: "/workspace/work/tariff-addons-mobile.png" });
    await page.evaluate(() => {
      window.testState.role = "client";
    });
    await page.goto("http://127.0.0.1:8000/#/projets/" + pid);
    await page.locator(".pay-list").first().waitFor();
    assert.equal(await page.locator("#project-addon-form").count(), 0);
    assert.equal(await page.locator("[data-edit-addon]").count(), 0);
    await page.getByText("Accès au logiciel Syntra", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: catalogue create/edit, type/active filtering, project option snapshots, custom/free options, decimal rounding, drafts, totals/profit/invoice snapshots, removal, client read-only and mobile/dark",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
