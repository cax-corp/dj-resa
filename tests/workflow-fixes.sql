begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare pid uuid; v uuid; f uuid; u uuid:=gen_random_uuid(); r uuid; begin
 insert into public.projects(client_id,title,location) values(current_setting('test.client')::uuid,'Workflow tests','Legacy venue') returning id into pid;
 insert into public.venues(name,address) values('Directory venue','1 Main Street') returning id into v;
 insert into public.event_form_links(kind,project_id) values('feedback',pid) returning token into f;
 insert into public.guest_music_requests(project_id,title,artist,note) values(pid,'September','Earth, Wind & Fire','Guest note') returning id into r;
 perform set_config('test.request',r::text,true);
 insert into auth.users(id,email,raw_user_meta_data) values(u,'workflow-'||u::text||'@example.test','{"full_name":"Unused test client"}');
 perform set_config('test.unused',u::text,true);perform set_config('test.project',pid::text,true);perform set_config('test.venue',v::text,true);perform set_config('test.feedback',f::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$ declare pid uuid:=current_setting('test.project')::uuid; v uuid:=current_setting('test.venue')::uuid; n integer; rejected boolean; other uuid;
begin
 perform public.save_catalog_project(pid,'{"title":"Workflow tests edited","status":"preparation","description":"Notes"}','keep');
 if not exists(select 1 from public.projects where id=pid and location='Legacy venue') then raise exception 'Legacy location was changed without selection';end if;
 perform public.set_project_directory_venue(pid,v);
 if not exists(select 1 from public.projects where id=pid and location='Directory venue, 1 Main Street') then raise exception 'Directory selection did not synchronize project';end if;
 update public.venues set address='2 Main Street' where id=v;
 if not exists(select 1 from public.projects where id=pid and location='Directory venue, 2 Main Street') then raise exception 'Directory edit not reflected';end if;
 select count(*) into n from public.projects;
 rejected:=false;begin perform public.create_catalog_project(jsonb_build_object('client_id',current_setting('test.client'),'title','Invalid','venue_id',gen_random_uuid()));exception when raise_exception then rejected:=true;end;
 if not rejected or (select count(*) from public.projects)<>n then raise exception 'Invalid directory creation not atomic';end if;
 other:=public.create_catalog_project(jsonb_build_object('client_id',current_setting('test.client'),'title','Catalog creation','venue_id',v,'location','Forged manual place'));
 if not exists(select 1 from public.projects where id=other and location='Directory venue, 2 Main Street') then raise exception 'Manual location bypassed directory';end if;
 update public.guest_music_requests set status='accepted' where id=current_setting('test.request')::uuid;
 update public.guest_music_requests set status='accepted' where id=current_setting('test.request')::uuid;
 insert into public.guest_music_requests(project_id,title,artist,status) values(pid,' september ','earth, wind & fire','accepted');
 if (select count(*) from public.project_tracks where project_id=pid and kind='must_play')<>1 then raise exception 'Acceptance did not add exactly one must-play track';end if;
 if exists(select 1 from public.project_tracks where project_id=pid and guest_request_id is not null and note is not null) then raise exception 'Private guest note copied into public playlist';end if;
 update public.guest_music_requests set status='rejected' where id=current_setting('test.request')::uuid;
 if exists(select 1 from public.project_tracks where project_id=pid and kind='do_not_play') then raise exception 'Rejection added a banned song';end if;
 rejected:=false;begin perform public.delete_unused_client(current_setting('test.client')::uuid);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Client with projects could be deleted';end if;
 perform public.delete_unused_client(current_setting('test.unused')::uuid);
end $$;
reset role;
do $$ begin
 if exists(select 1 from auth.users where id=current_setting('test.unused')::uuid) or exists(select 1 from public.profiles where id=current_setting('test.unused')::uuid) then raise exception 'Unused client account not removed';end if;
 if not exists(select 1 from public.projects where id=current_setting('test.project')::uuid) then raise exception 'Client deletion removed projects';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare rejected boolean:=false;begin
 begin perform public.delete_unused_client(current_setting('test.admin')::uuid);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Client can invoke account deletion';end if;
 if exists(select 1 from public.event_feedback) then raise exception 'Client can list feedback';end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ declare f uuid:=current_setting('test.feedback')::uuid; rejected boolean;begin
 if public.get_event_form(f)->>'kind'<>'feedback' then raise exception 'Public feedback form unavailable';end if;
 perform public.submit_event_form(f,'{"rating":5,"audience":"client","respondent":"Camille","comment":"Très belle soirée","project_id":"00000000-0000-0000-0000-000000000000"}');
 rejected:=false;begin perform public.submit_event_form(f,'{"rating":6,"audience":"guest"}');exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Invalid star rating accepted';end if;
 rejected:=false;begin perform 1 from public.event_feedback;exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous feedback listing exposed';end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.event_feedback where project_id=current_setting('test.project')::uuid and rating=5 and message='Très belle soirée') then raise exception 'Feedback not scoped to correct project';end if;
 update public.event_form_links set is_open=false where token=current_setting('test.feedback')::uuid;
end $$;
set local role anon;
do $$ declare rejected boolean:=false;begin
 begin perform public.submit_event_form(current_setting('test.feedback')::uuid,'{"rating":5,"audience":"guest"}');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Closed feedback form accepted a review';end if;
end $$;
reset role;
rollback;
