-- Keep the chosen commercial unit in the project snapshot independently of the catalog.
alter table public.project_payments add column addon_unit text not null default 'forfait' check(addon_unit in ('forfait','heure','unite'));
