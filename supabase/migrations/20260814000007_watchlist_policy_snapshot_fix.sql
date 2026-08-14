-- ============================================================================
-- Fix: a watchlist could be created but not read back
--
-- watchlists' SELECT policy called can_read_watchlist(id), which does
--   select ... from watchlists where id = wid
-- i.e. it looks the row up by id. During INSERT ... RETURNING that row is not
-- yet visible to the statement's own snapshot, so the lookup finds nothing,
-- the policy returns false, the returned row is filtered out, and PostgREST
-- reports "new row violates row-level security policy" — pointing at WITH
-- CHECK, which was never the problem. Exactly the same trap as create_group,
-- for a different reason: there a trigger had not fired yet, here the row is
-- invisible to itself.
--
-- The lesson generalises: a SELECT policy must decide using the columns of the
-- row it is handed, never by re-reading its own table.
--
-- These helpers take the row's values as arguments instead. They stay SECURITY
-- DEFINER so the membership lookups inside them bypass RLS and cannot recurse.
-- ============================================================================

create or replace function public.can_read_watchlist_row(
  p_id uuid,
  p_owner uuid,
  p_group uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_owner = auth.uid()
    or exists (
      select 1 from watchlist_members m
      where m.watchlist_id = p_id and m.user_id = auth.uid()
    )
    or (
      p_group is not null
      and exists (
        select 1 from group_members g
        where g.group_id = p_group and g.user_id = auth.uid()
      )
    );
$$;

create or replace function public.can_edit_watchlist_row(
  p_id uuid,
  p_owner uuid,
  p_group uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    p_owner = auth.uid()
    or exists (
      select 1 from watchlist_members m
      where m.watchlist_id = p_id and m.user_id = auth.uid() and m.role = 'editor'
    )
    or (
      p_group is not null
      and exists (
        select 1 from group_members g
        where g.group_id = p_group and g.user_id = auth.uid()
      )
    );
$$;

drop policy if exists watchlists_read on public.watchlists;

create policy watchlists_read on public.watchlists
  for select using (public.can_read_watchlist_row(id, owner_id, group_id));

-- watchlist_members and watchlist_items keep using the id-based helpers: by the
-- time anything touches those, the parent watchlist row is committed and
-- visible, so the lookup is sound there.
