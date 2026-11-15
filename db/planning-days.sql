-- Preserve existing rows and public links; old entries keep an unspecified day.
create temporary table planning_days_before(table_name text primary key,digest text) on commit drop;
do $$ declare t text; d text; begin
 foreach t in array array['schedule_items','projects','project_shares','project_payments','invoices'] loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
  insert into planning_days_before values(t,d);
 end loop;
 insert into planning_days_before values('public_payloads',(select md5(coalesce(jsonb_agg(public.get_shared_project(s.token) order by s.token)::text,'[]')) from public.project_shares s));
end $$;
alter table public.schedule_items add column day_offset smallint check(day_offset between -7 and 30);
comment on column public.schedule_items.day_offset is 'Start day relative to project event date: 0 event day, 1 next day. NULL means legacy day awaiting confirmation.';
CREATE OR REPLACE FUNCTION project_sharing_private.read_project(share_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  shared public.project_shares%rowtype;
  project public.projects%rowtype;
  payload jsonb;
begin
  select * into shared from public.project_shares where token = share_token;
  if not found then return null; end if;
  select * into project from public.projects where id = shared.project_id;
  if not found then return null; end if;
  payload := jsonb_build_object('title', project.title);
  if 'event_date' = any(shared.sections) then payload := payload || jsonb_build_object('event_date', project.event_date); end if;
  if 'location' = any(shared.sections) then payload := payload || jsonb_build_object('location', project.location); end if;
  if 'status' = any(shared.sections) then payload := payload || jsonb_build_object('status', project.status); end if;
  if 'description' = any(shared.sections) then payload := payload || jsonb_build_object('description', project.description); end if;
  if 'must_play' = any(shared.sections) then
    payload := payload || jsonb_build_object('must_play', coalesce((select jsonb_agg(jsonb_build_object(
      'title', t.title, 'artist', t.artist, 'note', t.note, 'url', t.url) order by t.created_at, t.id)
      from public.project_tracks t where t.project_id = project.id and t.kind = 'must_play'), '[]'::jsonb));
  end if;
  if 'do_not_play' = any(shared.sections) then
    payload := payload || jsonb_build_object('do_not_play', coalesce((select jsonb_agg(jsonb_build_object(
      'title', t.title, 'artist', t.artist, 'note', t.note, 'url', t.url) order by t.created_at, t.id)
      from public.project_tracks t where t.project_id = project.id and t.kind = 'do_not_play'), '[]'::jsonb));
  end if;
  if 'schedule' = any(shared.sections) then
    payload := payload || jsonb_build_object('schedule', coalesce((select jsonb_agg((jsonb_build_object(
      'start_time', t.start_time, 'end_time', t.end_time, 'kind', t.kind, 'title', t.title, 'details', t.details) || case when t.day_offset is null then '{}'::jsonb else jsonb_build_object('day_offset', t.day_offset) end) order by coalesce(t.day_offset, 0), t.start_time, t.id)
      from public.schedule_items t where t.project_id = project.id), '[]'::jsonb));
  end if;
  if 'tasks' = any(shared.sections) then
    payload := payload || jsonb_build_object('tasks', coalesce((select jsonb_agg(jsonb_build_object(
      'label', t.label, 'done', t.done) order by t.created_at, t.id)
      from public.project_tasks t where t.project_id = project.id), '[]'::jsonb));
  end if;
  if 'updates' = any(shared.sections) then
    payload := payload || jsonb_build_object('updates', coalesce((select jsonb_agg(jsonb_build_object(
      'body', t.body, 'created_at', t.created_at) order by t.created_at desc, t.id)
      from public.project_updates t where t.project_id = project.id), '[]'::jsonb));
  end if;
  if 'payments' = any(shared.sections) then
    payload := payload || jsonb_build_object('payments', coalesce((select jsonb_agg(jsonb_build_object(
      'label', t.label, 'amount', t.amount, 'paid', t.paid, 'is_base', t.is_base, 'quantity', t.quantity, 'unit_price', t.unit_price) order by t.created_at, t.id)
      from public.project_payments t where t.project_id = project.id), '[]'::jsonb));
  end if;
  if 'client' = any(shared.sections) then
    payload := payload || jsonb_build_object('client', (select jsonb_build_object(
      'full_name', c.full_name, 'email', c.email, 'phone', c.phone, 'company', c.company, 'billing_address', c.billing_address)
      from public.profiles c where c.id = project.client_id));
  end if;
  if 'invoices' = any(shared.sections) then
    payload := payload || jsonb_build_object('invoices', coalesce((select jsonb_agg(jsonb_build_object(
      'number', t.number, 'issue_date', t.issue_date, 'total', t.total) order by t.created_at desc, t.id)
      from public.invoices t where t.project_id = project.id), '[]'::jsonb));
  end if;
  return payload;
end;
$function$;

do $$ declare t text; d text; begin
 foreach t in array array['schedule_items','projects','project_shares','project_payments','invoices'] loop
  if t='schedule_items' then
   select md5(coalesce(jsonb_agg(to_jsonb(x)-'day_offset' order by to_jsonb(x)->>'id',to_jsonb(x)->>'token')::text,'[]')) into d from public.schedule_items x;
  else
   execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)->>''id'',to_jsonb(x)->>''token'')::text,''[]'')) from public.%I x',t) into d;
  end if;
  if d is distinct from (select digest from planning_days_before where table_name=t) then raise exception 'Unexpected existing data change: %',t; end if;
 end loop;
 select md5(coalesce(jsonb_agg(public.get_shared_project(s.token) order by s.token)::text,'[]')) into d from public.project_shares s;
 if d is distinct from (select digest from planning_days_before where table_name='public_payloads') then raise exception 'Existing shared responses changed'; end if;
end $$;

