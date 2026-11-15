-- Team membership extends operational access only. Existing finance helpers stay unchanged.
create table public.project_members(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,access_role text not null check(access_role in ('viewer','editor')),
 created_at timestamptz not null default now(),unique(project_id,user_id));
create index project_members_user_idx on public.project_members(user_id,project_id);
alter table public.project_members enable row level security;
revoke all on public.project_members from public,anon,authenticated;
grant select,insert,update,delete on public.project_members to authenticated;
create policy "Member read own" on public.project_members for select to authenticated using(public.is_admin() or user_id=auth.uid());
create policy "Admin manage members" on public.project_members for all to authenticated using(public.is_admin()) with check(public.is_admin());
create function public.check_project_member() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if not exists(select 1 from public.profiles where id=new.user_id and role='dj') then raise exception 'Choisissez un compte équipe.';end if;return new;end $$;
revoke all on function public.check_project_member() from public,anon,authenticated;
create trigger project_member_check before insert or update on public.project_members for each row execute function public.check_project_member();
create function public.is_project_team(pid uuid,needs_edit boolean default false) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.project_members m where m.project_id=pid and m.user_id=auth.uid() and (not needs_edit or m.access_role='editor'));
$$;
create function public.can_access_project_operations(pid uuid) returns boolean language sql stable security invoker set search_path='' as $$select public.can_view_project(pid) or public.is_project_team(pid,false);$$;
create function public.can_manage_project_operations(pid uuid) returns boolean language sql stable security invoker set search_path='' as $$select public.can_edit_project(pid) or (public.is_project_team(pid,true) and exists(select 1 from public.projects where id=pid and status<>'termine'));$$;
revoke all on function public.is_project_team(uuid,boolean),public.can_access_project_operations(uuid),public.can_manage_project_operations(uuid) from public,anon;
grant execute on function public.is_project_team(uuid,boolean),public.can_access_project_operations(uuid),public.can_manage_project_operations(uuid) to authenticated;
create policy "Team see assigned projects" on public.projects for select to authenticated using(public.is_project_team(id,false));
do $$declare t text;begin
 foreach t in array array['project_guests','project_tracks','schedule_items','project_tasks','project_contacts'] loop
 execute format('create policy "Team operations read" on public.%I for select to authenticated using(public.is_project_team(project_id,false))',t);
 execute format('create policy "Team operations add" on public.%I for insert to authenticated with check(public.is_project_team(project_id,true) and public.can_manage_project_operations(project_id))',t);
 execute format('create policy "Team operations update" on public.%I for update to authenticated using(public.is_project_team(project_id,true) and public.can_manage_project_operations(project_id)) with check(public.is_project_team(project_id,true) and public.can_manage_project_operations(project_id))',t);
 execute format('create policy "Team operations remove" on public.%I for delete to authenticated using(public.is_project_team(project_id,true) and public.can_manage_project_operations(project_id))',t);
 end loop;
end $$;
create policy "Team selected material read" on public.equipment_reservations for select to authenticated using(public.is_project_team(project_id,false));
create policy "Team selected inventory read" on public.equipment for select to authenticated using(exists(select 1 from public.equipment_reservations r where r.equipment_id=equipment.id and public.is_project_team(r.project_id,false)));
alter table public.project_documents add column team_visible boolean not null default false;
create policy "Team shared documents read" on public.project_documents for select to authenticated using(team_visible and public.is_project_team(project_id,false));
-- These two existing invoker RPCs must honor an editor's operational membership.
do $$declare f record;begin
 for f in select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('save_guest_sheet','set_conductor_step') loop
 execute replace(f.definition,'public.can_edit_project(', 'public.can_manage_project_operations(');
 end loop;
end $$;
create table public.project_costs(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 label text not null check(length(trim(label)) between 1 and 200),category text not null check(category in ('travel','staff','equipment','purchase','other')),
 amount numeric(12,2) not null check(amount>=0),notes text not null default '' check(length(notes)<=2000),created_at timestamptz not null default now());
create index project_costs_project_idx on public.project_costs(project_id);
create table public.project_profit_settings(project_id uuid primary key references public.projects(id) on delete cascade,hourly_cost numeric(10,2) not null default 0 check(hourly_cost>=0),created_at timestamptz not null default now());
alter table public.project_costs enable row level security;alter table public.project_profit_settings enable row level security;
revoke all on public.project_costs,public.project_profit_settings from public,anon,authenticated;
grant select,insert,update,delete on public.project_costs,public.project_profit_settings to authenticated;
create policy "Admin costs" on public.project_costs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "Admin cost settings" on public.project_profit_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());
create schema production_private;
revoke all on schema production_private from public;grant usage on schema production_private to anon,authenticated;
create table public.project_playlists(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 200),url text not null check(url ~ '^https://open[.]spotify[.]com/playlist/[A-Za-z0-9]{22}$'),created_at timestamptz not null default now());
create index project_playlists_project_idx on public.project_playlists(project_id);
alter table public.project_playlists enable row level security;revoke all on public.project_playlists from public,anon,authenticated;grant select,insert,update,delete on public.project_playlists to authenticated;
create policy "Playlist read" on public.project_playlists for select to authenticated using(public.can_access_project_operations(project_id));
create policy "Playlist add" on public.project_playlists for insert to authenticated with check(public.can_manage_project_operations(project_id));
create policy "Playlist edit" on public.project_playlists for update to authenticated using(public.can_manage_project_operations(project_id)) with check(public.can_manage_project_operations(project_id));
create policy "Playlist remove" on public.project_playlists for delete to authenticated using(public.can_manage_project_operations(project_id));
create function public.import_project_music(pid uuid,entries jsonb,track_kind text) returns integer language plpgsql security invoker set search_path='' as $$
declare n integer;begin
 if not public.can_manage_project_operations(pid) then raise exception 'Accès refusé' using errcode='42501';end if;
 if track_kind not in ('must_play','do_not_play') or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>2000 then raise exception 'Import invalide';end if;
 if exists(select 1 from jsonb_array_elements(entries) e where length(trim(coalesce(e->>'title',''))) not between 1 and 300 or length(coalesce(e->>'artist',''))>300 or (coalesce(e->>'url','')<>'' and (e->>'url')!~'^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$')) then raise exception 'Titre, artiste ou lien invalide';end if;
 perform pg_advisory_xact_lock(hashtextextended('music-import:'||pid::text,0));
 insert into public.project_tracks(project_id,kind,title,artist,url)
 select pid,track_kind::public.track_kind,min(trim(e->>'title')),min(trim(coalesce(e->>'artist',''))),nullif(min(coalesce(e->>'url','')),'') from jsonb_array_elements(entries) e
 where not exists(select 1 from public.project_tracks t where t.project_id=pid and t.kind::text=track_kind and lower(trim(t.title))=lower(trim(e->>'title')) and lower(trim(coalesce(t.artist,'')))=lower(trim(coalesce(e->>'artist',''))))
 group by lower(trim(e->>'title')),lower(trim(coalesce(e->>'artist','')));
 get diagnostics n=row_count;return n;
end $$;
revoke all on function public.import_project_music(uuid,jsonb,text) from public,anon;grant execute on function public.import_project_music(uuid,jsonb,text) to authenticated;
