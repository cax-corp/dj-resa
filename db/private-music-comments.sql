-- Accepting a suggestion transfers only its song, never a private guest message.
create or replace function public.accept_guest_music_track() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.status='accepted' then
   perform 1 from public.projects where id=new.project_id for update;
   if not exists(select 1 from public.project_tracks where project_id=new.project_id and kind='must_play'
       and lower(trim(title))=lower(trim(new.title)) and lower(trim(artist))=lower(trim(new.artist))) then
     insert into public.project_tracks(project_id,kind,title,artist,note,guest_request_id)
       values(new.project_id,'must_play',new.title,new.artist,null,new.id);
   end if;
 end if;
 return new;
end $$;
