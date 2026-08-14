-- ============================================================================
-- Film Society — row-level security
--
-- The app is a public launch with a browser-visible anon key, so RLS is the
-- only thing standing between one user's data and another's. Every table gets
-- it. Nothing is left open "for now".
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Membership helpers
--
-- These are SECURITY DEFINER on purpose. A policy on watchlists that queries
-- watchlist_members would trigger that table's own policy, which queries
-- watchlists, and Postgres raises "infinite recursion detected in policy".
-- Running the check as the definer bypasses RLS inside the function and breaks
-- the cycle. Each one is STABLE and pins search_path so it cannot be shadowed.
-- ----------------------------------------------------------------------------

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.can_read_watchlist(wid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from watchlists w
    where w.id = wid
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1 from watchlist_members m
          where m.watchlist_id = w.id and m.user_id = auth.uid()
        )
        or (
          w.group_id is not null
          and exists (
            select 1 from group_members g
            where g.group_id = w.group_id and g.user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.can_edit_watchlist(wid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from watchlists w
    where w.id = wid
      and (
        w.owner_id = auth.uid()
        or exists (
          select 1 from watchlist_members m
          where m.watchlist_id = w.id and m.user_id = auth.uid() and m.role = 'editor'
        )
        or (
          w.group_id is not null
          and exists (
            select 1 from group_members g
            where g.group_id = w.group_id and g.user_id = auth.uid()
          )
        )
      )
  );
$$;

create or replace function public.is_session_participant(sid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from swipe_participants
    where session_id = sid and user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS everywhere
-- ----------------------------------------------------------------------------

alter table public.profiles              enable row level security;
alter table public.titles                enable row level security;
alter table public.title_translations    enable row level security;
alter table public.title_certifications  enable row level security;
alter table public.title_providers       enable row level security;
alter table public.log_entries           enable row level security;
alter table public.entry_notes           enable row level security;
alter table public.favourites            enable row level security;
alter table public.follows               enable row level security;
alter table public.groups                enable row level security;
alter table public.group_members         enable row level security;
alter table public.watchlists            enable row level security;
alter table public.watchlist_members     enable row level security;
alter table public.watchlist_items       enable row level security;
alter table public.swipe_sessions        enable row level security;
alter table public.swipe_participants    enable row level security;
alter table public.swipe_candidates      enable row level security;
alter table public.swipes                enable row level security;
alter table public.activity              enable row level security;

-- ----------------------------------------------------------------------------
-- Profiles — public to read, yours to change
-- ----------------------------------------------------------------------------

create policy profiles_read on public.profiles
  for select using (true);

create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- Title cache — readable by any signed-in user, written only by the server
--
-- No insert/update/delete policies: the Edge Functions use the service role,
-- which bypasses RLS. Clients can never write to the TMDB cache.
-- ----------------------------------------------------------------------------

create policy titles_read on public.titles
  for select to authenticated using (true);

create policy title_translations_read on public.title_translations
  for select to authenticated using (true);

create policy title_certifications_read on public.title_certifications
  for select to authenticated using (true);

create policy title_providers_read on public.title_providers
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- The watch log — ratings are public, notes are not
-- ----------------------------------------------------------------------------

create policy log_entries_read on public.log_entries
  for select using (true);

create policy log_entries_write_own on public.log_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The only table in the schema with no public read path at all.
create policy entry_notes_own on public.entry_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy favourites_read on public.favourites
  for select using (true);

create policy favourites_write_own on public.favourites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Follows
-- ----------------------------------------------------------------------------

create policy follows_read on public.follows
  for select using (true);

create policy follows_write_own on public.follows
  for all using (follower_id = auth.uid()) with check (follower_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Groups — visible only to members
-- ----------------------------------------------------------------------------

create policy groups_read_members on public.groups
  for select using (public.is_group_member(id));

create policy groups_insert on public.groups
  for insert with check (created_by = auth.uid());

create policy groups_update_admin on public.groups
  for update using (public.is_group_admin(id));

create policy groups_delete_admin on public.groups
  for delete using (public.is_group_admin(id));

create policy group_members_read on public.group_members
  for select using (public.is_group_member(group_id));

-- Admins manage the roster; anyone may remove themselves.
create policy group_members_admin_manage on public.group_members
  for all using (public.is_group_admin(group_id))
  with check (public.is_group_admin(group_id));

create policy group_members_leave on public.group_members
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Watchlists
-- ----------------------------------------------------------------------------

create policy watchlists_read on public.watchlists
  for select using (public.can_read_watchlist(id));

create policy watchlists_insert on public.watchlists
  for insert with check (owner_id = auth.uid());

create policy watchlists_update_owner on public.watchlists
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy watchlists_delete_owner on public.watchlists
  for delete using (owner_id = auth.uid());

create policy watchlist_members_read on public.watchlist_members
  for select using (public.can_read_watchlist(watchlist_id));

create policy watchlist_members_manage on public.watchlist_members
  for all using (
    exists (select 1 from public.watchlists w where w.id = watchlist_id and w.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.watchlists w where w.id = watchlist_id and w.owner_id = auth.uid())
  );

create policy watchlist_items_read on public.watchlist_items
  for select using (public.can_read_watchlist(watchlist_id));

create policy watchlist_items_write on public.watchlist_items
  for all using (public.can_edit_watchlist(watchlist_id))
  with check (public.can_edit_watchlist(watchlist_id));

-- ----------------------------------------------------------------------------
-- Swipe sessions — participants only
-- ----------------------------------------------------------------------------

-- created_by is included so the host can still read a groupless session in the
-- moment between creating it and joining it.
create policy swipe_sessions_read on public.swipe_sessions
  for select using (
    created_by = auth.uid()
    or public.is_session_participant(id)
    or (group_id is not null and public.is_group_member(group_id))
  );

create policy swipe_sessions_insert on public.swipe_sessions
  for insert with check (created_by = auth.uid());

create policy swipe_sessions_update on public.swipe_sessions
  for update using (public.is_session_participant(id));

create policy swipe_participants_read on public.swipe_participants
  for select using (public.is_session_participant(session_id));

-- Joining is self-service; you can only add or remove yourself.
create policy swipe_participants_join on public.swipe_participants
  for insert with check (user_id = auth.uid());

create policy swipe_participants_leave on public.swipe_participants
  for delete using (user_id = auth.uid());

create policy swipe_candidates_read on public.swipe_candidates
  for select using (public.is_session_participant(session_id));

-- Everyone in the session sees everyone's swipes — that is what drives the
-- live match. Privacy here is the session boundary, not the individual swipe.
create policy swipes_read on public.swipes
  for select using (public.is_session_participant(session_id));

create policy swipes_insert_own on public.swipes
  for insert with check (user_id = auth.uid() and public.is_session_participant(session_id));

-- ----------------------------------------------------------------------------
-- Activity — group members only
-- ----------------------------------------------------------------------------

create policy activity_read on public.activity
  for select using (public.is_group_member(group_id));

create policy activity_insert on public.activity
  for insert with check (actor_id = auth.uid() and public.is_group_member(group_id));
