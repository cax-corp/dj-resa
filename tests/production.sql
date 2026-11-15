begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare p uuid;other_p uuid;viewer uuid:=gen_random_uuid();editor uuid:=gen_random_uuid();g uuid;g2 uuid;source uuid;speaker uuid;out_l uuid;out_r uuid;input uuid;n1 uuid:=gen_random_uuid();n2 uuid:=gen_random_uuid();n3 uuid:=gen_random_uuid();board jsonb;begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) values(viewer,'authenticated','authenticated',viewer||'@fixture.invalid','{}','{}'),(editor,'authenticated','authenticated',editor||'@fixture.invalid','{}','{}');
 update public.profiles set role='dj' where id in(viewer,editor);
 insert into public.projects(client_id,title,event_type) values(current_setting('test.client')::uuid,'Production fixture','mariage') returning id into p;
 insert into public.projects(client_id,title) values(current_setting('test.admin')::uuid,'Other production fixture') returning id into other_p;
 insert into public.project_members(project_id,user_id,access_role) values(p,viewer,'viewer'),(p,editor,'editor');
 insert into public.project_guests(project_id,full_name,companions) values(p,'Guest RSVP fixture',2) returning id into g;
 insert into public.project_guests(project_id,full_name,table_name) values(p,'Legacy group guest','Legacy group');
 insert into public.project_guests(project_id,full_name) values(other_p,'Other private guest') returning id into g2;
 insert into public.project_payments(project_id,label,amount) values(p,'Confidential price',1000);
 insert into public.project_costs(project_id,label,category,amount) values(p,'Confidential expense','travel',100);
 insert into public.invoices(project_id,number,total) values(p,'TEST-'||p::text,1000);
 insert into public.project_documents(project_id,name,storage_path,size_bytes,mime_type,team_visible) values(p,'team.pdf',p||'/team.pdf',10,'application/pdf',true),(p,'private.pdf',p||'/private.pdf',10,'application/pdf',false);
 insert into public.equipment(name,units) values('Controller fixture',1) returning id into source;
 insert into public.equipment(name,units) values('Speaker fixture',2) returning id into speaker;
 insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,source,1,'2030-01-01','2030-01-01'),(p,speaker,2,'2030-01-01','2030-01-01');
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,gender,signal) values(source,'Master L','out','xlr3','male','line') returning id into out_l;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,gender,signal) values(source,'Master R','out','xlr3','male','line') returning id into out_r;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,gender,signal) values(speaker,'Input','in','xlr3','female','line') returning id into input;
 select jsonb_build_object('width',10,'depth',6,'zones','[]'::jsonb,'nodes',jsonb_build_array(
 jsonb_build_object('id',n1,'equipment_id',source,'unit',1,'label','Controller','x',50,'y',80,'ports',(select jsonb_agg(to_jsonb(a)) from public.equipment_audio_ports a where equipment_id=source)),
 jsonb_build_object('id',n2,'equipment_id',speaker,'unit',1,'label','Left speaker','x',20,'y',20,'ports',(select jsonb_agg(to_jsonb(a)) from public.equipment_audio_ports a where equipment_id=speaker)),
 jsonb_build_object('id',n3,'equipment_id',speaker,'unit',2,'label','Right speaker','x',80,'y',20,'ports',(select jsonb_agg(to_jsonb(a)) from public.equipment_audio_ports a where equipment_id=speaker))),
 'edges',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from_node',n1,'from_port',out_l,'to_node',n2,'to_port',input,'length',5),jsonb_build_object('id',gen_random_uuid(),'from_node',n1,'from_port',out_r,'to_node',n3,'to_port',input,'length',5))) into board;
 perform set_config('test.project',p::text,true);perform set_config('test.other',other_p::text,true);perform set_config('test.viewer',viewer::text,true);perform set_config('test.editor',editor::text,true);perform set_config('test.guest',g::text,true);perform set_config('test.other_guest',g2::text,true);perform set_config('test.setup',board::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
select public.create_guest_rsvp_links(current_setting('test.project')::uuid);
select set_config('test.token',(select token::text from public.guest_rsvp_links where guest_id=current_setting('test.guest')::uuid),true);
do $$ declare p uuid:=current_setting('test.project')::uuid;t uuid:=gen_random_uuid();board jsonb;rejected boolean:=false;n integer;begin
 board:=jsonb_build_object('tables',jsonb_build_array(jsonb_build_object('id',t,'name','Table A','seats',8,'shape','round','x',30,'y',30)),'assignments',jsonb_build_object(current_setting('test.guest'),t::text),'guest_tables',jsonb_build_object(current_setting('test.guest'),''));
 n:=public.save_project_seating(p,board,0);if n<>1 then raise exception 'Seating not saved';end if;
 if (select table_name from public.project_guests where id=current_setting('test.guest')::uuid)<>'Table A' then raise exception 'Guest table not synchronized';end if;
 if (select table_name from public.project_guests where project_id=p and full_name='Legacy group guest')<>'Legacy group' then raise exception 'Legacy group erased';end if;
 update public.project_guests set table_name='Other manual group' where id=current_setting('test.guest')::uuid;
 if (select revision from public.project_seating where project_id=p)<>2 then raise exception 'Guest grouping did not invalidate seating revision';end if;
 update public.project_guests set table_name='Table A' where id=current_setting('test.guest')::uuid;
 begin perform public.save_project_seating(p,board,0);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Stale seating save allowed';end if;
 rejected:=false;begin perform public.save_project_seating(p,'{}',1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Malformed seating allowed';end if;
 n:=public.save_project_setup(p,current_setting('test.setup')::jsonb,0);if n<>1 then raise exception 'Setup not saved';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(current_setting('test.setup')::jsonb,'{nodes,0,ports,0,signal}','"speaker"'),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Speaker/line mismatch allowed';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(current_setting('test.setup')::jsonb,'{edges,0,id}','"<script>"'),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Invalid edge id allowed';end if;
 n:=public.import_project_music(p,'[{"title":"Test song","artist":"Test artist","url":"https://open.spotify.com/track/0123456789012345678901"}]','must_play');if n<>1 then raise exception 'Import failed';end if;
 n:=public.import_project_music(p,'[{"title":"Test song","artist":"Test artist"}]','must_play');if n<>0 then raise exception 'Duplicate track imported';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.viewer'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('test.project')::uuid;n integer;rejected boolean:=false;begin
 if not exists(select 1 from public.projects where id=p) or exists(select 1 from public.projects where id=current_setting('test.other')::uuid) then raise exception 'Project scope failed';end if;
 if exists(select 1 from public.project_payments) or exists(select 1 from public.invoices) or exists(select 1 from public.project_costs) or exists(select 1 from public.guest_rsvp_links) then raise exception 'Private finance or RSVP links leaked to team';end if;
 if (select count(*) from public.project_documents where project_id=p)<>1 then raise exception 'Team document visibility failed';end if;
 if (select count(*) from public.project_setups where project_id=p)<>1 then raise exception 'Team cannot read setup';end if;
 update public.project_guests set full_name='Unauthorized edit' where project_id=p;get diagnostics n=row_count;if n<>0 then raise exception 'Viewer edited guests';end if;
 begin perform public.save_project_setup(p,current_setting('test.setup')::jsonb,1);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Viewer saved setup';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.editor'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('test.project')::uuid;n integer;begin
 update public.project_guests set dietary='Editor update' where id=current_setting('test.guest')::uuid;get diagnostics n=row_count;if n<>1 then raise exception 'Editor cannot update guest';end if;
 n:=public.save_project_setup(p,current_setting('test.setup')::jsonb,1);if n<>2 then raise exception 'Editor cannot save setup';end if;
 if exists(select 1 from public.project_payments) or exists(select 1 from public.project_costs) then raise exception 'Editor saw money';end if;
end $$;
reset role;
delete from public.project_members where user_id=current_setting('test.editor')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.editor'),'role','authenticated')::text,true);
do $$begin if exists(select 1 from public.projects where id=current_setting('test.project')::uuid) or exists(select 1 from public.project_setups where project_id=current_setting('test.project')::uuid) then raise exception 'Membership revocation failed';end if;end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$declare payload jsonb;rejected boolean:=false;begin
 payload:=public.get_guest_rsvp(current_setting('test.token')::uuid);if payload->>'guest_name'<>'Guest RSVP fixture' or payload ? 'notes' or payload ? 'email' then raise exception 'RSVP projection failed';end if;
 perform public.submit_guest_rsvp(current_setting('test.token')::uuid,'{"response":"confirmed","companions":1,"dietary":"No nuts"}');
 begin perform public.submit_guest_rsvp(current_setting('test.token')::uuid,'{"response":"confirmed","companions":3}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Companion limit bypassed';end if;
 rejected:=false;begin perform 1 from public.project_seating;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous seating listing allowed';end if;
end $$;
reset role;
do $$begin if not exists(select 1 from public.project_guests where id=current_setting('test.guest')::uuid and response='confirmed' and companions=1 and dietary='No nuts' and table_name='Table A') then raise exception 'RSVP did not preserve guest/table fields';end if;update public.guest_rsvp_links set is_open=false where token=current_setting('test.token')::uuid;end $$;
set local role anon;
do $$declare rejected boolean:=false;begin
 if public.get_guest_rsvp(current_setting('test.token')::uuid) is not null then raise exception 'Closed RSVP still readable';end if;
 begin perform public.submit_guest_rsvp(current_setting('test.token')::uuid,'{"response":"confirmed","companions":0}');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Closed RSVP submission allowed';end if;
end $$;
reset role;
rollback;
