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
