-- Definitions and additive structures; preserve existing project/share/client data.
create temporary table workflow_preserve(table_name text primary key,digest text) on commit drop;
do $$ declare t text; d text; begin
 foreach t in array array['projects','project_shares','profiles','venues','project_venues','guest_music_requests','event_form_links'] loop
 execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
 insert into workflow_preserve values(t,d);
 end loop;
end $$;
create temporary table workflow_tracks_before on commit drop as select id,to_jsonb(t) payload from public.project_tracks t;

alter table public.project_tracks add column guest_request_id uuid unique references public.guest_music_requests(id) on delete set null;
create function public.accept_guest_music_track() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='accepted' then
   perform 1 from public.projects where id=new.project_id for update;
   if not exists(select 1 from public.project_tracks where project_id=new.project_id and kind='must_play'
       and lower(trim(title))=lower(trim(new.title)) and lower(trim(artist))=lower(trim(new.artist))) then
     insert into public.project_tracks(project_id,kind,title,artist,note,guest_request_id)
       values(new.project_id,'must_play',new.title,new.artist,null,new.id);
   end if;
 end if;
 return new;
end $$;
revoke all on function public.accept_guest_music_track() from public,anon,authenticated;
create trigger guest_music_accept after insert or update of status on public.guest_music_requests for each row execute function public.accept_guest_music_track();
-- Existing accepted suggestions receive the behavior explicitly requested, once.
update public.guest_music_requests set status=status where status='accepted';

create function public.sync_project_directory_venue() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='venues' then
   update public.projects p set location=concat_ws(', ',nullif(new.name,''),nullif(new.address,''))
     where exists(select 1 from public.project_venues pv where pv.project_id=p.id and pv.venue_id=new.id);
 elsif tg_op='DELETE' then update public.projects set location=null where id=old.project_id;
 else
   update public.projects p set location=(select concat_ws(', ',nullif(v.name,''),nullif(v.address,'')) from public.venues v where v.id=new.venue_id) where p.id=new.project_id;
 end if;
 return coalesce(new,old);
end $$;
revoke all on function public.sync_project_directory_venue() from public,anon,authenticated;
create trigger project_directory_venue_sync after insert or update or delete on public.project_venues for each row execute function public.sync_project_directory_venue();
create trigger directory_venue_sync after update of name,address on public.venues for each row execute function public.sync_project_directory_venue();

