-- Add optional criteria without rewriting existing reviews or form links.
create temporary table feedback_before on commit drop as
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'[]')) as digest from public.event_feedback x;
create temporary table feedback_links_before on commit drop as
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.token)::text,'[]')) as digest from public.event_form_links x;
alter table public.event_feedback
 alter column audience drop not null,
 add column music_rating smallint check(music_rating between 1 and 5),
 add column atmosphere_rating smallint check(atmosphere_rating between 1 and 5),
 add column sound_rating smallint check(sound_rating between 1 and 5),
 add column organization_rating smallint check(organization_rating between 1 and 5);
CREATE OR REPLACE FUNCTION event_tools_private.submit_form(form_token uuid, fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare f public.event_form_links%rowtype; total bigint; recent bigint; submitted uuid;
begin
  if fields is null or jsonb_typeof(fields)<>'object' or octet_length(fields::text)>12000 then raise exception 'Formulaire invalide'; end if;
  select * into f from public.event_form_links where token=form_token for update;
  if not found or not f.is_open then raise exception 'Ce formulaire est fermé ou indisponible'; end if;
  if f.kind='music' then
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent
      from public.guest_music_requests where link_token=form_token;
    if total>=500 or recent>=20 then raise exception 'Trop de demandes, réessayez plus tard'; end if;
    insert into public.guest_music_requests(project_id,link_token,guest_name,title,artist,note)
      values(f.project_id,form_token,trim(coalesce(fields->>'guest_name','')),trim(coalesce(fields->>'title','')),
        trim(coalesce(fields->>'artist','')),trim(coalesce(fields->>'note',''))) returning id into submitted;
  elsif f.kind='feedback' then
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent from public.event_feedback where link_token=form_token;
    if total>=1000 or recent>=20 then raise exception 'Trop de réponses, réessayez plus tard';end if;
    if coalesce(fields->>'rating','') !~ '^[1-5]$' then raise exception 'Choisissez une note globale de 1 à 5.'; end if;
    insert into public.event_feedback(project_id,link_token,rating,audience,respondent,message,music_rating,atmosphere_rating,sound_rating,organization_rating)
      values(f.project_id,form_token,(fields->>'rating')::integer,nullif(fields->>'audience',''),trim(coalesce(fields->>'respondent','')),trim(coalesce(fields->>'comment','')),
        nullif(fields->>'music_rating','')::integer,nullif(fields->>'atmosphere_rating','')::integer,
        nullif(fields->>'sound_rating','')::integer,nullif(fields->>'organization_rating','')::integer) returning id into submitted;
  else
    select count(*),count(*) filter(where created_at>now()-interval '1 minute') into total,recent
      from public.booking_inquiries where link_token=form_token;
    if total>=1000 or recent>=10 then raise exception 'Trop de demandes, réessayez plus tard'; end if;
    if strpos(coalesce(fields->>'email',''),'@')<2 then raise exception 'Adresse email invalide'; end if;
    insert into public.booking_inquiries(link_token,full_name,email,phone,event_date,location,message)
      values(form_token,trim(coalesce(fields->>'full_name','')),trim(fields->>'email'),trim(coalesce(fields->>'phone','')),
        nullif(fields->>'event_date','')::date,trim(coalesce(fields->>'location','')),trim(coalesce(fields->>'message',''))) returning id into submitted;
  end if;
  return submitted;
end $function$;
do $$ declare d text; begin
 select md5(coalesce(jsonb_agg(to_jsonb(x)-array['music_rating','atmosphere_rating','sound_rating','organization_rating'] order by x.id)::text,'[]')) into d from public.event_feedback x;
 if d is distinct from (select digest from feedback_before) then raise exception 'Existing feedback changed';end if;
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.token)::text,'[]')) into d from public.event_form_links x;
 if d is distinct from (select digest from feedback_links_before) then raise exception 'Existing links changed';end if;
end $$;

