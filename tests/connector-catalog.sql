-- Real database roundtrip; fixtures and their snapshots are always rolled back.
begin;
select set_config('test.connector_admin',(select id::text from public.profiles where role='admin' limit 1),true);
do $$declare p uuid;a uuid;b uuid;begin
 insert into public.projects(client_id,title) values(current_setting('test.connector_admin')::uuid,'Connector fixture') returning id into p;
 insert into public.equipment(name,units) values('Connector source fixture',1) returning id into a;
 insert into public.equipment(name,units) values('Connector destination fixture',1) returning id into b;
 insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,a,1,'2030-01-01','2030-01-01'),(p,b,1,'2030-01-01','2030-01-01');
 perform set_config('test.connector_project',p::text,true);perform set_config('test.connector_source',a::text,true);perform set_config('test.connector_dest',b::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.connector_admin'),'role','authenticated')::text,true);
do $$declare p uuid:=current_setting('test.connector_project')::uuid;a uuid:=current_setting('test.connector_source')::uuid;b uuid:=current_setting('test.connector_dest')::uuid;src uuid;dst uuid;n1 uuid:=gen_random_uuid();n2 uuid:=gen_random_uuid();link uuid:=gen_random_uuid();revision integer:=0;pair text[];board jsonb;rejected boolean:=false;begin
 foreach pair slice 1 in array array[
 ['binding_post','spring_clip','speaker'],['euroblock2','banana','speaker'],['euroblock3','mini_xlr3','line'],['speakon8','speakon4','speaker'],['ethercon','rj45','dante'],['mini_toslink','toslink','adat'],['usb_a','usb_mini','usb'],['usb_c','usb_micro','usb'],['jack_25','mini_trs','line'],['db25','db25','line']
 ] loop
  insert into public.equipment_audio_ports(equipment_id,name,direction,connector,gender,signal) values(a,pair[1]||revision,'out',pair[1],'none',pair[3]) returning id into src;
  insert into public.equipment_audio_ports(equipment_id,name,direction,connector,gender,signal) values(b,pair[2]||revision,'in',pair[2],'none',pair[3]) returning id into dst;
  board:=jsonb_build_object('width',10,'depth',6,'zones','[]'::jsonb,'nodes',jsonb_build_array(
   jsonb_build_object('id',n1,'equipment_id',a,'unit',1,'label','Source','x',20,'y',20,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where id=src)),
   jsonb_build_object('id',n2,'equipment_id',b,'unit',1,'label','Destination','x',60,'y',60,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where id=dst))),
   'edges',jsonb_build_array(jsonb_build_object('id',link,'from_node',n1,'from_port',src,'to_node',n2,'to_port',dst,'length',5)));
  revision:=public.save_project_setup(p,board,revision);
  if (select layout #>> '{nodes,0,ports,0,connector}' from public.project_setups where project_id=p)<>pair[1] then raise exception 'Connector snapshot altered';end if;
 end loop;
 begin insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Invalid','out','unknown_connector','line');exception when check_violation then rejected:=true;end;
 if not rejected then raise exception 'Unknown connector accepted';end if;
 rejected:=false;
 begin perform public.save_project_setup(p,jsonb_set(board,'{nodes,0,ports,0,connector}','"unknown_connector"'),revision);exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Unknown setup connector accepted';end if;
end $$;
rollback;
