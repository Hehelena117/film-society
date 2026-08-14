-- ============================================================================
-- Film Society — schema
--
-- Shape follows the product decisions in docs/DECISIONS.md:
--   · ratings are whole numbers 1–10
--   · rewatches are first-class — a film can be logged many times
--   · notes are ALWAYS private
--   · TV is tracked per season, never per episode
--   · the activity feed exists only inside a group
--   · TMDB content may not be cached longer than six months
-- ============================================================================

create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Profiles
-- ----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  -- Username doubles as the display name. citext gives case-insensitive
  -- uniqueness, so "Jesper" and "jesper" cannot both be taken.
  username citext not null unique
    check (char_length(username) between 3 and 24 and username ~ '^[A-Za-z0-9_]+$'),

  avatar_url text,
  bio text check (char_length(bio) <= 300),

  -- Drives which certifications and streaming providers we show.
  country char(2) not null default 'DK',
  language text not null default 'en' check (language in ('en', 'da', 'es')),
  theme text not null default 'lobby'
    check (theme in ('lobby', 'marquee', 'velvet', 'night')),

  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Titles — the TMDB cache
--
-- TMDB reuses ids across media types: the same integer can be a movie and an
-- unrelated series. The natural key is therefore (tmdb_id, media_type), with a
-- surrogate id so everything else has one column to point at.
-- ----------------------------------------------------------------------------

create table public.titles (
  id bigint generated always as identity primary key,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv')),

  year smallint,
  poster_path text,
  backdrop_path text,
  runtime_minutes smallint,
  seasons smallint,
  genres text[] not null default '{}',
  director text,
  trailer_key text,
  imdb_id text,

  -- Drives the six-month purge required by TMDB's terms.
  fetched_at timestamptz not null default now(),

  unique (tmdb_id, media_type)
);

create index titles_fetched_at_idx on public.titles (fetched_at);

-- Localised text, kept per language. We store TMDB's own translations rather
-- than translating anything ourselves — machine-translating their text would
-- be a derivative work, which their terms prohibit.
create table public.title_translations (
  title_id bigint not null references public.titles (id) on delete cascade,
  language text not null check (language in ('en', 'da', 'es')),
  name text not null,
  overview text,
  fetched_at timestamptz not null default now(),
  primary key (title_id, language)
);

-- Age certification only. The detailed IMDb-style severity breakdown is a paid
-- licence and is deliberately out of scope.
create table public.title_certifications (
  title_id bigint not null references public.titles (id) on delete cascade,
  country char(2) not null,
  certification text not null,
  primary key (title_id, country)
);

-- Streaming availability. Sourced from TMDB, which sources it from JustWatch —
-- attribution to JustWatch is required wherever this is displayed.
create table public.title_providers (
  title_id bigint not null references public.titles (id) on delete cascade,
  country char(2) not null,
  provider_id integer not null,
  provider_name text not null,
  logo_path text,
  offer_type text not null check (offer_type in ('flatrate', 'rent', 'buy', 'ads', 'free')),
  fetched_at timestamptz not null default now(),
  primary key (title_id, country, provider_id, offer_type)
);

-- ----------------------------------------------------------------------------
-- The watch log
-- ----------------------------------------------------------------------------

-- No unique constraint on (user_id, title_id): that absence is what makes
-- rewatches work. Each viewing is its own row with its own date and rating.
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,

  rating smallint check (rating between 1 and 10),
  watched_on date,
  season_number smallint check (season_number > 0),

  created_at timestamptz not null default now()
);

create index log_entries_user_idx on public.log_entries (user_id, created_at desc);
create index log_entries_title_idx on public.log_entries (title_id);

-- Notes live in their own table on purpose.
--
-- "Notes are always private" is then a property of the schema rather than a
-- policy detail on an otherwise-public table — there is no query shape, view,
-- or forgotten column grant that can leak them alongside a public rating.
create table public.entry_notes (
  entry_id uuid primary key references public.log_entries (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) <= 4000),
  updated_at timestamptz not null default now()
);

create table public.favourites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  position smallint not null default 0,
  primary key (user_id, title_id)
);

-- ----------------------------------------------------------------------------
-- Social
-- ----------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id);

-- Named groups, in the WhatsApp sense: a group is just people plus a name.
-- "Family" is not a distinct concept — it is a group someone called Family.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  avatar_url text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);

-- ----------------------------------------------------------------------------
-- Watchlists
--
-- A list is private to its owner until it is shared, and it can be shared two
-- ways: with named people (watchlist_members) or with a whole group (group_id).
-- ----------------------------------------------------------------------------

create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  created_at timestamptz not null default now()
);

create index watchlists_owner_idx on public.watchlists (owner_id);
create index watchlists_group_idx on public.watchlists (group_id);

create table public.watchlist_members (
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  primary key (watchlist_id, user_id)
);

create table public.watchlist_items (
  watchlist_id uuid not null references public.watchlists (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, title_id)
);

-- ----------------------------------------------------------------------------
-- Swipe to decide
-- ----------------------------------------------------------------------------

create table public.swipe_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups (id) on delete cascade,

  -- Candidates come either from a shared watchlist or from genre/service
  -- filters. Both may be set: filters then narrow the list.
  watchlist_id uuid references public.watchlists (id) on delete set null,
  filters jsonb not null default '{}'::jsonb,

  created_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'decided', 'cancelled')),
  decided_title_id bigint references public.titles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.swipe_participants (
  session_id uuid not null references public.swipe_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

-- The deck, fixed when the session opens so everyone swipes the same cards in
-- the same order.
create table public.swipe_candidates (
  session_id uuid not null references public.swipe_sessions (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  position integer not null,
  primary key (session_id, title_id)
);

create table public.swipes (
  session_id uuid not null references public.swipe_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, title_id)
);

create index swipes_session_title_idx on public.swipes (session_id, title_id) where liked;

-- ----------------------------------------------------------------------------
-- Activity feed
--
-- group_id is NOT NULL by design. The feed exists only inside a group, so
-- there is no such thing as a global activity row to accidentally expose.
-- ----------------------------------------------------------------------------

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (kind in ('rated', 'watched', 'added_to_list', 'joined_group', 'decided')),
  title_id bigint references public.titles (id) on delete cascade,
  watchlist_id uuid references public.watchlists (id) on delete cascade,
  rating smallint check (rating between 1 and 10),
  created_at timestamptz not null default now()
);

create index activity_group_idx on public.activity (group_id, created_at desc);
