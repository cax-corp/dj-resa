-- Real database integration checks. Every fixture write is rolled back.
begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$
declare p uuid; other_p uuid; stock uuid; token uuid; intake uuid; lead uuid; sid uuid;
begin
  insert into public.projects(client_id,title,event_date) values(current_setting('test.client')::uuid,'Event tools test','2030-01-01') returning id into p;
  insert into public.projects(client_id,title) values(current_setting('test.admin')::uuid,'Other private project') returning id into other_p;
  insert into public.equipment(name,units) values('Test speakers',2) returning id into stock;
  insert into public.event_form_links(kind,project_id) values('music',p) returning event_form_links.token into token;
  insert into public.event_form_links(kind) values('inquiry') returning event_form_links.token into intake;
  insert into public.booking_inquiries(full_name,email,event_date,location,message) values('Lead test','lead@example.test','2030-02-01','Venue','Request') returning id into lead;
  insert into public.schedule_items(project_id,start_time,title) values(p,'18:00','Arrival') returning id into sid;
  perform set_config('test.step1',sid::text,true);
  insert into public.schedule_items(project_id,start_time,title) values(p,'19:00','First dance') returning id into sid;
  perform set_config('test.step2',sid::text,true);
  insert into public.project_guests(project_id,full_name,response,companions,dietary) values(p,'Guest test','confirmed',2,'Allergy');
  insert into public.project_guests(project_id,full_name) values(other_p,'Other guest');
  insert into public.project_contacts(project_id,full_name,role) values(p,'Contact test','Photographer');
  insert into public.project_debriefs(project_id,summary) values(p,'Internal notes');
  insert into public.project_documents(project_id,name,storage_path,size_bytes,mime_type,client_visible)
    values(p,'visible.pdf',p::text||'/visible.pdf',10,'application/pdf',true),(p,'internal.pdf',p::text||'/internal.pdf',10,'application/pdf',false),
      (other_p,'other.pdf',other_p::text||'/other.pdf',10,'application/pdf',true);
  insert into storage.objects(bucket_id,name) values('project-documents',p::text||'/visible.pdf'),('project-documents',p::text||'/internal.pdf'),('project-documents',other_p::text||'/other.pdf');
  perform set_config('test.project',p::text,true);perform set_config('test.other',other_p::text,true);
  perform set_config('test.stock',stock::text,true);perform set_config('test.music',token::text,true);
  perform set_config('test.intake',intake::text,true);perform set_config('test.lead',lead::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$
declare stock uuid:=current_setting('test.stock')::uuid; p uuid:=current_setting('test.project')::uuid; reservation uuid; rejected boolean; pid uuid; pid2 uuid;
begin
  -- The same owned equipment may be planned for different projects, without a rental-period lock.
  insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,stock,1,'2030-01-01','2030-01-01') returning id into reservation;
  insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(current_setting('test.other')::uuid,stock,2,'2030-01-01','2030-01-01');
  rejected:=false;
  begin insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,stock,2,'2030-01-01','2030-01-01');exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Project selection exceeds owned quantity';end if;
  update public.equipment set units=1 where id=stock;
  if not exists(select 1 from public.equipment_reservations where equipment_id=stock and project_id=current_setting('test.other')::uuid and quantity=2) then raise exception 'Inventory edit changed project history';end if;
  update public.equipment_reservations set state='loaded' where id=reservation;
  update public.equipment set units=2 where id=stock;
  update public.equipment_reservations set state='cancelled' where id=reservation;
  update public.equipment_reservations set quantity=2,state='reserved' where id=reservation;
  if (select count(*) from public.equipment_reservations where id=reservation)<>1 then raise exception 'Selection identity was not preserved';end if;
  perform public.set_conductor_step(current_setting('test.step1')::uuid,'current');
  perform public.set_conductor_step(current_setting('test.step2')::uuid,'current');
  if (select count(*) from public.schedule_items where project_id=p and run_state='current')<>1 then raise exception 'Conductor current step not unique';end if;
  pid:=public.convert_booking_inquiry(current_setting('test.lead')::uuid,current_setting('test.client')::uuid,'Converted event');
  pid2:=public.convert_booking_inquiry(current_setting('test.lead')::uuid,current_setting('test.client')::uuid,'Duplicate event');
  if pid<>pid2 or (select count(*) from public.projects where id=pid)<>1 then raise exception 'Lead conversion not idempotent';end if;
  if not exists(select 1 from public.projects where id=pid and location='Venue' and event_date='2030-02-01') then raise exception 'Conversion lost lead fields';end if;
  if (select count(*) from storage.objects where bucket_id='project-documents' and name like p::text||'/%')<>2 then raise exception 'Admin storage read failed';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare rejected boolean; p uuid:=current_setting('test.project')::uuid;
