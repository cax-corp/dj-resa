-- Additive upgrade. Preserve every existing project, status, share and public payload.
do $$
declare
  before_projects text;
  before_shares text;
  before_payloads text;
  after_projects text;
  after_shares text;
  after_payloads text;
begin
  -- Prevent concurrent edits during the preservation check.
  lock table public.projects, public.project_shares in share row exclusive mode;
  select md5(coalesce(jsonb_agg(to_jsonb(p) order by p.id)::text, '[]')) into before_projects from public.projects p;
  select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.token)::text, '[]')) into before_shares from public.project_shares s;
  select md5(coalesce(jsonb_agg(public.get_shared_project(s.token) order by s.token)::text, '[]')) into before_payloads from public.project_shares s;

  alter table public.projects add column archived_at timestamptz default null;
  alter table public.projects drop constraint projects_status_check;
  alter table public.projects add constraint projects_status_check
    check (status in ('nouveau', 'preparation', 'valide', 'en_cours', 'termine'));

  select md5(coalesce(jsonb_agg(to_jsonb(p) - 'archived_at' order by p.id)::text, '[]')) into after_projects from public.projects p;
  select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.token)::text, '[]')) into after_shares from public.project_shares s;
  select md5(coalesce(jsonb_agg(public.get_shared_project(s.token) order by s.token)::text, '[]')) into after_payloads from public.project_shares s;
  if before_projects is distinct from after_projects or before_shares is distinct from after_shares
     or before_payloads is distinct from after_payloads then
    raise exception 'Preservation check failed: rolling back archive upgrade';
  end if;
end $$;
