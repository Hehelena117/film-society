import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import type { TitleRef } from '@/screens/TitleDetail'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { deleteEntry, getMyLog, type LoggedEntry } from '@/lib/log'

/** Your own shelf: everything you have logged, with the notes only you can see. */
export function Me({
  onOpenTitle,
  onFindPeople,
  onOpenProfile,
  onEditProfile,
}: {
  onOpenTitle: (ref: TitleRef) => void
  onFindPeople: () => void
  onOpenProfile: (userId: string) => void
  onEditProfile: () => void
}) {
  const { t, i18n } = useTranslation()
  const { profile, signOut, user } = useAuth()
  const [entries, setEntries] = useState<LoggedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await getMyLog(i18n.resolvedLanguage ?? 'en'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [i18n.resolvedLanguage])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    try {
      await deleteEntry(id)
      setEntries((current) => current.filter((e) => e.id !== id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const rated = entries.filter((e) => e.rating !== null)
  const average = rated.length
    ? (rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length).toFixed(1)
    : null
  const distinctTitles = new Set(entries.map((e) => e.title.id)).size

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={profile?.username ?? t('me.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {/* ---- Ticket stub of totals -------------------------------------- */}
        <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <dl className="flex justify-around text-center">
            <div>
              <dt className="type-meta text-ink-3">{t('me.watched')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{distinctTitles}</dd>
            </div>
            <div>
              <dt className="type-meta text-ink-3">{t('me.entries')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{entries.length}</dd>
            </div>
            <div>
              <dt className="type-meta text-ink-3">{t('me.average')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{average ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => user && onOpenProfile(user.id)}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('people.myProfile')}
          </button>
          <button
            type="button"
            onClick={onEditProfile}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('edit.open')}
          </button>
          <button
            type="button"
            onClick={onFindPeople}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('people.find')}
          </button>
        </div>

        {error && <p className="mt-5 text-[0.875rem] text-velvet-500">{error}</p>}

        <div className="rule-pip my-8">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('me.log')}</span>
        </div>

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="mt-6 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('me.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex gap-4 rounded-[2px] border border-rule bg-ground-2 p-3"
              >
                <button
                  type="button"
                  onClick={() =>
                    onOpenTitle({
                      tmdbId: entry.title.tmdbId,
                      mediaType: entry.title.mediaType,
                    })
                  }
                  aria-label={entry.title.name}
                  className="w-16 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5"
                >
                  <div className="relative aspect-2/3 overflow-hidden bg-pitch">
                    {entry.title.posterUrl && (
                      <img
                        src={entry.title.posterUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* Same problem as the watchlist grid: the poster opened
                        the title page but nothing said so. */}
                    <span className="type-meta absolute inset-x-0 bottom-0 bg-pitch/75 py-0.5 text-center text-[8px] text-plate">
                      {t('lists.details')}
                    </span>
                  </div>
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="type-title text-[1.0625rem] leading-tight text-ink">
                      {entry.title.name}
                      {entry.title.year && (
                        <span className="text-ink-3"> ({entry.title.year})</span>
                      )}
                    </h3>
                    {entry.rating !== null && (
                      <span className="type-marquee shrink-0 rounded-[2px] bg-velvet-600 px-2 py-1 text-[12px] text-plate">
                        {entry.rating}
                      </span>
                    )}
                  </div>

                  <p className="type-meta mt-1.5 text-ink-3">
                    {[
                      entry.seasonNumber && t('log.seasonN', { n: entry.seasonNumber }),
                      entry.watchedOn ?? t('me.noDate'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  {entry.note && (
                    <p className="mt-2 border-l-2 border-brass-600/40 pl-3 text-[0.8125rem] leading-relaxed text-ink-2 italic">
                      {entry.note}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void remove(entry.id)}
                    className="mt-2 text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
                  >
                    {t('me.delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="type-meta mt-12 w-full text-center text-ink-3 underline underline-offset-4 hover:text-velvet-500"
        >
          {t('auth.signOut')}
        </button>
      </main>
    </div>
  )
}
