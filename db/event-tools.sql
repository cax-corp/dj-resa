-- Add event tools without changing any existing project, share or child record.
create temporary table event_tools_preservation (table_name text primary key, digest text) on commit drop;
do $$ declare t text; d text; begin
  foreach t in array array['projects','project_shares','project_tasks','schedule_items','project_tracks','project_updates','project_payments','invoices','profiles','settings','rate_plans'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
    insert into event_tools_preservation values(t,d);
  end loop;
end $$;

alter table public.project_tasks
  add column due_date date,
  add column priority text not null default 'normal' check(priority in ('low','normal','urgent')),
  add column assignee text not null default '' check(length(assignee)<=150),
  add column progress_state text not null default 'todo' check(progress_state in ('todo','doing','done'));
alter table public.schedule_items
  add column speaker text not null default '' check(length(speaker)<=200),
  add column song text not null default '' check(length(song)<=300),
  add column cue text not null default '' check(length(cue)<=2000),
  add column run_state text not null default 'pending' check(run_state in ('pending','current','done'));
create unique index schedule_one_current_per_project on public.schedule_items(project_id) where run_state='current';

create table public.project_guests (id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 1 and 200), email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=50), companions integer not null default 0 check(companions between 0 and 20),
 response text not null default 'pending' check(response in ('pending','confirmed','declined')),
 dietary text not null default '' check(length(dietary)<=1000), table_name text not null default '' check(length(table_name)<=100),
 notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now());
alter table public.project_guests enable row level security;
revoke all on public.project_guests from public, anon, authenticated;
grant select, insert, update, delete on public.project_guests to authenticated;
create policy "project_guests read" on public.project_guests for select to authenticated using(public.can_view_project(project_id));
create policy "project_guests add" on public.project_guests for insert to authenticated with check(public.can_edit_project(project_id));
create policy "project_guests edit" on public.project_guests for update to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id));
create policy "project_guests remove" on public.project_guests for delete to authenticated using(public.can_edit_project(project_id));
create index project_guests_project_idx on public.project_guests(project_id);

create table public.project_contacts (id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 full_name text not null check(length(trim(full_name)) between 1 and 200), role text not null default '' check(length(role)<=150),
 company text not null default '' check(length(company)<=200), email text not null default '' check(length(email)<=254),
 phone text not null default '' check(length(phone)<=50), notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now());
alter table public.project_contacts enable row level security;
revoke all on public.project_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.project_contacts to authenticated;
create policy "project_contacts read" on public.project_contacts for select to authenticated using(public.can_view_project(project_id));
create policy "project_contacts add" on public.project_contacts for insert to authenticated with check(public.can_edit_project(project_id));
create policy "project_contacts edit" on public.project_contacts for update to authenticated using(public.can_edit_project(project_id)) with check(public.can_edit_project(project_id));
create policy "project_contacts remove" on public.project_contacts for delete to authenticated using(public.can_edit_project(project_id));
create index project_contacts_project_idx on public.project_contacts(project_id);

create table public.equipment (id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 200), category text not null default '' check(length(category)<=100),
 units integer not null default 1 check(units between 1 and 10000), reference text not null default '' check(length(reference)<=200),
 notes text not null default '' check(length(notes)<=2000), active boolean not null default true,
 created_at timestamptz not null default now());
alter table public.equipment enable row level security;
revoke all on public.equipment from public, anon, authenticated;
grant select, insert, update, delete on public.equipment to authenticated;
create policy "equipment admin" on public.equipment for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));

create table public.equipment_reservations (id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 equipment_id uuid not null references public.equipment(id) on delete restrict,
 quantity integer not null check(quantity between 1 and 10000), starts_on date not null, ends_on date not null check(ends_on>=starts_on),
 state text not null default 'reserved' check(state in ('reserved','loaded','returned','cancelled')),
 created_at timestamptz not null default now());
alter table public.equipment_reservations enable row level security;
revoke all on public.equipment_reservations from public, anon, authenticated;
grant select, insert, update, delete on public.equipment_reservations to authenticated;
create policy "equipment_reservations admin" on public.equipment_reservations for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index equipment_reservations_project_idx on public.equipment_reservations(project_id);

create table public.venues (id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 200), address text not null default '' check(length(address)<=500),
 contact_name text not null default '' check(length(contact_name)<=200), phone text not null default '' check(length(phone)<=50),
 access_notes text not null default '' check(length(access_notes)<=2000), power_notes text not null default '' check(length(power_notes)<=2000),
 sound_notes text not null default '' check(length(sound_notes)<=2000), notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now());
