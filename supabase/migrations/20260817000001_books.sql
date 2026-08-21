-- ============================================================================
-- The book half
--
-- Two sealed worlds under one account: what you read and what you watch never
-- mix, and each side has its own groups, its own people, its own profile.
--
-- HOW THAT IS BUILT, and why it is not one big table with a flag:
--
--   · Anything that points at a work gets its own table. A log entry has to
--     reference either a title or a book, and a foreign key cannot point at
--     two tables — faking it with a nullable pair and a check constraint gives
--     up the one guarantee the database was doing for us for free.
--
--   · Anything that points only at people gets a `side` column instead. Groups
--     and follows are just sets of people, so duplicating them would duplicate
--     every policy and every bug fix for no gain.
--
-- WHAT IS DIFFERENT FROM THE FILM SIDE:
--
--   Open Library's data is public domain and its API needs no key, so none of
--   the TMDB constraints apply here. There is no six-month purge, no ban on
--   derivative works, and no reason to keep book data out of a model prompt.
--   The books cache can simply be a cache. See docs/DECISIONS.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Which side you were last on
-- ----------------------------------------------------------------------------

-- The chooser after login is shown once and then remembered. Null means it has
-- not been chosen yet, which is what makes the chooser appear the first time.
alter table public.profiles
  add column if not exists last_side text
    check (last_side in ('film', 'book'));

-- Sending your own notes to the recommender is opt-in, and the two sides are
-- separate — book notes tend to be more personal than film notes, and someone
-- may reasonably want one and not the other.
alter table public.profiles
  add column if not exists use_book_notes_for_recommendations boolean not null default false;

comment on column public.profiles.use_book_notes_for_recommendations is
  'Opt-in, independent of use_notes_for_recommendations. Default false. Never '
  'enable for a user by any route but their own explicit choice in settings.';

-- ----------------------------------------------------------------------------
-- Books — the Open Library cache
--
-- Keyed by the WORK, not an edition. You read "The Fellowship of the Ring",
-- not a particular 1994 paperback of it, and tracking editions would ask a
-- question at every logging that almost nobody wants to answer.
-- ----------------------------------------------------------------------------

create table if not exists public.books (
  id bigint generated always as identity primary key,

  -- Open Library work key, e.g. "OL27448W". Their permanent identifier.
  ol_key text not null unique,

  title text not null,
  authors text[] not null default '{}',
  first_published_year smallint,

  -- Open Library serves cover art by id: /b/id/<cover_id>-L.jpg
  cover_id integer,

  -- Missing often enough that nothing may depend on it — which is exactly why
  -- reading progress is a percentage rather than a page number.
  pages smallint,

  subjects text[] not null default '{}',

  -- Present for most series, absent for some. Position is text, not a number:
  -- Open Library stores things like "1-3" for an omnibus.
  series_name text,
  series_position text,

  description text,
  fetched_at timestamptz not null default now()
);

create index if not exists books_title_idx on public.books using gin (to_tsvector('simple', title));

-- Localised titles, same shape as title_translations. Open Library search
-- returns whichever edition ranks first in ANY language — a search for Crime
-- and Punishment comes back as Преступление и наказание — so the language a
-- name was fetched for has to be recorded with it.
create table if not exists public.book_translations (
  book_id bigint not null references public.books (id) on delete cascade,
  language text not null check (language in ('en', 'da', 'es')),
  title text not null,
  description text,
  fetched_at timestamptz not null default now(),
  primary key (book_id, language)
);

-- ----------------------------------------------------------------------------
-- The reading log
-- ----------------------------------------------------------------------------

-- No unique constraint on (user_id, book_id): rereading is a first-class thing
-- here for the same reason rewatching is on the film side.
create table if not exists public.book_log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,

  rating smallint check (rating between 1 and 10),
  finished_on date,

  created_at timestamptz not null default now()
);

create index if not exists book_log_entries_user_idx
  on public.book_log_entries (user_id, created_at desc);

-- Its own table, with no public read path, for the same reason entry_notes has
-- one: "notes are always private" is then a property of the schema rather than
-- a policy detail on an otherwise-public table.
create table if not exists public.book_entry_notes (
  entry_id uuid primary key references public.book_log_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Currently reading
--
-- The one thing the book side has that the film side does not. A film is an
-- evening; a book is three weeks, and "what am I in the middle of" is half the
-- reason to keep a reading log at all.
--
-- Percentage rather than page number: Open Library's page count is missing
-- often enough that a page-based bar would be broken for real books, and a
-- percentage works for audiobooks and e-readers too.
-- ----------------------------------------------------------------------------

create table if not exists public.book_progress (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,

  percent smallint not null default 0 check (percent between 0 and 100),

  started_on date not null default current_date,
  updated_at timestamptz not null default now(),

  primary key (user_id, book_id)
);

-- ----------------------------------------------------------------------------
-- Reading lists — the watchlist equivalent
-- ----------------------------------------------------------------------------

create table if not exists public.reading_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.reading_list_items (
  list_id uuid not null references public.reading_lists (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  added_by uuid default auth.uid() references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (list_id, book_id)
);

create table if not exists public.reading_list_members (
  list_id uuid not null references public.reading_lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (list_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Groups and follows belong to one side
--
-- Both are sets of people and neither points at a work, so they take a column
-- rather than a second copy of themselves. Defaulting to 'film' is what keeps
-- every group and every follow that already exists exactly where it was.
-- ----------------------------------------------------------------------------

alter table public.groups
  add column if not exists side text not null default 'film'
    check (side in ('film', 'book'));

alter table public.follows
  add column if not exists side text not null default 'film'
    check (side in ('film', 'book'));

-- Following someone for books is a different act from following them for
-- films, so the pair alone is no longer unique. Dropping and rebuilding the
-- key rather than adding a second index: the primary key IS the rule here.
alter table public.follows drop constraint if exists follows_pkey;
alter table public.follows add primary key (follower_id, followee_id, side);

-- ----------------------------------------------------------------------------
-- Deciding together, on the book side
-- ----------------------------------------------------------------------------

create table if not exists public.book_swipe_sessions (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.reading_lists (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  decided_book_id bigint references public.books (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.book_swipe_participants (
  session_id uuid not null references public.book_swipe_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.book_swipe_candidates (
  session_id uuid not null references public.book_swipe_sessions (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  position smallint not null,
  primary key (session_id, book_id)
);

create table if not exists public.book_swipes (
  session_id uuid not null references public.book_swipe_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, book_id)
);

-- ----------------------------------------------------------------------------
-- What a group sees of its members' reading
-- ----------------------------------------------------------------------------

create table if not exists public.book_activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,

  -- Deliberately no 'progress' kind. A feed that announced "now 34%" every
  -- time someone picked their book up would bury the things worth reading.
  kind text not null check (kind in ('rated', 'added', 'decided', 'joined', 'started')),

  book_id bigint references public.books (id) on delete cascade,
  list_id uuid references public.reading_lists (id) on delete cascade,
  rating smallint check (rating between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists book_activity_group_idx
  on public.book_activity (group_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Steering the book shelf
-- ----------------------------------------------------------------------------

create table if not exists public.book_recommendation_feedback (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  ol_key text not null,
  title text not null,
  authors text[] not null default '{}',
  year smallint,
  verdict text not null check (verdict in ('more', 'less')),
  created_at timestamptz not null default now(),
  primary key (user_id, ol_key)
);

create index if not exists book_recommendation_feedback_user_idx
  on public.book_recommendation_feedback (user_id, verdict);
