begin;
select set_config('test.admin',(select id::text from public.profiles where role='admin' limit 1),true);
select set_config('test.client',(select id::text from public.profiles where role='client' limit 1),true);
do $$ declare p uuid; d uuid;begin
 insert into public.projects(client_id,title) values(current_setting('test.client')::uuid,'Document reader test') returning id into p;
 insert into public.project_documents(project_id,name,storage_path,size_bytes,mime_type) values(p,'Plan.pdf',p::text||'/test.pdf',10,'application/pdf') returning id into d;
 perform set_config('test.document',d::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.admin'),'role','authenticated')::text,true);
do $$ declare t uuid;rejected boolean:=false;begin
 insert into public.document_read_links(document_id) values(current_setting('test.document')::uuid) returning token into t;
 perform set_config('test.token',t::text,true);
 begin insert into public.document_read_links(document_id) values(current_setting('test.document')::uuid);exception when unique_violation then rejected:=true;end;
 if not rejected then raise exception 'Multiple active document links accepted';end if;
 update public.document_read_links set active=false where token=t;
 insert into public.document_read_links(document_id) values(current_setting('test.document')::uuid);
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.client'),'role','authenticated')::text,true);
do $$ declare rejected boolean:=false;begin
 if exists(select 1 from public.document_read_links) then raise exception 'Client can list bearer tokens';end if;
 if exists(select 1 from public.project_documents where id=current_setting('test.document')::uuid) then raise exception 'Internal file leaked';end if;
 begin insert into public.document_read_links(document_id) values(current_setting('test.document')::uuid);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Client can publish an internal document';end if;
end $$;
reset role;
set local role anon;
do $$ declare rejected boolean:=false;begin
 begin perform 1 from public.document_read_links;exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Anonymous token enumeration allowed';end if;
end $$;
reset role;
rollback;
