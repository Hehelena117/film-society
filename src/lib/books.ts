import { supabase } from '@/lib/supabase'
import { announceBook } from '@/lib/bookActivity'

const COVER = (id: number, size: 'M' | 'L' = 'L') =>
  `https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`

/** A book as Open Library search hands it back, before it is cached. */
export interface BookHit {
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverId: number | null
  coverUrl: string | null
  pages: number | null
  seriesName: string | null
  seriesPosition: string | null
  subjects: string[]
  /** Open Library's community rating, OUT OF FIVE. Not our 1-10 scale. */
  rating: number | null
  ratingCount: number | null
}

/** A book once it is in our cache. */
export interface CachedBook {
  id: number
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverUrl: string | null
  pages: number | null
  subjects: string[]
  seriesName: string | null
  seriesPosition: string | null
  description: string | null
  /** Out of five. See BookHit. */
  rating: number | null
  ratingCount: number | null
}

/**
 * Answers already fetched this session.
 *
 * Open Library takes between half a second and eight for a search, and that
 * is entirely theirs: measured at 4.0s hitting them directly against 4.0s
 * through our proxy, so the proxy costs nothing and can save nothing either.
 * Nothing on our side makes their first answer quicker — but nothing should
 * ask them the same question twice. Backspacing a letter, or looking a book up
 * again later, is then instant instead of another wait.
 *
 * Deliberately in memory and per-session. Ratings and covers do change, and a
 * cache that outlived a reload would go stale with no way to notice.
 */
const searchCache = new Map<string, BookHit[]>()

/**
 * Thrown when Open Library itself is not answering.
 *
 * A distinct type because it is not a fault in this app and the reader should
 * not be told it is: the screens translate this into "the catalogue is not
 * answering, try again shortly" rather than showing a stack of jargon.
 */
export class CatalogueUnavailable extends Error {
  constructor() {
    super('openlibrary-unavailable')
    this.name = 'CatalogueUnavailable'
  }
}

export async function searchBooks(query: string): Promise<BookHit[]> {
  const q = query.trim()
  if (!q) return []

  const key = q.toLowerCase()
  const cached = searchCache.get(key)
  if (cached) return cached

  const { data, error } = await supabase.functions.invoke(
    `openlibrary?q=${encodeURIComponent(q)}`,
    { method: 'GET' },
  )
  if (error) throw error
  if (data?.unavailable) throw new CatalogueUnavailable()

  const results = ((data?.results ?? []) as Array<Record<string, any>>).map((r) => ({
    olKey: r.olKey,
    title: r.title,
    authors: r.authors ?? [],
    year: r.year ?? null,
    coverId: r.coverId ?? null,
    coverUrl: r.coverId ? COVER(r.coverId, 'M') : null,
    pages: r.pages ?? null,
    seriesName: r.seriesName ?? null,
    seriesPosition: r.seriesPosition ?? null,
    subjects: r.subjects ?? [],
    rating: r.rating ?? null,
    ratingCount: r.ratingCount ?? null,
  }))

  // An empty answer is not worth remembering — it is usually a timeout, and
  // caching it would make one slow moment permanent for the rest of the visit.
  if (results.length) searchCache.set(key, results)
  return results
}

/**
 * Caches a book and returns its row.
 *
 * Clients hold SELECT only on `books`, so everything that needs a book row
 * goes through this one door — the same arrangement as `catalog` on the film
 * side, and for the same reason.
 */
export async function catalogBook(olKey: string, language: string): Promise<CachedBook> {
  const { data, error } = await supabase.functions.invoke<CachedBook & { unavailable?: boolean }>(
    'books',
    { body: { olKey, language } },
  )
  if (error) throw error
  if (data?.unavailable) throw new CatalogueUnavailable()
  if (!data) throw new Error('books returned nothing')
  return data
}

// ---------------------------------------------------------------------------
// The reading log
// ---------------------------------------------------------------------------

export interface ReadEntry {
  id: string
  rating: number | null
  finishedOn: string | null
  createdAt: string
  /** Only ever populated for the owner — book_entry_notes has no public read path. */
  note: string | null
  book: {
    id: number
    olKey: string
    title: string
    authors: string[]
    year: number | null
    coverUrl: string | null
  }
}

