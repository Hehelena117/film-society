import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Cover } from '@/book/Cover'
import { TellGroups } from '@/book/TellGroups'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  deleteReadEntry,
  updateReadEntry,
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
  onOpenProfile,
  onFindPeople,
}: {
  onOpenBook: (olKey: string) => void
  onSwitchSide: () => void
  onFrontDoor: () => void
  onOpenProfile: (userId: string) => void
  onFindPeople: () => void
}) {
  const { t, i18n } = useTranslation()
  const { profile, signOut, user } = useAuth()

  const [reading, setReading] = useState<Reading[]>([])
  const [entries, setEntries] = useState<ReadEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

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

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => user && onOpenProfile(user.id)}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('book.profile.mine')}
          </button>
          <button
            type="button"
            onClick={onFindPeople}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('people.find')}
          </button>
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
                    className="w-12 shrink-0"
                  >
                    <Cover url={r.book.coverUrl} title={r.book.title} />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
                      {r.book.title}
                    </p>
                    {/* One control, not two. This drew a progress bar AND a
                        range input under it — the same number twice, one of
                        them inert, which read as two smudges stacked up. */}
                    <div className="mt-1 flex items-center gap-2">
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
                        className="bookmark-slider min-w-0 flex-1"
                        style={{ ['--read']: `${r.percent}%` } as React.CSSProperties}
                      />
                      <span className="type-meta w-9 shrink-0 text-right text-ink-3">
                        {r.percent}%
                      </span>
                    </div>

                    {r.startedOn && (
                      <p className="type-meta mt-0.5 text-ink-3/80">
                        {/* Not the raw 2026-08-14. Nobody reads a date aloud
                            that way, and the film log was corrected for the
                            same reason. */}
                        {t('book.reading.since', {
                          date: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
                            day: 'numeric',
                            month: 'long',
                          }).format(new Date(r.startedOn)),
                        })}
                      </p>
                    )}

                    {/* Here as well as on the book itself, because a book
                        you started a while ago is one you reach through
                        the shelf and not by searching for it again. */}
                    <TellGroups
                      bookId={r.bookId}
                      className="mt-1 text-[0.75rem] text-ink-3 underline underline-offset-2 transition-colors hover:text-accent"
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
                    className="w-11 shrink-0"
                  >
                    <Cover url={entry.book.coverUrl} title={entry.book.title} />
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
                    {editing === entry.id ? (
                      <EditReading
                        entry={entry}
                        onCancel={() => setEditing(null)}
                        onSaved={(patch) => {
                          setEntries((c) =>
                            c.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
                          )
                          setEditing(null)
                        }}
                        onError={setError}
                      />
                    ) : (
                      <>
                        {entry.note && (
                          <p className="border-l-2 border-brass-600/40 pl-3 text-[0.8125rem] leading-relaxed text-ink-2 italic">
                            {entry.note}
                          </p>
                        )}
                        <div className="mt-2 flex gap-4">
                          <button
                            type="button"
                            onClick={() => setEditing(entry.id)}
                            className="text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-ink"
                          >
                            {t('book.edit.open')}
                          </button>
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
                            className="text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-accent"
                          >
                            {t('me.delete')}
                          </button>
                        </div>
                      </>
                    )}
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

/**
 * Changing a reading after the fact.
 *
 * People misremember when they finished something, change their mind about a
 * score a week later, and think of the thing they actually wanted to say long
 * after closing the book. All three are editable for that reason.
 *
 * Inline rather than a separate sheet: you are already looking at the row you
 * want to change, and being sent elsewhere to alter one number loses the
 * context that made you want to alter it.
 */
function EditReading({
  entry,
  onCancel,
  onSaved,
  onError,
}: {
  entry: ReadEntry
  onCancel: () => void
  onSaved: (patch: {
    rating: number | null
    finishedOn: string | null
    note: string | null
  }) => void
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const [rating, setRating] = useState<number | null>(entry.rating)
  const [finishedOn, setFinishedOn] = useState(entry.finishedOn ?? '')
  const [note, setNote] = useState(entry.note ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const patch = {
        rating,
        finishedOn: finishedOn || null,
        note: note.trim() || null,
      }
      await updateReadEntry({ entryId: entry.id, ...patch })
      onSaved(patch)
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 rounded-[2px] border border-rule bg-ground px-3 py-3">
      <fieldset>
        <legend className="type-meta mb-2 text-ink-3">{t('log.rating')}</legend>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              aria-pressed={rating === n}
              className={`type-marquee rounded-[2px] border py-1.5 text-[11px] transition-colors ${
                rating === n
                  ? 'border-accent bg-accent text-plate'
                  : 'border-rule text-ink-3 hover:border-brass-600 hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[0.7rem] text-ink-3">{t('log.ratingOptional')}</p>
      </fieldset>

      <label className="mt-3 block">
        <span className="type-meta mb-1.5 block text-ink-3">{t('book.log.finishedOn')}</span>
        <input
          type="date"
          value={finishedOn}
          onChange={(e) => setFinishedOn(e.target.value)}
          className="w-full rounded-[2px] border border-rule bg-ground-2 px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-brass-600"
        />
      </label>

      <label className="mt-3 block">
        <span className="type-meta mb-1.5 block text-ink-3">{t('log.note')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder={t('log.notePlaceholder')}
          className="w-full resize-y rounded-[2px] border border-rule bg-ground-2 px-3 py-2 text-[0.875rem] leading-relaxed text-ink outline-none focus:border-brass-600"
        />
        <span className="mt-1 block text-[0.7rem] text-ink-3">{t('book.edit.clearHint')}</span>
      </label>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="type-marquee flex-1 rounded-[2px] bg-accent py-2.5 text-[12px] text-plate disabled:opacity-60"
        >
          {busy ? t('auth.working') : t('edit.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-2.5 text-[12px] text-ink-2"
        >
          {t('log.close')}
        </button>
      </div>
    </div>
  )
}
