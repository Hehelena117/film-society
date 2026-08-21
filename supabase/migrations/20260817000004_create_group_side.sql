-- ============================================================================
-- create_group() has to know which half it is making a group for
--
-- The RPC exists because RETURNING is evaluated before the AFTER-insert
-- trigger seats the creator, so a plain insert fails the SELECT policy — see
-- 20260814000006. It predates there being two sides, so every group it made
-- landed on the film side by default.
--
-- The old one-argument version is DROPPED rather than left alongside this one.
-- `create or replace` with an extra parameter does not replace anything — it
-- adds an overload, and two overloads that differ only by a defaulted argument
-- make every call ambiguous. (Postgres says so plainly: "function name is not
-- unique". PostgREST would have had to guess.)
--
-- The new argument is defaulted, so the film side's one-argument calls keep
-- working untouched.
-- ============================================================================

drop function if exists public.create_group(text);
drop function if exists public.create_group(text, text);

create function public.create_group(group_name text, group_side text default 'film')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if group_side not in ('film', 'book') then
    raise exception 'Unknown side: %', group_side;
  end if;

  insert into public.groups (name, side, created_by)
  values (group_name, group_side, auth.uid())
  returning id into new_id;

  -- Returns only the id: reading the row back inside the same statement is
  -- exactly what did not work.
  return new_id;
end;
$$;

comment on function public.create_group(text, text) is
  'Creates a group on one side and returns its id.';
