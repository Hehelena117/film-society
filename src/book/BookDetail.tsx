import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AddToReadingList } from '@/book/AddToReadingList'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  catalogBook,
  CatalogueUnavailable,
  getCurrentlyReading,
  setProgress,
  stopReading,
  type CachedBook,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'

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
}: {
  olKey: string
  onBack: () => void
  onLog: (book: CachedBook) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const [book, setBook] = useState<CachedBook | null>(null)
  const [percent, setPercent] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    let active = true
    catalogBook(olKey, i18n.resolvedLanguage ?? 'en')
      .then(async (b) => {
        if (!active) return
        setBook(b)
        const reading = await getCurrentlyReading()
        if (active) setPercent(reading.find((r) => r.bookId === b.id)?.percent ?? null)
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

  async function move(next: number | null) {
    if (!book) return
    setBusy(true)
    setError(null)
    const previous = percent
    setPercent(next)
    try {
      if (next === null) await stopReading(book.id)
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
          <div className="w-32 shrink-0 overflow-hidden rounded-[2px] bg-frame p-1 shadow-frame">
            <div className="aspect-[2/3] overflow-hidden bg-pitch">
              {book.coverUrl && (
                <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
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

        {book.description && (
          <section className="mt-8">
            <div className="rule-pip mb-4">
              <span className="type-meta whitespace-nowrap text-ink-3">
                {t('book.detail.about')}
              </span>
            </div>
            <p className="text-[0.9375rem] leading-relaxed text-ink-2">
              {book.description.slice(0, 1200)}
            </p>
          </section>
        )}

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
