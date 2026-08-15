-- ============================================================================
-- Avatar storage
--
-- Public bucket: avatars appear next to usernames on public profiles, so
-- there is nothing to protect in the file itself. What must be protected is
-- who can write one — enforced by pinning the top-level folder to the
-- uploader's own id.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB; an avatar is displayed at 96px
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at an avatar.
create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

-- You may only write inside a folder named after your own user id, so one
-- person cannot overwrite another's avatar by guessing the path.
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
