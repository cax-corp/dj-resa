const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.TEST_URL || 'http://127.0.0.1:8000';
const pid = '20000000-0000-4000-8000-000000000001';
const musicToken = '10000000-0000-4000-8000-000000000001';
const inquiryToken = '10000000-0000-4000-8000-000000000002';
const mock = `
window.testState={signedIn:true,role:'admin',files:{},submissions:[],calls:[],db:{
 profiles:[{id:'admin',role:'admin',full_name:'DJ Test'},{id:'client',role:'client',full_name:'Camille Test',email:'camille@example.test'}],
 projects:[{id:'${pid}',client_id:'client',title:'Mariage test',status:'preparation',event_date:'2026-12-12',location:'Lyon',client:{full_name:'Camille Test'}},{id:'other-project',client_id:'client',title:'Autre soirée',status:'valide',event_date:'2026-12-12'}],
 project_guests:[],project_contacts:[],equipment:[],equipment_reservations:[],venues:[],project_venues:[],calendar_blocks:[],project_tasks:[],project_documents:[],project_debriefs:[],schedule_items:[],guest_music_requests:[],booking_inquiries:[],event_form_links:[],project_shares:[],project_updates:[],project_tracks:[],project_payments:[],invoices:[],rate_plans:[]}};
window.supabase={createClient:()=>({
 auth:{getSession:async()=>({data:{session:window.testState.signedIn?{user:{id:window.testState.role==='admin'?'admin':'client'}}:null}}),onAuthStateChange:callback=>{window.testState.authCallback=callback;}},
 from:table=>{
  let action='select',values,filters=[],single=false,conflict,range=null;
  const q={select:()=>q,range:(start,end)=>{range=[start,end];return q},eq:(key,value)=>{filters.push([key,value]);return q},order:()=>q,single:()=>{single=true;return q},insert:row=>{action='insert';values=row;return q},update:row=>{action='update';values=row;return q},delete:()=>{action='delete';return q},upsert:(row,opt)=>{action='upsert';values=row;conflict=opt?.onConflict||'id';return q},then:resolve=>{
    const state=window.testState;const db=state.db;db[table]||=[];let matched=db[table].filter(x=>filters.every(([k,v])=>x[k]===v));let data;
    const make=row=>({id:crypto.randomUUID(),created_at:'2026-11-13T12:00:00Z',updated_at:'2026-11-13T12:00:00Z',status:table==='guest_music_requests'?'pending':table==='booking_inquiries'?'new':undefined,state:table==='equipment_reservations'?'reserved':undefined,run_state:table==='schedule_items'?'pending':undefined,is_open:true,token:table==='event_form_links'?(row.kind==='music'?'${musicToken}':row.kind==='feedback'?'10000000-0000-4000-8000-000000000003':'${inquiryToken}'):undefined,...row});
    if(action==='insert'){if(Array.isArray(values)){data=values.map(make);db[table].push(...data)}else{data=make(values);db[table].push(data)}}
    else if(action==='upsert'){let existing=db[table].find(x=>x[conflict]===values[conflict]);if(existing){Object.assign(existing,values);data=existing}else{data=make(values);db[table].push(data)}}
    else if(action==='update'){matched.forEach(x=>Object.assign(x,values));if(table==='guest_music_requests'&&values.status==='accepted')matched.forEach(x=>{if(!db.project_tracks.some(t=>t.project_id===x.project_id&&t.kind==='must_play'&&t.title===x.title&&t.artist===x.artist))db.project_tracks.push({id:crypto.randomUUID(),project_id:x.project_id,kind:'must_play',title:x.title,artist:x.artist,note:null});});data=matched}
    else if(action==='delete'){db[table]=db[table].filter(x=>!matched.includes(x));data=matched}
    else data=matched;
    if(range&&action==='select'&&Array.isArray(data))data=data.slice(range[0],range[1]+1);
    if(single&&Array.isArray(data))data=data[0]||null;
    state.calls.push({table,action,values,filters});return Promise.resolve({data,error:null}).then(resolve);
  }};return q;
 },
 rpc:async(name,args)=>{
  const s=window.testState;const db=s.db;
  const assignVenue=(pid,vid)=>{const p=db.projects.find(x=>x.id===pid);if(!vid){db.project_venues=db.project_venues.filter(x=>x.project_id!==pid);p.location=null;return}const v=db.venues.find(x=>x.id===vid);let link=db.project_venues.find(x=>x.project_id===pid);if(!link){link={id:crypto.randomUUID(),project_id:pid};db.project_venues.push(link)}link.venue_id=vid;p.location=[v.name,v.address].filter(Boolean).join(', ')};
  if(name==='set_project_directory_venue'){assignVenue(args.target_project,args.selected_venue);return {data:null,error:null}}
  if(name==='save_catalog_project'){Object.assign(db.projects.find(x=>x.id===args.target_project),args.details);if(args.venue_choice!=='keep')assignVenue(args.target_project,args.venue_choice);return {data:null,error:null}}
  if(name==='create_catalog_project'){const id=crypto.randomUUID();db.projects.push({id,...args.details,status:'nouveau',location:null});if(args.details.venue_id)assignVenue(id,args.details.venue_id);return {data:id,error:null}}
  if(name==='save_guest_sheet'){
    if(args.entries.some(x=>!x.full_name))return {data:null,error:{message:'Nom manquant'}};
    for(const entry of args.entries){const {original,...fields}=entry;const existing=db.project_guests.find(x=>x.id===entry.id);if(existing)Object.assign(existing,fields);else db.project_guests.push({...fields,project_id:args.target_project,created_at:'2026-11-13T12:00:00Z'})}
    db.project_guests=db.project_guests.filter(x=>!(x.project_id===args.target_project&&args.removed_ids.includes(x.id)));
    return {data:{saved:args.entries.length,removed:args.removed_ids.length},error:null};
  }
  if(name==='delete_unused_client'){if(db.projects.some(p=>p.client_id===args.target_client))return {data:null,error:{message:'Ce client possède des projets'}};db.profiles=db.profiles.filter(x=>x.id!==args.target_client);return {data:null,error:null}}
  if(name==='get_event_form'){const f=db.event_form_links.find(x=>x.token===args.form_token);return {data:f?{kind:f.kind,is_open:f.is_open,title:f.kind==='music'||f.kind==='feedback'?'Mariage test':'Demande de prestation DJ'}:null,error:null}}
  if(name==='submit_event_form'){const f=db.event_form_links.find(x=>x.token===args.form_token);if(!f?.is_open)return {data:null,error:{message:'Formulaire fermé'}};s.submissions.push(args);(db[f.kind==='music'?'guest_music_requests':f.kind==='feedback'?'event_feedback':'booking_inquiries']||=[]).push({id:crypto.randomUUID(),project_id:f.project_id,status:f.kind==='music'?'pending':'new',created_at:'2026-11-13T12:00:00Z',message:args.fields.comment,...args.fields});return {data:crypto.randomUUID(),error:null}}
  if(name==='set_conductor_step'){const item=db.schedule_items.find(x=>x.id===args.step_id);if(args.next_state==='current')db.schedule_items.filter(x=>x.project_id===item.project_id).forEach(x=>x.run_state='pending');item.run_state=args.next_state;return {data:null,error:null}}
  if(name==='convert_booking_inquiry'){const inquiry=db.booking_inquiries.find(x=>x.id===args.inquiry_id);inquiry.project_id||=crypto.randomUUID();inquiry.status='won';if(!db.projects.some(p=>p.id===inquiry.project_id))db.projects.push({id:inquiry.project_id,title:args.project_title,status:'nouveau',client_id:args.target_client});return {data:inquiry.project_id,error:null}}
  return {data:null,error:null};
 },
 storage:{from:()=>({upload:async(path,file)=>{window.testState.files[path]={name:file.name,size:file.size};return {data:{path},error:null}},remove:async(paths)=>{paths.forEach(p=>delete window.testState.files[p]);return {data:[],error:null}},createSignedUrl:async(path)=>({data:{signedUrl:'https://storage.example.test/'+path+'?token=signed'},error:null})})}
})};`;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.setDefaultTimeout(12000);
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: mock })
    );
    await page.goto(base + '/#/admin');
    await page.locator('.project-register').waitFor();
    const tool = async (section) => {
      await page.goto(base + '/#/outils/' + pid + '?section=' + section);
      await page.locator('.tool-tabs a.active[href$="section=' + section + '"]').waitFor();
    };
    const editor = async () => {
      await page.locator('#tool-editor').evaluate((el) => (el.open = true));
      return page.locator('#tool-editor-form');
    };
    // Guests: create, confirm, search, edit, export and no accidental cross-project changes.
    await tool('guests');
    await page.getByRole('button', { name: 'Vue fiches', exact: true }).click();
    let form = await editor();
    await form.locator('[name=full_name]').fill('Julie Martin');
    await form.locator('[name=response]').selectOption('confirmed');
    await form.locator('[name=companions]').fill('2');
    await form.locator('[name=dietary]').fill('Sans gluten');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Julie Martin', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.testState.db.project_guests[0].project_id), pid);
    await page.locator('#guest-search').fill('absent');
    assert.equal(await page.locator('.tool-list .tool-row:visible').count(), 0);
    await page.locator('#guest-search').fill('Julie');
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    form = page.locator('#tool-editor-form');
    await form.locator('[name=table_name]').fill('Table 3');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText(/Table 3/).waitFor();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exporter CSV' }).click();
    assert.equal((await downloadPromise).suggestedFilename(), 'invites.csv');
    // More than one Data API page must still include every guest.
    await page.evaluate((pid) => {
      for (let i = 0; i < 501; i++)
        window.testState.db.project_guests.push({
          id: 'page-guest-' + i,
          project_id: pid,
          full_name: 'Guest ' + i,
          response: 'pending',
          companions: 0,
        });
    }, pid);
    await page.evaluate(() => route());
    await page.waitForFunction(
      () => document.querySelectorAll('.tool-list .tool-row').length === 502
    );
    // Contacts.
    await tool('contacts');
    form = await editor();
    await form.locator('[name=full_name]').fill('Alex Photo');
    await form.locator('[name=role]').fill('Photographe');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Alex Photo', { exact: true }).waitFor();
    // Own inventory, per-project selection and a preparation checklist.
    await page.goto(base + '/#/materiel');
    form = await editor();
    await form.locator('[name=name]').fill('Enceinte active');
    await form.locator('[name=units]').fill('2');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Enceinte active', { exact: true }).waitFor();
    await tool('equipment');
    form = page.locator('#gear-selection-form');
    assert.equal(await form.locator('input[type=date]').count(), 0);
    await form.locator('[name=quantity]').fill('1');
    await form.getByRole('button', { name: 'Ajouter au projet', exact: true }).click();
    await page.locator('[data-gear-ready]').waitFor();
    const selectedId = await page.evaluate(() => window.testState.db.equipment_reservations[0].id);
    await page.locator('[data-gear-ready]').check();
    await page.waitForFunction(
      () => window.testState.db.equipment_reservations[0].state === 'loaded'
    );
    await page.locator('[data-gear-quantity] input').fill('2');
    await page.locator('[data-gear-quantity] button').click();
    await page.waitForFunction(() => window.testState.db.equipment_reservations[0].quantity === 2);
    await page.getByRole('button', { name: 'Retirer du projet', exact: true }).click();
    await page.waitForFunction(
      () => window.testState.db.equipment_reservations[0].state === 'cancelled'
    );
    await page.locator('#gear-selection-form button').click();
    await page.locator('[data-gear-ready]').waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.equipment_reservations[0].id),
      selectedId
    );
    assert.equal(await page.evaluate(() => window.testState.db.equipment_reservations.length), 1);
    // Reusable venues and per-project association.
    await page.goto(base + '/#/lieux');
    form = await editor();
    await form.locator('[name=name]').fill('Domaine test');
    await form.locator('[name=power_notes]').fill('Deux circuits dédiés');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Domaine test', { exact: true }).waitFor();
    await tool('venue');
    await page.locator('#venue-link-form select').selectOption({ label: 'Domaine test' });
    await page.locator('#venue-link-form button').click();
    await page.getByRole('heading', { name: 'Domaine test' }).waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.projects[0].location),
      'Domaine test'
    );
    // Conductor reuses schedule_items; live state and extra instructions persist.
    await tool('conductor');
    form = await editor();
    await form.locator('[name=start_time]').fill('19:00');
    await form.locator('[name=title]').fill('Ouverture de bal');
    await form.locator('[name=speaker]').fill('Témoin');
    await form.locator('[name=cue]').fill('Attendre le signal');
    await form.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await page.getByText('Ouverture de bal', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Lancer', exact: true }).click();
    await page.locator('.is-current').waitFor();
    await page.getByRole('button', { name: 'Mode direct', exact: true }).click();
    assert.equal(await page.locator('.conductor-live').count(), 1);
    // Task board: create a task, update progress and preserve legacy done flag.
    await page.goto(base + '/#/taches');
    await page.locator('#task-project').waitFor();
    assert.ok(
      await page.locator('#task-project').evaluate((el) => el.getBoundingClientRect().height < 80)
    );
    await page.locator('.tool-editor').evaluate((el) => (el.open = true));
    form = page.locator('#board-task-form');
    await form.locator('[name=label]').fill('Préparer les câbles');
    await form.locator('[name=due_date]').fill('2026-12-10');
    await form.locator('[name=priority]').selectOption('urgent');
    await form.getByRole('button', { name: 'Ajouter la tâche', exact: true }).click();
    await page.getByRole('heading', { name: 'Préparer les câbles' }).waitFor();
    await page.locator('[data-task-state]').selectOption('done');
    await page.waitForFunction(() => window.testState.db.project_tasks[0].done === true);
    // Calendar and unavailable periods.
    await page.goto(base + '/#/calendrier?month=2026-12');
    await page.locator('.calendar-grid').waitFor();
    assert.equal(
      await page
        .locator('.calendar-alert')
        .getByText('Plusieurs prestations', { exact: true })
        .count(),
      1
    );
    await page.locator('.tool-editor').evaluate((el) => (el.open = true));
    form = page.locator('#block-form');
    await form.locator('[name=label]').fill('Indisponible');
    await form.locator('[name=starts_on]').fill('2026-12-15');
    await form.locator('[name=ends_on]').fill('2026-12-16');
    await form.getByRole('button', { name: 'Bloquer la période' }).click();
    await page.locator('.calendar-block').first().waitFor();
    // Documents: real file input, private upload metadata, temporary link and visibility.
    await tool('documents');
    await page.locator('input[type=file]').setInputFiles({
      name: 'plan.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test'),
    });
    await page.getByRole('button', { name: 'Importer le document' }).click();
    await page.getByText('plan.pdf', { exact: true }).waitFor();
    assert.equal(
      await page.evaluate(() => window.testState.db.project_documents[0].client_visible),
      false
    );
    await page.getByRole('button', { name: 'Lien temporaire', exact: true }).click();
    await page.getByRole('textbox', { name: 'Lien temporaire du document' }).waitFor();
    await page.getByRole('button', { name: 'Montrer au client' }).click();
    await page.getByRole('button', { name: 'Masquer au client' }).waitFor();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Retirer', exact: true }).click();
    await page.waitForFunction(() => window.testState.db.project_documents.length === 0);
    assert.equal(await page.evaluate(() => Object.keys(window.testState.files).length), 0);
    // Internal debrief.
    await tool('debrief');
    form = page.locator('#debrief-form');
    await form.locator('[name=rating]').selectOption('5');
    await form.locator('[name=improvements]').fill('Prévoir plus de temps pour le montage');
    await form.getByRole('button', { name: 'Enregistrer le bilan' }).click();
    await page.waitForFunction(() => window.testState.db.project_debriefs.length === 1);
    assert.equal(await page.evaluate(() => window.testState.db.project_debriefs[0].rating), 5);
    // Music form link, locally generated QR, anonymous submission, moderation and closure.
    await tool('requests');
    await page.getByRole('button', { name: 'Créer un lien invité' }).click();
    await page.getByRole('button', { name: 'QR code', exact: true }).click();
    await page.locator('.qr-preview svg').waitFor();
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(base + '/#/invites/' + musicToken);
    await page.locator('#public-event-form').waitFor();
    assert.equal(await page.locator('#auth-form').count(), 0);
    form = page.locator('#public-event-form');
    await form.locator('[name=title]').fill('September');
    await form.locator('[name=artist]').fill('Earth, Wind & Fire');
    await form.getByRole('button', { name: 'Envoyer ma suggestion' }).click();
    await page.getByText(/Votre suggestion a été transmise/).waitFor();
    await page.evaluate(() => (window.testState.signedIn = true));
    await tool('requests');
    await page.locator('[data-request]').selectOption('accepted');
    await page.waitForFunction(
      () => window.testState.db.guest_music_requests[0].status === 'accepted'
    );
    await page.getByRole('button', { name: 'Fermer', exact: true }).click();
    await page.getByRole('button', { name: 'Rouvrir', exact: true }).waitFor();
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(base + '/#/invites/' + musicToken);
    await page.getByRole('heading', { name: 'Formulaire fermé' }).waitFor();
    // Public incoming request then atomic conversion to an existing client project.
    await page.evaluate(() => (window.testState.signedIn = true));
    await page.goto(base + '/#/demandes');
    await page.getByRole('button', { name: 'Créer un lien de demande' }).click();
    await page.getByRole('button', { name: 'QR code', exact: true }).waitFor();
    await page.evaluate(() => (window.testState.signedIn = false));
    await page.goto(base + '/#/demande/' + inquiryToken);
    form = page.locator('#public-event-form');
    await form.locator('[name=full_name]').fill('Prospect Test');
    await form.locator('[name=email]').fill('prospect@example.test');
    await form.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await page.getByText(/demande a bien été enregistrée/).waitFor();
    await page.evaluate(() => (window.testState.signedIn = true));
    await page.goto(base + '/#/demandes');
    await page.locator('.convert-inquiry').evaluate((el) => (el.open = true));
    form = page.locator('[data-convert]');
    await form.locator('[name=target_client]').selectOption('client');
    await form.getByRole('button', { name: 'Créer le projet', exact: true }).click();
    await page.getByRole('heading', { name: 'Événement · Prospect Test', exact: true }).waitFor();
    // Mobile views fit without page overflow. Restricted tools are absent for clients.
    await page.setViewportSize({ width: 375, height: 812 });
    for (const section of [
      'guests',
      'requests',
      'conductor',
      'documents',
      'equipment',
      'venue',
      'debrief',
    ]) {
      await tool(section);
      await page.waitForTimeout(20);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'mobile overflow: ' + section
      );
    }
    await page.goto(base + '/#/calendrier?month=2026-12');
    await page.locator('.calendar-grid').waitFor();
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'calendar mobile overflow'
    );
    await page.evaluate(() => (window.testState.role = 'client'));
    await tool('guests');
    assert.equal(await page.getByRole('link', { name: 'Bilan', exact: true }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Matériel', exact: true }).count(), 0);
    await page.goto(base + '/#/materiel');
    await page.getByText(/Accès réservé/).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      'PASS: all 11 tools, CRUD, guest export, conductor, personal equipment selection and checklist, venue association, task board, calendar, uploads, QR, public music/intake forms, moderation, conversion, mobile and client UI boundaries'
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
