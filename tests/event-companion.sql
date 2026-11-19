begin;
select set_config('test.ec_admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.ec_client',(select id::text from public.profiles where role='client' limit 1),true);
do $$declare p uuid;q uuid;v uuid:=gen_random_uuid();e uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();begin
 insert into auth.users(id,aud,role,email,raw_user_meta_data,raw_app_meta_data) select id,'authenticated','authenticated',id::text||'@fixture.invalid','{}','{}' from unnest(array[v,e,outsider]) id;
 update public.profiles set role='dj' where id in(v,e);
 insert into public.projects(client_id,title,event_date,event_type,status) values(current_setting('test.ec_client')::uuid,'Companion fixture','2030-06-15','mariage','preparation') returning id into p;
 insert into public.projects(client_id,title,event_date,status) values(outsider,'Other companion fixture','2030-06-15','preparation') returning id into q;
 insert into public.project_members(project_id,user_id,access_role) values(p,v,'viewer'),(p,e,'editor');
 insert into public.project_guests(project_id,full_name,response,companions,table_name,dietary) values(p,'Fixture guest','confirmed',2,'Table A','Diet preserved');
 insert into public.project_payments(project_id,label,amount,is_base) values(p,'Base preserved',500,true);
 insert into public.invoices(project_id,number,lines,total) values(p,'TEST-'||p::text,'[{"label":"Frozen","amount":500}]',500);
 insert into public.project_shares(project_id,sections) values(p,array['status','event_date']);
 perform set_config('test.ec_project',p::text,true);perform set_config('test.ec_other',q::text,true);perform set_config('test.ec_viewer',v::text,true);perform set_config('test.ec_editor',e::text,true);perform set_config('test.ec_outsider',outsider::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_admin'),'role','authenticated')::text,true);
do $$declare f jsonb;p uuid:=current_setting('test.ec_project')::uuid;i uuid;s uuid;doc uuid;preset uuid;eq uuid;result jsonb;n integer;rejected boolean;controls jsonb;begin
 for f in select * from jsonb_array_elements($fixtures$[{"tool":"issues","status":"new","details":{"priority":"normal","location":"","reported_at":"","due_at":"","problem":"","resolution":"","responsible":"","notes":""}},{"tool":"fallbacks","status":"draft","details":{"element":"","trigger":"","replacement":"","phone":"","procedure":"","checked_at":"","responsible":"","notes":""}},{"tool":"decisions","status":"pending","details":{"decision_maker":"","due_at":"","question":"","decision":"","responsible":"","notes":""}},{"tool":"changes","status":"draft","details":{"effective_at":"","recipients":"","before":"","after":"","instructions":"","responsible":"","notes":""}},{"tool":"handovers","status":"pending","details":{"from_person":"","to_person":"","starts_at":"","remaining":"","equipment":"","instructions":"","responsible":"","notes":""}},{"tool":"rollcall","status":"expected","details":{"role":"","phone":"","expected_at":"","arrived_at":"","replacement":"","availability":"","responsible":"","notes":""}},{"tool":"logbook","status":"recorded","details":{"occurred_at":"","kind":"fact","location":"","facts":"","followup":"","responsible":"","notes":""}},{"tool":"interventions","status":"pending","details":{"starts_at":"","ends_at":"","participants":"","host":"","music":"","equipment":"","cue":"","instructions":"","responsible":"","notes":""}},{"tool":"media_queue","status":"pending","details":{"kind":"video","order":0,"document_id":"","url":"","duration_seconds":null,"cue":"","instructions":"","responsible":"","notes":""}},{"tool":"media_checks","status":"pending","details":{"document_id":"","checked_at":"","listening":"pending","result":"","device":"","responsible":"","notes":""}},{"tool":"diagnostics","status":"pending","details":{"symptom":"no_sound","device":"","checks":"","result":"","responsible":"","notes":""}},{"tool":"opening_checks","status":"pending","details":{"category":"technical","location":"","due_at":"","instructions":"","responsible":"","notes":""}},{"tool":"onsite_requests","status":"new","details":{"priority":"normal","location":"","due_at":"","request":"","result":"","responsible":"","notes":""}},{"tool":"cloakroom","status":"stored","details":{"ticket":"Fixture ticket","owner":"","quantity":1,"storage":"","deposited_at":"","returned_at":"","description":"","responsible":"","notes":""}},{"tool":"special_needs","status":"pending","details":{"guest":"","kind":"mobility","location":"","need":"","response":"","responsible":"","notes":""}},{"tool":"practical_info","status":"draft","details":{"category":"directions","audience":"private","body":"","url":"","responsible":"","notes":""}},{"tool":"signage","status":"pending","details":{"kind":"pin","arrow":"none","body":"","orientation":"portrait","responsible":"","notes":""}},{"tool":"queues","status":"normal","details":{"location":"","waiting":0,"threshold":20,"staff":1,"wait_minutes":0,"checked_at":"","action":"","responsible":"","notes":""}},{"tool":"meal_service","status":"pending","details":{"table_name":"","menu":"","expected":0,"prepared":0,"served":0,"dietary":"","service_team":"","responsible":"","notes":""}},{"tool":"replenishment","status":"needed","details":{"supply_id":"","quantity":1,"unit":"","source":"","destination":"","due_at":"","responsible":"","notes":""}},{"tool":"orders","status":"pending","details":{"supplier":"","phone":"","reference":"","expected_at":"","destination":"","ordered":1,"received":0,"unit":"","contents":"","document_id":"","responsible":"","notes":""}},{"tool":"borrowed","status":"planned","details":{"owner":"","phone":"","quantity":1,"returned":0,"starts_at":"","due_at":"","storage":"","condition":"","document_id":"","responsible":"","notes":""}},{"tool":"keys","status":"available","details":{"reference":"","holder":"","zone":"","issued_at":"","due_at":"","returned_at":"","responsible":"","notes":""}},{"tool":"venue_checks","status":"pending","details":{"phase":"arrival","zone":"","condition":"ok","description":"","document_id":"","validated_by":"","checked_at":"","responsible":"","notes":""}},{"tool":"cleaning","status":"pending","details":{"zone":"","due_at":"","supplies":"","waste":"","instructions":"","responsible":"","notes":""}},{"tool":"urgent_expenses","status":"pending","details":{"category":"travel","amount":0,"paid_by":"","reimburse_to":"","purchased_at":"","document_id":"","reference":"","responsible":"","notes":""}},{"tool":"extras","status":"proposed","details":{"quantity":1,"unit_price":0,"unit":"forfait","scope":"","approved_by":"","approved_at":"","document_id":"","responsible":"","notes":""}},{"tool":"claims","status":"new","details":{"requester":"","phone":"","priority":"normal","request":"","response":"","commitment":"","due_at":"","responsible":"","notes":""}},{"tool":"closing_checks","status":"pending","details":{"category":"people","location":"","instructions":"","checked_at":"","responsible":"","notes":""}},{"tool":"lessons","status":"draft","details":{"source":"","problem":"","improvement":"","task_label":"","event_type":"all","priority":"normal","responsible":"","notes":""}}]$fixtures$::jsonb) loop insert into public.project_companion_items(project_id,tool,label,status,details) values(p,f->>'tool','Fixture '||(f->>'tool'),f->>'status',f->'details');end loop;
 if (select count(*) from public.project_companion_items where project_id=p)<>30 then raise exception 'Not all structured workspaces saved';end if;
 -- Idempotent additive checklists and guest/service import.
 n:=public.seed_project_operation_checks(p,'opening_checks');if n<8 then raise exception 'Opening checklist incomplete';end if;
 if public.seed_project_operation_checks(p,'opening_checks')<>0 then raise exception 'Opening checklist duplicated';end if;
 if public.seed_project_operation_checks(p,'closing_checks')<8 then raise exception 'Closing checklist incomplete';end if;
 if public.seed_project_operation_checks(p,'meal_service')<>1 or public.seed_project_operation_checks(p,'meal_service')<>0 then raise exception 'Guest groups duplicated';end if;
 if not exists(select 1 from public.project_companion_items where project_id=p and tool='meal_service' and details->>'expected'='3' and details->>'dietary'='Diet preserved') then raise exception 'Guest service count invalid';end if;
 insert into public.project_operation_items(project_id,tool,label,status,details) values(p,'supplies','Supply fixture','planned','{"unit":"pièces","required":10,"available":2,"consumed":1}') returning id into s;
 if public.seed_project_operation_checks(p,'replenishment')<>1 then raise exception 'Restock not prepared';end if;
 select id into i from public.project_companion_items where project_id=p and source_key='supply:'||s::text;
 update public.project_companion_items set status='received',revision=revision+1 where id=i;
 result:=public.apply_project_operation_action(i,'restock',p);result:=public.apply_project_operation_action(i,'restock',p);
 if not (result->>'already_applied')::boolean or (select details->>'available' from public.project_operation_items where id=s)<>'11' then raise exception 'Restock duplicated or lost';end if;
 select id into i from public.project_companion_items where project_id=p and tool='issues';
 perform public.apply_project_operation_action(i,'task',p);result:=public.apply_project_operation_action(i,'task',p);if not (result->>'already_applied')::boolean or (select count(*) from public.project_tasks where project_id=p)<>1 then raise exception 'Task action duplicated';end if;
 perform public.apply_project_operation_action(i,'log',p);
 select id into i from public.project_companion_items where project_id=p and tool='interventions';
 update public.project_companion_items set details=details||'{"starts_at":"2030-06-15T23:30","ends_at":"2030-06-16T00:30","participants":"Fixture operator","cue":"Start"}',revision=revision+1 where id=i;
 result:=public.apply_project_operation_action(i,'schedule',p);s:=(result->>'target_id')::uuid;
 perform public.shift_project_schedule(p,jsonb_build_array(jsonb_build_object('id',s,'original_day',0,'original_start','23:30','original_end','00:30','day_offset',1,'start_time','00:15','end_time','01:15')));
 if not exists(select 1 from public.schedule_items where id=s and day_offset=1 and start_time='00:15' and end_time='01:15') then raise exception 'Midnight shift failed';end if;
 rejected:=false;begin perform public.shift_project_schedule(p,jsonb_build_array(jsonb_build_object('id',s,'original_day',0,'original_start','23:30','original_end','00:30','day_offset',1,'start_time','00:15','end_time','01:15')));exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Stale schedule shift allowed';end if;
 select id into i from public.project_companion_items where project_id=p and tool='urgent_expenses';update public.project_companion_items set status='approved',details=details||'{"amount":12.50}',revision=revision+1 where id=i;
 perform public.apply_project_operation_action(i,'cost',p);perform public.apply_project_operation_action(i,'cost',p);if (select count(*) from public.project_costs where project_id=p)<>1 then raise exception 'Expense duplicated';end if;
 select id into i from public.project_companion_items where project_id=p and tool='extras';update public.project_companion_items set status='approved',details=details||'{"quantity":1.5,"unit_price":0.67,"approved_by":"Fixture client","approved_at":"2030-06-15T23:00"}',revision=revision+1 where id=i;
 perform public.apply_project_operation_action(i,'quote',p);perform public.apply_project_operation_action(i,'quote',p);if (select count(*) from public.project_payments where project_id=p and is_addon)<>1 or not exists(select 1 from public.project_payments where project_id=p and is_addon and amount=1.01) then raise exception 'Extra quote duplicated or incorrectly rounded';end if;
 perform set_config('test.ec_extra',i::text,true);
 -- Actual virtual control validation, photo scope and revisions.
 insert into public.project_documents(project_id,name,storage_path,size_bytes,mime_type,team_visible) values(p,'Fixture photo.png',p||'/fixture.png',100,'image/png',true) returning id into doc;
 controls:=jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'label','Bass','section','Channel 1','kind','knob','min',-15,'max',15,'step',1,'value',3,'unit','dB'));
 insert into public.equipment_setting_presets(project_id,name,device_label,controls,photo_document_id) values(p,'Balance fixture','Yamaha MG06X',controls,doc) returning id into preset;
 rejected:=false;begin update public.equipment_setting_presets set controls=jsonb_set(controls,'{0,value}','99'),revision=revision+1 where id=preset;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Knob outside limits saved';end if;
 rejected:=false;begin update public.equipment_setting_presets set name='Stale save' where id=preset;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Stale preset update allowed';end if;
 delete from public.project_documents where id=doc;
 if not exists(select 1 from public.equipment_setting_presets where id=preset and photo_document_id is null and revision=2) then raise exception 'Photo removal broke preset';end if;
 rejected:=false;begin update public.equipment_setting_presets set project_id=current_setting('test.ec_other')::uuid,revision=revision+1 where id=preset;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Preset scope changed';end if;
 insert into public.project_regie_clocks(project_id,mode,duration_ms,elapsed_ms,running_since) values(p,'countdown',60000,0,now());
 rejected:=false;begin update public.project_regie_clocks set elapsed_ms=1000 where project_id=p;exception when check_violation then rejected:=true;end;if not rejected then raise exception 'Clock stale write allowed';end if;
 select id into i from public.project_companion_items where project_id=p and tool='changes';update public.project_companion_items set status='published',revision=revision+1 where id=i;perform set_config('test.ec_change',i::text,true);
 -- Public link has an explicit whitelist; no previous sharing options are expanded.
 update public.project_companion_items set status='published',details=details||'{"audience":"private","body":"Internal secret"}',revision=revision+1 where project_id=p and tool='practical_info';
 insert into public.project_companion_items(project_id,tool,label,status,details) values(p,'practical_info','Public parking','published','{"category":"parking","audience":"public","body":"Public entrance","url":"https://example.org/map"}');
 insert into public.project_practical_links(project_id) values(p) returning token into i;perform set_config('test.ec_public_token',i::text,true);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_client'),'role','authenticated')::text,true);
