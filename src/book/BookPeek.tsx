import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Cover } from '@/book/Cover'
import { CatalogueUnavailable, catalogBook, type CachedBook } from '@/lib/books'
import { errorMessage } from '@/lib/errors'
import { plainText } from '@/lib/plainText'

/**
 * What a book is, without leaving what you were doing.
 *
 * Ranking hands you two covers and two titles and asks which you would rather
 * read, which is not a question you can answer about a book you know nothing
 * about. The book's own page would answer it, but going there loses your place
 * in the ranking — the comparisons live in the screen, not in the database —
 * so this opens over the top and closes again with the ranking untouched.
 *
 * Kept between openings because Open Library takes anywhere up to eight
 * seconds, and looking at the same book twice while deciding is the normal
 * way to use this rather than the exception.
 */
const seen = new Map<string, CachedBook>()

export function BookPeek({
  book,
  onClose,
}: {
  book: { olKey: string; title: string; authors: string[]; coverUrl: string | null }
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()

  const cached = seen.get(book.olKey) ?? null
  const [full, setFull] = useState<CachedBook | null>(cached)
  const [loading, setLoading] = useState(cached === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (seen.has(book.olKey)) return
    let active = true

    catalogBook(book.olKey, i18n.resolvedLanguage ?? 'en')
      .then((b) => {
        seen.set(book.olKey, b)
        if (active) setFull(b)
      })
      .catch(
        (err) =>
          active &&
          setError(err instanceof CatalogueUnavailable ? t('book.unavailable') : errorMessage(err)),
      )
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [book.olKey, i18n.resolvedLanguage, t])

  // A panel you cannot dismiss from the keyboard is a trap on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-pitch/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={book.title}
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-[6px] border border-rule bg-ground px-6 pt-6 pb-8 shadow-frame sm:rounded-[3px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-4">
          <div className="w-20 shrink-0">
            <Cover url={book.coverUrl} title={book.title} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="type-title text-[1.1875rem] leading-tight text-ink">{book.title}</h2>
            {book.authors.length > 0 && (
              <p className="type-meta mt-1.5 text-accent">{book.authors.join(' · ')}</p>
            )}

            {full && (
              <>
                <p className="type-meta mt-1.5 text-ink-3">
                  {[full.year, full.pages ? t('book.pages', { count: full.pages }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {full.rating !== null && (
                  <p className="type-meta mt-1.5 text-ink-2">
                    {t('book.rating', {
                      score: full.rating.toFixed(1),
                      count: full.ratingCount ?? 0,
                    })}
                  </p>
                )}
                {full.seriesName && (
                  <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">
                    {full.seriesPosition
                      ? t('book.seriesN', { series: full.seriesName, n: full.seriesPosition })
                      : full.seriesName}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {loading ? (
          <p className="type-meta mt-6 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : error ? (
          <p className="mt-6 text-center text-[0.875rem] leading-relaxed text-accent">{error}</p>
        ) : full?.description ? (
          <>
            <div className="rule-pip mt-6 mb-3">
              <span className="type-meta whitespace-nowrap text-ink-3">{t('book.detail.about')}</span>
            </div>
            {/* Long enough to know what it is, short enough that the ranking
                does not turn into an afternoon of reading blurbs. */}
            <p className="text-[0.875rem] leading-relaxed text-ink-2">
              {plainText(full.description).slice(0, 700)}
            </p>
          </>
        ) : (
          <p className="mt-6 text-center text-[0.8125rem] leading-relaxed text-ink-3">
            {t('book.peek.noDescription')}
          </p>
        )}

        {full && full.subjects.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {full.subjects.slice(0, 6).map((s) => (
              <li key={s} className="type-meta rounded-full border border-rule px-3 py-1 text-ink-3">
                {s}
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="type-marquee mt-7 w-full rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
        >
          {t('book.peek.back')}
        </button>
      </div>
    </div>
  )
}
