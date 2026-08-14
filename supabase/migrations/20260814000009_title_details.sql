-- ============================================================================
-- Everything a title page needs
--
-- The catalog function already fetched credits and videos but threw most of it
-- away, keeping only the director. These columns hold the rest.
--
-- Cast goes in as jsonb rather than its own table: we only ever read the top
-- billing back as an ordered list for one title, never query across people.
-- A people table earns its keep when you want "everything with this actor" —
-- when that day comes it can be normalised out of this.
-- ============================================================================

alter table public.titles
  add column if not exists writers text[] not null default '{}',
  add column if not exists cast_top jsonb not null default '[]'::jsonb,
  -- TMDB keywords. The closest thing their data has to "themes".
  add column if not exists keywords text[] not null default '{}',
  add column if not exists tmdb_rating numeric(3, 1),
  add column if not exists tmdb_votes integer,
  add column if not exists tagline text;

comment on column public.titles.keywords is
  'TMDB keywords, surfaced in the UI as themes.';
comment on column public.titles.cast_top is
  'Top billing only, as [{name, character, profilePath}]. Ordered as TMDB returns it.';