alter table public.venues enable row level security;
revoke all on public.venues from public, anon, authenticated;
grant select, insert, update, delete on public.venues to authenticated;
create policy "venues admin" on public.venues for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));

create table public.project_venues (id uuid primary key default gen_random_uuid(),
 project_id uuid not null unique references public.projects(id) on delete cascade,
 venue_id uuid not null references public.venues(id) on delete restrict,
 created_at timestamptz not null default now());
alter table public.project_venues enable row level security;
revoke all on public.project_venues from public, anon, authenticated;
grant select, insert, update, delete on public.project_venues to authenticated;
create policy "project_venues admin" on public.project_venues for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index project_venues_project_idx on public.project_venues(project_id);

create table public.calendar_blocks (id uuid primary key default gen_random_uuid(),
 label text not null check(length(trim(label)) between 1 and 200), starts_on date not null,
 ends_on date not null check(ends_on>=starts_on),
 created_at timestamptz not null default now());
alter table public.calendar_blocks enable row level security;
revoke all on public.calendar_blocks from public, anon, authenticated;
grant select, insert, update, delete on public.calendar_blocks to authenticated;
create policy "calendar_blocks admin" on public.calendar_blocks for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));

create table public.project_debriefs (id uuid primary key default gen_random_uuid(),
 project_id uuid not null unique references public.projects(id) on delete cascade,
 rating integer check(rating between 1 and 5), summary text not null default '' check(length(summary)<=5000),
 incidents text not null default '' check(length(incidents)<=5000), improvements text not null default '' check(length(improvements)<=5000),
 client_feedback text not null default '' check(length(client_feedback)<=5000), updated_at timestamptz not null default now(),
 created_at timestamptz not null default now());
alter table public.project_debriefs enable row level security;
revoke all on public.project_debriefs from public, anon, authenticated;
grant select, insert, update, delete on public.project_debriefs to authenticated;
create policy "project_debriefs admin" on public.project_debriefs for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index project_debriefs_project_idx on public.project_debriefs(project_id);

create table public.project_documents (id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 250), storage_path text not null unique,
 size_bytes bigint not null check(size_bytes between 1 and 20971520), mime_type text not null,
 client_visible boolean not null default false, check(split_part(storage_path,'/',1)=project_id::text),
 created_at timestamptz not null default now());
alter table public.project_documents enable row level security;
revoke all on public.project_documents from public, anon, authenticated;
grant select, insert, update, delete on public.project_documents to authenticated;
create policy "project_documents admin" on public.project_documents for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create policy "project_documents client read" on public.project_documents for select to authenticated using(client_visible and public.can_view_project(project_id));
create index project_documents_project_idx on public.project_documents(project_id);

create table public.event_form_links (id uuid primary key default gen_random_uuid(),
 token uuid not null unique default gen_random_uuid(), kind text not null check(kind in ('music','inquiry')),
 project_id uuid references public.projects(id) on delete cascade,
 is_open boolean not null default true,
 check((kind='music' and project_id is not null) or (kind='inquiry' and project_id is null)),
 created_at timestamptz not null default now());
alter table public.event_form_links enable row level security;
revoke all on public.event_form_links from public, anon, authenticated;
grant select, insert, update, delete on public.event_form_links to authenticated;
create policy "event_form_links admin" on public.event_form_links for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index event_form_links_project_idx on public.event_form_links(project_id);

create table public.guest_music_requests (id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 link_token uuid references public.event_form_links(token) on delete set null,
 guest_name text not null default '' check(length(guest_name)<=100),
 title text not null check(length(trim(title)) between 1 and 200), artist text not null check(length(trim(artist)) between 1 and 200),
 note text not null default '' check(length(note)<=500),
 status text not null default 'pending' check(status in ('pending','accepted','rejected','played')),
 created_at timestamptz not null default now());
alter table public.guest_music_requests enable row level security;
revoke all on public.guest_music_requests from public, anon, authenticated;
grant select, insert, update, delete on public.guest_music_requests to authenticated;
create policy "guest_music_requests admin" on public.guest_music_requests for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index guest_music_requests_project_idx on public.guest_music_requests(project_id);

create table public.booking_inquiries (id uuid primary key default gen_random_uuid(),
 link_token uuid references public.event_form_links(token) on delete set null,
 full_name text not null check(length(trim(full_name)) between 1 and 200), email text not null check(length(email)<=254),
 phone text not null default '' check(length(phone)<=50), event_date date, location text not null default '' check(length(location)<=500),
 message text not null default '' check(length(message)<=5000), budget numeric check(budget>=0), follow_up date,
 status text not null default 'new' check(status in ('new','contacted','quote','won','lost')),
 project_id uuid references public.projects(id) on delete set null,
 created_at timestamptz not null default now());
