import { useCallback, useEffect, useMemo, useState } from 'react'
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
  // Which row is open. One at a time: the log is meant to be scannable, and a
  // screen of expanded rows is the wall of text this replaced.
  const [openEntry, setOpenEntry] = useState<string | null>(null)

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

  /**
   * The log broken into months, newest first.
   *
   * Read as a diary rather than a heap: "August 2026" tells you where you are
   * in a way that row 47 of 200 does not. Entries arrive newest-first already,
   * so the groups come out in order without a second sort.
   *
   * Dated by when it was watched where that is known, and by when it was logged
   * where it is not — an entry with no date still has to sit somewhere, and the
   * day you wrote it down is the honest fallback.
   */
  const months = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
      month: 'long',
      year: 'numeric',
    })

    const groups: Array<{ key: string; label: string; entries: LoggedEntry[] }> = []
    for (const entry of entries) {
      const when = new Date(entry.watchedOn ?? entry.createdAt)
      const key = `${when.getFullYear()}-${when.getMonth()}`
      const last = groups[groups.length - 1]
      if (last?.key === key) last.entries.push(entry)
      else groups.push({ key, label: format.format(when), entries: [entry] })
    }
    return groups
  }, [entries, i18n.resolvedLanguage])

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
          months.map((month) => (
            <section key={month.key} className="mb-7">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 className="type-marquee text-[14px] text-ink">{month.label}</h3>
                <span className="type-meta text-ink-3">{month.entries.length}</span>
              </div>

              <ul className="flex flex-col divide-y divide-rule rounded-[2px] border border-rule bg-ground-2">
                {month.entries.map((entry) => (
                  <LogRow
                    key={entry.id}
                    entry={entry}
                    open={openEntry === entry.id}
                    onToggle={() => setOpenEntry((c) => (c === entry.id ? null : entry.id))}
                    onOpenTitle={() =>
                      onOpenTitle({
                        tmdbId: entry.title.tmdbId,
                        mediaType: entry.title.mediaType,
                      })
                    }
                    onDelete={() => void remove(entry.id)}
                  />
                ))}
              </ul>
            </section>
          ))
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

/**
 * One viewing, one line.
 *
 * The note used to be printed in full on every row, which read beautifully at
 * three entries and became a wall of text at forty. It is folded to a single
 * line here and opens on a tap — and since the row has to expand anyway,
 * deleting lives inside that too, where it cannot be hit by accident while
 * scrolling.
 */
function LogRow({
  entry,
  open,
  onToggle,
  onOpenTitle,
  onDelete,
}: {
  entry: LoggedEntry
  open: boolean
  onToggle: () => void
  onOpenTitle: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  const meta = [
    entry.seasonNumber && t('log.seasonN', { n: entry.seasonNumber }),
    entry.watchedOn ?? t('me.noDate'),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <div className="flex items-center gap-3 p-2.5">
        <button
          type="button"
          onClick={onOpenTitle}
          aria-label={entry.title.name}
          className="w-11 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5"
        >
          <div className="aspect-2/3 overflow-hidden bg-pitch">
            {entry.title.posterUrl && (
              <img
                src={entry.title.posterUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
            {entry.title.name}
            {entry.title.year && <span className="text-ink-3"> ({entry.title.year})</span>}
          </p>
          <p className="type-meta mt-1 truncate text-ink-3">
            {meta}
            {entry.note && !open && (
              <span className="text-ink-3/80"> · {entry.note}</span>
            )}
          </p>
        </button>

        {entry.rating !== null && (
          <span className="type-marquee shrink-0 rounded-[2px] bg-velvet-600 px-2 py-1 text-[12px] text-plate">
            {entry.rating}
          </span>
        )}
      </div>

      {open && (
        <div className="px-2.5 pb-3 pl-[4.25rem]">
          {entry.note && (
            <p className="border-l-2 border-brass-600/40 pl-3 text-[0.8125rem] leading-relaxed text-ink-2 italic">
              {entry.note}
            </p>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="mt-2 text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
          >
            {t('me.delete')}
          </button>
        </div>
      )}
    </li>
  )
}
