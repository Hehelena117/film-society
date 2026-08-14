import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { catalogTitle } from '@/lib/api'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import type { SupportedLanguage } from '@/lib/i18n'
import { addToWatchlist, createWatchlist, getMyWatchlists, type Watchlist } from '@/lib/watchlists'

export interface AddTarget {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
}

/**
 * Sheet for putting a title on a list.
 *
 * The title may not exist in our database yet — recommendations arrive as bare
 * TMDB ids — so it is catalogued on demand at the moment of adding rather than
 * speculatively for every poster the user scrolls past.
 */
export function AddToList({ target, onClose }: { target: AddTarget; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage

  const [lists, setLists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    getMyWatchlists()
      .then(setLists)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function add(listId: string) {
    setSaving(listId)
    setError(null)
    try {
      const cataloged = await catalogTitle(
        target.tmdbId,
        target.mediaType,
        language,
        profile?.country ?? 'DK',
      )
      await addToWatchlist(listId, cataloged.id)
      setDone(listId)
      window.setTimeout(onClose, 700)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(null)
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return
    setSaving('new')
    setError(null)
    try {
      const listId = await createWatchlist(newName.trim(), null, null)
      await add(listId)
    } catch (err) {
      setError(errorMessage(err))
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 z-60 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t('log.close')}
        onClick={onClose}
        className="absolute inset-0 bg-pitch/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('lists.addTo')}
        className="relative w-full max-w-md rounded-t-xl border border-rule bg-ground p-5 shadow-frame sm:rounded-xl"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
        <div className="rule-pip mb-4">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('lists.addTo')}</span>
        </div>

        <p className="type-title mb-5 text-center text-[1.125rem] text-ink">{target.name}</p>

        {error && <p className="mb-4 text-[0.8125rem] text-velvet-500">{error}</p>}

        {loading ? (
          <p className="type-meta py-6 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void add(list.id)}
                  className="flex w-full items-center justify-between rounded-[2px] border border-rule bg-ground-2 px-4 py-3 text-left transition-colors hover:border-brass-600 disabled:opacity-60"
                >
                  <span>
                    <span className="type-title block text-[1rem] text-ink">{list.name}</span>
                    {list.groupName && (
                      <span className="type-meta mt-1 block text-ink-3">{list.groupName}</span>
                    )}
                  </span>
                  <span className="type-meta text-accent">
                    {done === list.id ? '✓' : saving === list.id ? '…' : '+'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex gap-2 border-t border-rule pt-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('lists.newNamed')}
            maxLength={80}
            className="min-w-0 flex-1 rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
          />
          <button
            type="button"
            onClick={() => void createAndAdd()}
            disabled={saving !== null || !newName.trim()}
            className="type-marquee rounded-[2px] bg-velvet-600 px-4 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
          >
            {t('lists.create')}
          </button>
        </div>
      </div>
    </div>
  )
}
