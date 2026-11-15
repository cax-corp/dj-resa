begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare p uuid; other_p uuid; token uuid;begin
 insert into public.projects(client_id,title,event_type) values(current_setting('test.client')::uuid,'Preparation test','mariage') returning id into p;
 insert into public.projects(client_id,title,event_type) values(current_setting('test.admin')::uuid,'Other preparation test','mariage') returning id into other_p;
 insert into public.project_shares(project_id,sections) values(p,array['description']) returning project_shares.token into token;
 perform set_config('test.project',p::text,true);perform set_config('test.other',other_p::text,true);perform set_config('test.token',token::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('test.project')::uuid; n integer; rejected boolean:=false;begin
 insert into public.project_event_briefs(project_id,event_type,details,revision) values(p,'mariage','{"couple_names":"Private Couple","ceremony_time":"13:30"}',99);
 if (select revision from public.project_event_briefs where project_id=p)<>1 then raise exception 'Untrusted revision accepted';end if;
 update public.project_event_briefs set details='{"couple_names":"Updated Couple"}',revision=99 where project_id=p and event_type='mariage' and revision=1;
 if (select revision from public.project_event_briefs where project_id=p)<>2 then raise exception 'Version not advanced';end if;
 update public.project_event_briefs set details='{}' where project_id=p and event_type='mariage' and revision=1;
 get diagnostics n=row_count;if n<>0 then raise exception 'Stale revision overwrote data';end if;
 begin insert into public.project_event_briefs(project_id,event_type,details) values(current_setting('test.other')::uuid,'mariage','{}');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Other project brief allowed';end if;
 rejected:=false;begin update public.project_event_briefs set details='{"speakers":"Wrong type field"}' where project_id=p;exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Wrong type fields accepted';end if;
 rejected:=false;begin update public.project_event_briefs set details='{"ceremony_time":"99:30"}' where project_id=p;exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Invalid time accepted';end if;
 n:=public.add_event_preparation_tasks(p,'mariage',array['Préparer les micros',' préparer les micros ']);if n<>1 then raise exception 'Duplicate task labels inserted';end if;
 n:=public.add_event_preparation_tasks(p,'mariage',array['Préparer les micros']);if n<>0 then raise exception 'Repeated click duplicated tasks';end if;
end $$;
reset role;
update public.projects set event_type='anniversaire' where id=current_setting('test.project')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare p uuid:=current_setting('test.project')::uuid; rejected boolean:=false;begin
 begin update public.project_event_briefs set details='{}' where project_id=p and event_type='mariage';exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Stale type accepted';end if;
 insert into public.project_event_briefs(project_id,event_type,details) values(p,'anniversaire','{"celebrant":"Birthday Person","cake_time":"22:00"}');
 if (select count(*) from public.project_event_briefs where project_id=p)<>2 then raise exception 'Previous type brief lost';end if;
end $$;
reset role;
update public.projects set status='termine' where id=current_setting('test.project')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare n integer;begin
 update public.project_event_briefs set details='{}' where project_id=current_setting('test.project')::uuid;
 get diagnostics n=row_count;if n<>0 then raise exception 'Completed client project edited';end if;
end $$;
reset role;
set local role anon;
do $$ declare rejected boolean:=false;payload jsonb;begin
 begin perform 1 from public.project_event_briefs;exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous brief listing allowed';end if;
 payload:=public.get_shared_project(current_setting('test.token')::uuid);
 if payload::text like '%Couple%' or payload::text like '%Birthday Person%' then raise exception 'Private brief exposed by share';end if;
end $$;
reset role;
rollback;