do $$declare rejected boolean;n integer;begin
 if exists(select 1 from public.project_companion_items where project_id=current_setting('test.ec_project')::uuid and tool in ('urgent_expenses','extras')) then raise exception 'Private financial records leaked to client';end if;
 perform public.acknowledge_operation_item(current_setting('test.ec_change')::uuid,2);
 if not exists(select 1 from public.operation_acknowledgements where item_id=current_setting('test.ec_change')::uuid and user_id=auth.uid() and item_revision=2) then raise exception 'Read confirmation missing';end if;
 rejected:=false;begin perform public.apply_project_operation_action(current_setting('test.ec_extra')::uuid,'quote',current_setting('test.ec_project')::uuid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Client added a financial line';end if;
 insert into public.project_tool_preferences(project_id,user_id,hidden_tools,favorites) values(current_setting('test.ec_project')::uuid,auth.uid(),array['signage'],array['live','settings']);
 rejected:=false;begin insert into public.project_tool_preferences(project_id,user_id) values(current_setting('test.ec_project')::uuid,current_setting('test.ec_admin')::uuid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Client modified another account preferences';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_viewer'),'role','authenticated')::text,true);
do $$declare n integer;rejected boolean:=false;begin
 if not exists(select 1 from public.equipment_setting_presets where project_id=current_setting('test.ec_project')::uuid) then raise exception 'Viewer cannot see settings';end if;
 update public.equipment_setting_presets set name='Viewer intrusion',revision=revision+1 where project_id=current_setting('test.ec_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Viewer changed settings';end if;
 begin perform public.seed_project_operation_checks(current_setting('test.ec_project')::uuid,'opening_checks');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Viewer created checklist';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_editor'),'role','authenticated')::text,true);
