begin;
select set_config('test.stereo_admin',(select id::text from public.profiles where role='admin' limit 1),true);
do $$declare p uuid;a uuid;b uuid;begin
 insert into public.projects(client_id,title) values(current_setting('test.stereo_admin')::uuid,'Stereo cable fixture') returning id into p;
 insert into public.equipment(name,units) values('DDJ fixture',1) returning id into a;
 insert into public.equipment(name,units) values('Yamaha fixture',1) returning id into b;
 insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,a,1,'2030-01-01','2030-01-01'),(p,b,1,'2030-01-01','2030-01-01');
 perform set_config('test.stereo_project',p::text,true);perform set_config('test.stereo_source',a::text,true);perform set_config('test.stereo_dest',b::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.stereo_admin'),'role','authenticated')::text,true);
do $$declare p uuid:=current_setting('test.stereo_project')::uuid;a uuid:=current_setting('test.stereo_source')::uuid;b uuid:=current_setting('test.stereo_dest')::uuid;src uuid;src2 uuid;dst uuid;dst2 uuid;n1 uuid:=gen_random_uuid();n2 uuid:=gen_random_uuid();board jsonb;edge jsonb;rejected boolean;begin
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal,channels,audio_role) values(a,'MASTER stereo RCA','out','rca_pair','line',2,'stereo') returning id into src;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Other source','out','jack_ts','line') returning id into src2;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal,group_name,audio_role) values(b,'CH3','in','jack_ts','line','3/4','left_mono') returning id into dst;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal,group_name,audio_role) values(b,'CH4','in','jack_ts','line','3/4','right') returning id into dst2;
 edge:=jsonb_build_object('id',gen_random_uuid(),'stereo',true,'from_node',n1,'from_port',src,'to_node',n2,'to_port',dst,'to_right_port',dst2,'length',3);
 board:=jsonb_build_object('width',10,'depth',6,'zones','[]'::jsonb,'nodes',jsonb_build_array(
  jsonb_build_object('id',n1,'equipment_id',a,'unit',1,'label','DDJ','x',20,'y',20,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where equipment_id=a)),
  jsonb_build_object('id',n2,'equipment_id',b,'unit',1,'label','Yamaha','x',60,'y',60,'ports',(select jsonb_agg(to_jsonb(t)) from public.equipment_audio_ports t where equipment_id=b))),
  'edges',jsonb_build_array(edge));
 perform public.save_project_setup(p,board,0);
 if (select layout #>> '{edges,0,to_right_port}' from public.project_setups where project_id=p)<>dst2::text then raise exception 'Right branch was lost';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0}',edge-'to_right_port'),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Missing branch accepted';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0,to_right_port}',to_jsonb(dst)),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Same input reused for L/R';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0,stereo}','false'),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Unmarked stereo branch accepted';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges,0,to_right_variant}',to_jsonb(gen_random_uuid())),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Unknown right plug accepted';end if;
 rejected:=false;begin perform public.save_project_setup(p,jsonb_set(board,'{edges}',jsonb_build_array(edge,jsonb_build_object('id',gen_random_uuid(),'from_node',n1,'from_port',src2,'to_node',n2,'to_port',dst2,'length',1))),1);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Occupied right input reused';end if;
 if (select revision from public.project_setups where project_id=p)<>1 then raise exception 'Rejected edit modified saved cable';end if;
end $$;
rollback;
