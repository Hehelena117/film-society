-- When you began a book you have finished.
--
-- The log recorded the rating, the day you finished and a note, so "I read
-- this over three weeks in June" was not a thing that could be written down --
-- and a reading you cannot describe fully is one you cannot correct either.
--
-- Nullable, unlike book_progress.started_on, and deliberately: every reading
-- already logged genuinely has no start date, and inventing one -- the day it
-- was logged, the day this ran -- would be putting words in the reader's
-- mouth. Blank means unknown, which is the truth about all of them.

alter table public.book_log_entries
  add column if not exists started_on date;

comment on column public.book_log_entries.started_on is
  'When the reader began. Null means they did not say, which is the case for '
  'every entry logged before this column existed.';