alter table public.booking_inquiries enable row level security;
revoke all on public.booking_inquiries from public, anon, authenticated;
grant select, insert, update, delete on public.booking_inquiries to authenticated;
create policy "booking_inquiries admin" on public.booking_inquiries for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));
create index booking_inquiries_project_idx on public.booking_inquiries(project_id);

create index music_requests_link_time_idx on public.guest_music_requests(link_token,created_at);
create index inquiries_link_time_idx on public.booking_inquiries(link_token,created_at);
create index equipment_reservations_equipment_dates_idx on public.equipment_reservations(equipment_id,starts_on,ends_on);
create index project_tasks_due_idx on public.project_tasks(due_date) where done=false;

-- Inventory locks serialize reservations and stock changes. Check peak occupancy
-- over each reservation start date, rather than adding disjoint reservations.
create function public.check_equipment_availability() returns trigger
language plpgsql security invoker set search_path='' as $$
declare available integer; peak integer;
begin
  if tg_table_name='equipment' then
    if new.units=old.units and new.active=old.active then return new; end if;
    select coalesce(max((select coalesce(sum(b.quantity),0) from public.equipment_reservations b
      where b.equipment_id=new.id and b.state in ('reserved','loaded') and b.starts_on<=a.starts_on and b.ends_on>=a.starts_on)),0)
    into peak from public.equipment_reservations a where a.equipment_id=new.id and a.state in ('reserved','loaded');
    if new.units<peak or (not new.active and peak>0) then raise exception 'Matériel déjà réservé : stock insuffisant pour les réservations existantes'; end if;
  else
    if tg_op='UPDATE' and new.equipment_id<>old.equipment_id then raise exception 'Pour changer de matériel, annulez cette réservation puis créez-en une autre'; end if;
    select units into available from public.equipment where id=new.equipment_id and active for update;
    if available is null then raise exception 'Matériel indisponible'; end if;
    if new.state not in ('reserved','loaded') then return new; end if;
    select coalesce(max(stock_usage.total),0) into peak from (
      select (select coalesce(sum(b.quantity),0) from public.equipment_reservations b
        where b.equipment_id=new.equipment_id and b.id<>new.id and b.state in ('reserved','loaded')
        and b.starts_on<=d.slot_date and b.ends_on>=d.slot_date) total
      from (select new.starts_on as slot_date union select a.starts_on from public.equipment_reservations a
        where a.equipment_id=new.equipment_id and a.id<>new.id and a.state in ('reserved','loaded')
        and a.starts_on between new.starts_on and new.ends_on) d
    ) stock_usage;
    if new.quantity+peak>available then raise exception 'Stock insuffisant sur cette période (déjà réservé sur un autre événement)'; end if;
  end if;
  return new;
end $$;
revoke all on function public.check_equipment_availability() from public,anon,authenticated;
create trigger equipment_stock_guard before update on public.equipment for each row execute function public.check_equipment_availability();
create trigger equipment_reservation_guard before insert or update on public.equipment_reservations for each row execute function public.check_equipment_availability();

create function public.set_conductor_step(step_id uuid, next_state text) returns void
language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
  select project_id into pid from public.schedule_items where id=step_id;
  if auth.uid() is null or not coalesce(public.can_edit_project(pid),false) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if next_state not in ('pending','current','done') then raise exception 'État invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended(pid::text,0));
  if next_state='current' then update public.schedule_items set run_state='pending' where project_id=pid and run_state='current'; end if;
  update public.schedule_items set run_state=next_state where id=step_id;
end $$;
revoke all on function public.set_conductor_step(uuid,text) from public,anon;
grant execute on function public.set_conductor_step(uuid,text) to authenticated;

