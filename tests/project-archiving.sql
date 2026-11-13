-- All test writes are rolled back. Existing projects/shares are never updated.
begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$
declare p uuid; token uuid;
begin
  insert into public.projects(client_id,title,description,status)
    values(current_setting('test.client')::uuid,'Archive test','Keep content','valide') returning id into p;
  insert into public.project_shares(project_id,sections) values(p,array['status','description']) returning project_shares.token into token;
  perform set_config('test.project',p::text,true);
  perform set_config('test.token',token::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$
declare before_project jsonb; before_share jsonb; before_payload jsonb; current_project jsonb;
begin
  select to_jsonb(p) into before_project from public.projects p where id=current_setting('test.project')::uuid;
  select to_jsonb(s) into before_share from public.project_shares s where token=current_setting('test.token')::uuid;
  before_payload := public.get_shared_project(current_setting('test.token')::uuid);
  update public.projects set archived_at=now() where id=current_setting('test.project')::uuid;
  select to_jsonb(p) into current_project from public.projects p where id=current_setting('test.project')::uuid;
  if current_project->>'archived_at' is null then raise exception 'Archiving failed'; end if;
  if (current_project - 'archived_at') is distinct from (before_project - 'archived_at') then raise exception 'Archive altered project content'; end if;
  if public.get_shared_project(current_setting('test.token')::uuid) is distinct from before_payload then raise exception 'Archive changed public payload'; end if;
  if not exists(select 1 from public.project_shares s where token=current_setting('test.token')::uuid and to_jsonb(s)=before_share) then raise exception 'Archive changed share'; end if;
  update public.projects set archived_at=null where id=current_setting('test.project')::uuid;
  select to_jsonb(p) into current_project from public.projects p where id=current_setting('test.project')::uuid;
  if current_project is distinct from before_project then raise exception 'Restore failed to preserve project'; end if;
  update public.projects set status='en_cours' where id=current_setting('test.project')::uuid;
  if public.get_shared_project(current_setting('test.token')::uuid)->>'status' <> 'en_cours' then raise exception 'New status not available through existing link'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$
declare changed integer;
begin
  update public.projects set archived_at=now() where id=current_setting('test.project')::uuid;
  get diagnostics changed=row_count;
  if changed <> 0 then raise exception 'Client can archive project'; end if;
  if not public.can_edit_project(current_setting('test.project')::uuid) then raise exception 'In-progress client editing regressed'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if public.get_shared_project(current_setting('test.token')::uuid)->>'description' <> 'Keep content' then raise exception 'Anonymous existing link failed'; end if;
end $$;
reset role;
rollback;