const shapeBook = (b: Record<string, any>) => ({
  id: b.id,
  olKey: b.ol_key,
  title: b.title,
  authors: b.authors ?? [],
  year: b.first_published_year,
  coverUrl: b.cover_id ? COVER(b.cover_id, 'M') : null,
})

export async function getMyReading(limit = 100): Promise<ReadEntry[]> {
  const { data, error } = await supabase
    .from('book_log_entries')
    .select(
      'id, rating, finished_on, created_at, note:book_entry_notes(body), ' +
        'book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    rating: row.rating,
    finishedOn: row.finished_on,
    createdAt: row.created_at,
    // One-to-one, but PostgREST embeds it as an array.
    note: Array.isArray(row.note) ? (row.note[0]?.body ?? null) : (row.note?.body ?? null),
    book: shapeBook(row.book),
  }))
}

export async function logReading(input: {
  bookId: number
  rating: number | null
  finishedOn: string | null
  note: string | null
}): Promise<string> {
  const { data, error } = await supabase
    .from('book_log_entries')
    .insert({
      book_id: input.bookId,
      rating: input.rating,
      finished_on: input.finishedOn,
    })
    .select('id')
    .single()

  if (error) throw error
  const entryId = data.id as string

  if (input.note?.trim()) {
    // user_id is omitted deliberately: it defaults to auth.uid(), and RLS
    // requires it to match, so a note cannot be attached to someone else's
    // entry however this is called.
    const { error: noteErr } = await supabase
      .from('book_entry_notes')
      .insert({ entry_id: entryId, body: input.note.trim() })

    if (noteErr) throw new Error(`Saved the entry, but the note failed: ${noteErr.message}`)
  }

  // Finishing a book means you are no longer in the middle of it.
  await supabase.from('book_progress').delete().eq('book_id', input.bookId)

  // Tell the groups, if it was scored. An unrated entry is usually
  // bookkeeping rather than an opinion, and not worth announcing.
  if (input.rating !== null) {
    await announceBook({ kind: 'rated', bookId: input.bookId, rating: input.rating })
  }

  return entryId
}

export async function deleteReadEntry(id: string): Promise<void> {
  const { error } = await supabase.from('book_log_entries').delete().eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Currently reading
// ---------------------------------------------------------------------------

export interface Reading {
  bookId: number
  percent: number
  startedOn: string
  book: ReadEntry['book']
}

export async function getCurrentlyReading(): Promise<Reading[]> {
  const { data, error } = await supabase
    .from('book_progress')
    .select(
      'book_id, percent, started_on, ' +
        'book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)',
    )
    .order('updated_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    bookId: row.book_id,
    percent: row.percent,
    startedOn: row.started_on,
    book: shapeBook(row.book),
  }))
}

/**
 * Starts a book or moves the marker.
 *
 * Percentage rather than a page number: Open Library's page count is missing
 * often enough that a page-based bar would simply be broken for real books,
 * and a percentage is the only unit that also works for an audiobook.
 *
 * user_id is named explicitly because this is an upsert, and PostgREST does
 * NOT apply column DEFAULTs on that path — the trap that once made watchlist
 * writes fail with an error blaming the wrong thing.
 */
export async function setProgress(bookId: number, percent: number): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { error } = await supabase.from('book_progress').upsert(
    {
      user_id: auth.user.id,
      book_id: bookId,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,book_id' },
  )
  if (error) throw error
}

