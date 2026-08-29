import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AddToReadingList } from '@/book/AddToReadingList'
import { Spine } from '@/book/Spine'
import type { SupportedLanguage } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import {
  getBookRecommendations,
  getMyBookFeedback,
  getReadingSnapshot,
  setBookFeedback,
  type BookFeedbackEntry,
  type BookHit,
  type BookRecommendation,
  type BookVerdict,
  type ReadingSnapshot,
} from '@/lib/books'
import { getFilmRatingsForCrossover } from '@/lib/api'
import { errorMessage } from '@/lib/errors'

const PAGE_SIZE = 6

/**
 * The shelf — the book half's answer to the poster wall.
 *
 * You travel along it sideways, the way you do in a bookshop, rather than
 * scrolling down a corridor. Each stop is one recommendation turned face-out
 * among its neighbours' spines, with the shelf edge running unbroken beneath
 * the lot. Reaching the right-hand end loads more, exactly as reaching the
 * bottom does on the film side.
 */
export function Shelf({ onOpenBook }: { onOpenBook: (hit: BookHit) => void }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()

  const [recs, setRecs] = useState<BookRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [verdicts, setVerdicts] = useState<Record<string, BookVerdict>>({})
  const [adding, setAdding] = useState<{ olKey: string; title: string } | null>(null)

  const railRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  const seenRef = useRef<string[]>([])
  const snapshotRef = useRef<ReadingSnapshot | null>(null)
  const feedbackRef = useRef<BookFeedbackEntry[]>([])
  const countRef = useRef(0)
  // Mirrors `recs`, so loadMore can check for duplicates without depending on it.
  const recsRef = useRef<BookRecommendation[]>([])
  // Films they loved, read once with the snapshot.
  const crossoverRef = useRef<Array<{ name: string; year: number | null; score: number }>>([])

  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage
  const useNotes = profile?.use_book_notes_for_recommendations === true

  const loadMore = useCallback(async () => {
    if (busyRef.current || exhausted) return
    busyRef.current = true
    setLoading(true)
    setError(null)

    try {
      if (snapshotRef.current === null) {
        snapshotRef.current = await getReadingSnapshot(useNotes)
        seenRef.current = [...new Set([...seenRef.current, ...snapshotRef.current.readTitles])]
        feedbackRef.current = await getMyBookFeedback()
        setVerdicts(Object.fromEntries(feedbackRef.current.map((f) => [f.olKey, f.verdict])))
        crossoverRef.current = await getFilmRatingsForCrossover(language)
      }

      const rejected = feedbackRef.current.filter((f) => f.verdict === 'less')

      const batch = await getBookRecommendations({
        ratings: snapshotRef.current.ratings,
        notes: snapshotRef.current.notes,
        crossover: crossoverRef.current,
        feedback: {
          more: feedbackRef.current
            .filter((f) => f.verdict === 'more')
            .map((f) => ({ title: f.title, author: f.authors[0] ?? null })),
          less: rejected.map((f) => ({ title: f.title, author: f.authors[0] ?? null })),
        },
        // Turned-down books first: the function trims this at 200, and these
        // are the ones that must never be dropped from it.
        excludeTitles: [...new Set([...rejected.map((f) => f.title), ...seenRef.current])],
        count: PAGE_SIZE,
      })

      if (!batch.length) {
        // A single failed model call looks exactly like a genuinely empty
        // shelf. With nothing up yet, offer the retry rather than a dead end.
        if (countRef.current === 0) setError(t('book.shelf.noneCame'))
        else setExhausted(true)
        return
      }

      // Belt and braces against the same book arriving twice.
      //
      // The exclusion list is built from TITLES, because that is the language
      // the prompt speaks — but a book can come back under a slightly
      // different title than the one that was excluded, and then it is a
      // duplicate cover on the same shelf. The Open Library key is the only
      // thing that actually identifies a book, so the last word is here.
      const known = new Set(recsRef.current.map((r) => r.book.olKey))
      const fresh = batch.filter((b) => !known.has(b.book.olKey))

      if (!fresh.length) {
        // Everything offered was already on the shelf. Asking again with the
        // same prompt would return the same thing, so stop rather than loop.
        setExhausted(true)
        return
      }

      const titles = fresh.map((b) => b.book.title)
      seenRef.current = [...new Set([...seenRef.current, ...titles])].slice(-150)
      countRef.current += fresh.length
      recsRef.current = [...recsRef.current, ...fresh]
      setRecs((current) => [...current, ...fresh])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }, [exhausted, useNotes, t, language])

  useEffect(() => {
    void loadMore()
    // Once on mount; loadMore guards itself against re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The sentinel sits at the right-hand end of the rail rather than the bottom
  // of the page, so the root is the scroller itself and not the viewport.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || exhausted) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { root: railRef.current, rootMargin: '600px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, exhausted])

  async function judge(rec: BookRecommendation, next: BookVerdict | null) {
    const key = rec.book.olKey
    const previous = verdicts[key] ?? null

    setVerdicts((current) => {
      const copy = { ...current }
      if (next === null) delete copy[key]
      else copy[key] = next
      return copy
    })

    const entry = {
      olKey: key,
      title: rec.book.title,
      authors: rec.book.authors,
      year: rec.book.year,
    }
    feedbackRef.current = [
      ...feedbackRef.current.filter((f) => f.olKey !== key),
      ...(next ? [{ ...entry, verdict: next }] : []),
    ]

    try {
      await setBookFeedback(entry, next)
    } catch (err) {
      setVerdicts((current) => {
        const copy = { ...current }
        if (previous === null) delete copy[key]
        else copy[key] = previous
        return copy
      })
      setError(errorMessage(err))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col wall-ground texture-wall pb-12 sm:pb-24">
      {/* ---- The shop sign ------------------------------------------------
          Measured before it was trimmed: 257px of a 640px phone, leaving 193px
          for a book that needed 304 — the shelf did not fit on ANY handset
          tested, including a 390x844 one. Everything here is smaller on a short
          screen and full size on a tall one, and the username line has gone: it
          was duplicated on the Me tab and cost 40px of the shelf itself. */}
      <header className="relative z-10 endpaper px-6 pt-6 pb-4 text-center sm:pt-12 sm:pb-8">
        <div className="inline-block border-y-2 border-frame/40 px-5 py-1 sm:px-6 sm:py-2">
          <h1 className="type-marquee text-[1.4rem] text-band-ink sm:text-[1.9rem]">
            {t('book.name')}
          </h1>
        </div>
        <p className="type-script mt-2 text-[1.15rem] text-band-ink/85 sm:mt-4 sm:text-[1.5rem]">
          {t('book.shelf.subtitle')}
        </p>

        <button
          type="button"
          onClick={() => {
            // Keep the exclusions — clearing them sends an identical prompt and
            // returns an identical shelf, which is the one thing this must not
            // do. Only the snapshot is dropped, so new ratings count.
            snapshotRef.current = null
            countRef.current = 0
            recsRef.current = []
            setRecs([])
            setExhausted(false)
            railRef.current?.scrollTo({ left: 0 })
            void loadMore()
          }}
          disabled={loading}
          className="type-meta mt-3 rounded-full border border-band-ink/30 px-4 py-1.5 text-band-ink/80 transition-colors hover:border-band-ink/60 hover:text-band-ink disabled:opacity-50 sm:mt-4 sm:py-2"
        >
          {t('book.shelf.reshuffle')}
        </button>
      </header>

      <div className="relative z-10 h-3 hex-floor opacity-[0.14] sm:h-6" aria-hidden />

      {/* ---- The shelf ----------------------------------------------------
          The books take whatever height is left rather than a fixed 19rem, so
          a short phone gets a shorter shelf instead of one that runs off the
          bottom. One custom property, because the board below is positioned
          absolutely at exactly this height and the two must never disagree. */}
      <main
        className="relative z-10 flex flex-1 flex-col justify-center py-3 sm:py-6"
        style={{ ['--shelf-h' as string]: 'clamp(7rem, 20vh, 19rem)' }}
      >
        <div className="rule-pip mb-3 px-6 sm:mb-5">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('book.shelf.onTheShelf')}</span>
        </div>

        {error ? (
          <div className="px-6 text-center">
            <p className="mx-auto max-w-[36ch] text-[0.875rem] leading-relaxed text-accent">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null)
                void loadMore()
              }}
              className="type-marquee mt-4 rounded-[2px] bg-accent px-6 py-2.5 text-[13px] text-plate"
            >
              {t('lobby.retry')}
            </button>
          </div>
        ) : (
          <div
            ref={railRef}
            className="shelf-scroll snap-x snap-mandatory"
            role="region"
            aria-label={t('book.shelf.onTheShelf')}
          >
            {/* w-max is load-bearing, not tidiness. A block inside an
                overflow-x scroller is only as wide as the VISIBLE area, so an
                absolutely positioned board with inset-x-0 spanned one screen
                and left a stub of shelf at the far left. Sizing the row to its
                content makes inset-x-0 mean the whole rail. */}
            <div className="relative flex w-max items-stretch">
              {/* ONE board, running the length of the rail and under every
                  book on it. It used to be drawn per recommendation, so the
                  shelf stopped and restarted between each one — which is the
                  one thing a shelf does not do. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[var(--shelf-h)] h-2 shelf-wood"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-[calc(var(--shelf-h)+0.5rem)] h-[3px] brass-rail"
              />

              {recs.map((rec) => (
                <Bay
                  key={rec.book.olKey}
                  rec={rec}
                  verdict={verdicts[rec.book.olKey] ?? null}
                  onVerdict={(next) => void judge(rec, next)}
                  onOpen={() => onOpenBook(rec.book)}
                  onAddToList={() =>
                    setAdding({ olKey: rec.book.olKey, title: rec.book.title })
                  }
                />
              ))}

              {/* Loads the next stretch when it comes into view sideways. */}
              <div ref={sentinelRef} aria-hidden className="w-px shrink-0" />

              {(loading || exhausted) && (
                <div className="flex w-[80vw] shrink-0 items-center justify-center px-6">
                  <p className="type-meta text-center text-ink-3/70" role="status" aria-live="polite">
                    {loading ? t('book.shelf.loading') : t('book.shelf.endOfShelf')}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {adding && (
        <AddToReadingList
          olKey={adding.olKey}
          title={adding.title}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  )
}

/**
 * One stop along the shelf: the recommended book face-out, with neighbours.
 *
 * Full-width and snapped, so travelling sideways lands on one book at a time
 * rather than leaving you between two.
 */
function Bay({
  rec,
  verdict,
  onVerdict,
  onOpen,
  onAddToList,
}: {
  rec: BookRecommendation
  verdict: BookVerdict | null
  onVerdict: (next: BookVerdict | null) => void
  onOpen: () => void
  onAddToList: () => void
}) {
  const { t } = useTranslation()
  const { book } = rec
  const rejected = verdict === 'less'

  // Open Library hands out a cover id and then sometimes serves nothing for
  // it — the image 404s, or their cover host throttles a burst of requests.
  // Without this the frame stays a black rectangle, which looks far more
  // broken than a book with no jacket. Seen happening, not guessed at.
  const [coverFailed, setCoverFailed] = useState(false)
  const cover = coverFailed ? null : book.coverUrl

  return (
    <article
      className={`w-[86vw] max-w-[24rem] shrink-0 snap-center px-4 transition-opacity duration-500 ${
        rejected ? 'opacity-40' : ''
      }`}
    >
      {/* The books, standing on the shelf. */}
      <div className="flex h-[var(--shelf-h)] items-end justify-center gap-[3px]">
        <Spine title={`${book.authors[0] ?? ''} ${book.title}`} />
        <Spine title={book.title.split(' ').reverse().join(' ')} />

        {/* A frame of fixed width, with the jacket fitted inside it.
            Covers are nothing like as uniform as film posters — a Penguin
            paperback, a square art book and a tall hardback are all normal —
            so object-cover was slicing the top and bottom off most of them.
            object-contain shows the whole jacket instead.

            The width is fixed rather than following the artwork. Letting it
            follow meant a cover that had not loaded yet had no intrinsic size
            and the frame collapsed to a sliver: on a phone the recommended
            book appeared as a brown stripe between its neighbours, which is
            what the first photograph of a real shelf showed. */}
        <button
          type="button"
          onClick={onOpen}
          className="relative mx-1 h-full w-[8.5rem] shrink-0 self-end overflow-hidden rounded-[2px] bg-frame p-1 shadow-frame transition-transform duration-300 hover:-translate-y-1 sm:w-[9.5rem]"
        >
          <span className="flex h-full items-center justify-center overflow-hidden bg-pitch texture-grain">
            {cover ? (
              <img
                src={cover}
                alt={book.title}
                onError={() => setCoverFailed(true)}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
                <span className="type-title text-[0.95rem] leading-tight text-plate">
                  {book.title}
                </span>
                <span className="h-px w-8 bg-brass-500/60" />
                <span className="type-marquee text-[11px] text-brass-500">
                  {book.authors[0] ?? ''}
                </span>
              </span>
            )}
          </span>
        </button>

        <Spine title={`${book.title} ${book.authors[0] ?? ''}`} />
        <Spine title={book.authors[0] ?? book.title} />
      </div>

      {/* Space for the board, which is drawn once across the whole rail so it
          does not stop between one recommendation and the next. See Shelf. */}
      <div className="h-[11px]" aria-hidden />

      {/* ---- The card slipped under the book ---------------------------- */}
      <div className="mt-2 text-center sm:mt-5">
        <h2 className="type-title text-[1.15rem] leading-tight text-ink sm:text-[1.4rem]">{book.title}</h2>
        <p className="type-meta mt-1.5 text-accent">
          {[book.authors[0], book.year].filter(Boolean).join(' · ')}
        </p>
        {book.rating !== null && (
          <p className="type-meta mt-1 text-ink-3">
            {t('book.rating', {
              score: book.rating.toFixed(1),
              count: book.ratingCount ?? 0,
            })}
          </p>
        )}
        {book.seriesName && (
          <p className="mt-1 text-[0.75rem] text-ink-3">
            {book.seriesPosition
              ? t('book.seriesN', { series: book.seriesName, n: book.seriesPosition })
              : book.seriesName}
          </p>
        )}

        <div className="rule-pip my-1.5 sm:my-3.5" aria-hidden>
          <span className="size-1 rotate-45 bg-brass-600/70" />
        </div>

        <p className="mx-auto line-clamp-2 max-w-[32ch] sm:line-clamp-3 text-[0.8125rem] leading-relaxed text-ink-2">
          {rec.reason}
        </p>

        <div className="mt-3 flex items-center justify-center gap-2.5 sm:mt-4">
          <Verdict
            active={verdict === 'more'}
            label={t('actions.moreLikeThis')}
            activeLabel={t('actions.moreLikeThisOn')}
            tone="brass"
            onClick={() => onVerdict(verdict === 'more' ? null : 'more')}
          />
          <Verdict
            active={rejected}
            label={t('actions.notForMe')}
            activeLabel={t('actions.notForMeOn')}
            tone="accent"
            onClick={() => onVerdict(rejected ? null : 'less')}
          />
        </div>

        {rejected && (
          <p className="type-meta mt-2.5 text-accent" role="status">
            {t('actions.wontShowAgain')}
          </p>
        )}

        <button
          type="button"
          onClick={onAddToList}
          className="type-marquee mt-2.5 rounded-full border border-rule-strong px-4 py-1.5 text-[11px] text-ink-3 transition-colors hover:border-brass-600 hover:text-ink-2"
        >
          + {t('book.lists.addTo')}
        </button>
      </div>
    </article>
  )
}

function Verdict({
  active,
  label,
  activeLabel,
  tone,
  onClick,
}: {
  active: boolean
  label: string
  activeLabel: string
  tone: 'brass' | 'accent'
  onClick: () => void
}) {
  const activeStyle =
    tone === 'brass'
      ? 'border-brass-600 bg-brass-600/15 text-ink'
      : 'border-accent bg-accent/10 text-accent'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`type-marquee rounded-full border px-3.5 py-1.5 text-[11px] transition-colors ${
        active ? activeStyle : 'border-rule-strong text-ink-3 hover:border-brass-600 hover:text-ink-2'
      }`}
    >
      {active ? activeLabel : label}
    </button>
  )
}
