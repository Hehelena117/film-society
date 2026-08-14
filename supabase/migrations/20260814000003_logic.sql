-- ============================================================================
-- Film Society — triggers, match logic, cache expiry
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Give every new account a profile row
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text;
  candidate text;
  suffix integer := 0;
begin
  wanted := nullif(trim(new.raw_user_meta_data ->> 'username'), '');

  -- Fall back to something derived from the id rather than failing signup.
  if wanted is null or wanted !~ '^[A-Za-z0-9_]{3,24}$' then
    wanted := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  -- Usernames are unique. Rather than rejecting the signup on a collision,
  -- append a counter and let the user rename themselves later.
  candidate := wanted;
  while exists (select 1 from public.profiles where username = candidate::citext) loop
    suffix := suffix + 1;
    candidate := left(wanted, 20) || suffix::text;
  end loop;

  insert into public.profiles (id, username) values (new.id, candidate);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Seat the creator of a group as its first admin
--
-- Without this, creating a group is impossible: the group_members policy
-- requires you to already be an admin of the group before you may insert a
-- membership row, so nobody could ever insert the first one.
-- ----------------------------------------------------------------------------

create or replace function public.add_group_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger groups_add_creator
  after insert on public.groups
  for each row execute function public.add_group_creator();

-- ----------------------------------------------------------------------------
-- Keep a note's owner honest
--
-- entry_notes.user_id is what RLS checks, so it must always match the owner of
-- the entry it hangs off. Deriving it here means a client cannot write a note
-- onto someone else's entry by supplying its own id.
-- ----------------------------------------------------------------------------

create or replace function public.sync_note_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select user_id into new.user_id from public.log_entries where id = new.entry_id;
  if new.user_id is null then
    raise exception 'No such log entry: %', new.entry_id;
  end if;
  return new;
end;
$$;

create trigger entry_notes_sync_owner
  before insert or update on public.entry_notes
  for each row execute function public.sync_note_owner();

-- ----------------------------------------------------------------------------
-- Match detection
--
-- Two people must agree unanimously. Three or more decide by majority.
-- Evaluated in the database rather than the client so the rule cannot be
-- bent by whoever swipes last, and so every participant learns the result
-- from the same write.
-- ----------------------------------------------------------------------------

create or replace function public.evaluate_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  participants integer;
  likes integer;
  needed integer;
begin
  if not new.liked then
    return new;
  end if;

  select count(*) into participants
    from swipe_participants where session_id = new.session_id;

  if participants = 0 then
    return new;
  end if;

  select count(*) into likes
    from swipes
   where session_id = new.session_id and title_id = new.title_id and liked;

  -- 1–2 participants: everyone. 3+: more than half.
  needed := case
    when participants <= 2 then participants
    else (participants / 2) + 1
  end;

  if likes >= needed then
    update swipe_sessions
       set status = 'decided',
           decided_title_id = new.title_id,
           decided_at = now()
     where id = new.session_id
       and status = 'open';   -- first match wins; later ones are ignored
  end if;

  return new;
end;
$$;

create trigger swipes_evaluate_match
  after insert on public.swipes
  for each row execute function public.evaluate_match();

-- ----------------------------------------------------------------------------
-- TMDB cache expiry
--
-- Their terms forbid caching TMDB content for more than six months.
--
-- This clears the cached CONTENT but keeps the title row and its tmdb_id.
-- Deleting title rows would cascade into log_entries, watchlist_items and
-- favourites — destroying users' own data to satisfy a restriction on TMDB's.
-- The surviving row is an id mapping with no TMDB content in it, and the next
-- read repopulates it.
-- ----------------------------------------------------------------------------

create or replace function public.purge_stale_tmdb_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '6 months';
begin
  delete from title_translations where fetched_at < cutoff;
  delete from title_providers where fetched_at < cutoff;

  delete from title_certifications tc
   using titles t
   where tc.title_id = t.id and t.fetched_at < cutoff;

  update titles
     set year = null,
         poster_path = null,
         backdrop_path = null,
         runtime_minutes = null,
         seasons = null,
         genres = '{}',
         director = null,
         trailer_key = null
   where fetched_at < cutoff;
end;
$$;

-- Schedule it once pg_cron is enabled on the project:
--
--   select cron.schedule('purge-tmdb-cache', '0 4 * * *',
--                        $$select public.purge_stale_tmdb_cache()$$);

-- ----------------------------------------------------------------------------
-- Realtime
--
-- The swipe tables drive the live session; activity drives the group feed.
-- ----------------------------------------------------------------------------

alter publication supabase_realtime add table public.swipes;
alter publication supabase_realtime add table public.swipe_sessions;
alter publication supabase_realtime add table public.swipe_participants;
alter publication supabase_realtime add table public.activity;
