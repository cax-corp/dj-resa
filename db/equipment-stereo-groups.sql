-- Atomic grouping updates metadata on the two existing sockets only, preserving IDs and saved plans.
create function public.set_equipment_stereo_group(gear_id uuid,left_id uuid,right_id uuid,group_label text,mono_when_right_empty boolean default true)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.equipment_audio_ports%rowtype;r public.equipment_audio_ports%rowtype;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Accès administrateur requis' using errcode='42501';end if;
 if gear_id is null or left_id is null or right_id is null or left_id=right_id or group_label is null or length(trim(group_label)) not between 1 and 100 or mono_when_right_empty is null then raise exception 'Groupe invalide';end if;
 perform pg_advisory_xact_lock(hashtextextended('audio-groups:'||gear_id::text,0));
 perform id from public.equipment_audio_ports where equipment_id=gear_id and id in(left_id,right_id) order by id for update;
 select * into l from public.equipment_audio_ports where id=left_id and equipment_id=gear_id;
 select * into r from public.equipment_audio_ports where id=right_id and equipment_id=gear_id;
 if l.id is null or r.id is null or l.direction<>r.direction or l.channels<>1 or r.channels<>1 or (mono_when_right_empty and l.direction<>'in') or exists(select 1 from jsonb_array_elements(l.alternatives||r.alternatives) a where (a->>'channels')::integer<>1) then raise exception 'Choisissez deux prises mono du même appareil et du même sens';end if;
 if exists(select 1 from public.equipment_audio_ports p where p.equipment_id=gear_id and p.direction=l.direction and p.id not in(left_id,right_id) and p.audio_role in('left','left_mono','right') and (p.group_name=trim(group_label) or (l.group_name<>'' and p.group_name=l.group_name and l.audio_role in('left','left_mono','right')) or (r.group_name<>'' and p.group_name=r.group_name and r.audio_role in('left','left_mono','right')))) then raise exception 'Une prise ou ce nom appartient déjà à un autre groupe. Dissociez-le d’abord.';end if;
 update public.equipment_audio_ports set group_name=trim(group_label),audio_role=case when id=left_id then case when mono_when_right_empty then 'left_mono' else 'left' end else 'right' end where equipment_id=gear_id and id in(left_id,right_id);
end; $$;
revoke all on function public.set_equipment_stereo_group(uuid,uuid,uuid,text,boolean) from public,anon;
grant execute on function public.set_equipment_stereo_group(uuid,uuid,uuid,text,boolean) to authenticated;
create function public.clear_equipment_stereo_group(gear_id uuid,left_id uuid,right_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare l public.equipment_audio_ports%rowtype;r public.equipment_audio_ports%rowtype;begin
 if not coalesce(public.is_admin(),false) then raise exception 'Accès administrateur requis' using errcode='42501';end if;
 if gear_id is null or left_id is null or right_id is null or left_id=right_id then raise exception 'Groupe invalide';end if;
 perform pg_advisory_xact_lock(hashtextextended('audio-groups:'||gear_id::text,0));
 perform id from public.equipment_audio_ports where equipment_id=gear_id and id in(left_id,right_id) order by id for update;
 select * into l from public.equipment_audio_ports where id=left_id and equipment_id=gear_id;
 select * into r from public.equipment_audio_ports where id=right_id and equipment_id=gear_id;
 if l.id is null or r.id is null or l.direction<>r.direction or l.group_name='' or l.group_name<>r.group_name or l.audio_role not in('left','left_mono') or r.audio_role<>'right' then raise exception 'Le groupe a changé. Rechargez sa fiche.';end if;
 update public.equipment_audio_ports set group_name='',audio_role='independent' where equipment_id=gear_id and id in(left_id,right_id);
end; $$;
revoke all on function public.clear_equipment_stereo_group(uuid,uuid,uuid) from public,anon;
grant execute on function public.clear_equipment_stereo_group(uuid,uuid,uuid) to authenticated;
