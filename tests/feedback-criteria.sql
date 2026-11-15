begin;
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
do $$ declare p uuid; token uuid; begin
 insert into public.projects(client_id,title) values(current_setting('test.client')::uuid,'Feedback criteria test') returning id into p;
 insert into public.event_form_links(project_id,kind) values(p,'feedback') returning event_form_links.token into token;
 perform set_config('test.project',p::text,true);perform set_config('test.token',token::text,true);
end $$;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select public.submit_event_form(current_setting('test.token')::uuid,'{"rating":4}');
select public.submit_event_form(current_setting('test.token')::uuid,'{"rating":5,"respondent":"Camille Martin","music_rating":5,"atmosphere_rating":4,"sound_rating":3,"organization_rating":2,"comment":"Detailed review"}');
-- Legacy payloads remain accepted for already-open browser tabs.
select public.submit_event_form(current_setting('test.token')::uuid,'{"rating":3,"audience":"guest","respondent":"Old tab"}');
do $$ declare rejected boolean:=false; begin
 begin perform public.submit_event_form(current_setting('test.token')::uuid,'{"rating":4,"sound_rating":6}');exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Invalid criterion accepted';end if;
 rejected:=false;
 begin perform public.submit_event_form(current_setting('test.token')::uuid,'{"music_rating":5}');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Missing global rating accepted';end if;
 rejected:=false;
 begin perform 1 from public.event_feedback;exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous feedback listing allowed';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.event_feedback where project_id=current_setting('test.project')::uuid)<>3 then raise exception 'Incorrect saved response count';end if;
 if not exists(select 1 from public.event_feedback where project_id=current_setting('test.project')::uuid and rating=4 and respondent='' and audience is null and music_rating is null and sound_rating is null) then raise exception 'Anonymous review misclassified';end if;
 if not exists(select 1 from public.event_feedback where project_id=current_setting('test.project')::uuid and respondent='Camille Martin' and music_rating=5 and organization_rating=2) then raise exception 'Criteria not saved';end if;
 update public.event_form_links set is_open=false where token=current_setting('test.token')::uuid;
end $$;
set local role anon;
do $$ declare rejected boolean:=false; begin
 begin perform public.submit_event_form(current_setting('test.token')::uuid,'{"rating":5}');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Closed form accepted review';end if;
end $$;
reset role;
rollback;
