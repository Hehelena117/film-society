import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Cover } from '@/book/Cover'
import { TellGroups } from '@/book/TellGroups'
import { AddToReadingList } from '@/book/AddToReadingList'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  catalogBook,
  CatalogueUnavailable,
  getCurrentlyReading,
  getSeries,
  startReading,
  setProgress,
  stopReading,
  type CachedBook,
  type SeriesVolume,
  getBookThoughts,
  writeBookThoughts,
  type BookThoughts,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'
import { plainText } from '@/lib/plainText'

/**
 * One book, opened.
 *
 * No "where to read" row: unlike the film side, this deliberately says nothing
 * about availability. The page is about the book — who wrote it, what it is
 * part of, what you thought — and there is nothing to keep accurate.
 */
export function BookDetail({
  olKey,
  onBack,
  onLog,
  onOpenBook,
}: {
  olKey: string
  onBack: () => void
  onLog: (book: CachedBook) => void
  onOpenBook: (olKey: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const [book, setBook] = useState<CachedBook | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [series, setSeries] = useState<SeriesVolume[]>([])
  const [startedOn, setStartedOn] = useState<string | null>(null)
  const [thoughts, setThoughts] = useState<BookThoughts | null>(null)
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    if (!book) return
    let active = true
    getBookThoughts(book.id)
      .then((t) => active && setThoughts(t))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [book])

  useEffect(() => {
    let active = true
    catalogBook(olKey, i18n.resolvedLanguage ?? 'en')
      .then(async (b) => {
        if (!active) return
        setBook(b)
        const reading = await getCurrentlyReading()
        const mine = reading.find((r) => r.bookId === b.id)
        if (active) {
          setPercent(mine?.percent ?? null)
          setStartedOn(mine?.startedOn ?? null)
        }
      })
      .catch(
        (err) =>
          active &&
          setError(err instanceof CatalogueUnavailable ? t('book.unavailable') : errorMessage(err)),
      )
    return () => {
      active = false
    }
  }, [olKey, i18n.resolvedLanguage, profile?.country])

  /**
   * The rest of the series, fetched after the book and never blocking it.
   *
   * Its own request rather than part of cataloguing, because the page is
   * perfectly useful without it and Open Library takes its time. A failure is
   * silent for the same reason — a book page that will not load because a
   * sequel list could not be found would be a poor trade.
   */
  useEffect(() => {
    const name = book?.seriesName
    if (!name) {
      setSeries([])
      return
    }

    let active = true
    getSeries(name)
      .then((v) => active && setSeries(v))
      .catch(() => active && setSeries([]))
    return () => {
      active = false
    }
  }, [book?.seriesName])

  async function move(next: number | null) {
    if (!book) return
    setBusy(true)
    setError(null)
    const previous = percent
    setPercent(next)
    try {
      if (next === null) await stopReading(book.id)
      else if (percent === null) await startReading(book.id)
      else await setProgress(book.id, next)
    } catch (err) {
      setPercent(previous)
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!book) {
    return (
      <div className="min-h-dvh wall-ground texture-wall">
        <ScreenHeader title={t('book.detail.title')} onBack={onBack} />
        <p className="px-6 py-10 text-center text-[0.875rem] text-ink-3">
          {error ?? t('lists.loading')}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('book.detail.title')} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-accent">{error}</p>}

        {/* The book laid on the reading table. */}
        <div className="flex gap-5">
          <div className="w-32 shrink-0 shadow-frame">
            <Cover url={book.coverUrl} title={book.title} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="type-title text-[1.5rem] leading-tight text-ink">{book.title}</h2>
            {book.authors.length > 0 && (
              <p className="type-meta mt-2 text-accent">{book.authors.join(' · ')}</p>
            )}
            <p className="type-meta mt-1.5 text-ink-3">
              {[
                book.year,
                book.pages ? t('book.pages', { count: book.pages }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {book.rating !== null && (
              <p className="type-meta mt-1.5 text-ink-2">
                {t('book.rating', {
                  score: book.rating.toFixed(1),
                  count: book.ratingCount ?? 0,
                })}
              </p>
            )}
            {book.seriesName && (
              <p className="mt-2 text-[0.8125rem] text-ink-2">
                {book.seriesPosition
                  ? t('book.seriesN', { series: book.seriesName, n: book.seriesPosition })
                  : book.seriesName}
              </p>
            )}
          </div>
        </div>

        {/* ---- Reading progress ------------------------------------------- */}
        <section className="mt-8 rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <h3 className="type-marquee text-[13px] text-ink">{t('book.progress.title')}</h3>

          {percent === null ? (
            <>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
                {t('book.progress.notStarted')}
              </p>
              <button
                type="button"
                onClick={() => void move(0)}
                disabled={busy}
                className="type-marquee mt-3 w-full rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink disabled:opacity-60"
              >
                {t('book.progress.start')}
              </button>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="type-title text-[1.6rem] text-ink">{percent}%</span>
                <button
                  type="button"
                  onClick={() => void move(null)}
                  className="type-meta text-ink-3 underline underline-offset-4 hover:text-accent"
                >
                  {t('book.progress.stop')}
                </button>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                onPointerUp={() => void move(percent)}
                onKeyUp={() => void move(percent)}
                aria-label={t('book.progress.title')}
                className="mt-3 w-full accent-accent"
              />

              <p className="mt-1.5 text-[0.75rem] text-ink-3">{t('book.progress.hint')}</p>

              {/* When you picked it up. Stored from the first day but never
                  shown before, so a date you could not see was also a date
                  you could not correct. */}
              <label className="mt-3 block">
                <span className="type-meta mb-1.5 block text-ink-3">
                  {t('book.progress.startedOn')}
                </span>
                <input
                  type="date"
                  value={startedOn ?? ''}
                  onChange={async (e) => {
                    const on = e.target.value
                    setStartedOn(on || null)
                    if (on && percent !== null) {
                      try {
                        await setProgress(book.id, percent, on)
                      } catch (err) {
                        setError(errorMessage(err))
                      }
                    }
                  }}
                  className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2 text-[0.875rem] text-ink outline-none focus:border-brass-600"
                />
              </label>

              <div className="mt-3">
                <TellGroups
                  bookId={book.id}
                  className="type-marquee w-full rounded-[2px] border border-rule-strong py-2.5 text-[11px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
                />
              </div>
            </>
          )}
        </section>

        <button
          type="button"
          onClick={() => onLog(book)}
          className="type-marquee mt-4 w-full rounded-[2px] bg-accent py-3.5 text-[13px] text-plate"
        >
          {t('book.detail.logIt')}
        </button>

        {/* Looking a book up often ends in "not now, but remember it"
            rather than "I have read this", so both endings live here. */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="type-marquee mt-3 w-full rounded-[2px] border border-rule-strong py-3.5 text-[13px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
        >
          + {t('book.lists.addTo')}
        </button>

        {series.length > 1 && (
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {book.seriesName}
              </span>
            </div>

            {/* Sideways, like the shelf: a long series should not push the
                rest of the page down. The book you are on is marked rather
                than removed, so the sequence reads properly. */}
            <div className="shelf-scroll">
              <div className="flex gap-3">
                {series.map((v) => {
                  const here = v.olKey === olKey
                  return (
                    <button
                      key={v.olKey}
                      type="button"
                      onClick={() => !here && onOpenBook(v.olKey)}
                      disabled={here}
                      className="w-[5.5rem] shrink-0 snap-start text-left disabled:cursor-default"
                    >
                      <span
                        className={`relative block overflow-hidden rounded-[2px] bg-frame p-1 ${
                          here ? 'ring-2 ring-accent' : 'shadow-lift'
                        }`}
                      >
                        <span className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-pitch">
                          {v.coverUrl ? (
                            <img
                              src={v.coverUrl}
                              alt=""
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <span className="type-title px-1 text-center text-[0.65rem] leading-tight text-plate/70">
                              {v.title}
                            </span>
                          )}
                        </span>
                        <span className="type-marquee absolute bottom-1 left-1 rounded-[2px] bg-frame/90 px-1.5 py-0.5 text-[10px] text-plate">
                          {v.position}
                        </span>
                      </span>
                      <span
                        className={`mt-1.5 line-clamp-2 block text-[0.7rem] leading-tight ${
                          here ? 'text-accent' : 'text-ink'
                        }`}
                      >
                        {v.title}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {book.description && (
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.detail.about')}
              </span>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              {plainText(book.description).slice(0, 1200)}
            </p>
          </section>
        )}

        {/* Underneath the catalogue's own description, never over it. A
            good blurb written by a person is not improved by replacing it,
            and which ones are good is not a judgement to make silently. */}
        <section className="mt-8">
          {thoughts?.description && (
            <>
              <div className="rule-pip mb-4">
                <span className="type-meta whitespace-nowrap text-ink-3">
                  {t('book.thoughts.inOtherWords')}
                </span>
              </div>
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                {thoughts.description}
              </p>
            </>
          )}

          {thoughts?.would && (
            <>
              <div className="rule-pip mt-8 mb-4">
                <span className="type-meta whitespace-nowrap text-ink-3">
                  {t('book.thoughts.wouldYou')}
                </span>
              </div>
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">{thoughts.would}</p>
              {thoughts.wouldnt && (
                <p className="mt-3 border-l-2 border-brass-600/40 pl-3 text-[0.875rem] leading-relaxed text-ink-3">
                  {thoughts.wouldnt}
                </p>
              )}
              {/* Said plainly. Text a machine wrote should say so. */}
              <p className="mt-4 text-[0.7rem] leading-relaxed text-ink-3/70">
                {t('book.thoughts.written')}
              </p>
            </>
          )}

          {!thoughts?.would && (
            <button
              type="button"
              disabled={writing}
              onClick={async () => {
                setWriting(true)
                try {
                  setThoughts(await writeBookThoughts(olKey, i18n.resolvedLanguage ?? 'en'))
                } catch (err) {
                  setError(errorMessage(err))
                } finally {
                  setWriting(false)
                }
              }}
              className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-3.5 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink disabled:opacity-60"
            >
              {writing
                ? t('book.thoughts.writing')
                : book.description
                  ? t('book.thoughts.askThin')
                  : t('book.thoughts.askNone')}
            </button>
          )}
        </section>

        {book.subjects.length > 0 && (
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.detail.subjects')}
              </span>
            </div>
            <ul className="flex flex-wrap justify-center gap-2">
              {book.subjects.slice(0, 12).map((s) => (
                <li
                  key={s}
                  className="type-meta rounded-full border border-rule px-3 py-1 text-ink-3"
                >
                  {s}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {adding && (
        <AddToReadingList olKey={olKey} title={book.title} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}
