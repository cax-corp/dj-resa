-- Optional idempotent starter grid using the owner's existing general hourly prices.
-- No market price is invented. No existing price or project payment is changed.
insert into public.rate_plans(name,amount,unit,description,event_type)
select c.label || ' — ' || b.label, r.amount, r.unit,
 c.scope || ' ' || b.details || ' Base de devis modifiable selon la prestation.', c.kind
from (values
 ('mariage','Mariage','Inclure préparation, coordination des temps forts, installation, animation et rangement.'),
 ('anniversaire','Anniversaire','Prévoir installation, animation adaptée aux invités et rangement.'),
 ('entreprise','Entreprise','Prévoir prises de parole, coordination du programme et besoins techniques.'),
 ('association','Association','Préciser les animations, les horaires et le matériel nécessaire.'),
 ('soiree_privee','Soirée privée','Préciser l’ambiance, les horaires et la préparation technique.'),
 ('autre','Autre prestation','Définir le périmètre, les horaires et les moyens techniques.')
) c(kind,label,scope)
cross join (values
 ('Normal','Base horaire','Appliquer aux heures de travail convenues.'),
 ('Tard','Heures tardives','Appliquer uniquement aux heures tardives convenues, sans les compter deux fois.')
) b(source_name,label,details)
join lateral (select amount,unit from public.rate_plans where event_type is null and name=b.source_name and unit='heure' order by created_at,id limit 1) r on true
where not exists(select 1 from public.rate_plans existing where existing.event_type=c.kind and existing.name=c.label || ' — ' || b.label);
