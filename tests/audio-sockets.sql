-- Shared physical sockets must never accept simultaneous alternative plugs.
begin;
select set_config('test.sockets_admin',(select id::text from public.profiles where role='admin' limit 1),true);
do $$declare p uuid;a uuid;b uuid;begin
 insert into public.projects(client_id,title) values(current_setting('test.sockets_admin')::uuid,'Hybrid socket fixture') returning id into p;
 insert into public.equipment(name,units) values('Line source fixture',1) returning id into a;
 insert into public.equipment(name,units) values('Combo mixer fixture',1) returning id into b;
 insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,a,1,'2030-01-01','2030-01-01'),(p,b,1,'2030-01-01','2030-01-01');
 perform set_config('test.sockets_project',p::text,true);perform set_config('test.sockets_source',a::text,true);perform set_config('test.sockets_dest',b::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sockets_admin'),'role','authenticated')::text,true);
do $$declare p uuid:=current_setting('test.sockets_project')::uuid;a uuid:=current_setting('test.sockets_source')::uuid;b uuid:=current_setting('test.sockets_dest')::uuid;src uuid;src2 uuid;dst uuid;jack uuid:=gen_random_uuid();xlr uuid:=gen_random_uuid();n1 uuid:=gen_random_uuid();n2 uuid:=gen_random_uuid();board jsonb;v jsonb;rejected boolean;begin
 v:=jsonb_build_array(jsonb_build_object('id',jack,'connector','jack_trs','gender','female','signal','line','channels',1),jsonb_build_object('id',xlr,'connector','xlr3','gender','female','signal','line','channels',1));
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Line L','out','jack_trs','line') returning id into src;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Line R','out','jack_trs','line') returning id into src2;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal,alternatives,group_name,audio_role) values(b,'CH 1 MIC/LINE','in','xlr3','mic',v,'CH 1 / 2','independent') returning id into dst;
 board:=jsonb_build_object('width',10,'depth',6,'zones','[]'::jsonb,'nodes',jsonb_build_array(
  jsonb_build_object('id',n1,'equipment_id',a,'unit',1,'label','Source','x',20,'y',20,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where equipment_id=a)),
  jsonb_build_object('id',n2,'equipment_id',b,'unit',1,'label','Mixer','x',60,'y',60,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where id=dst))),
  'edges',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from_node',n1,'from_port',src,'to_node',n2,'to_port',dst,'to_variant',jack,'length',5)));
 perform public.save_project_setup(p,board,0);
 if (select layout #>> '{edges,0,to_variant}' from public.project_setups where project_id=p)<>jack::text then raise exception 'Chosen jack lost';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0,to_variant}','"primary"'),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Line directly accepted as mic';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0,to_variant}',to_jsonb(gen_random_uuid())),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Unknown alternative accepted';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges}',(board->'edges')||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from_node',n1,'from_port',src2,'to_node',n2,'to_port',dst,'to_variant',xlr,'length',5))),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Two plugs accepted on one physical socket';end if;
 rejected:=false;begin update public.equipment_audio_ports set alternatives=jsonb_set(v,'{0,connector}','"unknown"') where id=dst;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Unknown connector alternative accepted';end if;
 rejected:=false;begin update public.equipment_audio_ports set alternatives=jsonb_set(v,'{0,direction}','"out"') where id=dst;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Alternative direction injection accepted';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{nodes,1,ports,0,alternatives}',jsonb_set(v,'{0,direction}','"out"')),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Snapshot direction injection accepted';end if;
 if (select revision from public.project_setups where project_id=p)<>1 then raise exception 'Failed save altered snapshot';end if;
end $$;
rollback;