export async function stopReading(bookId: number): Promise<void> {
  const { error } = await supabase.from('book_progress').delete().eq('book_id', bookId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// The shelf
// ---------------------------------------------------------------------------

export interface BookRecommendation {
  book: BookHit
  reason: string
}

export interface ReadingSnapshot {
  ratings: Array<{ title: string; author: string | null; score: number }>
  notes: Array<{ title: string; score: number | null; body: string }>
  /** Everything logged at all — never recommend a book back to someone who read it. */
  readTitles: string[]
}

/**
 * The reader's own log, for seeding the shelf.
 *
 * `includeNotes` must come from profiles.use_book_notes_for_recommendations
 * and nothing else, and defaults to false at every layer so a caller that
 * forgets to ask sends nothing rather than everything. The book switch is
 * separate from the film one: book notes tend to be the more personal of the
 * two, and someone may reasonably want one and not the other.
 */
export async function getReadingSnapshot(includeNotes = false): Promise<ReadingSnapshot> {
  const { data, error } = await supabase
    .from('book_log_entries')
    .select(
      'rating, book:books!inner(title, authors)' + (includeNotes ? ', note:book_entry_notes(body)' : ''),
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Could not read the reading log', error)
    return { ratings: [], notes: [], readTitles: [] }
  }

  const ratings: ReadingSnapshot['ratings'] = []
  const notes: ReadingSnapshot['notes'] = []
  const readTitles = new Set<string>()

  for (const row of (data ?? []) as Array<Record<string, any>>) {
    const title = row.book?.title
    if (!title) continue
    readTitles.add(title)

    const author = row.book?.authors?.[0] ?? null
    if (row.rating !== null) ratings.push({ title, author, score: row.rating })

    if (includeNotes && notes.length < 30) {
      const body = Array.isArray(row.note) ? row.note[0]?.body : row.note?.body
      if (typeof body === 'string' && body.trim()) {
        notes.push({ title, score: row.rating, body: body.trim().slice(0, 400) })
      }
    }
  }

  return { ratings, notes, readTitles: [...readTitles] }
}

export async function getBookRecommendations(opts: {
  ratings: ReadingSnapshot['ratings']
  notes?: ReadingSnapshot['notes']
  feedback?: {
    more?: Array<{ title: string; author: string | null }>
    less?: Array<{ title: string; author: string | null }>
  }
  /** Films they loved. The one bridge between the two halves. */
  crossover?: Array<{ name: string; year: number | null; score: number }>
  excludeTitles: string[]
  count: number
}): Promise<BookRecommendation[]> {
  const { data, error } = await supabase.functions.invoke<{
    recommendations: Array<{ book: Record<string, any>; reason: string }>
  }>('book-recommend', { body: opts })

  if (error) throw error

  return (data?.recommendations ?? []).map((r) => ({
    reason: r.reason,
    book: {
      olKey: r.book.olKey,
      title: r.book.title,
      authors: r.book.authors ?? [],
      year: r.book.year ?? null,
      coverId: null,
      coverUrl: r.book.coverUrl ?? null,
      pages: r.book.pages ?? null,
      seriesName: r.book.seriesName ?? null,
      seriesPosition: r.book.seriesPosition ?? null,
      subjects: [],
      rating: r.book.rating ?? null,
      ratingCount: r.book.ratingCount ?? null,
    },
  }))
}

// ---------------------------------------------------------------------------
// Steering the shelf
// ---------------------------------------------------------------------------

export type BookVerdict = 'more' | 'less'

export interface BookFeedbackEntry {
  olKey: string
  title: string
  authors: string[]
  year: number | null
  verdict: BookVerdict
}

export async function getMyBookFeedback(): Promise<BookFeedbackEntry[]> {
  const { data, error } = await supabase
    .from('book_recommendation_feedback')
    .select('ol_key, title, authors, year, verdict')

  if (error) {
    console.error('Could not read shelf feedback', error)
    return []
  }

  return ((data ?? []) as Array<Record<string, any>>).map((r) => ({
    olKey: r.ol_key,
    title: r.title,
    authors: r.authors ?? [],
    year: r.year,
    verdict: r.verdict,
  }))
}

/** user_id is named explicitly: PostgREST does not fire DEFAULTs on upsert. */
export async function setBookFeedback(
  entry: Omit<BookFeedbackEntry, 'verdict'>,
  verdict: BookVerdict | null,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  if (verdict === null) {
    const { error } = await supabase
      .from('book_recommendation_feedback')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('ol_key', entry.olKey)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('book_recommendation_feedback').upsert(
    {
      user_id: auth.user.id,
      ol_key: entry.olKey,
      title: entry.title,
      authors: entry.authors,
      year: entry.year,
      verdict,
    },
    { onConflict: 'user_id,ol_key' },
  )
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Reading lists
// ---------------------------------------------------------------------------

export interface ReadingList {
  id: string
  name: string
  groupId: string | null
  groupName: string | null
  count: number
  isOwner: boolean
}

export interface ReadingListItem {
  bookId: number
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverUrl: string | null
  subjects: string[]
}

export async function getMyReadingLists(): Promise<ReadingList[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id

  const { data, error } = await supabase
    .from('reading_lists')
    .select('id, name, owner_id, group_id, group:groups(name), items:reading_list_items(count)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    name: row.name,
    groupId: row.group_id,
    groupName: row.group?.name ?? null,
    count: row.items?.[0]?.count ?? 0,
    isOwner: row.owner_id === me,
  }))
}

/**
 * owner_id is left to its DEFAULT rather than named.
 *
 * This is a plain insert, not an upsert, so the default does fire — the trap
 * that broke watchlists only applies on the upsert path. See lib/feedback.ts.
 */
export async function createReadingList(name: string, groupId: string | null): Promise<string> {
  const { data, error } = await supabase
    .from('reading_lists')
    .insert({ name: name.trim(), group_id: groupId })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

export async function deleteReadingList(id: string): Promise<void> {
  const { error } = await supabase.from('reading_lists').delete().eq('id', id)
  if (error) throw error
}

/** Shares an existing list with a group, or takes it back to yourself. */
export async function setReadingListGroup(id: string, groupId: string | null): Promise<void> {
  const { error } = await supabase.from('reading_lists').update({ group_id: groupId }).eq('id', id)
  if (error) throw error
}

export async function getReadingListItems(listId: string): Promise<ReadingListItem[]> {
  const { data, error } = await supabase
    .from('reading_list_items')
    .select(
      'book:books!inner(id, ol_key, title, authors, first_published_year, cover_id, subjects)',
    )
    .eq('list_id', listId)
    .order('added_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    bookId: row.book.id,
    olKey: row.book.ol_key,
    title: row.book.title,
    authors: row.book.authors ?? [],
    year: row.book.first_published_year,
    coverUrl: row.book.cover_id ? COVER(row.book.cover_id, 'M') : null,
    subjects: row.book.subjects ?? [],
  }))
}

/**
 * The book must already be catalogued — call catalogBook first.
 *
 * Plain insert tolerating a duplicate, never an upsert: PostgREST does not
 * apply column DEFAULTs on the upsert path, so `added_by DEFAULT auth.uid()`
 * would arrive NULL and quietly forget who added what.
 */
export async function addToReadingList(listId: string, bookId: number): Promise<void> {
  const { error } = await supabase
    .from('reading_list_items')
    .insert({ list_id: listId, book_id: bookId })

  if (error && error.code !== '23505') throw error
  await announceBook({ kind: 'added', bookId, listId })
}

export async function removeFromReadingList(listId: string, bookId: number): Promise<void> {
  const { error } = await supabase
    .from('reading_list_items')
    .delete()
    .eq('list_id', listId)
    .eq('book_id', bookId)

  if (error) throw error
}

/**
 * Your book ratings, for the FILM side's recommender.
 *
 * The one deliberate bridge between two otherwise sealed halves: a film may be
 * justified by a book you loved. Only titles and scores cross — never notes.
 * Notes are opt-in per side, and a switch turned on for books cannot be taken
 * as permission to send them somewhere the film switch governs.
 */
export async function getBookRatingsForCrossover(limit = 30): Promise<
  Array<{ title: string; author: string | null; score: number }>
> {
  const { data, error } = await supabase
    .from('book_log_entries')
    .select('rating, book:books!inner(title, authors)')
    .not('rating', 'is', null)
    .gte('rating', 7)
    .order('rating', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Could not read book ratings for crossover', error)
    return []
  }

  return ((data ?? []) as Array<Record<string, any>>)
    .filter((row) => row.book?.title)
    .map((row) => ({
      title: row.book.title,
      author: row.book.authors?.[0] ?? null,
      score: row.rating,
    }))
}
