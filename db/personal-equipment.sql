-- Own inventory and per-project packing lists. Existing selections and project
-- links remain intact; the old table/state identifiers are kept for compatibility.
create temporary table personal_gear_preservation(table_name text primary key,digest text) on commit drop;
do $$ declare t text; d text; begin
  foreach t in array array['equipment','equipment_reservations','projects','project_shares'] loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
    insert into personal_gear_preservation values(t,d);
  end loop;
end $$;

create or replace function public.check_equipment_availability() returns trigger
language plpgsql security invoker set search_path='' as $$
declare owned integer; already_selected integer;
begin
  -- Inventory edits reflect what the DJ owns today. They never rewrite history.
  if tg_table_name='equipment' then return new; end if;
  if tg_op='UPDATE' then
    if new.equipment_id<>old.equipment_id or new.project_id<>old.project_id then
      raise exception 'Retirez cet élément de la sélection puis choisissez le bon matériel.';
    end if;
    -- Preparation checkmarks must work even if inventory has changed since.
    if new.state='cancelled' or (new.quantity=old.quantity and old.state<>'cancelled') then return new; end if;
  elsif new.state='cancelled' then return new;
  end if;
  select units into owned from public.equipment where id=new.equipment_id and active for update;
  if owned is null then raise exception 'Ce matériel n’est plus proposé dans votre inventaire.'; end if;
  select coalesce(sum(quantity),0) into already_selected from public.equipment_reservations
    where project_id=new.project_id and equipment_id=new.equipment_id and id<>new.id and state<>'cancelled';
  if new.quantity+already_selected>owned then
    raise exception 'La quantité choisie pour ce projet dépasse le matériel que vous possédez.';
  end if;
  -- Another project's selection is informational, never a rental-period lock.
  return new;
end $$;
revoke all on function public.check_equipment_availability() from public,anon,authenticated;

do $$ declare r record; d text; begin
  for r in select * from personal_gear_preservation loop
    execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',r.table_name) into d;
    if d is distinct from r.digest then raise exception 'Existing data changed in %; rollback required',r.table_name; end if;
  end loop;
end $$;
