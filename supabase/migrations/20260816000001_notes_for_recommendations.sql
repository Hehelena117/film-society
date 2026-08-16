-- ============================================================================
-- Let notes feed the recommender — but only if asked
--
-- entry_notes is the one table in this schema with no public read path at all
-- (see 20260814000002_rls.sql). "Private" there means private from other
-- users. Sending a note to the recommender means the text also leaves this
-- database for the model provider, which is a different promise, so it is not
-- one to make on the user's behalf.
--
-- Hence an explicit opt-in, defaulting to OFF. A new account's notes go
-- nowhere until its owner says otherwise. Nothing about entry_notes' RLS
-- changes: notes remain unreadable by anyone but their author, and the choice
-- below only governs what the client is willing to send to the recommend
-- function on its own behalf.
-- ============================================================================

alter table public.profiles
  add column if not exists use_notes_for_recommendations boolean not null default false;

comment on column public.profiles.use_notes_for_recommendations is
  'Opt-in. When true the client may include the user''s own note text in the '
  'payload to the recommend function, which forwards it to the model provider. '
  'Default false. Never enable this for a user by any route but their own '
  'explicit choice in settings.';