begin
  if (select count(*) from public.project_guests where project_id=p)<>1 or exists(select 1 from public.project_guests where project_id=current_setting('test.other')::uuid) then raise exception 'Guest scope failed';end if;
  insert into public.project_contacts(project_id,full_name) values(p,'Client contact');
  rejected:=false;begin insert into public.project_guests(project_id,full_name) values(current_setting('test.other')::uuid,'Intruder');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Cross-project guest insert allowed';end if;
  if exists(select 1 from public.project_debriefs) or exists(select 1 from public.equipment) or exists(select 1 from public.booking_inquiries) then raise exception 'Internal admin data leaked';end if;
  if (select count(*) from public.project_documents where project_id=p)<>1 then raise exception 'Document visibility failed';end if;
  if (select count(*) from storage.objects where bucket_id='project-documents' and name like p::text||'/%')<>1 then raise exception 'Storage visibility failed';end if;
  if exists(select 1 from storage.objects where bucket_id='project-documents' and name like current_setting('test.other')||'/%') then raise exception 'Other project files leaked';end if;
  rejected:=false;begin insert into storage.objects(bucket_id,name) values('project-documents',p::text||'/unauthorized.pdf');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Client file upload accepted';end if;
  rejected:=false;begin perform public.convert_booking_inquiry(current_setting('test.lead')::uuid,current_setting('test.client')::uuid,'Unauthorized');exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Client lead conversion accepted';end if;
  perform public.set_conductor_step(current_setting('test.step1')::uuid,'done');
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
declare result jsonb; submitted uuid; rejected boolean; t text; i integer;
begin
  result:=public.get_event_form(current_setting('test.music')::uuid);
  if result->>'kind'<>'music' or (select count(*) from jsonb_object_keys(result))<>3 then raise exception 'Anonymous form exposes wrong fields';end if;
  if public.get_event_form(gen_random_uuid()) is not null then raise exception 'Unknown form accepted';end if;
  submitted:=public.submit_event_form(current_setting('test.music')::uuid,jsonb_build_object('title','Requested track','artist','Artist','guest_name','Guest','project_id',current_setting('test.other'),'status','played'));
  if submitted is null then raise exception 'Anonymous music request failed';end if;
  for i in 1..19 loop perform public.submit_event_form(current_setting('test.music')::uuid,'{"title":"Another track","artist":"Artist"}');end loop;
  rejected:=false;begin perform public.submit_event_form(current_setting('test.music')::uuid,'{"title":"Overflow","artist":"Artist"}');exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Music submission limit failed';end if;
  perform public.submit_event_form(current_setting('test.intake')::uuid,'{"full_name":"Public prospect","email":"public@example.test","event_date":"2030-03-01"}');
  rejected:=false;begin perform public.submit_event_form(current_setting('test.intake')::uuid,'{"full_name":"Invalid","email":"bad"}');exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Invalid public email accepted';end if;
  foreach t in array array['project_guests','project_contacts','guest_music_requests','event_form_links','booking_inquiries','project_documents','project_debriefs','equipment','equipment_reservations','venues','calendar_blocks'] loop
    rejected:=false;begin execute format('select 1 from public.%I limit 1',t);exception when insufficient_privilege then rejected:=true;end;
    if not rejected then raise exception 'Anonymous raw read accepted: %',t;end if;
  end loop;
  if exists(select 1 from storage.objects where bucket_id='project-documents') then raise exception 'Anonymous storage files leaked';end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.guest_music_requests where link_token=current_setting('test.music')::uuid and project_id=current_setting('test.project')::uuid and status='pending') then raise exception 'Server did not enforce music scope';end if;
  if exists(select 1 from public.guest_music_requests where link_token=current_setting('test.music')::uuid and project_id=current_setting('test.other')::uuid) then raise exception 'Forged project accepted';end if;
  update public.event_form_links set is_open=false where token=current_setting('test.music')::uuid;
end $$;
set local role anon;
do $$ declare rejected boolean:=false;begin
  begin perform public.submit_event_form(current_setting('test.music')::uuid,'{"title":"Closed","artist":"Artist"}');exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Closed music form accepted submission';end if;
end $$;
reset role;
rollback;
