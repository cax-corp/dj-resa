-- Optional tariff catalog. Existing prices, quotes, invoices and share links are unchanged.
create temporary table addon_preservation(table_name text primary key,digest text) on commit drop;
do $$declare t text;d text;begin
 foreach t in array array['projects','rate_plans','project_payments','invoices','project_shares'] loop
 execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,''[]'')) from public.%I x',t) into d;
 insert into addon_preservation values(t,d);
 end loop;
end $$;
create table public.rate_addons(
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 200),
 amount numeric(12,2) check(amount between 0 and 1000000),
 unit text not null default 'forfait' check(unit in ('forfait','heure','unite')),
 description text not null default '' check(length(description)<=2000),
 event_type text check(event_type in ('mariage','anniversaire','entreprise','association','soiree_privee','autre')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.rate_addons enable row level security;
revoke all on public.rate_addons from public,anon,authenticated;
grant select,insert,update,delete on public.rate_addons to authenticated;
create policy "Admin tariff options" on public.rate_addons for all to authenticated using((select public.is_admin())) with check((select public.is_admin()));

alter table public.project_payments
 add column is_addon boolean not null default false,
 add column addon_id uuid references public.rate_addons(id) on delete set null,
 add column addon_description text not null default '' check(length(addon_description)<=2000),
 add constraint project_payment_addon_values check(not is_addon or (
  not is_base and quantity is not null and quantity>0 and quantity<=1000000 and
  unit_price is not null and unit_price>=0 and unit_price<=1000000 and
  amount>=0 and amount<=99999999.99 and amount=round(quantity*unit_price,2) and
  length(trim(label)) between 1 and 200));
create index project_payments_addon_idx on public.project_payments(addon_id) where addon_id is not null;

insert into public.rate_addons(name,description,unit) values
 ('Accès au logiciel Syntra','Mise à disposition de l’espace projet pour centraliser la préparation et les échanges. Périmètre à préciser avec le client.','forfait'),
 ('Coordination de l’événement','Coordination du programme et des intervenants selon le périmètre convenu.','forfait'),
 ('Sonorisation supplémentaire','Ajout d’un espace ou de moyens de sonorisation à la prestation de base.','forfait'),
 ('Éclairage d’ambiance','Éclairage décoratif ou ambiance lumineuse complémentaire.','forfait'),
 ('Préparation musicale personnalisée','Préparation complémentaire de la sélection musicale, des montages ou des temps forts.','forfait'),
 ('Installation et rangement supplémentaires','Temps supplémentaire d’installation ou de rangement convenu avec le client.','heure'),
 ('Déplacement supplémentaire','Déplacement complémentaire selon les modalités convenues.','forfait');

do $$declare r record;d text;begin
 for r in select * from addon_preservation loop
 if r.table_name='project_payments' then
  select md5(coalesce(jsonb_agg(to_jsonb(x)-array['is_addon','addon_id','addon_description'] order by (to_jsonb(x)-array['is_addon','addon_id','addon_description'])::text)::text,'[]')) into d from public.project_payments x;
 else
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text)::text,''[]'')) from public.%I x',r.table_name) into d;
 end if;
 if d is distinct from r.digest then raise exception 'Existing data changed: %',r.table_name;end if;
 end loop;
end $$;
