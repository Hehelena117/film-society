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

/** The deck, minus anything this person has already judged. */
export async function getBookDeck(sessionId: string): Promise<BookCandidate[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id

  const [{ data: cards, error }, { data: mine }] = await Promise.all([
    supabase
      .from('book_swipe_candidates')
      .select(
        'position, book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)',
      )
      .eq('session_id', sessionId)
      .order('position'),
    supabase.from('book_swipes').select('book_id').eq('session_id', sessionId).eq('user_id', me),
  ])

  if (error) throw error

  const judged = new Set((mine ?? []).map((s: Record<string, any>) => s.book_id))

  return ((cards ?? []) as Array<Record<string, any>>)
    .filter((row) => !judged.has(row.book.id))
    .map((row) => ({
      bookId: row.book.id,
      olKey: row.book.ol_key,
      title: row.book.title,
      authors: row.book.authors ?? [],
      year: row.book.first_published_year,
      coverUrl: row.book.cover_id ? COVER(row.book.cover_id) : null,
    }))
}

export async function swipeBook(
  sessionId: string,
  bookId: number,
  liked: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('book_swipes')
    .insert({ session_id: sessionId, book_id: bookId, liked })
  if (error && error.code !== '23505') throw error
}

/**
 * Has everyone agreed on something?
 *
 * Read rather than triggered, unlike the film side. The rule is the one that
 * was agreed for films and carries over unchanged: two people must both say
 * yes, three or more need a majority.
 */
export async function findBookMatch(sessionId: string): Promise<number | null> {
  const [{ data: people }, { data: swipes }] = await Promise.all([
    supabase.from('book_swipe_participants').select('user_id').eq('session_id', sessionId),
    supabase.from('book_swipes').select('book_id, liked').eq('session_id', sessionId),
  ])

  const heads = (people ?? []).length
  if (heads < 2) return null

  const needed = heads === 2 ? 2 : Math.floor(heads / 2) + 1

  const yes = new Map<number, number>()
  for (const s of (swipes ?? []) as Array<Record<string, any>>) {
    if (s.liked) yes.set(s.book_id, (yes.get(s.book_id) ?? 0) + 1)
  }

  for (const [bookId, count] of yes) if (count >= needed) return bookId
  return null
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