create function public.set_project_directory_venue(target_project uuid, selected_venue uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 perform 1 from public.projects where id=target_project for update;if not found then raise exception 'Projet introuvable';end if;
 if selected_venue is null then
   delete from public.project_venues where project_id=target_project;
   update public.projects set location=null where id=target_project;
 else
   if not exists(select 1 from public.venues where id=selected_venue) then raise exception 'Choisissez un lieu du répertoire';end if;
   insert into public.project_venues(project_id,venue_id) values(target_project,selected_venue)
     on conflict(project_id) do update set venue_id=excluded.venue_id;
 end if;
end $$;
revoke all on function public.set_project_directory_venue(uuid,uuid) from public,anon;
grant execute on function public.set_project_directory_venue(uuid,uuid) to authenticated;
create function public.save_catalog_project(target_project uuid, details jsonb, venue_choice text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 if length(trim(coalesce(details->>'title',''))) not between 1 and 200 then raise exception 'Nom de projet invalide';end if;
 update public.projects set title=trim(details->>'title'),event_date=nullif(details->>'event_date','')::date,
   status=details->>'status',description=nullif(trim(details->>'description'),'') where id=target_project;
 if not found then raise exception 'Projet introuvable';end if;
 if venue_choice<>'keep' then perform public.set_project_directory_venue(target_project,nullif(venue_choice,'')::uuid);end if;
end $$;
revoke all on function public.save_catalog_project(uuid,jsonb,text) from public,anon;
grant execute on function public.save_catalog_project(uuid,jsonb,text) to authenticated;
create function public.create_catalog_project(details jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 if length(trim(coalesce(details->>'title',''))) not between 1 and 200 then raise exception 'Nom de projet invalide';end if;
 if not exists(select 1 from public.profiles where id=(details->>'client_id')::uuid and role='client') then raise exception 'Client invalide';end if;
 insert into public.projects(client_id,title,event_date,description) values((details->>'client_id')::uuid,trim(details->>'title'),nullif(details->>'event_date','')::date,nullif(trim(details->>'description'),'')) returning id into pid;
 if nullif(details->>'venue_id','') is not null then perform public.set_project_directory_venue(pid,(details->>'venue_id')::uuid);end if;
 return pid;
end $$;
revoke all on function public.create_catalog_project(jsonb) from public,anon;
grant execute on function public.create_catalog_project(jsonb) to authenticated;

create or replace function public.convert_booking_inquiry(inquiry_id uuid, target_client uuid, project_title text) returns uuid
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
    values(target_client,trim(project_title),lead.event_date,null,concat_ws(E'\n',nullif(lead.message,''),case when lead.location<>'' then 'Lieu souhaité : '||lead.location end)) returning id into pid;
  update public.booking_inquiries set project_id=pid,status='won' where id=inquiry_id;
  return pid;
end $$;

-- Actual account deletion is only available to a signed-in administrator, and
-- refuses any client with projects/history. Creating this API deletes no user.
create function event_tools_private.delete_unused_client(target_client uuid) returns void language plpgsql security definer set search_path='' as $$
declare client_role text;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 select role::text into client_role from public.profiles where id=target_client for update;
 if client_role is distinct from 'client' or target_client=auth.uid() then raise exception 'Ce compte ne peut pas être supprimé';end if;
 if exists(select 1 from public.projects where client_id=target_client) or exists(select 1 from public.project_updates where author_id=target_client) then
   raise exception 'Ce client possède des projets ou un historique. Réaffectez ses projets avant de supprimer son compte.';
 end if;
 delete from auth.sessions where user_id=target_client;
 delete from auth.refresh_tokens where user_id::text=target_client::text;
 delete from auth.users where id=target_client;
end $$;
revoke all on function event_tools_private.delete_unused_client(uuid) from public,anon;
grant execute on function event_tools_private.delete_unused_client(uuid) to authenticated;
create function public.delete_unused_client(target_client uuid) returns void language sql security invoker set search_path='' as $$select event_tools_private.delete_unused_client(target_client);$$;
revoke all on function public.delete_unused_client(uuid) from public,anon;
grant execute on function public.delete_unused_client(uuid) to authenticated;

alter table public.event_form_links drop constraint event_form_links_kind_check;
alter table public.event_form_links add constraint event_form_links_kind_check check(kind in ('music','inquiry','feedback'));
alter table public.event_form_links drop constraint event_form_links_check;
alter table public.event_form_links add constraint event_form_links_check check((kind in ('music','feedback') and project_id is not null) or (kind='inquiry' and project_id is null));
create table public.event_feedback(
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id) on delete cascade,
 link_token uuid references public.event_form_links(token) on delete set null,
 rating integer not null check(rating between 1 and 5),audience text not null check(audience in ('client','guest')),
 respondent text not null default '' check(length(respondent)<=150),message text not null default '' check(length(message)<=3000),created_at timestamptz not null default now());
alter table public.event_feedback enable row level security;
revoke all on public.event_feedback from public,anon,authenticated;
grant select,delete on public.event_feedback to authenticated;
create policy "Feedback admin read" on public.event_feedback for select to authenticated using((select public.is_admin()));
create policy "Feedback admin remove" on public.event_feedback for delete to authenticated using((select public.is_admin()));
create index event_feedback_project_idx on public.event_feedback(project_id);
create index event_feedback_link_time_idx on public.event_feedback(link_token,created_at);
create or replace function event_tools_private.read_form(form_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('kind',f.kind,'is_open',f.is_open,'title',case when f.kind in ('music','feedback') then p.title else 'Demande de prestation DJ' end)
 from public.event_form_links f left join public.projects p on p.id=f.project_id where f.token=form_token;
$$;

create or replace function event_tools_private.submit_form(form_token uuid, fields jsonb) returns uuid
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
  elsif f.kind='feedback' then
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent from public.event_feedback where link_token=form_token;
    if total>=1000 or recent>=20 then raise exception 'Trop de réponses, réessayez plus tard';end if;
    insert into public.event_feedback(project_id,link_token,rating,audience,respondent,message)
      values(f.project_id,form_token,(fields->>'rating')::integer,coalesce(fields->>'audience','guest'),trim(coalesce(fields->>'respondent','')),trim(coalesce(fields->>'comment',''))) returning id into submitted;
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

do $$ declare r record; d text; begin
 for r in select * from workflow_preserve loop
 execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',r.table_name) into d;
 if d is distinct from r.digest then raise exception 'Unexpected existing-data change in %',r.table_name;end if;
 end loop;
 if exists(select 1 from workflow_tracks_before b left join public.project_tracks t on t.id=b.id where t.id is null or to_jsonb(t)-'guest_request_id' is distinct from b.payload) then raise exception 'Existing playlist changed';end if;
end $$;
