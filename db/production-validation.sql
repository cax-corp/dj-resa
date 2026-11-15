-- Validate required JSON fields and protocol boundaries before publishing the editors.
CREATE OR REPLACE FUNCTION public.import_project_music(pid uuid, entries jsonb, track_kind text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare n integer;begin
 if not public.can_manage_project_operations(pid) then raise exception 'Accès refusé' using errcode='42501';end if;
 if coalesce(track_kind,'') not in ('must_play','do_not_play') or coalesce(jsonb_typeof(entries),'')<>'array' or jsonb_array_length(entries)>2000 then raise exception 'Import invalide';end if;
 if exists(select 1 from jsonb_array_elements(entries) e where length(trim(coalesce(e->>'title',''))) not between 1 and 300 or length(coalesce(e->>'artist',''))>300 or (coalesce(e->>'url','')<>'' and (e->>'url')!~'^https://open[.]spotify[.]com/track/[A-Za-z0-9]{22}$')) then raise exception 'Titre, artiste ou lien invalide';end if;
 perform pg_advisory_xact_lock(hashtextextended('music-import:'||pid::text,0));
 insert into public.project_tracks(project_id,kind,title,artist,url)
 select pid,track_kind::public.track_kind,min(trim(e->>'title')),min(trim(coalesce(e->>'artist',''))),nullif(min(coalesce(e->>'url','')),'') from jsonb_array_elements(entries) e
 where not exists(select 1 from public.project_tracks t where t.project_id=pid and t.kind::text=track_kind and lower(trim(t.title))=lower(trim(e->>'title')) and lower(trim(coalesce(t.artist,'')))=lower(trim(coalesce(e->>'artist',''))))
 group by lower(trim(e->>'title')),lower(trim(coalesce(e->>'artist','')));
 get diagnostics n=row_count;return n;
end $function$;
CREATE OR REPLACE FUNCTION production_private.submit_guest_rsvp(link_token uuid, fields jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare l public.guest_rsvp_links%rowtype;c integer;begin
 if coalesce(jsonb_typeof(fields),'')<>'object' or octet_length(fields::text)>4000 or coalesce(fields->>'response','') not in ('confirmed','declined') or coalesce(fields->>'companions','')!~'^[0-9]{1,2}$' or length(coalesce(fields->>'dietary',''))>1000 then raise exception 'Réponse invalide';end if;
 select * into l from public.guest_rsvp_links where token=link_token for update;
 if not found or not l.is_open or (l.expires_at is not null and l.expires_at<=now()) then raise exception 'Ce lien est fermé ou indisponible';end if;
 c:=(fields->>'companions')::integer;if c>l.max_companions then raise exception 'Le nombre d’accompagnants dépasse celui prévu dans l’invitation';end if;
 if l.window_start<now()-interval '1 minute' then l.window_start:=now();l.window_count:=0;end if;
 if l.window_count>=20 then raise exception 'Trop de réponses. Réessayez dans une minute.';end if;
 update public.project_guests set response=fields->>'response',companions=case when fields->>'response'='declined' then 0 else c end,dietary=trim(coalesce(fields->>'dietary','')) where id=l.guest_id and project_id=l.project_id;
 update public.guest_rsvp_links set window_start=l.window_start,window_count=l.window_count+1 where id=l.id;
end $function$;
CREATE OR REPLACE FUNCTION production_private.save_seating(pid uuid, board jsonb, expected_revision integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.project_seating%rowtype; table_item jsonb; assignment_row record; n integer;begin
 if not public.can_manage_project_operations(pid) then raise exception 'Accès refusé' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or coalesce(jsonb_typeof(board),'')<>'object' or octet_length(board::text)>300000 or coalesce(jsonb_typeof(board->'tables'),'')<>'array' or jsonb_array_length(board->'tables')>100 or coalesce(jsonb_typeof(board->'assignments'),'')<>'object' then raise exception 'Plan invalide';end if;
 for table_item in select value from jsonb_array_elements(board->'tables') loop
  if coalesce(jsonb_typeof(table_item->'name'),'')<>'string' or coalesce(jsonb_typeof(table_item->'seats'),'')<>'number' or coalesce(jsonb_typeof(table_item->'x'),'')<>'number' or coalesce(jsonb_typeof(table_item->'y'),'')<>'number' or coalesce(table_item->>'id','')!~'^[0-9a-f-]{36}$' or length(trim(coalesce(table_item->>'name',''))) not between 1 and 100 or coalesce(table_item->>'seats','')!~'^[0-9]{1,2}$' or (table_item->>'seats')::integer not between 1 and 50 or coalesce(table_item->>'x','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(table_item->>'y','')!~'^[0-9]+([.][0-9]+)?$' or (table_item->>'x')::numeric not between 0 and 100 or (table_item->>'y')::numeric not between 0 and 100 or coalesce(table_item->>'shape','') not in ('round','rectangle') then raise exception 'Table invalide';end if;
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
end $function$;
CREATE OR REPLACE FUNCTION production_private.save_setup(pid uuid, board jsonb, expected_revision integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.project_setups%rowtype;n integer;node jsonb;port jsonb;edge jsonb;zone jsonb;src jsonb;dst jsonb;begin
 if not(public.is_admin() or (public.is_project_team(pid,true) and exists(select 1 from public.projects where id=pid and status<>'termine'))) then raise exception 'Accès refusé' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or coalesce(jsonb_typeof(board),'')<>'object' or octet_length(board::text)>500000 or coalesce(jsonb_typeof(board->'nodes'),'')<>'array' or coalesce(jsonb_typeof(board->'edges'),'')<>'array' or coalesce(jsonb_typeof(board->'zones'),'')<>'array' then raise exception 'Setup invalide';end if;
 if jsonb_array_length(board->'nodes')>80 or jsonb_array_length(board->'edges')>200 or jsonb_array_length(board->'zones')>20 or coalesce(board->>'width','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(board->>'depth','')!~'^[0-9]+([.][0-9]+)?$' then raise exception 'Dimensions ou nombre d’éléments invalide';end if;
 if (board->>'width')::numeric not between 1 and 200 or (board->>'depth')::numeric not between 1 and 200 then raise exception 'Dimensions invalides';end if;
 for node in select value from jsonb_array_elements(board->'nodes') loop
  if coalesce(jsonb_typeof(node->'label'),'')<>'string' or coalesce(jsonb_typeof(node->'unit'),'')<>'number' or coalesce(jsonb_typeof(node->'x'),'')<>'number' or coalesce(jsonb_typeof(node->'y'),'')<>'number' or coalesce(node->>'id','')!~'^[0-9a-f-]{36}$' or length(trim(coalesce(node->>'label',''))) not between 1 and 200 or coalesce(node->>'unit','')!~'^[0-9]{1,5}$' or coalesce(node->>'x','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(node->>'y','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(jsonb_typeof(node->'ports'),'')<>'array' or jsonb_array_length(node->'ports')>64 then raise exception 'Appareil invalide';end if;
  if (node->>'x')::numeric not between 0 and 100 or (node->>'y')::numeric not between 0 and 100 or (node->>'unit')::integer<1 then raise exception 'Position ou exemplaire invalide';end if;
  if not exists(select 1 from public.equipment_reservations r where r.project_id=pid and r.equipment_id::text=node->>'equipment_id' and r.state<>'cancelled' group by r.equipment_id having sum(r.quantity)>=(node->>'unit')::integer) then raise exception 'Cet exemplaire doit être sélectionné dans le matériel du projet.';end if;
  for port in select value from jsonb_array_elements(node->'ports') loop
   if coalesce(jsonb_typeof(port->'name'),'')<>'string' or coalesce(jsonb_typeof(port->'channels'),'')<>'number' or coalesce(port->>'id','')!~'^[0-9a-f-]{36}$' or length(coalesce(port->>'name','')) not between 1 and 100 or coalesce(port->>'direction','') not in ('in','out') or coalesce(port->>'connector','') not in ('xlr3','jack_trs','jack_ts','rca','rca_pair','mini_trs','mini_trrs','speakon2','speakon4','usb_a','usb_b','usb_c','rj45','toslink','bnc') or coalesce(port->>'gender','') not in ('male','female','none') or coalesce(port->>'signal','') not in ('mic','line','speaker','aes3','spdif','adat','dante','avb','usb') or coalesce(port->>'channels','')!~'^[0-9]{1,2}$' then raise exception 'Connectique invalide';end if;
   if (port->>'channels')::integer not between 1 and 64 then raise exception 'Nombre de canaux invalide';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(node->'ports') p group by p->>'id' having count(*)>1) then raise exception 'Ports en double';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(board->'nodes') a group by a->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'nodes') a group by a->>'equipment_id',a->>'unit' having count(*)>1) then raise exception 'Appareils en double';end if;
 for zone in select value from jsonb_array_elements(board->'zones') loop
  if coalesce(jsonb_typeof(zone->'name'),'')<>'string' or length(trim(coalesce(zone->>'name',''))) not between 1 and 100 or coalesce(zone->>'id','')!~'^[0-9a-f-]{36}$' or coalesce(zone->>'x','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(zone->>'y','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(zone->>'w','')!~'^[0-9]+([.][0-9]+)?$' or coalesce(zone->>'h','')!~'^[0-9]+([.][0-9]+)?$' then raise exception 'Zone invalide';end if;
  if (zone->>'x')::numeric<0 or (zone->>'y')::numeric<0 or (zone->>'w')::numeric<1 or (zone->>'h')::numeric<1 or (zone->>'x')::numeric+(zone->>'w')::numeric>100 or (zone->>'y')::numeric+(zone->>'h')::numeric>100 then raise exception 'Zone hors du plan';end if;
 end loop;
 for edge in select value from jsonb_array_elements(board->'edges') loop
  if coalesce(edge->>'id','')!~'^[0-9a-f-]{36}$' then raise exception 'Identifiant de liaison invalide';end if;
  select p into src from jsonb_array_elements(board->'nodes') a cross join lateral jsonb_array_elements(a->'ports') p where a->>'id'=edge->>'from_node' and p->>'id'=edge->>'from_port';
  select p into dst from jsonb_array_elements(board->'nodes') a cross join lateral jsonb_array_elements(a->'ports') p where a->>'id'=edge->>'to_node' and p->>'id'=edge->>'to_port';
  if src is null or dst is null or src->>'direction'<>'out' or dst->>'direction'<>'in' or src->>'signal'<>dst->>'signal' or src->>'channels'<>dst->>'channels' or edge->>'from_node'=edge->>'to_node' then raise exception 'Liaison incompatible : vérifiez direction, signal et canaux.';end if;
  if src->>'signal'='usb' and ((src->>'connector') not in ('usb_a','usb_b','usb_c') or (dst->>'connector') not in ('usb_a','usb_b','usb_c') or ((src->>'connector')=(dst->>'connector') and src->>'connector'<>'usb_c')) then raise exception 'Liaison USB incompatible';end if;
  if (src->>'signal') in ('dante','avb') and (src->>'connector'<>'rj45' or dst->>'connector'<>'rj45') then raise exception 'Liaison réseau incompatible';end if;
  if src->>'signal'='adat' and (src->>'connector'<>'toslink' or dst->>'connector'<>'toslink') then raise exception 'Liaison ADAT incompatible';end if;
  if src->>'signal'='spdif' and ((src->>'connector'='toslink')<>(dst->>'connector'='toslink')) then raise exception 'Un convertisseur optique/coaxial est nécessaire';end if;
  if src->>'signal'='aes3' and src->>'connector'<>dst->>'connector' then raise exception 'Adaptation AES/EBU nécessaire';end if;
  if coalesce(edge->>'length','0')!~'^[0-9]+([.][0-9]+)?$' or coalesce(edge->>'length','0')::numeric not between 0 and 200 then raise exception 'Longueur invalide';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'from_node',e->>'from_port' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'to_node',e->>'to_port' having count(*)>1) then raise exception 'Un port est déjà utilisé. Ajoutez un répartiteur si nécessaire.';end if;
 perform pg_advisory_xact_lock(hashtextextended('setup:'||pid::text,0));select * into previous from public.project_setups where project_id=pid for update;
 if coalesce(previous.revision,0)<>expected_revision then raise exception 'Le setup a changé ailleurs. Rechargez-le.';end if;
 n:=coalesce(previous.revision,0)+1;insert into public.project_setups(project_id,layout,revision) values(pid,board,n) on conflict(project_id) do update set layout=excluded.layout,revision=excluded.revision;return n;
end $function$;
