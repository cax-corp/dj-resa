-- Add a visual project marker without reclassifying old events or replacing their content.
create temporary table project_icons_before(table_name text primary key,digest text) on commit drop;
do $$declare t text;d text;begin
 foreach t in array array['projects','project_shares','project_payments','invoices'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
  insert into project_icons_before values(t,d);
 end loop;
end $$;
alter table public.projects add column icon text not null default 'grid' check(icon in ('grid','rings','heart','cake','gift','party','music','headphones','turntable','microphone','speaker','mixer','utensils','chef','glass','coffee','briefcase','presentation','people','handshake','graduation','pin','building','home','tent','sun','moon','flower','trophy','ball','camera','film'));
CREATE OR REPLACE FUNCTION public.save_catalog_project(target_project uuid, details jsonb, venue_choice text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 if length(trim(coalesce(details->>'title',''))) not between 1 and 200 then raise exception 'Nom de projet invalide';end if;
 update public.projects set title=trim(details->>'title'),event_date=nullif(details->>'event_date','')::date,
   status=details->>'status',description=nullif(trim(details->>'description'),''),
   event_type=case when details ? 'event_type' then nullif(details->>'event_type','') else event_type end,
   icon=case when details ? 'icon' then coalesce(nullif(details->>'icon',''),'grid') else icon end where id=target_project;
 if not found then raise exception 'Projet introuvable';end if;
 if venue_choice<>'keep' then perform public.set_project_directory_venue(target_project,nullif(venue_choice,'')::uuid);end if;
end $function$;
CREATE OR REPLACE FUNCTION public.create_catalog_project(details jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare pid uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Accès refusé' using errcode='42501';end if;
 if length(trim(coalesce(details->>'title',''))) not between 1 and 200 then raise exception 'Nom de projet invalide';end if;
 if not exists(select 1 from public.profiles where id=(details->>'client_id')::uuid and role='client') then raise exception 'Client invalide';end if;
 insert into public.projects(client_id,title,event_date,description,event_type,icon) values((details->>'client_id')::uuid,trim(details->>'title'),nullif(details->>'event_date','')::date,nullif(trim(details->>'description'),''),nullif(details->>'event_type',''),coalesce(nullif(details->>'icon',''),'grid')) returning id into pid;
 if nullif(details->>'venue_id','') is not null then perform public.set_project_directory_venue(pid,(details->>'venue_id')::uuid);end if;
 return pid;
end $function$;

do $$declare t text;d text;begin
 foreach t in array array['projects','project_shares','project_payments','invoices'] loop
  if t='projects' then
   execute 'select md5(coalesce(jsonb_agg(to_jsonb(x)-''icon'' order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.projects x' into d;
  else
   execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
  end if;
  if d is distinct from (select digest from project_icons_before where table_name=t) then raise exception 'Existing data changed: %',t;end if;
 end loop;
end $$;
