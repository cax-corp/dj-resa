-- Token-scoped public reads. Run once before releasing the accompanying app.js.
-- Old links based on project IDs are deliberately retired: create new links in the UI.
create table public.project_shares (
  token uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  sections text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint project_share_sections check (
    sections <@ array['event_date','location','status','description','must_play','do_not_play',
      'schedule','tasks','updates','payments','client','invoices']::text[]
    and array_position(sections, null) is null
  )
);
create index project_shares_project_id_idx on public.project_shares(project_id);
alter table public.project_shares enable row level security;
revoke all on public.project_shares from public, anon, authenticated;
grant select, insert, delete on public.project_shares to authenticated;
create policy "Admins manage project sharing" on public.project_shares
  for all to authenticated
  using ((select auth.uid()) is not null and (select public.is_admin()))
  with check ((select auth.uid()) is not null and (select public.is_admin()));

-- The lookup intentionally authenticates the bearer token, not a user session.
-- Keep the privileged implementation out of exposed schemas. The public wrapper
-- uses invoker security; no caller can list shares or request extra fields.
create schema project_sharing_private;
revoke all on schema project_sharing_private from public;
grant usage on schema project_sharing_private to anon, authenticated;
create function project_sharing_private.read_project(share_token uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
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
    payload := payload || jsonb_build_object('schedule', coalesce((select jsonb_agg(jsonb_build_object(
      'start_time', t.start_time, 'end_time', t.end_time, 'kind', t.kind, 'title', t.title, 'details', t.details) order by t.start_time, t.id)
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
$$;
revoke all on function project_sharing_private.read_project(uuid) from public;
grant execute on function project_sharing_private.read_project(uuid) to anon, authenticated;
create function public.get_shared_project(share_token uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select project_sharing_private.read_project(share_token);
$$;
revoke all on function public.get_shared_project(uuid) from public;
grant execute on function public.get_shared_project(uuid) to anon, authenticated;

-- Public reads must go through the token-filtered payload, never raw tables.
drop policy if exists "Public can view projects" on public.projects;
drop policy if exists "Public can view project tracks" on public.project_tracks;
revoke select on public.projects, public.project_tracks from anon;
revoke insert, update, delete on public.projects, public.project_tracks, public.project_updates,
  public.schedule_items, public.project_tasks, public.project_payments, public.invoices,
  public.profiles, public.rate_plans, public.settings from anon;
