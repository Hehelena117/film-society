-- The group's answer, decided once and only once.
--
-- Every client computed the winner for itself and wrote it, so the screen
-- could show one book and then a different one on the next refresh. Two
-- causes, both fixed: the order is deterministic now (see lib/ranking.ts,
-- where a genuine tie on average position used to be broken by whatever order
-- Postgres happened to return the rows in), and the decision is written
-- exactly once here -- the first writer wins, and everyone after is told what
-- was already decided rather than deciding again.
--
-- SECURITY DEFINER because book_swipe_sessions may only be updated by the
-- person who opened it. A participant who was not the opener could not close
-- the session, so if the opener wandered off it stayed open for good.

create or replace function public.settle_book_session(p_session uuid, p_book bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decided bigint;
begin
  if not exists (
    select 1 from book_swipe_participants p
    where p.session_id = p_session and p.user_id = auth.uid()
  ) then
    raise exception 'not a participant in this session';
  end if;

  -- Under READ COMMITTED the loser of the race re-checks this predicate after
  -- the winner commits, sees a decision already there, and updates no rows.
  update book_swipe_sessions
     set decided_book_id = p_book, closed_at = now()
   where id = p_session
     and decided_book_id is null;

  select decided_book_id into v_decided
    from book_swipe_sessions
   where id = p_session;

  return v_decided;
end;
$$;

grant execute on function public.settle_book_session(uuid, bigint) to authenticated;

comment on function public.settle_book_session is
  'Closes a ranking session on a book, first writer wins. Returns the book '
  'the session is actually settled on, which may not be the one passed in.';
