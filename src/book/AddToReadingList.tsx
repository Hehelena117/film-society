import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  addToReadingList,
  catalogBook,
  createReadingList,
  getMyReadingLists,
  type ReadingList,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'

/**
 * Puts a book on a list, from wherever you happen to be looking at it.
 *
 * The book is catalogued first: `reading_list_items.book_id` is a foreign key
 * into our own cache, and a book found by search has not been written there
 * yet. Doing it here rather than at the call site means every route in — the
 * shelf, a book's page, a search result — goes through the same door.
 *
 * Anyone who can read a list can add to it, so the lists offered here include
 * the ones shared with your groups, not only your own.
 */
export function AddToReadingList({
  olKey,
  title,
  onClose,
}: {
  olKey: string
  title: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()

  const [lists, setLists] = useState<ReadingList[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getMyReadingLists()
      .then((l) => active && setLists(l))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  async function add(listId: string) {
    setBusy(listId)
    setError(null)
    try {
      const book = await catalogBook(olKey, i18n.resolvedLanguage ?? 'en')
      await addToReadingList(listId, book.id)
      setAdded(listId)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return
    setBusy('new')
    setError(null)
    try {
      const listId = await createReadingList(newName, null)
      const book = await catalogBook(olKey, i18n.resolvedLanguage ?? 'en')
      await addToReadingList(listId, book.id)
      setNewName('')
      setLists(await getMyReadingLists())
      setAdded(listId)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('book.lists.addTo')}
      className="fixed inset-0 z-50 flex items-end justify-center bg-pitch/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-[6px] border border-rule bg-ground px-6 pt-6 pb-8 shadow-frame sm:rounded-[3px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rule-pip mb-1">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('book.lists.addTo')}</span>
        </div>
        <p className="type-title mb-5 text-center text-[1.1rem] leading-tight text-ink">{title}</p>

        {error && <p className="mb-4 text-[0.8125rem] text-accent">{error}</p>}

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => void add(list.id)}
                  disabled={busy !== null || added === list.id}
                  className={`flex w-full items-center justify-between gap-3 rounded-[2px] border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                    added === list.id
                      ? 'border-accent bg-accent/10'
                      : 'border-rule bg-ground-2 hover:border-brass-600'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="type-title block text-[1rem] text-ink">{list.name}</span>
                    <span className="type-meta mt-0.5 block text-ink-3">
                      {[
                        t('lists.count', { count: list.count }),
                        list.groupName ?? t('lists.justMe'),
                      ].join(' · ')}
                    </span>
                  </span>
                  <span className="type-marquee shrink-0 text-[12px] text-accent">
                    {added === list.id ? t('book.lists.added') : busy === list.id ? '…' : '+'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Somewhere to put it when there is no list yet, which is the state
            every new reader is in. */}
        <div className="mt-5 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('book.lists.newNamed')}
            maxLength={80}
            className="min-w-0 flex-1 rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
          />
          <button
            type="button"
            onClick={() => void createAndAdd()}
            disabled={!newName.trim() || busy !== null}
            className="type-marquee shrink-0 rounded-[2px] bg-accent px-4 text-[12px] text-plate disabled:opacity-40"
          >
            {t('lists.create')}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="type-meta mt-6 w-full text-center text-ink-3 underline underline-offset-4 hover:text-ink-2"
        >
          {t('log.close')}
        </button>
      </div>
    </div>
  )
}
