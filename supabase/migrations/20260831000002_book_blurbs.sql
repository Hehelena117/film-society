-- A description worth reading, and whether this reader would get on with it.
--
-- Open Library's descriptions vary from good to "Novel. 320 pages." to a list
-- of which edition had which cover. Where one is thin the book is unreadable
-- from its own page, which is exactly when you most want telling what it is.
--
-- Two different things, stored two different ways.
--
-- The description is ABOUT THE BOOK, so it is the same for everybody and lives
-- on the catalogue row: written once, then free and instant for every reader
-- afterwards. Open Library's own description is left exactly where it is --
-- this sits underneath it, labelled, and replaces nothing.
--
-- Whether you would like it is ABOUT YOU. It is built from what you have
-- rated and, only if you have turned that on, what you wrote in your notes,
-- so it is nobody else's business: its own table, owner-only, no read path
-- for anyone else. Two people opening the same book see the same description
-- and different reasons for reading it.

alter table public.books
  add column if not exists ai_description text,
  add column if not exists ai_described_at timestamptz;

comment on column public.books.ai_description is
  'Written on request when someone asks about the book. Shared: the same for '
  'every reader, and never overwrites the catalogue description.';

create table if not exists public.book_fit (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  book_id bigint not null references public.books (id) on delete cascade,

  would text not null,
  -- Nullable: sometimes there is honestly nothing to warn a reader about.
  wouldnt text,

  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.book_fit enable row level security;

-- Both verbs in one policy. A table with RLS on and only a read policy
-- refuses writes quietly, which is how the film side's deck was dead for a
-- week under a green suite.
create policy book_fit_own on public.book_fit
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.book_fit is
  'Why one reader would or would not get on with one book. Owner-only: it is '
  'built from their ratings and possibly their notes, and describes them at '
  'least as much as it describes the book.';
