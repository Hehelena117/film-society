-- ============================================================================
-- Deciding on a book is a ranking, not a yes/no
--
-- The film side asks "would you watch this?" and looks for agreement. Books
-- are chosen differently: a book club is not looking for something everyone
-- would tolerate, it is looking for the one people would MOST rather read.
-- So each person is shown two books and picks the one they would rather, and
-- the group's answer is the book with the best average position across
-- everybody's ranking.
--
-- The comparisons are chosen as a decision tree — binary insertion — so no
-- question is asked that earlier answers already settled. Ten books cost about
-- twenty-two choices rather than the forty-five of every possible pair.
--
-- book_swipes is dropped rather than left lying about. It was never used (all
-- four swipe tables were empty when this ran) and a table implying a mechanic
-- the app no longer has is a trap for whoever reads this next.
-- ============================================================================

drop table if exists public.book_swipes;

-- Every choice, kept rather than only the final order. It is the evidence the
-- ranking is derived from, it lets a half-finished session resume, and a
-- ranking with no record of how it was reached cannot be checked.
create table if not exists public.book_comparisons (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.book_swipe_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,

  winner_book_id bigint not null references public.books (id) on delete cascade,
  loser_book_id bigint not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- A book cannot be preferred to itself.
  constraint book_comparisons_distinct check (winner_book_id <> loser_book_id)
);

create index if not exists book_comparisons_session_idx
  on public.book_comparisons (session_id, user_id);

-- One person's finished order. Its existence is what "this person is done"
-- means, which is what the waiting-for line reads.
create table if not exists public.book_rankings (
  session_id uuid not null references public.book_swipe_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,

  -- 1 is the book they would most rather read.
  position smallint not null check (position >= 1),
  created_at timestamptz not null default now(),

  primary key (session_id, user_id, book_id)
);

create index if not exists book_rankings_session_idx on public.book_rankings (session_id);

alter table public.book_comparisons enable row level security;
alter table public.book_rankings enable row level security;

-- Everyone in the session sees everyone's, which is what makes an average
-- possible; you may only write your own. Both verbs get a policy: a table with
-- RLS on and only a read policy silently rejects writes, which is how the film
-- side's deck was dead for a week under a green suite.
create policy book_comparisons_read on public.book_comparisons
  for select using (
    exists (
      select 1 from book_swipe_participants p
      where p.session_id = book_comparisons.session_id and p.user_id = auth.uid()
    )
  );

create policy book_comparisons_write_own on public.book_comparisons
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy book_rankings_read on public.book_rankings
  for select using (
    exists (
      select 1 from book_swipe_participants p
      where p.session_id = book_rankings.session_id and p.user_id = auth.uid()
    )
  );

create policy book_rankings_write_own on public.book_rankings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.book_rankings is
  'One person''s finished order for a session. Position 1 is their first '
  'choice. The group''s winner is the lowest average position across everyone '
  'who has finished.';
