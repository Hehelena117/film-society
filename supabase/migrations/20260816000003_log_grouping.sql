-- ============================================================================
-- How each person wants their own log stacked up
--
-- Purely a display preference, but it belongs on the profile rather than in
-- localStorage: someone who has decided they read their log by rating should
-- not have to decide again on their phone. (The theme is still local-only —
-- see the TODO in src/lib/theme.ts.)
--
-- The check constraint is the list the client offers. Adding a grouping means
-- a migration, which is the right amount of friction: an unrecognised value
-- would leave the log with no headings and no clue why.
-- ============================================================================

alter table public.profiles
  add column if not exists log_grouping text not null default 'month'
    check (log_grouping in ('month', 'year', 'rating', 'decade', 'none'));

comment on column public.profiles.log_grouping is
  'How this user groups their own watch log. Display only — affects nothing '
  'anyone else sees, and nothing about what is stored.';
