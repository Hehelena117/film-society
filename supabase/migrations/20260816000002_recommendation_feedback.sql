-- ============================================================================
-- "More like this" / "Not for me" on the recommendation wall
--
-- Steering the wall directly, rather than only through ratings. A rating means
-- "I watched this and here is what I thought"; these mean "I have not watched
-- it, but show me more of this" or "never offer me this again". Conflating the
-- two would put films in someone's watch log that they never watched.
--
-- No foreign key to titles. A recommendation is resolved straight from TMDB
-- search inside the recommend function and is never written to the cache, so
-- there is usually no titles row to point at — and name/year is the vocabulary
-- the prompt itself speaks in. Storing them here keeps the feedback readable
-- without a join and independent of the six-month cache purge.
-- ============================================================================

create table if not exists public.recommendation_feedback (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,

  tmdb_id integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  name text not null,
  year smallint,

  -- 'more' = want more like it. 'less' = never offer it again.
  verdict text not null check (verdict in ('more', 'less')),
  created_at timestamptz not null default now(),

  -- One standing verdict per title per person: pressing the other button
  -- changes your mind rather than recording a second opinion.
  primary key (user_id, tmdb_id, media_type)
);

create index recommendation_feedback_user_idx
  on public.recommendation_feedback (user_id, verdict);

alter table public.recommendation_feedback enable row level security;

-- Nobody else's business. This is not a public opinion — it is a private
-- instruction to the recommender, and it is about films the user has usually
-- not even seen.
create policy recommendation_feedback_own on public.recommendation_feedback
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.recommendation_feedback is
  'Private steering for the recommendation wall. Not a rating and not a watch '
  'record — see the log for those. Read only by its owner.';
