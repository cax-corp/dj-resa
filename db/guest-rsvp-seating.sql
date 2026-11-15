create table public.guest_rsvp_links(id uuid primary key default gen_random_uuid(),token uuid not null unique default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,guest_id uuid not null unique references public.project_guests(id) on delete cascade,max_companions integer not null default 0 check(max_companions between 0 and 20),is_open boolean not null default true,expires_at timestamptz,window_start timestamptz not null default now(),window_count integer not null default 0,created_at timestamptz not null default now());
create index guest_rsvp_project_idx on public.guest_rsvp_links(project_id);
alter table public.guest_rsvp_links enable row level security;revoke all on public.guest_rsvp_links from public,anon,authenticated;grant select,insert,update on public.guest_rsvp_links to authenticated;
create policy "RSVP links owner read" on public.guest_rsvp_links for select to authenticated using(public.can_view_project(project_id));
create policy "RSVP links owner create" on public.guest_rsvp_links for insert to authenticated with check(public.can_edit_project(project_id));
create policy "RSVP links owner update" on public.guest_rsvp_links for update to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id));
create function public.check_rsvp_guest_scope() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if not exists(select 1 from public.project_guests where id=new.guest_id and project_id=new.project_id) then raise exception 'Invité hors projet';end if;
 if tg_op='UPDATE' and (new.project_id<>old.project_id or new.guest_id<>old.guest_id) then raise exception 'Le destinataire du lien ne peut pas changer';end if;return new;end $$;
revoke all on function public.check_rsvp_guest_scope() from public,anon,authenticated;
create trigger rsvp_guest_scope before insert or update on public.guest_rsvp_links for each row execute function public.check_rsvp_guest_scope();
create function public.create_guest_rsvp_links(pid uuid) returns integer language plpgsql security invoker set search_path='' as $$declare n integer;begin
 if not public.can_edit_project(pid) then raise exception 'Accès refusé' using errcode='42501';end if;
 insert into public.guest_rsvp_links(project_id,guest_id,max_companions) select pid,id,companions from public.project_guests where project_id=pid on conflict(guest_id) do nothing;
 get diagnostics n=row_count;return n;end $$;
