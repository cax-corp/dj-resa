const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const token = '10000000-0000-4000-8000-000000000001';
const projectId = '20000000-0000-4000-8000-000000000001';
const mock = `
window.testState = { admin: false, shares: [], calls: [], payload: {title: '<script>unsafe</script>', must_play: [{title:'Shared song', artist:'Artist', url:'javascript:alert(1)'}]} };
window.supabase = {createClient: () => ({
  auth: {getSession: async () => ({data:{session: window.testState.admin ? {user:{id:'admin'}} : null}}), onAuthStateChange: () => {}, signOut: async () => {}},
  rpc: async (name,args) => {window.testState.calls.push({name,args}); return {data:window.testState.payload,error:null}},
  from: table => {
    let action='select', values, filter, single=false;
    const q = {
      select: () => q, eq: (key,value) => {filter=value;return q}, order: () => q,
      single: () => {single=true;return q}, insert: row => {action='insert';values=row;return q},
      delete: () => {action='delete';return q},
      then: resolve => {
        let data=[];
        if(table==='profiles') data={id:'admin',role:'admin'};
        if(table==='projects') data={id:'${projectId}',title:'Project',status:'nouveau',client:{}};
        if(table==='project_shares') {
          if(action==='insert') window.testState.shares.push({token:'${token}',sections:values.sections,created_at:'2026-11-13T12:00:00Z'});
          if(action==='delete') window.testState.shares=[];
          data=window.testState.shares;
        }
        return Promise.resolve({data,error:null}).then(resolve);
      }
    }; return q;
  }
})};`;
(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({contentType:'application/javascript',body:mock}));
    await page.goto(base + '/#/partage/' + token);
    await page.getByRole('heading', {name:'À passer absolument',exact:true}).waitFor();
    assert.equal(await page.locator('#auth-form').count(),0);
    assert.equal(await page.locator('#app form, #app button, #app script').count(),0);
    assert.equal(await page.getByText('Shared song',{exact:true}).count(),1);
    assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
    assert.equal(await page.getByRole('heading',{name:'Informations du projet'}).count(),0);
    assert.equal(await page.getByRole('heading',{name:'À ne pas passer',exact:true}).count(),0);
    assert.equal(await page.locator('h1').textContent(),'<script>unsafe</script>');
    // All optional sections render without write controls.
    await page.evaluate(() => window.testState.payload={title:'All sections',event_date:null,location:'Paris',status:'nouveau',description:'Description',must_play:[],do_not_play:[],schedule:[],tasks:[{label:'Task',done:true}],payments:[],updates:[],client:{},invoices:[]});
    await page.evaluate(() => route());
    await page.getByRole('heading',{name:'Résumé des factures'}).waitFor();
    assert.equal(await page.locator('#app form, #app button, #app input:not([disabled])').count(),0);
    assert.equal(await page.locator('#app input[disabled]').count(),1);
    await page.evaluate(() => window.testState.payload=null);
    await page.evaluate(() => route());
    await page.getByRole('heading',{name:'Lien indisponible'}).waitFor();
    const calls = await page.evaluate(() => window.testState.calls.length);
    await page.goto(base + '/#/partage/invalid-token');
    await page.getByRole('heading',{name:'Lien indisponible'}).waitFor();
    assert.equal(await page.evaluate(() => window.testState.calls.length),calls);
    // Admin creates a link with a precise selection and can revoke it.
    await page.evaluate(() => window.testState.admin=true);
    await page.goto(base + '/#/admin/projets/' + projectId);
    await page.getByRole('button',{name:'Créer le lien',exact:true}).waitFor();
    for (const checkbox of await page.locator('#share-form input').all()) await checkbox.uncheck();
    await page.locator('#share-form input[value="schedule"]').check();
    await page.getByRole('button',{name:'Créer le lien',exact:true}).click();
    await page.locator('#share-links input[readonly]').waitFor();
    assert.deepEqual(await page.evaluate(() => window.testState.shares[0].sections),['schedule']);
    assert.ok((await page.locator('#share-links input').inputValue()).endsWith('/partage/' + token));
    await page.setViewportSize({width:375,height:812});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    page.once('dialog', d => d.accept());
    await page.getByRole('button',{name:'Révoquer',exact:true}).click();
    await page.getByText('Aucun lien actif.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(() => window.testState.shares.length),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: anonymous rendering, selected sections, read-only controls, invalid/revoked links, escaping, admin link creation/revocation, mobile layout');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
