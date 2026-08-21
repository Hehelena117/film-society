import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SuggestionRow } from '@/components/SuggestionRow'
import {
  CatalogueUnavailable,
  getCurrentlyReading,
  getMyReading,
  logReading,
  searchBooks,
  type BookHit,
  type CachedBook,
} from '@/lib/books'
import { errorMessage } from '@/lib/errors'

/**
 * Log a book: find it, score it out of ten, keep a private note.
 *
 * A search result opens the book's page rather than this form, for the same
 * reason it does on the film side: searching for something is not the same as
 * having read it, and jumping to "rate this" assumes an intent the search has
 * not expressed. What is offered under an empty box is what you are in the
 * middle of — by far the likeliest thing you are about to finish.
 */
export function LogReading({
  prefill,
  onOpenBook,
  onDone,
}: {
  prefill?: CachedBook | null
  onOpenBook: (olKey: string) => void
  onDone: () => void
}) {
  const { t } = useTranslation()

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<BookHit[]>([])
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<CachedBook | null>(prefill ?? null)
  const [error, setError] = useState<string | null>(null)

  const [reading, setReading] = useState<Array<{ id: number; olKey: string; title: string; coverUrl: string | null; year: number | null }>>([])
  const [finished, setFinished] = useState<Array<{ id: number; olKey: string; title: string; coverUrl: string | null; year: number | null }>>([])

  useEffect(() => {
    if (prefill) return
    let active = true

    void getCurrentlyReading().then((r) => {
      if (!active) return
      setReading(r.map((x) => ({ ...x.book })))
    })
    void getMyReading(40).then((entries) => {
      if (!active) return
      const seen = new Set<number>()
      setFinished(
        entries
          .filter((e) => !seen.has(e.book.id) && seen.add(e.book.id))
          .slice(0, 12)
          .map((e) => ({ ...e.book })),
      )
    })

    return () => {
      active = false
    }
  }, [prefill])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const timer = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setHits(await searchBooks(query))
      } catch (err) {
        // Their outage is not this app breaking, and must not read like it.
        setError(err instanceof CatalogueUnavailable ? t('book.unavailable') : errorMessage(err))
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <header className="relative z-10 endpaper px-6 py-6">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <h1 className="type-marquee text-lg text-band-ink">{t('book.log.title')}</h1>
          <button
            type="button"
            onClick={onDone}
            className="type-meta text-band-ink/70 underline underline-offset-4 hover:text-band-ink"
          >
            {t('log.close')}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && (
          <p role="alert" className="mb-5 text-[0.875rem] text-accent">
            {error}
          </p>
        )}

        {chosen ? (
          <RatingForm
            book={chosen}
            onCancel={() => setChosen(null)}
            onSaved={onDone}
            onError={setError}
          />
        ) : (
          <>
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('book.log.search')}</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('book.log.searchPlaceholder')}
                className="w-full rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600 focus:ring-1 focus:ring-brass-600/50"
              />
            </label>

            <p className="type-meta mt-3 h-4 text-ink-3/70">{searching ? t('log.searching') : ''}</p>

            <ul className="mt-3 flex flex-col gap-2">
              {hits.map((hit) => (
                <li key={hit.olKey}>
                  <button
                    type="button"
                    onClick={() => onOpenBook(hit.olKey)}
                    className="flex w-full items-center gap-3 rounded-[2px] border border-rule bg-ground-2 p-2 text-left transition-colors hover:border-brass-600"
                  >
                    <span className="h-[68px] w-[46px] shrink-0 overflow-hidden rounded-[1px] bg-frame">
                      {hit.coverUrl && (
                        <img
                          src={hit.coverUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="type-title block text-[1.0625rem] leading-tight text-ink">
                        {hit.title}
                      </span>
                      <span className="type-meta mt-1 block text-ink-3">
                        {[
                          hit.authors[0],
                          hit.year,
                          hit.rating !== null ? `${hit.rating.toFixed(1)}/5` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {!query.trim() && (
              <>
                <SuggestionRow
                  title={t('book.log.reading')}
                  hint={t('book.log.readingHint')}
                  items={reading.map((b) => ({
                    key: `r-${b.id}`,
                    name: b.title,
                    year: b.year,
                    posterUrl: b.coverUrl,
                    onOpen: () => onOpenBook(b.olKey),
                  }))}
                  empty={t('book.log.nothingStarted')}
                />
                <SuggestionRow
                  title={t('book.log.readBefore')}
                  items={finished.map((b) => ({
                    key: `f-${b.id}`,
                    name: b.title,
                    year: b.year,
                    posterUrl: b.coverUrl,
                    onOpen: () => onOpenBook(b.olKey),
                  }))}
                />
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function RatingForm({
  book,
  onCancel,
  onSaved,
  onError,
}: {
  book: CachedBook
  onCancel: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [finishedOn, setFinishedOn] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await logReading({
        bookId: book.id,
        rating,
        finishedOn: finishedOn || null,
        note: note || null,
      })
      onSaved()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="w-16 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5">
          <div className="aspect-[2/3] overflow-hidden bg-pitch">
            {book.coverUrl && <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />}
          </div>
        </div>
        <div className="min-w-0">
          <h2 className="type-title text-[1.25rem] leading-tight text-ink">{book.title}</h2>
          <p className="type-meta mt-1 text-ink-3">
            {[book.authors[0], book.year].filter(Boolean).join(' · ')}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="type-meta mt-1.5 text-ink-3 underline underline-offset-4 hover:text-accent"
          >
            {t('book.log.notThisOne')}
          </button>
        </div>
      </div>

      <fieldset className="mt-7">
        <legend className="type-meta mb-2 text-ink-3">{t('log.rating')}</legend>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              aria-pressed={rating === n}
              className={`type-marquee rounded-[2px] border py-2 text-[13px] transition-colors ${
                rating === n
                  ? 'border-accent bg-accent text-plate'
                  : 'border-rule text-ink-3 hover:border-brass-600 hover:text-ink'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.75rem] text-ink-3">{t('log.ratingOptional')}</p>
      </fieldset>

      <label className="mt-6 flex flex-col">
        <span className="type-meta mb-2 text-ink-3">{t('book.log.finishedOn')}</span>
        <input
          type="date"
          value={finishedOn}
          onChange={(e) => setFinishedOn(e.target.value)}
          className="rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
        />
        <span className="mt-1.5 block text-[0.75rem] text-ink-3">{t('log.privateHint')}</span>
      </label>

      <label className="mt-6 block">
        <span className="type-meta mb-2 block text-ink-3">{t('log.note')}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={t('log.notePlaceholder')}
          className="w-full resize-y rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none focus:border-brass-600"
        />
        <span className="mt-1.5 block text-[0.75rem] text-ink-3">{t('log.privateHint')}</span>
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="type-marquee mt-8 w-full rounded-[2px] bg-accent py-3.5 text-[14px] text-plate disabled:opacity-60"
      >
        {busy ? t('auth.working') : t('book.log.save')}
      </button>
    </>
  )
}
