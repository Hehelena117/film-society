import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PosterTile } from '@/components/PosterTile'
import { ScreenHeader } from '@/components/ScreenHeader'
import { errorMessage } from '@/lib/errors'
import { getProfileRatings, type RatedTitle } from '@/lib/profiles'
import type { TitleRef } from '@/screens/TitleDetail'

export interface CollectionTarget {
  userId: string
  username: string
}

type Sort = 'rating' | 'name' | 'year'

/**
 * Everything someone has rated, in one place.
 *
 * The profile deliberately shows shelves rather than the lot, so this is where
 * the lot lives — and where finding one particular film is the job, which is
 * why it has a search box and the profile does not.
 */
export function Collection({
  target,
  onBack,
  onOpenTitle,
}: {
  target: CollectionTarget
  onBack: () => void
  onOpenTitle: (ref: TitleRef) => void
}) {
  const { t, i18n } = useTranslation()
  const [ratings, setRatings] = useState<RatedTitle[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('rating')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getProfileRatings(target.userId, i18n.resolvedLanguage ?? 'en')
      .then((r) => active && setRatings(r))
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [target.userId, i18n.resolvedLanguage])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q ? ratings.filter((r) => r.name.toLowerCase().includes(q)) : ratings

    // Copy before sorting: the state array is not ours to reorder in place.
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, i18n.resolvedLanguage ?? 'en')
      // Undated titles sink rather than sorting as year zero.
      if (sort === 'year') return (b.year ?? 0) - (a.year ?? 0)
      return b.rating - a.rating || a.name.localeCompare(b.name)
    })
  }, [ratings, query, sort, i18n.resolvedLanguage])

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={target.username} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-6">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('collection.search')}
          aria-label={t('collection.search')}
          className="w-full rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(['rating', 'name', 'year'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={`type-marquee rounded-full border px-3.5 py-1.5 text-[11px] transition-colors ${
                  sort === s
                    ? 'border-brass-600 bg-brass-600/15 text-ink'
                    : 'border-rule-strong text-ink-3 hover:border-brass-600 hover:text-ink-2'
                }`}
              >
                {t(`collection.sort.${s}`)}
              </button>
            ))}
          </div>
          <span className="type-meta shrink-0 text-ink-3">{shown.length}</span>
        </div>

        {error && <p className="mt-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {loading ? (
          <p className="type-meta mt-10 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : shown.length === 0 ? (
          <p className="mt-10 text-center text-[0.875rem] text-ink-3">
            {query ? t('collection.noMatch') : t('people.noRatings')}
          </p>
        ) : (
          <ul className="mt-6 grid grid-cols-3 gap-3">
            {shown.map((r) => (
              <li key={r.titleId}>
                <PosterTile
                  rated={r}
                  onOpen={() => onOpenTitle({ tmdbId: r.tmdbId, mediaType: r.mediaType })}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
