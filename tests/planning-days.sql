-- Real database fixtures; no existing project is changed.
begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare p uuid; other_p uuid; token uuid; hidden uuid; begin
 insert into public.projects(client_id,title,event_date) values(current_setting('test.client')::uuid,'Planning days test','2030-01-01') returning id into p;
 insert into public.projects(client_id,title) values(current_setting('test.admin')::uuid,'Other planning test') returning id into other_p;
 insert into public.schedule_items(project_id,start_time,end_time,title,day_offset) values
  (p,'11:50','13:00','Installation',0),(p,'10:00','12:00','Rangement',1),(other_p,'09:00','12:00','Other private schedule',1);
 insert into public.project_shares(project_id,sections) values(p,array['schedule']) returning project_shares.token into token;
 insert into public.project_shares(project_id,sections) values(p,array['status']) returning project_shares.token into hidden;
 perform set_config('test.project',p::text,true);perform set_config('test.other',other_p::text,true);perform set_config('test.token',token::text,true);perform set_config('test.hidden',hidden::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare n integer; rejected boolean:=false; begin
 update public.schedule_items set day_offset=2 where project_id=current_setting('test.project')::uuid and title='Rangement';
 get diagnostics n=row_count;if n<>1 then raise exception 'Authorized day editing failed';end if;
 update public.schedule_items set day_offset=3 where project_id=current_setting('test.other')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Other project changed';end if;
 begin
  update public.schedule_items set day_offset=31 where project_id=current_setting('test.project')::uuid;
 exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Invalid day accepted';end if;
 update public.schedule_items set day_offset=1 where project_id=current_setting('test.project')::uuid and title='Rangement';
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ declare payload jsonb; begin
 payload:=public.get_shared_project(current_setting('test.token')::uuid);
 if payload->'schedule'->0->>'title'<>'Installation' or payload->'schedule'->1->>'title'<>'Rangement' then raise exception 'Public schedule ordering incorrect';end if;
 if payload->'schedule'->1->>'day_offset'<>'1' then raise exception 'Public day missing';end if;
 if jsonb_array_length(payload->'schedule')<>2 then raise exception 'Other project schedule leaked';end if;
 if payload ? 'event_date' then raise exception 'Unselected date leaked';end if;
 if public.get_shared_project(current_setting('test.hidden')::uuid) ? 'schedule' then raise exception 'Unselected schedule leaked';end if;
end $$;
reset role;
rollback;
