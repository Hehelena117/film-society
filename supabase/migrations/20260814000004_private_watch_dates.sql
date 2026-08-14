-- ============================================================================
-- Make watch dates private
--
-- log_entries was world-readable so that public profiles could show ratings.
-- That also exposed watched_on, season_number and created_at — i.e. when
-- someone watched a thing and how far into a series they are.
--
-- Column-level grants cannot fix this: they are per-ROLE, and every signed-in
-- user shares the `authenticated` role, so revoking a column from the public
-- would also hide it from its own owner.
--
-- So the table becomes owner-only, and a narrow view republishes just the part
-- a profile actually needs.
-- ============================================================================

-- Owner-only from here on. The surviving log_entries_write_own policy is
-- FOR ALL, so it already grants owners their own SELECT.
drop policy if exists log_entries_read on public.log_entries;

-- ----------------------------------------------------------------------------
-- What a profile may show
--
-- security_invoker = false is deliberate. The view runs as its owner and so
-- bypasses the owner-only policy above — that is the entire point: it is the
-- one controlled window onto the table, and it selects three columns.
-- created_at is used for ordering and never projected.
--
-- DISTINCT ON collapses rewatches to the most recent rating per title, so a
-- profile shows what someone currently thinks of a film, not every pass.
-- ----------------------------------------------------------------------------

create view public.public_ratings
with (security_invoker = false) as
  select distinct on (user_id, title_id)
    user_id,
    title_id,
    rating
  from public.log_entries
  where rating is not null
  order by user_id, title_id, created_at desc;

comment on view public.public_ratings is
  'Public projection of log_entries: latest rating per title per user. '
  'Intentionally SECURITY DEFINER — log_entries itself is owner-only so that '
  'watch dates stay private. Do not add date columns to this view.';

-- How many distinct titles someone has logged. A count leaks nothing about
-- when, and profiles need it.
create view public.public_watch_counts
with (security_invoker = false) as
  select
    user_id,
    count(distinct title_id) as titles_watched
  from public.log_entries
  group by user_id;

comment on view public.public_watch_counts is
  'Public projection of log_entries: distinct titles logged per user. '
  'Intentionally SECURITY DEFINER — see public_ratings.';

grant select on public.public_ratings to anon, authenticated;
grant select on public.public_watch_counts to anon, authenticated;