revoke all on function public.create_guest_rsvp_links(uuid) from public,anon;grant execute on function public.create_guest_rsvp_links(uuid) to authenticated;
create function production_private.read_guest_rsvp(link_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',p.title,'event_date',p.event_date,'guest_name',g.full_name,'response',g.response,'companions',g.companions,'max_companions',l.max_companions,'dietary',g.dietary)
 from public.guest_rsvp_links l join public.projects p on p.id=l.project_id join public.project_guests g on g.id=l.guest_id and g.project_id=l.project_id where l.token=link_token and l.is_open and (l.expires_at is null or l.expires_at>now());$$;
create function production_private.submit_guest_rsvp(link_token uuid,fields jsonb) returns void language plpgsql security definer set search_path='' as $$declare l public.guest_rsvp_links%rowtype;c integer;begin
 if jsonb_typeof(fields)<>'object' or octet_length(fields::text)>4000 or fields->>'response' not in ('confirmed','declined') or coalesce(fields->>'companions','')!~'^[0-9]{1,2}$' or length(coalesce(fields->>'dietary',''))>1000 then raise exception 'Réponse invalide';end if;
 select * into l from public.guest_rsvp_links where token=link_token for update;
 if not found or not l.is_open or (l.expires_at is not null and l.expires_at<=now()) then raise exception 'Ce lien est fermé ou indisponible';end if;
 c:=(fields->>'companions')::integer;if c>l.max_companions then raise exception 'Le nombre d’accompagnants dépasse celui prévu dans l’invitation';end if;
 if l.window_start<now()-interval '1 minute' then l.window_start:=now();l.window_count:=0;end if;
 if l.window_count>=20 then raise exception 'Trop de réponses. Réessayez dans une minute.';end if;
 update public.project_guests set response=fields->>'response',companions=case when fields->>'response'='declined' then 0 else c end,dietary=trim(coalesce(fields->>'dietary','')) where id=l.guest_id and project_id=l.project_id;
 update public.guest_rsvp_links set window_start=l.window_start,window_count=l.window_count+1 where id=l.id;
end $$;
revoke all on function production_private.read_guest_rsvp(uuid),production_private.submit_guest_rsvp(uuid,jsonb) from public;
grant execute on function production_private.read_guest_rsvp(uuid),production_private.submit_guest_rsvp(uuid,jsonb) to anon,authenticated;
create function public.get_guest_rsvp(link_token uuid) returns jsonb language sql stable security invoker set search_path='' as $$select production_private.read_guest_rsvp(link_token);$$;
create function public.submit_guest_rsvp(link_token uuid,fields jsonb) returns void language sql security invoker set search_path='' as $$select production_private.submit_guest_rsvp(link_token,fields);$$;
revoke all on function public.get_guest_rsvp(uuid),public.submit_guest_rsvp(uuid,jsonb) from public;grant execute on function public.get_guest_rsvp(uuid),public.submit_guest_rsvp(uuid,jsonb) to anon,authenticated;
create table public.project_seating(project_id uuid primary key references public.projects(id) on delete cascade,layout jsonb not null default '{"tables":[],"assignments":{}}',revision integer not null default 1,created_at timestamptz not null default now());
alter table public.project_seating enable row level security;revoke all on public.project_seating from public,anon,authenticated;grant select on public.project_seating to authenticated;
create policy "Seating operations read" on public.project_seating for select to authenticated using(public.can_access_project_operations(project_id));
create function production_private.save_seating(pid uuid,board jsonb,expected_revision integer) returns integer language plpgsql security definer set search_path='' as $$
declare previous public.project_seating%rowtype; table_item jsonb; assignment_row record; n integer;begin
 if not public.can_manage_project_operations(pid) then raise exception 'Accès refusé' using errcode='42501';end if;
 if jsonb_typeof(board)<>'object' or octet_length(board::text)>300000 or jsonb_typeof(board->'tables')<>'array' or jsonb_array_length(board->'tables')>100 or jsonb_typeof(board->'assignments')<>'object' then raise exception 'Plan invalide';end if;
 for table_item in select value from jsonb_array_elements(board->'tables') loop
  if coalesce(table_item->>'id','')!~'^[0-9a-f-]{36}$' or length(trim(coalesce(table_item->>'name',''))) not between 1 and 100 or coalesce(table_item->>'seats','')!~'^[0-9]{1,2}$' or (table_item->>'seats')::integer not between 1 and 50 or coalesce(table_item->>'x','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(table_item->>'y','')!~'^[0-9]+([.][0-9]+)?$' or (table_item->>'x')::numeric not between 0 and 100 or (table_item->>'y')::numeric not between 0 and 100 or table_item->>'shape' not in ('round','rectangle') then raise exception 'Table invalide';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(board->'tables') t group by t->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'tables') t group by lower(trim(t->>'name')) having count(*)>1) then raise exception 'Identifiants ou noms de tables en double';end if;
 for assignment_row in select key,value#>>'{}' as table_id from jsonb_each(board->'assignments') loop
  if not exists(select 1 from public.project_guests where id::text=assignment_row.key and project_id=pid) or not exists(select 1 from jsonb_array_elements(board->'tables') t where t->>'id'=assignment_row.table_id) then raise exception 'Invité ou table hors projet';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('seating:'||pid::text,0));
 select * into previous from public.project_seating where project_id=pid for update;
 if coalesce(previous.revision,0)<>expected_revision then raise exception 'Le plan a changé ailleurs. Rechargez-le.';end if;
 -- Clear only assignments that belonged to the previously saved visual plan.
 update public.project_guests g set table_name='' where g.project_id=pid and previous.layout->'assignments' ? g.id::text and not(board->'assignments' ? g.id::text);
 update public.project_guests g set table_name=t.item->>'name' from jsonb_each_text(board->'assignments') a join lateral(select item from jsonb_array_elements(board->'tables') item where item->>'id'=a.value)t on true where g.project_id=pid and g.id::text=a.key;
 n:=coalesce(previous.revision,0)+1;
 insert into public.project_seating(project_id,layout,revision) values(pid,board,n) on conflict(project_id) do update set layout=excluded.layout,revision=excluded.revision;
 return n;
end $$;
revoke all on function production_private.save_seating(uuid,jsonb,integer) from public,anon;grant execute on function production_private.save_seating(uuid,jsonb,integer) to authenticated;
create function public.save_project_seating(pid uuid,board jsonb,expected_revision integer) returns integer language sql security invoker set search_path='' as $$select production_private.save_seating(pid,board,expected_revision);$$;
revoke all on function public.save_project_seating(uuid,jsonb,integer) from public,anon;grant execute on function public.save_project_seating(uuid,jsonb,integer) to authenticated;
