-- ============================================================================
-- Row-level security for the book half
--
-- Mirrors 20260814000002_rls.sql, and carries the same hard-won rules:
--
--   · A SELECT policy must never re-read its own table by id. During
--     INSERT ... RETURNING the new row is invisible to its own snapshot, so
--     the insert fails with an error blaming WITH CHECK, which is fine.
--     Hence can_read_reading_list_row(id, owner, group) taking the values.
--
--   · Every table needs a policy for every verb it is used with. A table with
--     RLS on and only a read policy silently rejects writes — that is how the
--     film side's swipe deck was dead for a week under a green test suite.
--
--   · Reading progress and notes are owner-only. Progress is not private in
--     the way a note is, but "she is 12% into it" is nobody else's business.
-- ============================================================================

alter table public.books                          enable row level security;
alter table public.book_translations              enable row level security;
alter table public.book_log_entries               enable row level security;
alter table public.book_entry_notes               enable row level security;
alter table public.book_progress                  enable row level security;
alter table public.reading_lists                  enable row level security;
alter table public.reading_list_items             enable row level security;
alter table public.reading_list_members           enable row level security;
alter table public.book_swipe_sessions            enable row level security;
alter table public.book_swipe_participants        enable row level security;
alter table public.book_swipe_candidates          enable row level security;
alter table public.book_swipes                    enable row level security;
alter table public.book_activity                  enable row level security;
alter table public.book_recommendation_feedback   enable row level security;

-- ----------------------------------------------------------------------------
-- The cache: everyone reads, nobody writes
--
-- Writes go through the `books` edge function, exactly as the titles cache
-- goes through `catalog`. One door means one place where a malformed row can
-- come from.
-- ----------------------------------------------------------------------------

create policy books_read on public.books
  for select to authenticated using (true);

create policy book_translations_read on public.book_translations
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- The reading log — ratings are public, dates and notes are not
-- ----------------------------------------------------------------------------

-- Owner-only, like log_entries. finished_on says when you were reading, which
-- is the same class of thing as a watch date. A narrow view republishes the
-- ratings below.
create policy book_log_entries_own on public.book_log_entries
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No public read path at all. The only other table in the schema like this is
-- entry_notes, and for the same reason.
create policy book_entry_notes_own on public.book_entry_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy book_progress_own on public.book_progress
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace view public.public_book_ratings
with (security_invoker = false) as
  select distinct on (user_id, book_id)
    user_id,
    book_id,
    rating
  from public.book_log_entries
  where rating is not null
  order by user_id, book_id, created_at desc;

comment on view public.public_book_ratings is
  'Public projection of book_log_entries: latest rating per book per user. '
  'Intentionally SECURITY DEFINER — the table itself is owner-only so that '
  'reading dates stay private. Do not add date columns to this view.';

create or replace view public.public_book_counts
with (security_invoker = false) as
  select user_id, count(distinct book_id) as books_read
  from public.book_log_entries
  group by user_id;

grant select on public.public_book_ratings to anon, authenticated;
grant select on public.public_book_counts to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Reading lists
-- ----------------------------------------------------------------------------

-- Takes the row's values rather than looking them up, so it can be evaluated
-- against a row that is not committed yet. See the header.
create or replace function public.can_read_reading_list_row(
  p_id uuid,
  p_owner uuid,
  p_group uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_owner = auth.uid()
    or exists (
      select 1 from reading_list_members m
      where m.list_id = p_id and m.user_id = auth.uid()
    )
    or (
      p_group is not null
      and exists (
        select 1 from group_members g
        where g.group_id = p_group and g.user_id = auth.uid()
      )
    );
$$;

-- By the time anything touches items or members, the parent list is committed,
-- so those may look it up by id.
create or replace function public.can_read_reading_list(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from reading_lists l
    where l.id = p_id
      and public.can_read_reading_list_row(l.id, l.owner_id, l.group_id)
  );
$$;

create policy reading_lists_read on public.reading_lists
  for select using (public.can_read_reading_list_row(id, owner_id, group_id));

create policy reading_lists_write_own on public.reading_lists
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy reading_list_items_read on public.reading_list_items
  for select using (public.can_read_reading_list(list_id));

create policy reading_list_items_write on public.reading_list_items
  for all using (public.can_read_reading_list(list_id))
  with check (public.can_read_reading_list(list_id));

create policy reading_list_members_read on public.reading_list_members
  for select using (public.can_read_reading_list(list_id));

-- Only the owner hands out access, or you may remove yourself.
create policy reading_list_members_write on public.reading_list_members
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from reading_lists l where l.id = list_id and l.owner_id = auth.uid()
    )
  )
  with check (
    exists (select 1 from reading_lists l where l.id = list_id and l.owner_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Deciding together
-- ----------------------------------------------------------------------------

create or replace function public.can_join_book_session(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from book_swipe_sessions s
    join reading_lists l on l.id = s.list_id
    where s.id = p_session
      and (
        s.created_by = auth.uid()
        or public.can_read_reading_list_row(l.id, l.owner_id, l.group_id)
      )
  );
$$;

create policy book_swipe_sessions_read on public.book_swipe_sessions
  for select using (public.can_read_reading_list(list_id));

create policy book_swipe_sessions_write on public.book_swipe_sessions
  for all using (created_by = auth.uid())
  with check (public.can_read_reading_list(list_id));

create policy book_swipe_participants_read on public.book_swipe_participants
  for select using (public.can_join_book_session(session_id));

create policy book_swipe_participants_join on public.book_swipe_participants
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_join_book_session(session_id));

create policy book_swipe_candidates_read on public.book_swipe_candidates
  for select using (public.can_join_book_session(session_id));

-- The film side shipped without this one and the whole feature was dead: RLS
-- was on, only a read policy existed, and the test that should have caught it
-- inserted candidates without checking the error.
create policy book_swipe_candidates_write on public.book_swipe_candidates
  for all using (public.can_join_book_session(session_id))
  with check (public.can_join_book_session(session_id));

create policy book_swipes_read on public.book_swipes
  for select using (public.can_join_book_session(session_id));

create policy book_swipes_write_own on public.book_swipes
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_join_book_session(session_id));

-- ----------------------------------------------------------------------------
-- The group feed
-- ----------------------------------------------------------------------------

create policy book_activity_read on public.book_activity
  for select using (
    exists (
      select 1 from group_members g
      where g.group_id = book_activity.group_id and g.user_id = auth.uid()
    )
  );

create policy book_activity_write_own on public.book_activity
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from group_members g
      where g.group_id = book_activity.group_id and g.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Shelf feedback — a private instruction, about books usually not yet read
-- ----------------------------------------------------------------------------

create policy book_recommendation_feedback_own on public.book_recommendation_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
