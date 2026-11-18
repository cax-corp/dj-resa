const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm");
const { mock: baseMock, pid } = require("./production-mock.cjs");
const ops = vm.runInNewContext(
  fs.readFileSync(__dirname + "/../project-operations.js", "utf8") +
    ";ProjectOperations",
);
const mock =
  baseMock +
  `\nwindow.testState.db.projects[0].event_type='mariage';window.testState.db.project_operation_items=[];
const makeOriginal=window.supabase.createClient;window.supabase.createClient=(...args)=>{const c=makeOriginal(...args),orig=c.from,rpc=c.rpc;
c.from=table=>{const q=orig(table);if(table!=='project_operation_items')return q;const insert=q.insert,then=q.then; q.insert=value=>insert({...value,revision:1});q.then=resolve=>then(result=>resolve(result.data===null?{data:null,error:{code:'PGRST116',message:'Stale row'}}:result));return q;};
c.rpc=async(name,args)=>{if(name!=='import_project_loading')return rpc(name,args);let count=0;const db=window.testState.db;for(const gear of db.equipment_reservations.filter(r=>r.project_id===args.pid&&r.state!=='cancelled')){const source_key='equipment:'+gear.id;if(db.project_operation_items.some(x=>x.project_id===args.pid&&x.tool==='loading'&&x.source_key===source_key))continue;db.project_operation_items.push({id:crypto.randomUUID(),project_id:args.pid,tool:'loading',label:db.equipment.find(e=>e.id===gear.equipment_id).name,status:'pending',revision:1,source_key,details:{quantity:gear.quantity,load_order:0,case_name:'',vehicle:'',destination:'',responsible:'',notes:''}});count++;}return{data:count,error:null};};return c;};`;
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
    await page.route("https://cdn.jsdelivr.net/**", (r) =>
      r.fulfill({ contentType: "application/javascript", body: mock }),
    );
    const tool = async (key) => {
      await page.goto(
        "http://127.0.0.1:8000/#/outils/" + pid + "?section=" + key,
      );
      await page.locator("#ops-list").waitFor();
    };
    await page.goto("http://127.0.0.1:8000/#/admin/projets/" + pid);
    await page.locator("#edit-form").waitFor();
    assert.equal(await page.locator(".project-tool-shortcuts").count(), 0);
    assert.ok(
      (await page.locator(".project-tool-launcher").boundingBox()).height < 110,
    );
    await page.locator("[data-browse-tools]").click();
    let dialog = page.locator("#project-tools-dialog");
    assert.equal(await dialog.locator("#project-tools-groups a").count(), 29);
    assert.equal(await dialog.locator(".tool-browser-category").count(), 6);
    await page.screenshot({
      path: "/workspace/work/project-tools-directory.png",
      animations: "disabled",
    });
    await dialog.locator("[data-tool-category=logistics]").click();
    assert.equal(await dialog.locator("#project-tools-groups a").count(), 6);
    await dialog.locator("input").fill("hébergement");
    assert.equal(await dialog.locator("#project-tools-groups a").count(), 1);
    await dialog.locator("#project-tools-groups a").click();
    await page.locator("#ops-list").waitFor();
    assert.equal(await page.locator("#project-tools-dialog").count(), 0);
    const fill = async (key, label) => {
      await page.locator("#ops-editor").evaluate((el) => (el.open = true));
      const form = page.locator("#ops-form");
      await form.locator("[name=label]").fill(label);
      for (const f of ops.fieldsFor(key)) {
        const el = form.locator("[name=" + f.key + "]");
        if (f.type === "select") {
          await el.selectOption(Object.keys(f.options)[0]);
          continue;
        }
        const value =
          f.type === "number"
            ? String(f.value ?? (f.min || 1))
            : f.type === "date"
              ? "2030-06-15"
              : f.type === "datetime-local"
                ? "2030-06-15T15:00"
                : f.type === "url"
                  ? "https://example.org/album"
                  : f.key === "circuit"
                    ? "Circuit A"
                    : f.key === "unit"
                      ? "pièces"
                      : "Valeur " + f.key;
        await el.fill(value);
      }
      await form
        .getByRole("button", { name: "Enregistrer", exact: true })
        .click();
      await page
        .locator("[data-ops-item]")
        .filter({ hasText: label })
        .waitFor();
    };
    for (const key of Object.keys(ops.tools)) {
      await tool(key);
      await fill(key, "Test " + key);
      assert.equal(
        await page.evaluate(
          (k) =>
            window.testState.db.project_operation_items.filter(
              (x) => x.tool === k,
            ).length,
          key,
        ),
        1,
      );
    }
    // Real cross-tool inputs: guest needs, shared notes, stock and overbooking indicators.
    await tool("meals");
    await page.locator(".ops-dietary summary").click();
    await page.getByText("Initial needs", { exact: false }).waitFor();
    await tool("lodging");
    await page.locator("[data-ops-edit]").click();
    let form = page.locator("#ops-form");
    await form.locator("[name=occupants]").fill("4");
    await form.locator("[name=capacity]").fill("2");
    await form
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.getByText("Couchages insuffisants", { exact: true }).waitFor();
    // Draft survives navigation; changing the form must not save until submit.
    await tool("activities");
    await page.locator("#ops-editor").evaluate((el) => (el.open = true));
    await page
      .locator("#ops-form [name=label]")
      .fill("Discours non enregistré");
    await tool("media");
    await tool("activities");
    assert.equal(
      await page.locator("#ops-form [name=label]").inputValue(),
      "Discours non enregistré",
    );
    assert.equal(
      await page.evaluate(() =>
        window.testState.db.project_operation_items.some(
          (x) => x.label === "Discours non enregistré",
        ),
      ),
      false,
    );
    await page.locator("#ops-reset").click();
    // Power groups add across devices on one circuit rather than adding circuit capacity twice.
    await tool("power");
    await page.locator("[data-ops-edit]").click();
    form = page.locator("#ops-form");
    await form.locator("[name=watts]").fill("4000");
    await form
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page.getByText("Capacité dépassée", { exact: true }).waitFor();
    // Loading importer keeps customized sheets and never changes inventory or project quantities.
    await tool("loading");
    const beforeGear = await page.evaluate(() =>
      JSON.stringify([
        window.testState.db.equipment,
        window.testState.db.equipment_reservations,
      ]),
    );
    await page.locator("#ops-import-gear").click();
    await page.waitForFunction(
      () =>
        window.testState.db.project_operation_items.filter(
          (x) => x.tool === "loading",
        ).length === 3,
    );
    await page.locator("#ops-import-gear").click();
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_operation_items.filter(
            (x) => x.tool === "loading",
          ).length,
      ),
      3,
    );
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify([
          window.testState.db.equipment,
          window.testState.db.equipment_reservations,
        ]),
      ),
      beforeGear,
    );
    await page.locator("[data-ops-next]").first().click();
    await page.waitForFunction(() =>
      window.testState.db.project_operation_items.some(
        (x) => x.tool === "loading" && x.status === "loaded",
      ),
    );
    await page.locator("#ops-filter").selectOption("loaded");
    assert.equal(await page.locator("[data-ops-item]").count(), 1);
    await page.locator("[data-ops-next]").click();
    await page.waitForFunction(() =>
      window.testState.db.project_operation_items.some(
        (x) => x.tool === "loading" && x.status === "returned",
      ),
    );
    // Stale writes fail without discarding the draft.
    await tool("decoration");
    await page.locator("[data-ops-edit]").click();
    await page.evaluate(
      () =>
        window.testState.db.project_operation_items.find(
          (x) => x.tool === "decoration",
        ).revision++,
    );
    await page.locator("#ops-form [name=label]").fill("Stale edit");
    await page
      .locator("#ops-form")
      .getByRole("button", { name: "Enregistrer", exact: true })
      .click();
    await page
      .getByText(
        "Cette fiche a changé ailleurs. Rechargez la page avant de réessayer.",
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page.locator("#ops-form [name=label]").inputValue(),
      "Stale edit",
    );
    // Print is a document with checkboxes, not the workspace interface.
    await tool("supplies");
    await page.evaluate(() => (window.print = () => {}));
    await page.locator("#ops-print").click();
    await page.locator("#print-sheet .paper-checkbox").waitFor({ state: "attached" });
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".sidebar").isVisible(), false);
    assert.equal(await page.locator("#print-sheet").isVisible(), true);
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    // Mobile and dark: directory stays within viewport, keyboard closes it, links still work.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => setTheme("dark"));
    await page.locator("[data-browse-tools]").click();
    dialog = page.locator("#project-tools-dialog");
    assert.equal(
      await dialog.evaluate((d) => d.scrollWidth <= d.clientWidth + 1),
      true,
    );
    await dialog.locator('[data-tool-category=logistics]').click();
    await dialog.locator('[data-tool-category=all]').click();
    assert.equal(await page.locator('.tool-quick-links').evaluate(e => getComputedStyle(e).position), 'static');
    await page.screenshot({
      path: "/workspace/work/project-tools-mobile.png",
      animations: "disabled",
    });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({
      path: "/workspace/work/project-operations-mobile.png",
      animations: "disabled",
    });
    // Completed client and viewer team get read-only controls; unrelated tools/finance stay hidden.
    await page.evaluate(() => {
      window.testState.role = "client";
      window.testState.db.projects[0].status = "termine";
    });
    await page.evaluate(() => route());
    await page.locator("#ops-list").waitFor();
    assert.equal(await page.locator("#ops-form").count(), 0);
    assert.equal(await page.locator("[data-ops-edit]").count(), 0);
    await page.evaluate(() => {
      window.testState.role = "dj";
      window.testState.db.project_members = [
        {
          project_id: window.testState.db.projects[0].id,
          user_id: "team",
          access_role: "viewer",
        },
      ];
      window.testState.db.projects[0].status = "preparation";
    });
    await page.evaluate(() => route());
    await page.locator("#ops-list").waitFor();
    assert.equal(await page.locator("#ops-form").count(), 0);
    await page.locator("[data-browse-tools]").click();
    assert.equal(
      await page
        .locator('#project-tools-groups a[href$="section=profit"]')
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: 14 structured tools, compact categorized directory/search, create/edit/drafts, guest needs, overbooking, power, idempotent loading, checklist, stale revision, print, mobile/dark and read-only access",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
