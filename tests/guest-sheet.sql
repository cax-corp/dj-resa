begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare p uuid; other uuid; gid uuid:=gen_random_uuid(); begin
 insert into public.projects(client_id,title) values(current_setting('test.client')::uuid,'Guest sheet test') returning id into p;
 insert into public.projects(client_id,title) values(current_setting('test.admin')::uuid,'Other guest sheet') returning id into other;
 perform set_config('test.project',p::text,true);perform set_config('test.other',other::text,true);perform set_config('test.guest',gid::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare entry jsonb; original jsonb; result jsonb; rejected boolean; p uuid:=current_setting('test.project')::uuid; gid uuid:=current_setting('test.guest')::uuid;begin
 entry:=jsonb_build_object('id',gid,'full_name','Camille','email','camille@example.test','phone','','companions',1,'response','confirmed','table_name','Table 1','dietary','','notes','','original',null);
 result:=public.save_guest_sheet(p,jsonb_build_array(entry),'{}');
 perform public.save_guest_sheet(p,jsonb_build_array(entry),'{}');
 if (select count(*) from public.project_guests where project_id=p)<>1 then raise exception 'Retry duplicated a guest';end if;
 original:=entry-'id'-'original';
 entry:=entry||jsonb_build_object('table_name','Table 2','original',original);
 perform public.save_guest_sheet(p,jsonb_build_array(entry),'{}');
 if not exists(select 1 from public.project_guests where id=gid and table_name='Table 2') then raise exception 'Cell edit failed';end if;
 rejected:=false;begin perform public.save_guest_sheet(p,jsonb_build_array(entry||'{"table_name":"Stale overwrite"}'::jsonb),'{}');exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Stale sheet overwrote newer data';end if;
 rejected:=false;begin perform public.save_guest_sheet(current_setting('test.other')::uuid,jsonb_build_array(entry),'{}');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Cross-project save accepted';end if;
 rejected:=false;begin perform public.save_guest_sheet(p,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'full_name','Should roll back','original',null),jsonb_build_object('id',gen_random_uuid(),'full_name','','original',null)),'{}');exception when check_violation then rejected:=true;end;
 if not rejected or exists(select 1 from public.project_guests where project_id=p and full_name='Should roll back') then raise exception 'Sheet save was not atomic';end if;
 perform public.save_guest_sheet(p,'[]',array[gid]);
 if exists(select 1 from public.project_guests where id=gid) then raise exception 'Explicit row removal failed';end if;
end $$;
reset role;
update public.projects set status='termine' where id=current_setting('test.project')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare rejected boolean:=false;begin
 begin perform public.save_guest_sheet(current_setting('test.project')::uuid,'[]','{}');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Closed project client can save';end if;
end $$;
reset role;
set local role anon;
do $$ declare rejected boolean:=false;begin
 begin perform public.save_guest_sheet(current_setting('test.project')::uuid,'[]','{}');exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous guest sheet mutation accepted';end if;
end $$;
reset role;
rollback;
