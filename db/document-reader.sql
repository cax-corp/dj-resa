-- New share links are explicit, file-scoped and revocable. No existing file or link changes.
create table public.document_read_links(
 id uuid primary key default gen_random_uuid(),token uuid not null unique default gen_random_uuid(),
 document_id uuid not null references public.project_documents(id) on delete cascade,
 active boolean not null default true,expires_at timestamptz,created_at timestamptz not null default now()
);
alter table public.document_read_links enable row level security;
revoke all on public.document_read_links from public,anon,authenticated;
grant select,insert,update,delete on public.document_read_links to authenticated;
grant select on public.document_read_links to service_role;
create policy "Document sharing admin" on public.document_read_links for all to authenticated
 using((select public.is_admin())) with check((select public.is_admin()));
create index document_read_links_document_idx on public.document_read_links(document_id);
create unique index document_read_links_one_active_idx on public.document_read_links(document_id) where active;