do $$declare n integer;begin
 update public.equipment_setting_presets set notes='Editor adjustment',revision=revision+1 where project_id=current_setting('test.ec_project')::uuid;get diagnostics n=row_count;if n<>1 then raise exception 'Editor cannot save settings';end if;
 if exists(select 1 from public.project_companion_items where tool in ('urgent_expenses','extras')) then raise exception 'Team saw private expenses';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_outsider'),'role','authenticated')::text,true);
do $$declare rejected boolean:=false;n integer;begin
 if exists(select 1 from public.project_companion_items where project_id=current_setting('test.ec_project')::uuid) or exists(select 1 from public.equipment_setting_presets where project_id=current_setting('test.ec_project')::uuid) then raise exception 'Cross-project data leak';end if;
 begin perform public.acknowledge_operation_item(current_setting('test.ec_change')::uuid,2);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'Unrelated acknowledgement allowed';end if;
end $$;
reset role;
update public.projects set status='termine' where id=current_setting('test.ec_project')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ec_client'),'role','authenticated')::text,true);
do $$declare n integer;begin update public.project_companion_items set label='Finished edit',revision=revision+1 where project_id=current_setting('test.ec_project')::uuid;get diagnostics n=row_count;if n<>0 then raise exception 'Finished project edited by client';end if;end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$declare result jsonb;rejected boolean:=false;begin
 result:=public.get_practical_project(current_setting('test.ec_public_token')::uuid);
 if jsonb_array_length(result->'information')<>1 or result::text like '%Internal secret%' or result::text like '%Diet preserved%' or result::text like '%500%' or result->'information'->0->>'body'<>'Public entrance' then raise exception 'Public practical projection leaked information';end if;
 begin perform 1 from public.project_companion_items;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous operations listing allowed';end if;
 rejected:=false;begin perform 1 from public.equipment_setting_presets;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous settings listing allowed';end if;
end $$;
reset role;
update public.project_practical_links set is_open=false where token=current_setting('test.ec_public_token')::uuid;
set local role anon;
do $$begin if public.get_practical_project(current_setting('test.ec_public_token')::uuid) is not null then raise exception 'Closed link accessible';end if;end $$;
reset role;
do $$begin
 if not exists(select 1 from public.project_payments where project_id=current_setting('test.ec_project')::uuid and is_base and amount=500) or not exists(select 1 from public.invoices where project_id=current_setting('test.ec_project')::uuid and total=500 and lines='[{"label":"Frozen","amount":500}]'::jsonb) or not exists(select 1 from public.project_guests where project_id=current_setting('test.ec_project')::uuid and dietary='Diet preserved') or not exists(select 1 from public.project_shares where project_id=current_setting('test.ec_project')::uuid) then raise exception 'Existing project content changed';end if;
end $$;
rollback;
