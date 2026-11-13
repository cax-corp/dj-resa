-- Integration checks against the deployed schema. All fixture writes roll back.
begin;
select set_config('test.admin', (select id::text from public.profiles where role='admin' limit 1), true);
select set_config('test.client', (select id::text from public.profiles where role='client' limit 1), true);
do $$
declare p uuid; minimal uuid; full_link uuid;
begin
  if current_setting('test.admin') = '' or current_setting('test.client') = '' then raise exception 'Tests require an existing admin and client'; end if;
  insert into public.projects(client_id,title,event_date,location,description)
    values(current_setting('test.client')::uuid,'Sharing test','2026-12-01','Private location','Private description') returning id into p;
  insert into public.project_tracks(project_id,kind,title,artist,note) values(p,'must_play','Shared track','Artist','Track note');
  insert into public.project_tasks(project_id,label) values(p,'Private task');
  insert into public.schedule_items(project_id,start_time,title) values(p,'18:00','Private schedule');
  insert into public.project_updates(project_id,author_id,body) values(p,current_setting('test.admin')::uuid,'Private update');
  insert into public.project_payments(project_id,label,amount) values(p,'Private payment',100);
  insert into public.invoices(project_id,number,total) values(p,'SHARE-TEST-' || p::text,100);
  insert into public.project_shares(project_id,sections) values(p,array['event_date','must_play']) returning token into minimal;
  insert into public.project_shares(project_id,sections) values(p,array['event_date','location','status','description','must_play','do_not_play','schedule','tasks','updates','payments','client','invoices']) returning token into full_link;
  perform set_config('test.project',p::text,true);
  perform set_config('test.minimal',minimal::text,true);
  perform set_config('test.full',full_link::text,true);
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
declare payload jsonb; k text;
begin
  payload := public.get_shared_project(current_setting('test.minimal')::uuid);
  if payload->>'title' <> 'Sharing test' or jsonb_array_length(payload->'must_play') <> 1 then raise exception 'Anonymous read failed'; end if;
  if (select count(*) from jsonb_object_keys(payload)) <> 3 then raise exception 'Hidden sections leaked'; end if;
  if payload::text like '%Private%' or payload::text like '%project_id%' or payload::text like '%author_id%' then raise exception 'Private data leaked'; end if;
  payload := public.get_shared_project(current_setting('test.full')::uuid);
  if (select count(*) from jsonb_object_keys(payload)) <> 13 then raise exception 'Full selection failed'; end if;
  foreach k in array array['schedule','tasks','updates','payments','invoices'] loop
    if jsonb_array_length(payload->k) <> 1 then raise exception 'Missing section %',k; end if;
  end loop;
  if payload->'client'->>'id' is not null then raise exception 'Client ID leaked'; end if;
  if public.get_shared_project(gen_random_uuid()) is not null then raise exception 'Unknown token accepted'; end if;
  if public.get_shared_project(current_setting('test.project')::uuid) is not null then raise exception 'Old project ID link accepted'; end if;
  foreach k in array array['projects','project_tracks','project_shares'] loop
    begin
      execute format('select 1 from public.%I limit 1',k);
      raise exception 'Anonymous raw read allowed on %',k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    update public.projects set title='Unauthorized' where id=current_setting('test.project')::uuid;
    raise exception 'Anonymous update allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.project_shares(project_id) values(current_setting('test.project')::uuid);
    raise exception 'Anonymous share creation allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$
begin
  if exists(select 1 from public.project_shares) then raise exception 'Client can list share tokens'; end if;
  begin
    insert into public.project_shares(project_id) values(current_setting('test.project')::uuid);
    raise exception 'Client can create share tokens';
  exception when insufficient_privilege then null;
  end;
  if public.get_shared_project(current_setting('test.minimal')::uuid) is null then raise exception 'Signed-in bearer read failed'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$
declare new_token uuid;
begin
  insert into public.project_shares(project_id,sections) values(current_setting('test.project')::uuid,'{}') returning token into new_token;
  if public.get_shared_project(new_token) <> '{"title":"Sharing test"}'::jsonb then raise exception 'Title-only link failed'; end if;
  update public.projects set title='Edited by admin' where id=current_setting('test.project')::uuid;
  if public.get_shared_project(new_token)->>'title' <> 'Edited by admin' then raise exception 'Authenticated editing or live refresh failed'; end if;
  delete from public.project_shares where token=current_setting('test.minimal')::uuid;
  begin
    insert into public.project_shares(project_id,sections) values(current_setting('test.project')::uuid,array['invalid']);
    raise exception 'Unknown section accepted';
  exception when check_violation then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  if public.get_shared_project(current_setting('test.minimal')::uuid) is not null then raise exception 'Revoked token still usable'; end if;
end $$;
reset role;
rollback;
