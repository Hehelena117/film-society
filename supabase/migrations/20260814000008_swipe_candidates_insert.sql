-- ============================================================================
-- swipe_candidates could be read but never written
--
-- The table had RLS enabled and a SELECT policy only, so building a session's
-- deck failed for everyone. RLS denies by default: enabling it without an
-- INSERT policy is a closed door, not an open one.
--
-- The host joins their own session before inserting the deck, so participation
-- is the right test — and it also lets anyone already in a session extend the
-- deck later, which is what a "add more options" feature would need.
-- ============================================================================

create policy swipe_candidates_insert on public.swipe_candidates
  for insert with check (public.is_session_participant(session_id));

create policy swipe_candidates_delete on public.swipe_candidates
  for delete using (public.is_session_participant(session_id));
