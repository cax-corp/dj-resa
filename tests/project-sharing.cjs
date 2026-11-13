const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const token = '10000000-0000-4000-8000-000000000001';
const projectId = '20000000-0000-4000-8000-000000000001';
const mock = `
window.testState = { admin: false, shares: [], calls: [], projects: [{id:'${projectId}',title:'Project',status:'nouveau',archived_at:null,client:{}}], payload: {title: '<script>unsafe</script>', must_play: [{title:'Shared song', artist:'Artist', url:'javascript:alert(1)'}]} };
window.supabase = {createClient: () => ({
  auth: {getSession: async () => ({data:{session: window.testState.admin ? {user:{id:'admin'}} : null}}), onAuthStateChange: () => {}, signOut: async () => {}},
  rpc: async (name,args) => {window.testState.calls.push({name,args}); if(name==='save_catalog_project'){Object.assign(window.testState.projects.find(p=>p.id===args.target_project),args.details);return {data:null,error:null}}return {data:window.testState.payload,error:null}},
  from: table => {
    let action='select', values, filter, single=false;
    const q = {
      select: () => q, eq: (key,value) => {filter=value;return q}, order: () => q,
      single: () => {single=true;return q}, insert: row => {action='insert';values=row;return q},
      delete: () => {action='delete';return q}, update: row => {action='update';values=row;return q},
      then: resolve => {
        let data=[];
        if(table==='profiles') data={id:'admin',role:window.testState.role || 'admin'};
        if(table==='projects') {
          if(action==='update') Object.assign(window.testState.projects.find(p=>p.id===filter),values);
          data=single ? window.testState.projects.find(p=>p.id===filter) : window.testState.projects;
        }
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
    await page.evaluate(() => window.testState.payload={title:'All sections',event_date:null,location:'Paris',status:'en_cours',description:'Description',must_play:[],do_not_play:[],schedule:[],tasks:[{label:'Task',done:true}],payments:[],updates:[],client:{},invoices:[]});
    await page.evaluate(() => route());
    await page.getByRole('heading',{name:'Résumé des factures'}).waitFor();
    assert.equal(await page.locator('#app form, #app button, #app input:not([disabled])').count(),0);
    assert.equal(await page.locator('#app input[disabled]').count(),1);
    assert.equal(await page.getByText('En cours',{exact:true}).count(),1);
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
    // Archive and restore must leave the entire project and share unchanged.
    const before = await page.evaluate(() => JSON.stringify(window.testState.projects[0]));
    const linksBefore = await page.evaluate(() => JSON.stringify(window.testState.shares));
    await page.getByRole('button',{name:'Archiver le projet',exact:true}).click();
    await page.getByRole('button',{name:'Restaurer le projet',exact:true}).waitFor();
    assert.equal(await page.locator('.archive-notice').count(),1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.testState.shares)),linksBefore);
    assert.equal(await page.evaluate(() => { const p={...window.testState.projects[0],archived_at:null};return JSON.stringify(p); }),before);
    await page.locator('#edit-form select[name="status"]').selectOption('en_cours');
    await page.locator('#edit-form button[type="submit"], #edit-form button.primary').click();
    await page.waitForFunction(() => window.testState.projects[0].status==='en_cours');
    await page.getByRole('button',{name:'Restaurer le projet',exact:true}).click();
    await page.getByRole('button',{name:'Archiver le projet',exact:true}).waitFor();
    assert.equal(await page.locator('.archive-notice').count(),0);
    assert.equal(await page.evaluate(() => window.testState.projects[0].archived_at),null);
    assert.equal(await page.evaluate(() => JSON.stringify(window.testState.shares)),linksBefore);
    await page.getByRole('button',{name:'Finances',exact:true}).click();
    assert.equal(await page.locator('.project-navigation button.active').textContent(),'Finances');
    assert.ok(page.url().endsWith('/admin/projets/'+projectId));
    await page.setViewportSize({width:375,height:812});
    await page.getByRole('button',{name:'Ouvrir le menu',exact:true}).click();
    assert.equal(await page.locator('.sidebar').isVisible(),true);
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sidebar').isVisible(),false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    page.once('dialog', d => d.accept());
    await page.getByRole('button',{name:'Révoquer',exact:true}).click();
    await page.getByText('Aucun lien actif.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(() => window.testState.shares.length),0);
    await page.evaluate(() => window.testState.projects.push({id:'archived-project',title:'Archived project',status:'valide',archived_at:'2026-11-13T12:00:00Z',client:{}}));
    await page.goto(base+'/#/admin');
    await page.locator('#f-archive').waitFor();
    assert.equal(await page.locator('.row-card').count(),1);
    await page.locator('#f-s').selectOption('en_cours');
    assert.equal(await page.locator('.row-card').count(),1);
    await page.locator('#f-s').selectOption('');
    await page.locator('#f-archive').selectOption('archived');
    assert.equal(await page.locator('.row-card').count(),1);
    assert.ok((await page.locator('.row-card').textContent()).includes('Archived project'));
    await page.locator('#f-archive').selectOption('all');
    assert.equal(await page.locator('.row-card').count(),2);
    await page.evaluate(() => window.testState.role='client');
    await page.goto(base+'/#/projets');
    await page.locator('#client-proj-list').waitFor();
    assert.equal(await page.locator('.row-card').count(),1);
    await page.locator('#f-archive').selectOption('archived');
    assert.equal(await page.locator('.row-card').count(),1);
    await page.locator('#f-archive').selectOption('all');
    assert.equal(await page.locator('.row-card').count(),2);
    await page.goto(base+'/#/projets/'+projectId);
    await page.getByRole('heading',{name:'Mon projet',exact:true}).waitFor();
    assert.equal(await page.locator('#archive-project, #edit-form').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: anonymous rendering, selected sections, read-only controls, invalid/revoked links, escaping, admin link creation/revocation, archive/restore preserves content and links, in-progress status, archive/status filters, workspace navigation, mobile menu and layout');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
