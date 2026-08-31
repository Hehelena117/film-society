import { supabase } from '@/lib/supabase'

export type BookActivityKind = 'rated' | 'added' | 'decided' | 'joined' | 'started'

export interface BookActivityItem {
  id: string
  kind: BookActivityKind
  username: string
  avatarUrl: string | null
  rating: number | null
  createdAt: string
  book: { title: string; authors: string[]; coverUrl: string | null; olKey: string } | null
  listName: string | null
}

const COVER = (id: number) => `https://covers.openlibrary.org/b/id/${id}-M.jpg?default=false`

/**
 * What has been happening in one book group.
 *
 * Only inside a group, exactly as on the film side: there is no global feed
 * and there is not going to be one. RLS enforces it — the read policy checks
 * membership — so this cannot leak by a forgotten filter.
 */
export async function getBookGroupActivity(
  groupId: string,
  limit = 40,
): Promise<BookActivityItem[]> {
  const { data, error } = await supabase
    .from('book_activity')
    .select(
      'id, kind, rating, created_at, user_id, ' +
        'actor:profiles!inner(username, avatar_url), ' +
        'book:books(ol_key, title, authors, cover_id), ' +
        'list:reading_lists(name)',
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    kind: row.kind,
    username: row.actor?.username ?? '—',
    avatarUrl: row.actor?.avatar_url ?? null,
    rating: row.rating,
    createdAt: row.created_at,
    book: row.book
      ? {
          title: row.book.title,
          authors: row.book.authors ?? [],
          coverUrl: row.book.cover_id ? COVER(row.book.cover_id) : null,
          olKey: row.book.ol_key,
        }
      : null,
    listName: row.list?.name ?? null,
  }))
}

/**
 * Tells every book group you are in.
 *
 * Failure is swallowed on purpose. Announcing is a side effect of finishing a
 * book, and a feed that will not write must never be the reason a rating is
 * lost — the film side made the same call for the same reason.
 */
export async function announceBook(entry: {
  kind: BookActivityKind
  bookId?: number | null
  listId?: string | null
  rating?: number | null
}): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser()
    const me = auth.user?.id
    if (!me) return

    // Book groups only. The tables are shared with the film side, so without
    // this filter finishing a novel would post into a film group.
    const { data: groups } = await supabase
      .from('group_members')
      .select('group_id, group:groups!inner(side)')
      .eq('user_id', me)
      .eq('group.side', 'book')

    const rows = (groups ?? []).map((g: Record<string, any>) => ({
      group_id: g.group_id,
      kind: entry.kind,
      book_id: entry.bookId ?? null,
      list_id: entry.listId ?? null,
      rating: entry.rating ?? null,
    }))

    if (rows.length) await supabase.from('book_activity').insert(rows)
  } catch (err) {
    console.error('Could not post book activity', err)
  }
}

export interface CurrentRead {
  userId: string
  username: string
  avatarUrl: string | null
  postedAt: string
  book: { title: string; authors: string[]; coverUrl: string | null; olKey: string }
}

/**
 * What people in a group have said they are reading.
 *
 * Built from what people chose to POST, not from book_progress. Progress is
 * owner-only and stays that way — "she is 12% into it" is nobody else's
 * business, and there is no setting here that could quietly turn that around.
 * Telling the group is a deliberate act, so this shows exactly what was
 * deliberately told.
 *
 * A post is superseded by finishing: if someone rated the same book after
 * saying they had started it, they are no longer reading it. That is inferred
 * rather than stored, so nobody has to remember to un-post.
 */
export async function getGroupCurrentlyReading(groupId: string): Promise<CurrentRead[]> {
  const { data, error } = await supabase
    .from('book_activity')
    .select(
      'user_id, book_id, kind, created_at, ' +
        'actor:profiles!inner(username, avatar_url), ' +
        'book:books!inner(ol_key, title, authors, cover_id)',
    )
    .eq('group_id', groupId)
    .in('kind', ['started', 'rated'])
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error

  const rows = (data ?? []) as Array<Record<string, any>>
  const one = (v: any) => (Array.isArray(v) ? v[0] : v)

  // Finished first, so a start can be checked against it.
  const finished = new Set(
    rows.filter((r) => r.kind === 'rated').map((r) => `${r.user_id}:${r.book_id}`),
  )

  const seen = new Set<string>()
  const out: CurrentRead[] = []

  for (const row of rows) {
    if (row.kind !== 'started') continue
    // Newest first, so the first start found for a person is their latest.
    if (seen.has(row.user_id)) continue
    if (finished.has(`${row.user_id}:${row.book_id}`)) continue

    seen.add(row.user_id)
    const actor = one(row.actor)
    const book = one(row.book)
    out.push({
      userId: row.user_id,
      username: actor?.username ?? '—',
      avatarUrl: actor?.avatar_url ?? null,
      postedAt: row.created_at,
      book: {
        title: book.title,
        authors: book.authors ?? [],
        coverUrl: book.cover_id ? COVER(book.cover_id) : null,
        olKey: book.ol_key,
      },
    })
  }

  return out
}

/** Tells your book groups what you have picked up. Nothing else changes. */
export interface Told {
  /** Book groups you are in at all. Zero means there was nobody to tell. */
  groups: number
  /** How many of them this book was new to. */
  posted: number
}

/**
 * Tell your book groups what you have picked up.
 *
 * Written out rather than handed to announceBook, which swallows every
 * error on purpose — a feed line that fails to post is not worth
 * interrupting anybody over. This one has a button behind it that says
 * "your groups know", and saying that when nothing was written is worse
 * than an error. It also could not tell you the difference between posting
 * to three groups and being in none, which look identical from the outside
 * and are not the same thing at all.
 */
export async function postCurrentRead(bookId: number): Promise<Told> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) throw new Error('Not signed in')

  // Book groups only. The tables are shared with the film side, so without
  // this a novel would be announced to a film group.
  const { data: groups, error: gErr } = await supabase
    .from('group_members')
    .select('group_id, group:groups!inner(side)')
    .eq('user_id', me)
    .eq('group.side', 'book')
  if (gErr) throw gErr

  const ids = (groups ?? []).map((g: Record<string, any>) => g.group_id as string)
  if (!ids.length) return { groups: 0, posted: 0 }

  // Saying it twice is not saying it louder.
  const { data: already, error: aErr } = await supabase
    .from('book_activity')
    .select('group_id')
    .eq('user_id', me)
    .eq('book_id', bookId)
    .eq('kind', 'started')
    .in('group_id', ids)
  if (aErr) throw aErr

  const done = new Set((already ?? []).map((r) => r.group_id as string))
  const rows = ids
    .filter((id) => !done.has(id))
    .map((id) => ({
      group_id: id,
      // Named rather than left to the column DEFAULT. The write policy
      // checks user_id = auth.uid(), and a row failing that check is
      // refused quietly.
      user_id: me,
      kind: 'started' as const,
      book_id: bookId,
    }))

  if (rows.length) {
    const { error } = await supabase.from('book_activity').insert(rows)
    if (error) throw error
  }

  return { groups: ids.length, posted: rows.length }
}
