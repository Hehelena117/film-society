import { supabase } from '@/lib/supabase'

/**
 * Postgres for "no such column".
 *
 * Migrations here are run by hand, so there is always a window where the
 * code knows about a column the database has not been told about yet. A
 * screen that shows nothing at all is far worse than one missing a date,
 * so the queries that read new columns fall back to the old shape rather
 * than throwing. Once the migration is run the fallback simply stops
 * being reached.
 */
const NO_COLUMN = '42703'
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
  /** When they began. Null for every entry logged before the column existed. */
  startedOn: string | null
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
  const columns = (withStart: boolean) =>
    `id, rating, finished_on, ${withStart ? 'started_on, ' : ''}created_at, ` +
    'note:book_entry_notes(body), ' +
    'book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)'

  const run = (withStart: boolean) =>
    supabase
      .from('book_log_entries')
      .select(columns(withStart))
      .order('created_at', { ascending: false })
      .limit(limit)

  let { data, error } = await run(true)
  // Everything you have ever read, or nothing at all, over one date.
  if (error?.code === NO_COLUMN) ({ data, error } = await run(false))

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    rating: row.rating,
    finishedOn: row.finished_on,
    startedOn: row.started_on,
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
  startedOn: string | null
  note: string | null
}): Promise<string> {
  const entry = {
    book_id: input.bookId,
    rating: input.rating,
    finished_on: input.finishedOn,
  }

  let { data, error } = await supabase
    .from('book_log_entries')
    .insert({ ...entry, started_on: input.startedOn })
    .select('id')
    .single()

  // Better to lose the start date than the reading.
  if (error?.code === NO_COLUMN) {
    ;({ data, error } = await supabase
      .from('book_log_entries')
      .insert(entry)
      .select('id')
      .single())
  }

  if (error) throw error
  // PostgREST does not answer .single() with neither a row nor an error, but
  // the fallback path makes that a promise the compiler cannot see for itself.
  if (!data) throw new Error('The reading was not saved')
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

/**
 * Changes a reading you have already logged.
 *
 * The rating, the date and the note are all editable: people misremember when
 * they finished something, change their mind about a score a week later, and
 * think of the thing they actually wanted to say about a book long after
 * closing it.
 *
 * The note lives in its own table, so it is written separately — and
 * user_id is NAMED rather than left to its DEFAULT, because this is an upsert
 * and PostgREST does not apply column defaults on that path. The default would
 * silently not fire, the row would arrive with a null owner, and RLS would
 * reject it while blaming the wrong thing. That is precisely how watchlist
 * writes broke once already.
 *
 * Clearing the text deletes the note rather than storing an empty one: a note
 * that exists but says nothing would still show its quotation mark on the row.
 */
export async function updateReadEntry(input: {
  entryId: string
  rating: number | null
  finishedOn: string | null
  startedOn: string | null
  note: string | null
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const changes = { rating: input.rating, finished_on: input.finishedOn }

  let { error } = await supabase
    .from('book_log_entries')
    .update({ ...changes, started_on: input.startedOn })
    .eq('id', input.entryId)

  if (error?.code === NO_COLUMN) {
    ;({ error } = await supabase
      .from('book_log_entries')
      .update(changes)
      .eq('id', input.entryId))
  }

  if (error) throw error

  const body = input.note?.trim()
  if (!body) {
    const { error: delErr } = await supabase
      .from('book_entry_notes')
      .delete()
      .eq('entry_id', input.entryId)
    if (delErr) throw delErr
    return
  }

  const { error: noteErr } = await supabase.from('book_entry_notes').upsert(
    {
      entry_id: input.entryId,
      user_id: auth.user.id,
      body,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'entry_id' },
  )
  if (noteErr) throw noteErr
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
export async function setProgress(
  bookId: number,
  percent: number,
  startedOn?: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { error } = await supabase.from('book_progress').upsert(
    {
      user_id: auth.user.id,
      book_id: bookId,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
      // Sent only when the caller means to change it. Omitting it on an
      // ordinary nudge leaves the existing date alone, which is what moving a
      // bookmark should do — you are not starting the book again.
      ...(startedOn ? { started_on: startedOn } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,book_id' },
  )
  if (error) throw error
}

/** Picks a book up, recording the day. */
export async function startReading(bookId: number, on?: string): Promise<void> {
  // The date is named rather than left to the column's DEFAULT: this goes
  // through an upsert, and defaults are exactly what that path does not apply.
  await setProgress(bookId, 0, on ?? new Date().toISOString().slice(0, 10))
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

// ---------------------------------------------------------------------------
// Reading profiles
// ---------------------------------------------------------------------------

export interface RatedBook {
  bookId: number
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverUrl: string | null
  rating: number
}

/**
 * Somebody's rated books, best first.
 *
 * Read through public_book_ratings, so it can only ever surface a score —
 * never when they read it, never a note. The whole set rather than a page:
 * the profile sorts these into a shelf per score and prints a count on each,
 * and a count taken from a truncated list is a wrong count.
 */
export async function getBookProfileRatings(userId: string, limit = 400): Promise<RatedBook[]> {
  const { data, error } = await supabase
    .from('public_book_ratings')
    .select(
      'rating, book:books!inner(id, ol_key, title, authors, first_published_year, cover_id)',
    )
    .eq('user_id', userId)
    .order('rating', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    bookId: row.book.id,
    olKey: row.book.ol_key,
    title: row.book.title,
    authors: row.book.authors ?? [],
    year: row.book.first_published_year,
    coverUrl: row.book.cover_id ? COVER(row.book.cover_id, 'M') : null,
    rating: row.rating,
  }))
}

export interface ReadingProfile {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  booksRead: number
  followers: number
  following: number
}

/**
 * A reading profile.
 *
 * The count comes from public_book_counts rather than book_log_entries, which
 * is owner-only — that view exists so a profile can say how much someone reads
 * without saying when. Follower counts are per side: following somebody for
 * books is a separate act from following them for films.
 */
export async function getReadingProfile(userId: string): Promise<ReadingProfile | null> {
  const [profileRes, countRes, followersRes, followingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, avatar_url, bio')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('public_book_counts').select('books_read').eq('user_id', userId).maybeSingle(),
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('followee_id', userId)
      .eq('side', 'book'),
    supabase
      .from('follows')
      .select('followee_id', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('side', 'book'),
  ])

  if (profileRes.error) throw profileRes.error
  if (!profileRes.data) return null

  const p = profileRes.data as Record<string, any>
  return {
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    booksRead: (countRes.data as Record<string, any> | null)?.books_read ?? 0,
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// The rest of a series
// ---------------------------------------------------------------------------

export interface SeriesVolume {
  position: number
  olKey: string
  title: string
  authors: string[]
  year: number | null
  coverUrl: string | null
}

/**
 * The other books in a series, in order.
 *
 * Only volumes Open Library gives a numbered place in the sequence: they file
 * all sorts under a series name — a book about the films under "The Lord of
 * the Rings", something unrelated under "The Empyrean" — and having a position
 * is what separates a volume from a book that merely mentions the series.
 *
 * Cached for the session like search is, because a series does not change
 * while you are looking at it and Open Library is slow enough that asking
 * twice is worth avoiding.
 */
const seriesCache = new Map<string, SeriesVolume[]>()

export async function getSeries(name: string): Promise<SeriesVolume[]> {
  const key = name.trim().toLowerCase()
  if (!key) return []

  const cached = seriesCache.get(key)
  if (cached) return cached

  const { data, error } = await supabase.functions.invoke(
    `openlibrary?series=${encodeURIComponent(name.trim())}`,
    { method: 'GET' },
  )
  if (error) throw error
  if (data?.unavailable) throw new CatalogueUnavailable()

  const volumes = ((data?.volumes ?? []) as Array<Record<string, any>>).map((v) => ({
    position: v.position,
    olKey: v.olKey,
    title: v.title,
    authors: v.authors ?? [],
    year: v.year ?? null,
    coverUrl: v.coverId ? COVER(v.coverId, 'M') : null,
  }))

  if (volumes.length) seriesCache.set(key, volumes)
  return volumes
}

export interface SharedList {
  id: string
  name: string
  count: number
  /** A few jackets, so a list reads as books rather than as a row of text. */
  covers: Array<{ bookId: number; olKey: string; title: string; coverUrl: string | null }>
}

/**
 * The lists this group shares.
 *
 * A shared list is where a group's next read comes from, so it belongs on the
 * group's own page and not only under your lists — otherwise the only way to
 * find what the group is choosing between is to remember it exists.
 */
export async function getGroupReadingLists(groupId: string): Promise<SharedList[]> {
  const { data, error } = await supabase
    .from('reading_lists')
    .select('id, name, items:reading_list_items(book:books!inner(id, ol_key, title, cover_id))')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
    const items = (row.items ?? []) as Array<Record<string, any>>
    return {
      id: row.id,
      name: row.name,
      count: items.length,
      covers: items.slice(0, 6).map((i) => ({
        bookId: i.book.id,
        olKey: i.book.ol_key,
        title: i.book.title,
        coverUrl: i.book.cover_id ? COVER(i.book.cover_id, 'M') : null,
      })),
    }
  })
}

// ---------------------------------------------------------------------------
// What a book is, and whether you would get on with it
// ---------------------------------------------------------------------------

export interface BookThoughts {
  /** The written description. Shared: the same for every reader. */
  description: string | null
  /** Why THIS reader might like it. Theirs alone. */
  would: string | null
  wouldnt: string | null
}

/** What has already been written, if anything. Costs nothing. */
export async function getBookThoughts(bookId: number): Promise<BookThoughts | null> {
  const [fit, row] = await Promise.all([
    supabase.from('book_fit').select('would, wouldnt').eq('book_id', bookId).maybeSingle(),
    supabase.from('books').select('ai_description').eq('id', bookId).maybeSingle(),
  ])

  const description = (row.data as Record<string, any> | null)?.ai_description ?? null
  const mine = fit.data as Record<string, any> | null
  if (!description && !mine) return null

  return {
    description,
    would: mine?.would ?? null,
    wouldnt: mine?.wouldnt ?? null,
  }
}

/**
 * Asks for a description, and for an honest word about whether you would
 * like it.
 *
 * Only ever on request. Every book anyone glanced at would otherwise cost a
 * call, and most books do not need explaining -- Open Library's own
 * description is often perfectly good, which is why it stays exactly where
 * it is and this goes underneath rather than over the top.
 *
 * Notes reach the prompt only if the reader turned that on, which is read
 * here rather than passed in, so no screen can get it wrong.
 */
export async function writeBookThoughts(
  olKey: string,
  language: string,
): Promise<BookThoughts> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('use_book_notes_for_recommendations')
    .eq('id', auth.user.id)
    .maybeSingle()

  const snapshot = await getReadingSnapshot(
    (profile as Record<string, any> | null)?.use_book_notes_for_recommendations === true,
  )

  const { data, error } = await supabase.functions.invoke<{
    bookId: number
    description: string | null
    would: string
    wouldnt: string | null
    error?: string
  }>('book-blurb', {
    body: {
      olKey,
      ratings: snapshot.ratings,
      notes: snapshot.notes,
      language,
    },
  })

  if (error) throw error
  if (!data) throw new Error('book-blurb returned nothing')
  if (data.error) throw new Error(data.error)

  // Written by the reader to their own row, not by the function on their
  // behalf: what they would make of a book is built from their ratings and
  // their notes, and RLS is what keeps it theirs rather than a promise made
  // in a function they cannot see.
  //
  // user_id is named because this is an upsert, and PostgREST does not apply
  // column DEFAULTs on that path.
  const { error: fitErr } = await supabase.from('book_fit').upsert(
    {
      user_id: auth.user.id,
      book_id: data.bookId,
      would: data.would,
      wouldnt: data.wouldnt,
    },
    { onConflict: 'user_id,book_id' },
  )
  if (fitErr) throw fitErr

  return { description: data.description, would: data.would, wouldnt: data.wouldnt }
}

export interface KnownBook {
  olKey: string
  title: string
}

/**
 * Every book this reader already has something to do with.
 *
 * Read, on a list, or in their hands right now. The shelf excluded only
 * what had been READ, so a book sitting on a list waiting to be picked up
 * was recommended back to the person who put it there -- which is the one
 * suggestion that is certainly no use, because they have already decided.
 *
 * Both the title and the key. The title is what the prompt can be told to
 * avoid; the key is what actually identifies a book when the model offers
 * it back under a slightly different name.
 */
export async function getBooksAlreadyKnown(): Promise<KnownBook[]> {
  const shape = (rows: unknown) =>
    ((rows ?? []) as Array<Record<string, any>>)
      .map((r) => r.book)
      .filter(Boolean)
      .map((b: Record<string, any>) => ({ olKey: b.ol_key as string, title: b.title as string }))

  const pick = "book:books!inner(ol_key, title)"

  const [logged, listed, holding] = await Promise.all([
    supabase.from('book_log_entries').select(pick).limit(500),
    supabase.from('reading_list_items').select(pick).limit(500),
    supabase.from('book_progress').select(pick).limit(200),
  ])

  const all = [...shape(logged.data), ...shape(listed.data), ...shape(holding.data)]

  const seen = new Set<string>()
  return all.filter((b) => {
    if (!b.olKey || seen.has(b.olKey)) return false
    seen.add(b.olKey)
    return true
  })
}
