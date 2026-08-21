-- ============================================================================
-- What other readers made of it
--
-- Open Library carries ratings — out of five, not ten — and they were simply
-- not being read. The film side shows TMDB's score on a title page; there was
-- no equivalent here, so a book page said nothing about how it had landed with
-- anyone but you.
--
-- Stored out of five, exactly as Open Library reports it. Rescaling to ten
-- would make it look like one of our own 1-10 ratings, which it is not.
-- ============================================================================

alter table public.books
  add column if not exists ratings_average real,
  add column if not exists ratings_count integer;

comment on column public.books.ratings_average is
  'Open Library''s community rating, out of 5. Not our 1-10 scale — do not '
  'rescale it into one, and do not mix it with book_log_entries.rating.';
