-- Extend the catalogue without rewriting any stored port or project snapshot.
alter table public.equipment_audio_ports drop constraint equipment_audio_ports_connector_check;
alter table public.equipment_audio_ports add constraint equipment_audio_ports_connector_check check(connector in ('xlr3','xlr4','xlr5','mini_xlr3','mini_xlr4','jack_ts','jack_trs','mini_ts','mini_trs','mini_trrs','jack_25','jack_25_trrs','pentaconn','rca','rca_pair','bnc','binding_post','spring_clip','euroblock2','euroblock3','banana','speakon2','speakon4','speakon8','usb_a','usb_b','usb_c','usb_mini','usb_micro','rj45','ethercon','toslink','mini_toslink','db25','din5'));

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
   if coalesce(jsonb_typeof(port->'name'),'')<>'string' or coalesce(jsonb_typeof(port->'channels'),'')<>'number' or coalesce(port->>'id','')!~'^[0-9a-f-]{36}$' or length(coalesce(port->>'name','')) not between 1 and 100 or coalesce(port->>'direction','') not in ('in','out') or coalesce(port->>'connector','') not in ('xlr3','xlr4','xlr5','mini_xlr3','mini_xlr4','jack_ts','jack_trs','mini_ts','mini_trs','mini_trrs','jack_25','jack_25_trrs','pentaconn','rca','rca_pair','bnc','binding_post','spring_clip','euroblock2','euroblock3','banana','speakon2','speakon4','speakon8','usb_a','usb_b','usb_c','usb_mini','usb_micro','rj45','ethercon','toslink','mini_toslink','db25','din5') or coalesce(port->>'gender','') not in ('male','female','none') or coalesce(port->>'signal','') not in ('mic','line','speaker','aes3','spdif','adat','dante','avb','usb') or coalesce(port->>'channels','')!~'^[0-9]{1,2}$' then raise exception 'Connectique invalide';end if;
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
  if src is null or dst is null or src->>'direction'<>'out' or dst->>'direction'<>'in' or src->>'signal'<>dst->>'signal' or src->>'channels'<>dst->>'channels' or edge->>'from_node'=edge->>'to_node' then raise exception 'Liaison incompatible : vérifiez le sens, le signal et le format audio.';end if;
  if src->>'signal'='usb' and ((src->>'connector') not in ('usb_a','usb_b','usb_c','usb_mini','usb_micro') or (dst->>'connector') not in ('usb_a','usb_b','usb_c','usb_mini','usb_micro') or ((src->>'connector')=(dst->>'connector') and src->>'connector'<>'usb_c')) then raise exception 'Liaison USB incompatible';end if;
  if (src->>'signal') in ('dante','avb') and (src->>'connector' not in ('rj45','ethercon') or dst->>'connector' not in ('rj45','ethercon')) then raise exception 'Liaison réseau incompatible';end if;
  if src->>'signal'='adat' and (src->>'connector' not in ('toslink','mini_toslink') or dst->>'connector' not in ('toslink','mini_toslink')) then raise exception 'Liaison ADAT incompatible';end if;
  if src->>'signal'='spdif' and ((src->>'connector' in ('toslink','mini_toslink'))<>(dst->>'connector' in ('toslink','mini_toslink'))) then raise exception 'Un convertisseur optique/coaxial est nécessaire';end if;
  if src->>'signal'='aes3' and src->>'connector'<>dst->>'connector' then raise exception 'Adaptation AES/EBU nécessaire';end if;
  if coalesce(edge->>'length','0')!~'^[0-9]+([.][0-9]+)?$' or coalesce(edge->>'length','0')::numeric not between 0 and 200 then raise exception 'Longueur invalide';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'from_node',e->>'from_port' having count(*)>1) or exists(select 1 from jsonb_array_elements(board->'edges') e group by e->>'to_node',e->>'to_port' having count(*)>1) then raise exception 'Un port est déjà utilisé. Ajoutez un répartiteur si nécessaire.';end if;
 perform pg_advisory_xact_lock(hashtextextended('setup:'||pid::text,0));select * into previous from public.project_setups where project_id=pid for update;
 if coalesce(previous.revision,0)<>expected_revision then raise exception 'Le setup a changé ailleurs. Rechargez-le.';end if;
 n:=coalesce(previous.revision,0)+1;insert into public.project_setups(project_id,layout,revision) values(pid,board,n) on conflict(project_id) do update set layout=excluded.layout,revision=excluded.revision;return n;
end $function$;