create function public.convert_booking_inquiry(inquiry_id uuid, target_client uuid, project_title text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare lead public.booking_inquiries%rowtype; pid uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501'; end if;
  select * into lead from public.booking_inquiries where id=inquiry_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if lead.project_id is not null then return lead.project_id; end if;
  if length(trim(project_title)) not between 1 and 200 then raise exception 'Nom de projet invalide'; end if;
  if not exists(select 1 from public.profiles where id=target_client and role='client') then raise exception 'Client invalide'; end if;
  insert into public.projects(client_id,title,event_date,location,description)
    values(target_client,trim(project_title),lead.event_date,nullif(lead.location,''),lead.message) returning id into pid;
  update public.booking_inquiries set project_id=pid,status='won' where id=inquiry_id;
  return pid;
end $$;
revoke all on function public.convert_booking_inquiry(uuid,uuid,text) from public,anon;
grant execute on function public.convert_booking_inquiry(uuid,uuid,text) to authenticated;

-- Dedicated anonymous forms never expose guest lists, other requests or documents.
create schema event_tools_private;
revoke all on schema event_tools_private from public;
grant usage on schema event_tools_private to anon,authenticated;
create function event_tools_private.read_form(form_token uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('kind',f.kind,'is_open',f.is_open,'title',case when f.kind='music' then p.title else 'Demande de prestation DJ' end)
  from public.event_form_links f left join public.projects p on p.id=f.project_id where f.token=form_token;
$$;
revoke all on function event_tools_private.read_form(uuid) from public;
grant execute on function event_tools_private.read_form(uuid) to anon,authenticated;
create function public.get_event_form(form_token uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select event_tools_private.read_form(form_token);$$;
revoke all on function public.get_event_form(uuid) from public;
grant execute on function public.get_event_form(uuid) to anon,authenticated;

create function event_tools_private.submit_form(form_token uuid, fields jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.event_form_links%rowtype; total bigint; recent bigint; submitted uuid;
begin
  if fields is null or jsonb_typeof(fields)<>'object' or octet_length(fields::text)>12000 then raise exception 'Formulaire invalide'; end if;
  select * into f from public.event_form_links where token=form_token for update;
  if not found or not f.is_open then raise exception 'Ce formulaire est fermé ou indisponible'; end if;
  if f.kind='music' then
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent
      from public.guest_music_requests where link_token=form_token;
    if total>=500 or recent>=20 then raise exception 'Trop de demandes, réessayez plus tard'; end if;
    insert into public.guest_music_requests(project_id,link_token,guest_name,title,artist,note)
      values(f.project_id,form_token,trim(coalesce(fields->>'guest_name','')),trim(coalesce(fields->>'title','')),
        trim(coalesce(fields->>'artist','')),trim(coalesce(fields->>'note',''))) returning id into submitted;
  else
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent
      from public.booking_inquiries where link_token=form_token;
    if total>=1000 or recent>=10 then raise exception 'Trop de demandes, réessayez plus tard'; end if;
    if strpos(coalesce(fields->>'email',''),'@')<2 then raise exception 'Adresse email invalide'; end if;
    insert into public.booking_inquiries(link_token,full_name,email,phone,event_date,location,message)
      values(form_token,trim(coalesce(fields->>'full_name','')),trim(fields->>'email'),trim(coalesce(fields->>'phone','')),
        nullif(fields->>'event_date','')::date,trim(coalesce(fields->>'location','')),trim(coalesce(fields->>'message',''))) returning id into submitted;
  end if;
  return submitted;
end $$;
revoke all on function event_tools_private.submit_form(uuid,jsonb) from public;
grant execute on function event_tools_private.submit_form(uuid,jsonb) to anon,authenticated;
create function public.submit_event_form(form_token uuid, fields jsonb) returns uuid
language sql security invoker set search_path='' as $$select event_tools_private.submit_form(form_token,fields);$$;
revoke all on function public.submit_event_form(uuid,jsonb) from public;
grant execute on function public.submit_event_form(uuid,jsonb) to anon,authenticated;

-- Uploads are private by default. Only explicitly client-visible metadata/files
-- are readable by the assigned client. Signed links are issued by Storage, not SQL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-documents','project-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy "Event documents read" on storage.objects for select to authenticated using(
 bucket_id='project-documents' and exists(select 1 from public.project_documents d
   where d.storage_path=storage.objects.name
   and ((select public.is_admin()) or (d.client_visible and public.can_view_project(d.project_id)))));
create policy "Event documents upload" on storage.objects for insert to authenticated with check(bucket_id='project-documents' and (select public.is_admin())
 and exists(select 1 from public.projects p where p.id::text=split_part(storage.objects.name,'/',1)));
create policy "Event documents remove" on storage.objects for delete to authenticated using(bucket_id='project-documents' and (select public.is_admin()));

-- No existing rows or sharing outputs may change in this migration.
do $$ declare r record; d text; omitted text[]; begin
  for r in select * from event_tools_preservation loop
    omitted:=case r.table_name when 'project_tasks' then array['due_date','priority','assignee','progress_state']
      when 'schedule_items' then array['speaker','song','cue','run_state'] else array[]::text[] end;
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(x)-$1 order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',r.table_name) into d using omitted;
    if d is distinct from r.digest then raise exception 'Existing data changed: %; rollback required',r.table_name; end if;
  end loop;
end $$;
