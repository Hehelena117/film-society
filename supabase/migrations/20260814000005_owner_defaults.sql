-- ============================================================================
-- Default ownership columns to the caller
--
-- log_entries.user_id and entry_notes.user_id were NOT NULL with no default,
-- which forced every client insert to name its own user id. That is noise at
-- best and a footgun at worst — code that has to state who it is invites code
-- that states it wrongly, and it made the generated TypeScript demand a value
-- callers should never have to think about.
--
-- RLS still has the final say: the WITH CHECK on each table requires
-- user_id = auth.uid(), and entry_notes additionally derives its owner from
-- the parent entry via trigger. These defaults just mean the honest value is
-- also the effortless one.
-- ============================================================================

alter table public.log_entries
  alter column user_id set default auth.uid();

alter table public.entry_notes
  alter column user_id set default auth.uid();

-- Same reasoning for the columns that record who did something.
alter table public.watchlists
  alter column owner_id set default auth.uid();

alter table public.watchlist_items
  alter column added_by set default auth.uid();

alter table public.groups
  alter column created_by set default auth.uid();

alter table public.follows
  alter column follower_id set default auth.uid();

alter table public.favourites
  alter column user_id set default auth.uid();

alter table public.swipe_sessions
  alter column created_by set default auth.uid();

alter table public.swipe_participants
  alter column user_id set default auth.uid();

alter table public.swipes
  alter column user_id set default auth.uid();

alter table public.activity
  alter column actor_id set default auth.uid();
