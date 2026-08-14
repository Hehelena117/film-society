-- ============================================================================
-- create_group()
--
-- Creating a group and reading it back in one statement could not work.
--
-- groups' SELECT policy is is_group_member(id), and the creator only becomes a
-- member via an AFTER INSERT trigger. Postgres evaluates RETURNING before
-- AFTER-row triggers fire, so at that instant the creator is not yet a member,
-- the row is filtered out, and PostgREST surfaces it as
--   "new row violates row-level security policy for table groups"
-- which points at WITH CHECK — the one thing that was fine. Inserting without
-- RETURNING succeeded all along.
--
-- The obvious patch is to add `or created_by = auth.uid()` to the SELECT
-- policy, but that leaks: someone who creates a group and later leaves would
-- keep seeing it forever. Instead, do the whole thing in one authoritative
-- function that runs as definer and hands back the id.
-- ============================================================================

create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in';
  end if;

  if group_name is null or btrim(group_name) = '' then
    raise exception 'A group needs a name';
  end if;

  insert into groups (name, created_by)
  values (btrim(group_name), caller)
  returning id into new_id;

  -- The groups_add_creator trigger has seated the caller as admin by now.
  return new_id;
end;
$$;

revoke execute on function public.create_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
