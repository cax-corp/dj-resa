begin;
select set_config('test.groups_admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.groups_client',(select id::text from public.profiles where role='client' limit 1),true);
do $$declare a uuid;b uuid;l uuid;r uuid;other uuid;p uuid;begin
 insert into public.equipment(name,units) values('Stereo group fixture',1) returning id into a;
 insert into public.equipment(name,units) values('Other group fixture',1) returning id into b;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Input 3','in','jack_ts','line') returning id into l;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(a,'Input 4','in','jack_ts','line') returning id into r;
 insert into public.equipment_audio_ports(equipment_id,name,direction,connector,signal) values(b,'Other input','in','jack_ts','line') returning id into other;
 insert into public.projects(client_id,title) values(current_setting('test.groups_admin')::uuid,'Group preservation fixture') returning id into p;
 insert into public.project_setups(project_id,layout) values(p,'{"legacy":"untouched"}');
 perform set_config('test.groups_gear',a::text,true);perform set_config('test.groups_left',l::text,true);perform set_config('test.groups_right',r::text,true);perform set_config('test.groups_other',other::text,true);perform set_config('test.groups_project',p::text,true);
 perform set_config('test.groups_original',(select jsonb_agg(to_jsonb(t) order by t.id)::text from public.equipment_audio_ports t where equipment_id=a),true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.groups_admin'),'role','authenticated')::text,true);
do $$declare a uuid:=current_setting('test.groups_gear')::uuid;l uuid:=current_setting('test.groups_left')::uuid;r uuid:=current_setting('test.groups_right')::uuid;rejected boolean;before jsonb;after jsonb;begin
 perform public.set_equipment_stereo_group(a,l,r,'CH 3 / 4',true);
 if not exists(select 1 from public.equipment_audio_ports where id=l and group_name='CH 3 / 4' and audio_role='left_mono') or not exists(select 1 from public.equipment_audio_ports where id=r and group_name='CH 3 / 4' and audio_role='right') then raise exception 'Stereo group not saved';end if;
 select jsonb_agg(to_jsonb(t)-'group_name'-'audio_role' order by t.id) into after from public.equipment_audio_ports t where equipment_id=a;
 select jsonb_agg(v-'group_name'-'audio_role' order by v->>'id') into before from jsonb_array_elements(current_setting('test.groups_original')::jsonb) v;
 if before<>after then raise exception 'Physical sockets altered by grouping';end if;
 perform public.set_equipment_stereo_group(a,l,r,'Renamed stereo group',false);
 if (select audio_role from public.equipment_audio_ports where id=l)<>'left' then raise exception 'Mono fallback cannot be disabled';end if;
 rejected:=false;begin perform public.set_equipment_stereo_group(a,l,current_setting('test.groups_other')::uuid,'Invalid',true);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Cross-equipment group accepted';end if;
 rejected:=false;begin perform public.set_equipment_stereo_group(a,l,l,'Invalid',true);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Same physical socket accepted twice';end if;
 if (select layout from public.project_setups where project_id=current_setting('test.groups_project')::uuid)<>'{"legacy":"untouched"}'::jsonb then raise exception 'Existing setup changed';end if;
 perform public.clear_equipment_stereo_group(a,l,r);
 select jsonb_agg(to_jsonb(t) order by t.id) into after from public.equipment_audio_ports t where equipment_id=a;
 if after<>current_setting('test.groups_original')::jsonb then raise exception 'Dissociation changed or deleted sockets';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.groups_client'),'role','authenticated')::text,true);
do $$declare rejected boolean:=false;begin
 begin perform public.set_equipment_stereo_group(current_setting('test.groups_gear')::uuid,current_setting('test.groups_left')::uuid,current_setting('test.groups_right')::uuid,'Forbidden',true);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Client can change equipment groups';end if;
 if has_function_privilege('anon','public.set_equipment_stereo_group(uuid,uuid,uuid,text,boolean)','execute') or has_function_privilege('anon','public.clear_equipment_stereo_group(uuid,uuid,uuid)','execute') then raise exception 'Anonymous group management';end if;
end $$;
rollback;
