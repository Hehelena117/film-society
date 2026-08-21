import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  deleteReadEntry,
  getCurrentlyReading,
  getMyReading,
  setProgress,
  type ReadEntry,
  type Reading,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'

/** Your own shelf: what you are in the middle of, and everything you have finished. */
export function MyShelf({
  onOpenBook,
  onSwitchSide,
  onFrontDoor,
}: {
  onOpenBook: (olKey: string) => void
  onSwitchSide: () => void
  onFrontDoor: () => void
}) {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()

  const [reading, setReading] = useState<Reading[]>([])
  const [entries, setEntries] = useState<ReadEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openEntry, setOpenEntry] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, e] = await Promise.all([getCurrentlyReading(), getMyReading()])
      setReading(r)
      setEntries(e)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function nudge(bookId: number, percent: number) {
    setReading((current) =>
      current.map((r) => (r.bookId === bookId ? { ...r, percent } : r)),
    )
    try {
      await setProgress(bookId, percent)
    } catch (err) {
      setError(errorMessage(err))
      void load()
    }
  }

  const rated = entries.filter((e) => e.rating !== null)
  const average = rated.length
    ? (rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length).toFixed(1)
    : null
  const distinct = new Set(entries.map((e) => e.book.id)).size

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={profile?.username ?? t('book.nav.me')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <dl className="flex justify-around text-center">
            <Stat label={t('book.stats.read')} value={distinct} />
            <Stat label={t('book.stats.entries')} value={entries.length} />
            <Stat label={t('me.average')} value={average ?? '—'} />
          </dl>
        </div>

        {/* The door back to the other half. */}
        <button
          type="button"
          onClick={onSwitchSide}
          className="type-marquee mt-4 w-full rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
        >
          {t('book.toFilm')}
        </button>

        {error && <p className="mt-5 text-[0.875rem] text-accent">{error}</p>}

        {/* ---- Currently reading ------------------------------------------ */}
        {reading.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2">
              <h3 className="type-marquee text-[14px] text-ink">{t('book.reading.title')}</h3>
              <span className="type-meta ml-auto text-ink-3">{reading.length}</span>
            </div>

            <ul className="flex flex-col gap-4">
              {reading.map((r) => (
                <li key={r.bookId} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenBook(r.book.olKey)}
                    aria-label={r.book.title}
                    className="w-12 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5"
                  >
                    <span className="block aspect-[2/3] overflow-hidden bg-pitch">
                      {r.book.coverUrl && (
                        <img
                          src={r.book.coverUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
                      {r.book.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {/* The bookmark's position along the block. */}
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-rule">
                        <span
                          className="block h-full bg-accent"
                          style={{ width: `${r.percent}%` }}
                        />
                      </span>
                      <span className="type-meta shrink-0 text-ink-3">{r.percent}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={r.percent}
                      onChange={(e) =>
                        setReading((current) =>
                          current.map((x) =>
                            x.bookId === r.bookId ? { ...x, percent: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      onPointerUp={() => void nudge(r.bookId, r.percent)}
                      onKeyUp={() => void nudge(r.bookId, r.percent)}
                      aria-label={t('book.progress.title')}
                      className="mt-1 w-full accent-accent"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Finished ---------------------------------------------------- */}
        <div className="rule-pip mt-8 mb-4">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('book.finished')}</span>
        </div>

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="mt-6 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('book.empty')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule/60">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpenBook(entry.book.olKey)}
                    aria-label={entry.book.title}
                    className="w-11 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5"
                  >
                    <span className="block aspect-[2/3] overflow-hidden bg-pitch">
                      {entry.book.coverUrl && (
                        <img
                          src={entry.book.coverUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setOpenEntry((c) => (c === entry.id ? null : entry.id))
                    }
                    aria-expanded={openEntry === entry.id}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
                      {entry.book.title}
                    </p>
                    <p className="type-meta mt-1 truncate text-ink-3">
                      {[entry.book.authors[0], entry.book.year].filter(Boolean).join(' · ')}
                    </p>
                    {/* Sentence case, not type-meta — that utility uppercases,
                        and a note previewed in capitals reads as a label. */}
                    {entry.note && openEntry !== entry.id && (
                      <p className="mt-1 truncate text-[0.75rem] leading-snug text-ink-3/90 italic">
                        {entry.note}
                      </p>
                    )}
                  </button>

                  {entry.rating !== null && (
                    <span className="type-marquee shrink-0 rounded-[2px] border border-accent/40 px-1.5 py-0.5 text-[12px] text-accent">
                      {entry.rating}
                    </span>
                  )}
                </div>

                {openEntry === entry.id && (
                  <div className="pb-3 pl-[3.5rem]">
                    {entry.note && (
                      <p className="border-l-2 border-brass-600/40 pl-3 text-[0.8125rem] leading-relaxed text-ink-2 italic">
                        {entry.note}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteReadEntry(entry.id)
                          setEntries((c) => c.filter((e) => e.id !== entry.id))
                        } catch (err) {
                          setError(errorMessage(err))
                        }
                      }}
                      className="mt-2 text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-accent"
                    >
                      {t('me.delete')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Both ways out, together at the foot of the page. */}
        <button
          type="button"
          onClick={onFrontDoor}
          className="type-meta mt-12 w-full text-center text-ink-3 underline underline-offset-4 hover:text-ink-2"
        >
          {t('chooser.frontDoor')}
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          className="type-meta mt-3 w-full text-center text-ink-3 underline underline-offset-4 hover:text-accent"
        >
          {t('auth.signOut')}
        </button>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="type-meta text-ink-3">{label}</dt>
      <dd className="type-title mt-1 text-[1.5rem] text-ink">{value}</dd>
    </div>
  )
}
