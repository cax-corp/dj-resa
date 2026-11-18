const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
let mock = vm.runInNewContext(source.slice(0, source.lastIndexOf('(async () => {')) + '\nmock', {
  require,
  process,
});
mock += `\nwindow.testState.db.project_event_briefs=[];
const originalCreate=window.supabase.createClient;window.supabase.createClient=(...args)=>{const client=originalCreate(...args),from=client.from,rpc=client.rpc;
client.from=table=>{if(table!=='project_event_briefs')return from(table);let filters=[],action='select',values,single=false;
const q={select:()=>q,order:()=>q,range:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},single:()=>{single=true;return q},insert:payload=>{action='insert';values=payload;return q},update:payload=>{action='update';values=payload;return q},then:resolve=>{const db=window.testState.db;let rows=db.project_event_briefs.filter(row=>filters.every(([key,value])=>row[key]===value));let error=null,data=rows;
if(action==='insert'){if(db.project_event_briefs.some(row=>row.project_id===values.project_id&&row.event_type===values.event_type))error={code:'23505'};else{data={...values,revision:1,created_at:'2026-11-15T10:00:00Z',updated_at:'2026-11-15T10:00:00Z'};db.project_event_briefs.push(data)}}
if(action==='update'){rows.forEach(row=>Object.assign(row,values,{revision:row.revision+1}));data=rows}
if(single&&Array.isArray(data)){data=data[0]||null;if(!data)error={code:'PGRST116'}}return Promise.resolve({data:structuredClone(data),error}).then(resolve)}};return q};
client.rpc=async(name,args)=>{if(name!=='add_event_preparation_tasks')return rpc(name,args);const db=window.testState.db;let count=0;for(const label of args.task_labels){if(!db.project_tasks.some(t=>t.project_id===args.target_project&&t.label.toLowerCase().trim()===label.toLowerCase().trim())){db.project_tasks.push({id:crypto.randomUUID(),project_id:args.target_project,label,done:false});count++}}return {data:count,error:null}};return client};`;
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const pid = '20000000-0000-4000-8000-000000000001';
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    await page.evaluate((pid) => {
      window.testState.db.projects.find((p) => p.id === pid).event_type = 'mariage';
      window.testState.db.project_tasks = [
        { id: 'original-task', project_id: pid, label: 'Tâche existante', done: true },
      ];
    }, pid);
    await page.goto(base + '/#/admin/projets/' + pid);
    await page.getByRole('heading', { name: 'Préparer le mariage', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Ouvrir la fiche de préparation' }).click();
    await page.locator('.event-brief-form').waitFor();
    assert.equal(await page.locator('.project-tool-launcher .tool-current').textContent(), 'Préparation Mariage');
    assert.equal(await page.locator('[name=cake_song]').count(), 0);
    await page.locator('[name=couple_names]').fill('Ana & Léo');
    await page.locator('[name=ceremony_time]').fill('13:30');
    await page.locator('[name=first_dance]').fill('Notre morceau');
    await page
      .locator('.event-brief-form')
      .getByRole('button', { name: 'Enregistrer la préparation' })
      .click();
    await page.locator('.experience-saved').waitFor();
    if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0)});await page.waitForTimeout(300);await page.screenshot({path:process.env.SCREENSHOT_DIR+'/preparation-mariage.png',fullPage:true});}
    assert.equal(
      await page.evaluate(() => window.testState.db.project_event_briefs[0].details.couple_names),
      'Ana & Léo'
    );
    await page.locator('[data-recommendation]').nth(2).uncheck();
    await page.locator('[data-recommendation]').nth(3).uncheck();
    await page.locator('[data-recommendation]').nth(4).uncheck();
    await page.getByRole('button', { name: 'Ajouter les tâches choisies' }).click();
    await page.waitForFunction(() => window.testState.db.project_tasks.length === 3);
    await page.locator('[data-recommendation="0"]:disabled').waitFor();
    assert.equal(await page.evaluate(() => window.testState.db.project_tasks[0].done), true);
    const changeType = async (type) => {
      await page.goto(base + '/#/admin');
      await page.evaluate(
        ({ pid, type }) =>
          (window.testState.db.projects.find((p) => p.id === pid).event_type = type),
        { pid, type }
      );
      await page.goto(base + '/#/outils/' + pid + '?section=preparation');
      await page.locator('.event-brief-form').waitFor();
    };
    await changeType('anniversaire');
    assert.equal(await page.locator('[name=couple_names]').count(), 0);
    await page.locator('[name=celebrant]').fill('Camille');
    await page.locator('[name=cake_time]').fill('22:00');
    await page
      .locator('.event-brief-form')
      .getByRole('button', { name: 'Enregistrer la préparation' })
      .click();
    await page.locator('.experience-saved').waitFor();
    await changeType('mariage');
    assert.equal(await page.locator('[name=couple_names]').inputValue(), 'Ana & Léo');
    assert.equal(await page.evaluate(() => window.testState.db.project_event_briefs.length), 2);
    assert.equal(await page.evaluate(() => window.testState.db.project_tasks.length), 3);
    await page.evaluate(() => {
      const brief = window.testState.db.project_event_briefs.find(
        (b) => b.event_type === 'mariage'
      );
      brief.revision++;
      brief.details.couple_names = 'Modification ailleurs';
    });
    await page.locator('[name=couple_names]').fill('Brouillon local');
    await page
      .locator('.event-brief-form')
      .getByRole('button', { name: 'Enregistrer la préparation' })
      .click();
    await page.getByText(/Cette fiche a été modifiée ailleurs/).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.testState.db.project_event_briefs.find((b) => b.event_type === 'mariage').details
            .couple_names
      ),
      'Modification ailleurs'
    );
    for (const [type, key] of [
      ['entreprise', 'speakers'],
      ['association', 'volunteers'],
      ['soiree_privee', 'mood'],
      ['autre', 'expectations'],
    ]) {
      await changeType(type);
      await page.locator('[name=' + key + ']').waitFor();
      await page.setViewportSize({ width: 375, height: 812 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        type + ' mobile overflow'
      );
      if(process.env.SCREENSHOT_DIR&&type==='entreprise'){await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(250);await page.screenshot({path:process.env.SCREENSHOT_DIR+'/preparation-entreprise-mobile.png',fullPage:true});}
    }
    await page.evaluate((pid) => {
      window.testState.role = 'client';
      window.testState.db.projects.find((p) => p.id === pid).status = 'termine';
    }, pid);
    await page.goto(base + '/#/projets/' + pid);
    await page.getByRole('link', { name: 'Ouvrir la fiche de préparation' }).click();
    await page.locator('.event-brief-form').waitFor();
    assert.equal(await page.locator('.event-brief-form button').count(), 0);
    assert.equal(await page.locator('[name=expectations]').getAttribute('readonly'), '');
    assert.equal(await page.getByRole('link', { name: 'Matériel', exact: true }).count(), 0);
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(base + '/#/admin');
    await page.goto(base + '/#/outils/' + pid + '?section=preparation');
    await page.locator('#auth-form').waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: six distinct preparation forms, tailored navigation, saved briefs retained across types, selected additive tasks, unchanged old tasks, stale edit protection, mobile, completed-client read-only mode and login gate'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
