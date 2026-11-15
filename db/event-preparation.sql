-- Dedicated briefs are private to the project's existing authorized users.
-- Existing project, share, task and schedule records are not changed.
create function public.event_brief_is_valid(kind text, details jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare keys text[]; item record; begin
 if details is null or jsonb_typeof(details)<>'object' or octet_length(details::text)>20000 then return false;end if;
 keys:=case kind
 when 'mariage' then array['couple_names','coordination_contact','ceremony_time','ceremony_notes','cocktail_time','entrance','first_dance','speeches']
 when 'anniversaire' then array['celebrant','milestone','coordinator','guests_profile','cake_time','cake_song','activities','music_preferences']
 when 'entreprise' then array['company','coordinator','objectives','speakers','av_needs','brand_style','timing_constraints','protocol']
 when 'association' then array['association_name','coordinator','purpose','volunteers','activities','access_needs','sound_constraints']
 when 'soiree_privee' then array['occasion','host','mood','guests_profile','key_moments','venue_rules']
 when 'autre' then array['purpose','coordinator','participants','expectations','constraints'] else null end;
 if keys is null then return false;end if;
 for item in select key,value from jsonb_each(details) loop
  if not(item.key=any(keys)) or jsonb_typeof(item.value)<>'string' or length(item.value#>>'{}')>1500 then return false;end if;
  if item.key in ('ceremony_time','cocktail_time','cake_time') and item.value#>>'{}'<>'' and (item.value#>>'{}')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function public.event_brief_is_valid(text,jsonb) from public,anon;
grant execute on function public.event_brief_is_valid(text,jsonb) to authenticated;
create table public.project_event_briefs(
 project_id uuid not null references public.projects(id) on delete cascade,
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 revision integer not null default 1 check(revision>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 primary key(project_id,event_type),
 check(public.event_brief_is_valid(event_type,details))
);
alter table public.project_event_briefs enable row level security;
revoke all on public.project_event_briefs from public,anon,authenticated;
grant select,insert,update on public.project_event_briefs to authenticated;
create policy "Event brief read" on public.project_event_briefs for select to authenticated using(public.can_view_project(project_id));
create policy "Event brief create" on public.project_event_briefs for insert to authenticated with check(public.can_edit_project(project_id));
create policy "Event brief edit" on public.project_event_briefs for update to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id));
create function public.prepare_event_brief_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.can_edit_project(new.project_id) then raise exception 'Accès refusé' using errcode='42501';end if;
 if not exists(select 1 from public.projects p where p.id=new.project_id and p.event_type=new.event_type) then raise exception 'Le type de ce projet a changé. Rechargez la page.';end if;
 if tg_op='UPDATE' then
  if new.project_id<>old.project_id or new.event_type<>old.event_type then raise exception 'La fiche ne peut pas changer de projet ou de type.';end if;
  new.revision:=old.revision+1;new.created_at:=old.created_at;
 else new.revision:=1;new.created_at:=now();end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
revoke all on function public.prepare_event_brief_write() from public,anon,authenticated;
create trigger event_brief_write before insert or update on public.project_event_briefs for each row execute function public.prepare_event_brief_write();
create function public.add_event_preparation_tasks(target_project uuid, target_type text, task_labels text[]) returns integer
language plpgsql security invoker set search_path='' as $$
declare added integer;begin
 if not public.can_edit_project(target_project) then raise exception 'Accès refusé' using errcode='42501';end if;
 if not exists(select 1 from public.projects where id=target_project and event_type=target_type) then raise exception 'Le type du projet a changé. Rechargez la page.';end if;
 if task_labels is null or cardinality(task_labels)>20 or exists(select 1 from unnest(task_labels) x where x is null or length(trim(x)) not between 1 and 200) then raise exception 'Tâches invalides';end if;
 perform pg_advisory_xact_lock(hashtextextended('event-preparation:'||target_project::text,0));
 insert into public.project_tasks(project_id,label)
 select target_project,min(trim(candidate)) from unnest(task_labels) candidate
 where not exists(select 1 from public.project_tasks t where t.project_id=target_project and lower(trim(t.label))=lower(trim(candidate)))
 group by lower(trim(candidate));
 get diagnostics added=row_count;return added;
end $$;
revoke all on function public.add_event_preparation_tasks(uuid,text,text[]) from public,anon;
grant execute on function public.add_event_preparation_tasks(uuid,text,text[]) to authenticated;
