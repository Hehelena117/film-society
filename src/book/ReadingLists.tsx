import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Cover } from '@/book/Cover'
import { ScreenHeader } from '@/components/ScreenHeader'
import {
  createReadingList,
  deleteReadingList,
  getMyReadingLists,
  getReadingListItems,
  removeFromReadingList,
  setReadingListGroup,
  type ReadingList,
  type ReadingListItem,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'
import { getMyGroups, type Group } from '@/lib/groups'

/**
 * Reading lists: things you mean to read, alone or with a group.
 *
 * A list shared with a book group is what a book-club pick is decided from,
 * so sharing is offered on an existing list and not only at the moment of
 * making one — deciding to read something together rarely happens on the same
 * day as starting the list.
 */
export function ReadingLists({
  onOpenBook,
  onStartSwipe,
}: {
  onOpenBook: (olKey: string) => void
  onStartSwipe: (sessionId: string) => void
}) {
  const { t } = useTranslation()

  const [lists, setLists] = useState<ReadingList[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState<ReadingList | null>(null)
  const [items, setItems] = useState<ReadingListItem[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, g] = await Promise.all([getMyReadingLists(), getMyGroups('book')])
      setLists(l)
      setGroups(g)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!open) return
    let active = true
    getReadingListItems(open.id)
      .then((i) => active && setItems(i))
      .catch((err) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [open])

  async function create() {
    if (!name.trim()) return
    try {
      await createReadingList(name, groupId || null)
      setName('')
      setGroupId('')
      setCreating(false)
      await load()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // ---- one list, opened -----------------------------------------------------
  if (open) {
    return (
      <div className="min-h-dvh wall-ground texture-wall pb-28">
        <ScreenHeader title={open.name} onBack={() => setOpen(null)} />

        <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
          {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

          {/* Sharing, after the fact. */}
          {open.isOwner && (
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('book.lists.shareWith')}</span>
              <select
                value={open.groupId ?? ''}
                onChange={async (e) => {
                  const next = e.target.value || null
                  try {
                    await setReadingListGroup(open.id, next)
                    setOpen({ ...open, groupId: next })
                    await load()
                  } catch (err) {
                    setError(errorMessage(err))
                  }
                }}
                className="w-full rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              >
                <option value="">{t('lists.justMe')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              {groups.length === 0 && (
                <span className="mt-1.5 block text-[0.75rem] text-ink-3">
                  {t('book.lists.noGroupsYet')}
                </span>
              )}
            </label>
          )}

          {/* Deciding together needs a group to decide with. */}
          <button
            type="button"
            disabled={items.length < 2}
            onClick={async () => {
              try {
                const { startBookSwipe } = await import('@/lib/bookSwipe')
                onStartSwipe(await startBookSwipe(open.id))
              } catch (err) {
                setError(errorMessage(err))
              }
            }}
            className="type-marquee mt-4 w-full rounded-[2px] bg-accent py-3.5 text-[13px] text-plate disabled:opacity-40"
          >
            {t('book.swipe.start')}
          </button>
          {items.length < 2 ? (
            <p className="mt-2 text-center text-[0.75rem] leading-relaxed text-ink-3">
              {t('book.swipe.needsTwo')}
            </p>
          ) : !open.groupId ? (
            <p className="mt-2 text-center text-[0.75rem] leading-relaxed text-ink-3">
              {t('book.swipe.justYou')}
            </p>
          ) : null}

          <div className="rule-pip mt-8 mb-4">
            <span className="type-meta whitespace-nowrap text-ink-3">
              {t('lists.count', { count: items.length })}
            </span>
          </div>

          {items.length === 0 ? (
            <p className="text-center text-[0.875rem] text-ink-3">{t('lists.emptyList')}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {items.map((item) => (
                <li key={item.bookId}>
                  <button
                    type="button"
                    onClick={() => onOpenBook(item.olKey)}
                    className="block w-full text-left"
                  >
                    <Cover url={item.coverUrl} title={item.title} className="shadow-lift" />
                    <span className="mt-1.5 line-clamp-2 block text-[0.7rem] leading-tight text-ink">
                      {item.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await removeFromReadingList(open.id, item.bookId)
                        setItems((c) => c.filter((x) => x.bookId !== item.bookId))
                      } catch (err) {
                        setError(errorMessage(err))
                      }
                    }}
                    className="mt-1 text-[0.65rem] text-ink-3 underline underline-offset-2 hover:text-accent"
                  >
                    {t('lists.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {open.isOwner && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteReadingList(open.id)
                  setOpen(null)
                  await load()
                } catch (err) {
                  setError(errorMessage(err))
                }
              }}
              className="type-meta mt-10 w-full text-center text-ink-3 underline underline-offset-4 hover:text-accent"
            >
              {t('book.lists.delete')}
            </button>
          )}
        </main>
      </div>
    )
  }

  // ---- all lists ------------------------------------------------------------
  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('book.lists.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

        {creating ? (
          <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('book.lists.name')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-[2px] border border-rule bg-ground px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              />
            </label>

            <label className="mt-4 block">
              <span className="type-meta mb-2 block text-ink-3">{t('book.lists.shareWith')}</span>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              >
                <option value="">{t('lists.justMe')}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void create()}
                className="type-marquee flex-1 rounded-[2px] bg-accent py-3 text-[13px] text-plate"
              >
                {t('lists.create')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-3 text-[13px] text-ink-2"
              >
                {t('log.close')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-4 text-[13px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            + {t('book.lists.new')}
          </button>
        )}

        {loading ? (
          <p className="type-meta mt-8 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : lists.length === 0 ? (
          <p className="mt-8 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('book.lists.empty')}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => setOpen(list)}
                  className="flex w-full items-center justify-between gap-3 rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span className="min-w-0">
                    <span className="type-title block text-[1.0625rem] text-ink">{list.name}</span>
                    <span className="type-meta mt-1 block text-ink-3">
                      {[
                        t('lists.count', { count: list.count }),
                        list.groupName ?? t('lists.justMe'),
                      ].join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
