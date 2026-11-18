begin;
select set_config('test.ops_admin',(select id::text from public.profiles where role='admin' limit 1),true);
do $$declare client uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();viewer uuid:=gen_random_uuid();editor uuid:=gen_random_uuid();p uuid;q uuid;e uuid;begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) select id,'authenticated','authenticated',id::text||'@fixture.invalid','{}','{}' from unnest(array[client,outsider,viewer,editor]) id;
 update public.profiles set role='dj' where id in(viewer,editor);
 insert into public.projects(client_id,title,status,event_type) values(client,'Operation fixture','preparation','mariage') returning id into p;
 insert into public.projects(client_id,title,status) values(outsider,'Unrelated operation fixture','preparation') returning id into q;
 insert into public.project_members(project_id,user_id,access_role) values(p,viewer,'viewer'),(p,editor,'editor');
 insert into public.project_guests(project_id,full_name,dietary) values(p,'Guest preserved','Allergy preserved');
 insert into public.project_payments(project_id,label,amount) values(p,'Preserved price',123);
 insert into public.project_shares(project_id,sections) values(p,array['status','event_date']);
 insert into public.equipment(name,units) values('Loading fixture',2) returning id into e;
 insert into public.equipment_reservations(project_id,equipment_id,quantity,starts_on,ends_on) values(p,e,2,'2030-06-15','2030-06-15');
 perform set_config('test.ops_client',client::text,true);perform set_config('test.ops_outsider',outsider::text,true);perform set_config('test.ops_viewer',viewer::text,true);perform set_config('test.ops_editor',editor::text,true);perform set_config('test.ops_project',p::text,true);perform set_config('test.ops_other',q::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ops_admin'),'role','authenticated')::text,true);
do $$declare f jsonb;x record;p uuid:=current_setting('test.ops_project')::uuid;rejected boolean;n integer;begin
 for f in select * from jsonb_array_elements($fixtures$[{"tool":"meals","status":"planned","details":{"quantity":1,"service":"Fixture service","provider":"Fixture provider","starts_at":"2030-06-15T15:00","menu":"Fixture menu","dietary":"Fixture dietary","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"lodging","status":"pending","details":{"address":"Fixture address","capacity":1,"occupants":0,"starts_on":"2030-06-15","ends_on":"2030-06-15","contact":"Fixture contact","phone":"Fixture phone","reference":"Fixture reference","guests":"Fixture guests","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"transport","status":"planned","details":{"departure":"Fixture departure","destination":"Fixture destination","starts_at":"2030-06-15T15:00","ends_at":"2030-06-15T15:00","vehicle":"Fixture vehicle","driver":"Fixture driver","phone":"Fixture phone","capacity":1,"passengers":0,"guests":"Fixture guests","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"lighting","status":"planned","details":{"zone":"Fixture zone","fixtures":"Fixture fixtures","quantity":1,"colors":"Fixture colors","cue":"Fixture cue","starts_at":"2030-06-15T15:00","universe":null,"address":null,"instructions":"Fixture instructions","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"power","status":"planned","details":{"circuit":"Fixture circuit","location":"Fixture location","watts":null,"quantity":1,"voltage":230,"amps":16,"connection":"Fixture connection","instructions":"Fixture instructions","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"loading","status":"pending","details":{"quantity":1,"case_name":"Fixture case_name","vehicle":"Fixture vehicle","load_order":0,"destination":"Fixture destination","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"activities","status":"planned","details":{"starts_at":"2030-06-15T15:00","ends_at":"2030-06-15T15:00","host":"Fixture host","audience":"Fixture audience","location":"Fixture location","requirements":"Fixture requirements","instructions":"Fixture instructions","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"media","status":"planned","details":{"kind":"photo","starts_at":"2030-06-15T15:00","photographer":"Fixture photographer","location":"Fixture location","url":"https://example.org/proof","shot_list":"Fixture shot_list","due_on":"2030-06-15","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"decoration","status":"planned","details":{"zone":"Fixture zone","quantity":1,"style":"Fixture style","provider":"Fixture provider","starts_at":"2030-06-15T15:00","ends_at":"2030-06-15T15:00","instructions":"Fixture instructions","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"access","status":"planned","details":{"location":"Fixture location","badge":"Fixture badge","expected":0,"arrived":0,"starts_at":"2030-06-15T15:00","ends_at":"2030-06-15T15:00","accessibility":"Fixture accessibility","parking":"Fixture parking","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"safety","status":"pending","details":{"kind":"instruction","priority":"normal","location":"Fixture location","phone":"Fixture phone","due_on":"2030-06-15","procedure":"Fixture procedure","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"permits","status":"pending","details":{"kind":"permission","issuer":"Fixture issuer","reference":"Fixture reference","due_on":"2030-06-15","valid_until":"2030-06-15","url":"https://example.org/proof","requirements":"Fixture requirements","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"lost_found","status":"stored","details":{"found_at":"2030-06-15T15:00","location":"Fixture location","storage":"Fixture storage","claimant":"Fixture claimant","phone":"Fixture phone","returned_at":"2030-06-15T15:00","description":"Fixture description","responsible":"Fixture responsible","notes":"Fixture notes"}},{"tool":"supplies","status":"planned","details":{"unit":"Fixture unit","required":1,"available":0,"consumed":0,"location":"Fixture location","provider":"Fixture provider","responsible":"Fixture responsible","notes":"Fixture notes"}}]$fixtures$::jsonb) loop
  insert into public.project_operation_items(project_id,tool,label,status,details) values(p,f->>'tool','Fixture '||(f->>'tool'),f->>'status',f->'details');
 end loop;
 if (select count(*) from public.project_operation_items where project_id=p)<>14 then raise exception 'Not all workspaces persisted';end if;
 n:=public.import_project_loading(p);if n<>1 then raise exception 'Equipment import failed';end if;
 update public.project_operation_items set details=details||'{"vehicle":"Customized van","quantity":1}',revision=revision+1 where project_id=p and source_key is not null;
 n:=public.import_project_loading(p);if n<>0 then raise exception 'Import duplicated equipment';end if;
 if not exists(select 1 from public.project_operation_items where project_id=p and source_key is not null and details->>'vehicle'='Customized van' and details->>'quantity'='1') then raise exception 'Import overwrote customization';end if;
 if (select quantity from public.equipment_reservations where project_id=p)<>2 then raise exception 'Import changed selected quantity';end if;
 -- Each malformed update must fail atomically, including wrong types and hostile URLs.
 for f in select * from jsonb_array_elements('[{"tool":"media","details":{"url":"javascript:alert(1)"}},{"tool":"transport","details":{"passengers":"six"}},{"tool":"lighting","details":{"address":513}},{"tool":"supplies","details":{"consumed":100,"available":1}},{"tool":"activities","details":{"starts_at":"2030-06-16T15:00","ends_at":"2030-06-15T15:00"}},{"tool":"meals","details":{"quantity":-1}},{"tool":"access","details":{"unknown":1}}]'::jsonb) loop
  rejected:=false;
  begin update public.project_operation_items set details=details||(f->'details'),revision=revision+1 where project_id=p and tool=f->>'tool';exception when check_violation then rejected:=true;end;
  if not rejected then raise exception 'Invalid payload accepted: %',f;end if;
 end loop;
 rejected:=false;begin update public.project_operation_items set status='invalid',revision=revision+1 where project_id=p and tool='meals';exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Unknown status accepted';end if;
 rejected:=false;begin update public.project_operation_items set project_id=current_setting('test.ops_other')::uuid,revision=revision+1 where project_id=p and tool='meals';exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Project scope changed';end if;
 rejected:=false;begin update public.project_operation_items set label='Without revision' where project_id=p and tool='meals';exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Revision not enforced';end if;
 rejected:=false;begin update public.project_operation_items set details=details||'{"due_on":"2030-02-31"}',revision=revision+1 where project_id=p and tool='permits';exception when datetime_field_overflow then rejected:=true;end;if not rejected then raise exception 'Invalid date accepted';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ops_client'),'role','authenticated')::text,true);
do $$declare n integer;rejected boolean:=false;begin
 if (select count(*) from public.project_operation_items where project_id=current_setting('test.ops_project')::uuid)<>15 then raise exception 'Client cannot see own workspaces';end if;
 update public.project_operation_items set label='Client menu',revision=revision+1 where project_id=current_setting('test.ops_project')::uuid and tool='meals';get diagnostics n=row_count;if n<>1 then raise exception 'Client cannot update own workspace';end if;
 begin perform public.import_project_loading(current_setting('test.ops_project')::uuid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Client can import private equipment';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ops_outsider'),'role','authenticated')::text,true);
do $$declare n integer;rejected boolean:=false;begin
 if exists(select 1 from public.project_operation_items where project_id=current_setting('test.ops_project')::uuid) then raise exception 'Unrelated project leaked';end if;
 update public.project_operation_items set label='Intrusion',revision=revision+1 where project_id=current_setting('test.ops_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Unrelated update allowed';end if;
 delete from public.project_operation_items where project_id=current_setting('test.ops_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Unrelated delete allowed';end if;
 begin insert into public.project_operation_items(project_id,tool,label,status,details) values(current_setting('test.ops_project')::uuid,'meals','Intrusion','planned','{"quantity":1}');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Unrelated insert allowed';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ops_viewer'),'role','authenticated')::text,true);
do $$declare n integer;begin
 if (select count(*) from public.project_operation_items where project_id=current_setting('test.ops_project')::uuid)<>15 then raise exception 'Viewer cannot read';end if;
 update public.project_operation_items set label='Viewer intrusion',revision=revision+1 where project_id=current_setting('test.ops_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Viewer edit allowed';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ops_editor'),'role','authenticated')::text,true);
do $$declare n integer;begin
 update public.project_operation_items set label='Team loading',revision=revision+1 where project_id=current_setting('test.ops_project')::uuid and tool='loading' and source_key is null;get diagnostics n=row_count;if n<>1 then raise exception 'Editor cannot update';end if;
 perform public.import_project_loading(current_setting('test.ops_project')::uuid);
end $$;
reset role;
update public.projects set status='termine' where id=current_setting('test.ops_project')::uuid;
set local role authenticated;
do $$declare n integer;begin
 update public.project_operation_items set label='Finished intrusion',revision=revision+1 where project_id=current_setting('test.ops_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Finished project editable by team';end if;
end $$;
reset role;
delete from public.project_members where user_id=current_setting('test.ops_editor')::uuid;
set local role authenticated;
do $$begin if exists(select 1 from public.project_operation_items where project_id=current_setting('test.ops_project')::uuid) then raise exception 'Revoked member retained access';end if;end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$declare rejected boolean:=false;begin
 begin perform 1 from public.project_operation_items;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous listing allowed';end if;
 rejected:=false;begin perform public.import_project_loading(current_setting('test.ops_project')::uuid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous import allowed';end if;
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.project_guests where project_id=current_setting('test.ops_project')::uuid and dietary='Allergy preserved') or not exists(select 1 from public.project_shares where project_id=current_setting('test.ops_project')::uuid) or not exists(select 1 from public.project_payments where project_id=current_setting('test.ops_project')::uuid and amount=123) then raise exception 'Existing project data not preserved';end if;
end $$;
rollback;
