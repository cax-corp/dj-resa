-- Save an in-site guest sheet atomically. Installing this function changes no data.
create function public.save_guest_sheet(target_project uuid, entries jsonb, removed_ids uuid[] default array[]::uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; incoming jsonb; current_values jsonb; guest public.project_guests%rowtype; row_id uuid; saved integer:=0; removed integer:=0;
begin
 if auth.uid() is null or not coalesce(public.can_edit_project(target_project),false) then raise exception 'Accès refusé' using errcode='42501';end if;
 if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries)>1000 or coalesce(cardinality(removed_ids),0)>1000 then raise exception 'Enregistrez au maximum 1 000 lignes à la fois';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(entries) x)<>jsonb_array_length(entries) then raise exception 'Identifiants de lignes invalides';end if;
 perform pg_advisory_xact_lock(hashtextextended('guest-sheet:'||target_project::text,0));
 for item in select value from jsonb_array_elements(entries) loop
   row_id:=(item->>'id')::uuid;
   if row_id=any(coalesce(removed_ids,array[]::uuid[])) then raise exception 'Une ligne ne peut pas être modifiée et supprimée à la fois';end if;
   incoming:=jsonb_build_object('full_name',trim(coalesce(item->>'full_name','')),'email',trim(coalesce(item->>'email','')),
     'phone',trim(coalesce(item->>'phone','')),'companions',coalesce((item->>'companions')::integer,0),
     'response',coalesce(item->>'response','pending'),'table_name',trim(coalesce(item->>'table_name','')),
     'dietary',trim(coalesce(item->>'dietary','')),'notes',trim(coalesce(item->>'notes','')));
   if incoming->>'email'<>'' and incoming->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Adresse email invalide pour %',incoming->>'full_name';end if;
   select * into guest from public.project_guests where id=row_id for update;
   if found then
     if guest.project_id<>target_project then raise exception 'Cette ligne appartient à un autre projet' using errcode='42501';end if;
     current_values:=jsonb_build_object('full_name',guest.full_name,'email',guest.email,'phone',guest.phone,'companions',guest.companions,'response',guest.response,'table_name',guest.table_name,'dietary',guest.dietary,'notes',guest.notes);
     if current_values is distinct from incoming and current_values is distinct from item->'original' then
       raise exception 'Cet invité a été modifié ailleurs. Actualisez ou annulez le brouillon avant de réessayer : %',guest.full_name;
     end if;
     update public.project_guests set full_name=incoming->>'full_name',email=incoming->>'email',phone=incoming->>'phone',
       companions=(incoming->>'companions')::integer,response=incoming->>'response',table_name=incoming->>'table_name',dietary=incoming->>'dietary',notes=incoming->>'notes'
       where id=row_id and project_id=target_project;
   else
     if item->'original' is not null and item->'original'<>'null'::jsonb then raise exception 'Un invité du tableau a été supprimé ailleurs. Actualisez votre brouillon.';end if;
     insert into public.project_guests(id,project_id,full_name,email,phone,companions,response,table_name,dietary,notes)
       values(row_id,target_project,incoming->>'full_name',incoming->>'email',incoming->>'phone',(incoming->>'companions')::integer,incoming->>'response',incoming->>'table_name',incoming->>'dietary',incoming->>'notes');
   end if;
   saved:=saved+1;
 end loop;
 delete from public.project_guests where project_id=target_project and id=any(coalesce(removed_ids,array[]::uuid[]));
 get diagnostics removed=row_count;
 return jsonb_build_object('saved',saved,'removed',removed);
end $$;
revoke all on function public.save_guest_sheet(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.save_guest_sheet(uuid,jsonb,uuid[]) to authenticated;
