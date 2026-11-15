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
