import { bestAveragePosition } from '@/lib/ranking'
import { supabase } from '@/lib/supabase'

export interface BookCandidate {
  bookId: number
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverUrl: string | null
}

export interface BookSession {
  id: string
  listId: string
  listName: string
  groupId: string | null
  participants: number
  decidedBookId: number | null
}

const COVER = (id: number) => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`

/**
 * Opens a session and stocks its deck.
 *
 * The deck is written now rather than read live from the list, so everyone
 * decides between the same books even if someone adds to the list halfway
 * through. The film side learned this the hard way: a deck that changes under
 * people produces a "match" nobody actually agreed on.
 *
 * Every insert's error is checked. A previous version of the film equivalent
 * inserted candidates without looking, and the whole feature was dead for a
 * week under a green test suite.
 */
export async function startBookSwipe(listId: string): Promise<string> {
  const { data: list, error: listErr } = await supabase
    .from('reading_lists')
    .select('id, group_id')
    .eq('id', listId)
    .single()
  if (listErr) throw listErr

  const { data: session, error: sErr } = await supabase
    .from('book_swipe_sessions')
    .insert({ list_id: listId, group_id: list.group_id })
    .select('id')
    .single()
  if (sErr) throw sErr

  const { error: joinErr } = await supabase
    .from('book_swipe_participants')
    .insert({ session_id: session.id })
  if (joinErr) throw joinErr

  const { data: items, error: itemsErr } = await supabase
    .from('reading_list_items')
    .select('book_id')
    .eq('list_id', listId)
  if (itemsErr) throw itemsErr

  const deck = (items ?? []).map((row: Record<string, any>, i: number) => ({
    session_id: session.id,
    book_id: row.book_id,
    position: i,
  }))

  if (deck.length) {
    const { error: deckErr } = await supabase.from('book_swipe_candidates').insert(deck)
    if (deckErr) throw deckErr
  }

  return session.id as string
}

export async function joinBookSwipe(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('book_swipe_participants')
    .insert({ session_id: sessionId })
  // Already in it is not an error.
  if (error && error.code !== '23505') throw error
}

export async function getBookSession(sessionId: string): Promise<BookSession | null> {
  const { data, error } = await supabase
    .from('book_swipe_sessions')
    .select(
      'id, list_id, group_id, decided_book_id, ' +
        'list:reading_lists!inner(name), people:book_swipe_participants(count)',
    )
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as Record<string, any>
  return {
    id: row.id,
    listId: row.list_id,
    listName: row.list?.name ?? '',
    groupId: row.group_id,
    participants: row.people?.[0]?.count ?? 1,
    decidedBookId: row.decided_book_id,
  }
}

/**
 * Every book in the session, in the order it was stocked.
 *
 * The whole deck, not "what is left": ranking sorts the entire list, and the
 * decision tree decides which pair to ask about next. It used to filter out
 * anything already judged, which made sense when each card got one yes or no
 * and makes none now.
 */
export async function getBookDeck(sessionId: string): Promise<BookCandidate[]> {
  const { data: cards, error } = await supabase
    .from('book_swipe_candidates')
    .select('position, book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)')
    .eq('session_id', sessionId)
    .order('position')

  if (error) throw error

  return ((cards ?? []) as Array<Record<string, any>>).map((row) => ({
    bookId: row.book.id,
    olKey: row.book.ol_key,
    title: row.book.title,
    authors: row.book.authors ?? [],
    year: row.book.first_published_year,
    coverUrl: row.book.cover_id ? COVER(row.book.cover_id) : null,
  }))
}

/**
 * Records one choice.
 *
 * Every comparison is kept, not just the finished order: it is the evidence
 * the ranking rests on, and it lets someone who walks away mid-session pick up
 * where they left off.
 */
export async function recordChoice(
  sessionId: string,
  winnerBookId: number,
  loserBookId: number,
): Promise<void> {
  const { error } = await supabase
    .from('book_comparisons')
    .insert({ session_id: sessionId, winner_book_id: winnerBookId, loser_book_id: loserBookId })
  if (error) throw error
}

/**
 * Files someone's finished order.
 *
 * Written in one go, so "this person is done" is a fact with no half-state:
 * either their whole ranking is there or none of it is, and the waiting-for
 * line reads exactly that.
 */
export async function saveRanking(sessionId: string, orderedBookIds: number[]): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const rows = orderedBookIds.map((bookId, i) => ({
    session_id: sessionId,
    user_id: auth.user.id,
    book_id: bookId,
    position: i + 1,
  }))

  // user_id is named rather than left to its DEFAULT: this is an upsert, and
  // PostgREST does not fire column defaults on that path — the trap that once
  // made watchlist writes fail while blaming the wrong thing.
  const { error } = await supabase
    .from('book_rankings')
    .upsert(rows, { onConflict: 'session_id,user_id,book_id' })
  if (error) throw error
}

export interface SessionProgress {
  /** Everyone in the session, and whether they have finished ranking. */
  people: Array<{ userId: string; username: string; done: boolean }>
  waitingFor: string[]
  everyoneDone: boolean
}

export async function getSessionProgress(sessionId: string): Promise<SessionProgress> {
  const [{ data: participants }, { data: rankings }] = await Promise.all([
    supabase
      .from('book_swipe_participants')
      .select('user_id, profile:profiles!inner(username)')
      .eq('session_id', sessionId),
    supabase.from('book_rankings').select('user_id').eq('session_id', sessionId),
  ])

  const finished = new Set((rankings ?? []).map((r) => r.user_id))
  // Typed loosely on purpose: PostgREST types an embedded one-to-one as an
  // array in some versions and an object in others, and the shape is what the
  // server sends, not what the generated types promise.
  const people = ((participants ?? []) as Array<Record<string, any>>).map((p) => ({
    userId: p.user_id,
    username: (Array.isArray(p.profile) ? p.profile[0]?.username : p.profile?.username) ?? '—',
    done: finished.has(p.user_id),
  }))

  return {
    people,
    waitingFor: people.filter((p) => !p.done).map((p) => p.username),
    // An empty session is not a finished one.
    everyoneDone: people.length > 0 && people.every((p) => p.done),
  }
}

/**
 * The group's choice, once everybody has finished.
 *
 * Returns null while anyone is still ranking: the result is deliberately
 * hidden until then, so nobody can see a running leader and rank tactically.
 */
export async function getGroupResult(
  sessionId: string,
): Promise<Array<{ book: BookCandidate; average: number; voters: number }> | null> {
  const progress = await getSessionProgress(sessionId)
  if (!progress.everyoneDone) return null

  const { data: rankings, error } = await supabase
    .from('book_rankings')
    .select('user_id, book_id, position')
    .eq('session_id', sessionId)
  if (error) throw error

  const ordered = bestAveragePosition(
    (rankings ?? []).map((r) => ({ userId: r.user_id, bookId: r.book_id, position: r.position })),
  )
  if (!ordered.length) return null

  const { data: books } = await supabase
    .from('books')
    .select('id, ol_key, title, authors, first_published_year, cover_id')
    .in(
      'id',
      ordered.map((o) => o.bookId),
    )

  const byId = new Map(
    ((books ?? []) as Array<Record<string, any>>).map((b) => [
      b.id,
      {
        bookId: b.id,
        olKey: b.ol_key,
        title: b.title,
        authors: b.authors ?? [],
        year: b.first_published_year,
        coverUrl: b.cover_id ? COVER(b.cover_id) : null,
      },
    ]),
  )

  return ordered
    .filter((o) => byId.has(o.bookId))
    .map((o) => ({ book: byId.get(o.bookId)!, average: o.average, voters: o.voters }))
}

export async function settleOn(sessionId: string, bookId: number): Promise<void> {
  const { error } = await supabase
    .from('book_swipe_sessions')
    .update({ decided_book_id: bookId, closed_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw error
}

/** Sessions running on lists you can see, so others can join one. */
export async function getOpenBookSessions(): Promise<BookSession[]> {
  const { data, error } = await supabase
    .from('book_swipe_sessions')
    .select(
      'id, list_id, group_id, decided_book_id, ' +
        'list:reading_lists!inner(name), people:book_swipe_participants(count)',
    )
    .is('closed_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    listId: row.list_id,
    listName: row.list?.name ?? '',
    groupId: row.group_id,
    participants: row.people?.[0]?.count ?? 1,
    decidedBookId: row.decided_book_id,
  }))
}
