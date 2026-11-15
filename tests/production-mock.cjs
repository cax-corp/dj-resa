const fs = require('node:fs'),
  vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/event-tools.cjs', 'utf8');
let mock = vm.runInNewContext(source.slice(0, source.lastIndexOf('(async () => {')) + '\nmock', {
  require,
  process,
});
mock = mock.replace(
  "window.testState.role==='admin'?'admin':'client'",
  "window.testState.role==='admin'?'admin':window.testState.role==='dj'?'team':'client'"
);
const pid = '20000000-0000-4000-8000-000000000001',
  sourceId = '70000000-0000-4000-8000-000000000001',
  speakerId = '70000000-0000-4000-8000-000000000002';
mock += `\nwindow.testState.db.profiles.push({id:'team',role:'dj',full_name:'Équipe test',email:'team@example.test'});
Object.assign(window.testState.db,{project_members:[],guest_rsvp_links:[],project_seating:[],project_setups:[],equipment_audio_ports:[],project_costs:[],project_profit_settings:[],project_playlists:[]});
window.testState.db.equipment=[{id:'${sourceId}',name:'Controller',units:1,active:true},{id:'${speakerId}',name:'Speaker',units:2,active:true}];
window.testState.db.equipment_reservations=[{id:'res1',project_id:'${pid}',equipment_id:'${sourceId}',quantity:1,state:'reserved'},{id:'res2',project_id:'${pid}',equipment_id:'${speakerId}',quantity:2,state:'reserved'}];
window.testState.db.project_guests=[{id:crypto.randomUUID(),project_id:'${pid}',full_name:'Alice',email:'alice@example.test',response:'confirmed',companions:1,table_name:'',dietary:'Initial needs',notes:'Private note'},{id:crypto.randomUUID(),project_id:'${pid}',full_name:'Bob',email:'bob@example.test',response:'pending',companions:0,table_name:'',dietary:'',notes:''}];
window.testState.db.project_payments=[{id:'base',project_id:'${pid}',label:'Base',amount:1000,paid:true,is_base:true}];
window.testState.db.schedule_items=[{id:'slot',project_id:'${pid}',title:'Travail',start_time:'18:00',end_time:'20:00',day_offset:0}];
window.testState.db.project_documents=[{id:crypto.randomUUID(),project_id:'${pid}',name:'Shared document.pdf',size_bytes:10,mime_type:'application/pdf',team_visible:true},{id:crypto.randomUUID(),project_id:'${pid}',name:'Private document.pdf',size_bytes:10,mime_type:'application/pdf',team_visible:false}];
const originalCreate=window.supabase.createClient;window.supabase.createClient=(...args)=>{const client=originalCreate(...args),from=client.from,rpc=client.rpc;const clone=data=>structuredClone(data);
client.from=table=>{const q=from(table),then=q.then;q.then=resolve=>then(result=>{if(window.testState.role==='dj'){const memberships=window.testState.db.project_members.filter(m=>m.user_id==='team');const allowed=new Set(memberships.map(m=>m.project_id));let data=result.data;if(['project_payments','invoices','project_costs','project_profit_settings','guest_rsvp_links'].includes(table))data=[];else if(table==='projects'){if(Array.isArray(data))data=data.filter(p=>allowed.has(p.id));else if(data&&!allowed.has(data.id))data=null;}else if(table==='project_documents'&&Array.isArray(data))data=data.filter(d=>allowed.has(d.project_id)&&d.team_visible);else if(table==='project_members'&&Array.isArray(data))data=data.filter(m=>m.user_id==='team');result={...result,data};}return resolve(result)});return q};
client.rpc=async(name,args)=>{const db=window.testState.db;const fail=message=>({data:null,error:{message}});window.testState.calls.push({rpc:name,args});
if(name==='create_guest_rsvp_links'){let count=0;for(const g of db.project_guests.filter(g=>g.project_id===args.pid)){if(!db.guest_rsvp_links.some(l=>l.guest_id===g.id)){db.guest_rsvp_links.push({id:crypto.randomUUID(),token:crypto.randomUUID(),guest_id:g.id,project_id:g.project_id,max_companions:g.companions,is_open:true,created_at:'2026-11-15T10:00:00Z'});count++}}return {data:count,error:null}}
if(name==='get_guest_rsvp'){const link=db.guest_rsvp_links.find(l=>l.token===args.link_token&&l.is_open);if(!link)return {data:null,error:null};const g=db.project_guests.find(g=>g.id===link.guest_id);return {data:{title:'Mariage test',event_date:'2026-12-12',guest_name:g.full_name,response:g.response,companions:g.companions,dietary:g.dietary,max_companions:link.max_companions},error:null}}
if(name==='submit_guest_rsvp'){const link=db.guest_rsvp_links.find(l=>l.token===args.link_token&&l.is_open);if(!link)return fail('Invitation fermée');if(args.fields.companions>link.max_companions)return fail('Limite dépassée');const g=db.project_guests.find(g=>g.id===link.guest_id);Object.assign(g,args.fields,{companions:args.fields.response==='declined'?0:args.fields.companions});return {data:null,error:null}}
if(name==='save_project_seating'||name==='save_project_setup'){const table=name==='save_project_seating'?'project_seating':'project_setups';let row=db[table].find(r=>r.project_id===args.pid);if((row?.revision||0)!==args.expected_revision)return fail('Le plan a changé ailleurs. Rechargez-le.');if(name==='save_project_seating'){const old=row?.layout?.assignments||{};for(const g of db.project_guests.filter(g=>g.project_id===args.pid)){const tableId=args.board.assignments[g.id];if(tableId)g.table_name=args.board.tables.find(t=>t.id===tableId).name;else if(old[g.id])g.table_name='';}}if(!row){row={project_id:args.pid,revision:0,created_at:'2026-11-15T10:00:00Z'};db[table].push(row)}row.layout=clone(args.board);if(table==='project_seating')delete row.layout.guest_tables;row.revision++;return {data:row.revision,error:null}}
if(name==='import_project_music'){let n=0;for(const item of args.entries){if(!db.project_tracks.some(t=>t.project_id===args.pid&&t.kind===args.track_kind&&t.title.toLowerCase()===item.title.toLowerCase()&&t.artist.toLowerCase()===item.artist.toLowerCase())){db.project_tracks.push({id:crypto.randomUUID(),project_id:args.pid,kind:args.track_kind,...item});n++}}return {data:n,error:null}}
return rpc(name,args)};
client.functions={invoke:async(name,{body})=>{if(name!=='create-team-user')return {error:{message:'Unsupported'}};const id=crypto.randomUUID(),db=window.testState.db;db.profiles.push({id,role:'dj',full_name:body.full_name,email:body.email});return{data:{id},error:null}}};return client};`;
module.exports = { mock, pid, sourceId, speakerId };
