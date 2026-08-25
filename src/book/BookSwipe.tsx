import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import {
  getBookDeck,
  getBookSession,
  getGroupResult,
  getSessionProgress,
  recordChoice,
  saveRanking,
  settleOn,
  type BookCandidate,
  type BookSession,
  type SessionProgress,
} from '@/lib/bookSwipe'
import { errorMessage } from '@/lib/errors'
import {
  choose,
  isFinished,
  nextPair,
  questionsLeft,
  startRanking,
  type RankingState,
} from '@/lib/ranking'
import { supabase } from '@/lib/supabase'

type GroupResult = Awaited<ReturnType<typeof getGroupResult>>

/**
 * Deciding on a book together, by ranking rather than by yes and no.
 *
 * A book club is not looking for something everyone would tolerate; it is
 * looking for the one people would MOST rather read. So you are shown two
 * books and pick the one you would rather, and the group's answer is the book
 * with the best average position across everybody.
 *
 * The pairs come from a decision tree — see lib/ranking.ts — so no question is
 * asked that your earlier answers already settled. Ten books cost about
 * twenty-two choices rather than the forty-five of every possible pair.
 *
 * The result stays hidden until everyone has finished, so nobody can watch a
 * running leader and rank tactically against it.
 */
export function BookSwipe({ sessionId, onExit }: { sessionId: string; onExit: () => void }) {
  const { t } = useTranslation()

  const [session, setSession] = useState<BookSession | null>(null)
  const [state, setState] = useState<RankingState<BookCandidate> | null>(null)
  const [progress, setProgress] = useState<SessionProgress | null>(null)
  const [result, setResult] = useState<GroupResult>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([getSessionProgress(sessionId), getGroupResult(sessionId)])
      setProgress(p)
      setResult(r)
      if (r?.length) await settleOn(sessionId, r[0].book.bookId)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [sessionId])

  useEffect(() => {
    let active = true
    Promise.all([getBookSession(sessionId), getBookDeck(sessionId)])
      .then(([s, deck]) => {
        if (!active) return
        setSession(s)
        setState(startRanking(deck))
      })
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))
    void refresh()
    return () => {
      active = false
    }
  }, [sessionId, refresh])

  /**
   * Somebody else finishing is the only thing that changes this screen once
   * your own ranking is in, so that is what it listens for.
   */
  useEffect(() => {
    const channel = supabase
      .channel(`book-ranking-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'book_rankings',
          filter: `session_id=eq.${sessionId}`,
        },
        () => void refresh(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, refresh])

  async function pick(preferLeft: boolean) {
    if (!state) return
    const pair = nextPair(state)
    if (!pair) return

    // The screen moves on the tap; the write follows. A choice that waits on a
    // round trip before anything happens feels broken on a phone.
    const next = choose(state, preferLeft)
    setState(next)

    try {
      const winner = preferLeft ? pair.left : pair.right
      const loser = preferLeft ? pair.right : pair.left
      await recordChoice(sessionId, winner.bookId, loser.bookId)

      if (isFinished(next)) {
        await saveRanking(
          sessionId,
          next.placed.map((b) => b.bookId),
        )
        await refresh()
      }
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // ---- everyone is done: the group's answer -------------------------------
  if (result?.length) {
    const winner = result[0]
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center wall-ground texture-wall px-6 py-10">
        <p className="type-script text-[1.9rem] text-accent">{t('book.rank.agreed')}</p>

        <div className="mt-5 w-40 overflow-hidden rounded-[2px] bg-frame p-1.5 shadow-frame">
          <div className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-pitch">
            {winner.book.coverUrl && (
              <img
                src={winner.book.coverUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
        </div>

        <h2 className="type-title mt-4 text-center text-[1.4rem] leading-tight text-ink">
          {winner.book.title}
        </h2>
        <p className="type-meta mt-1.5 text-accent">{winner.book.authors[0]}</p>
        <p className="type-meta mt-1 text-ink-3">
          {t('book.rank.averagePlace', { place: winner.average.toFixed(1) })}
        </p>

        {/* What nearly won, which is the useful part when the winner turns out
            to be one somebody has already read. */}
        {result.length > 1 && (
          <ul className="mt-6 w-full max-w-xs">
            {result.slice(1, 4).map((r, i) => (
              <li
                key={r.book.bookId}
                className="flex items-baseline justify-between gap-3 border-b border-rule py-2"
              >
                <span className="type-meta text-ink-3">{i + 2}</span>
                <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink-2">
                  {r.book.title}
                </span>
                <span className="type-meta shrink-0 text-ink-3">{r.average.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onExit}
          className="type-marquee mt-8 rounded-[2px] bg-accent px-8 py-3 text-[13px] text-plate"
        >
          {t('swipe.done')}
        </button>
      </div>
    )
  }

  const pair = state ? nextPair(state) : null
  const done = state ? isFinished(state) : false

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-10">
      <ScreenHeader title={session?.listName ?? t('book.rank.title')} onBack={onExit} />

      <main className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-6 py-4">
        {error && <p className="mb-4 text-[0.875rem] text-accent">{error}</p>}

        {loading ? (
          <p className="type-meta mt-16 text-ink-3/70">{t('lists.loading')}</p>
        ) : done ? (
          // ---- yours is in; waiting on the others ---------------------------
          <div className="mt-14 text-center">
            <p className="type-script text-[1.75rem] text-ink-2">{t('book.rank.yoursIsIn')}</p>
            <p className="mx-auto mt-3 max-w-[32ch] text-[0.875rem] leading-relaxed text-ink-3">
              {progress?.waitingFor.length
                ? t('book.rank.waitingFor', { who: progress.waitingFor.join(', ') })
                : t('book.rank.tallying')}
            </p>

            {state && (
              <ol className="mx-auto mt-8 w-full max-w-xs text-left">
                {state.placed.slice(0, 5).map((b, i) => (
                  <li key={b.bookId} className="flex items-baseline gap-3 border-b border-rule py-2">
                    <span className="type-meta text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink-2">
                      {b.title}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ) : !pair ? (
          <p className="type-meta mt-16 text-center text-ink-3">{t('swipe.emptyDeck')}</p>
        ) : (
          <>
            <p className="type-meta text-center text-ink-3">{t('book.rank.whichWouldYouRather')}</p>

            <div className="mt-5 grid w-full grid-cols-2 gap-3">
              {[
                { book: pair.left, left: true },
                { book: pair.right, left: false },
              ].map(({ book, left }) => (
                <button
                  key={book.bookId}
                  type="button"
                  onClick={() => void pick(left)}
                  className="flex flex-col rounded-[2px] border border-rule bg-ground-2 p-2 text-left transition-colors hover:border-accent"
                >
                  <span className="block overflow-hidden rounded-[2px] bg-frame p-1">
                    <span className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-pitch">
                      {book.coverUrl ? (
                        <img
                          src={book.coverUrl}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="type-title px-2 text-center text-[0.8rem] leading-tight text-plate">
                          {book.title}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="type-title mt-2 line-clamp-2 text-[0.9rem] leading-tight text-ink">
                    {book.title}
                  </span>
                  <span className="type-meta mt-1 truncate text-ink-3">{book.authors[0] ?? ''}</span>
                </button>
              ))}
            </div>

            <p className="type-meta mt-6 text-ink-3">
              {t('book.rank.roughlyLeft', { count: questionsLeft(state as RankingState<BookCandidate>) })}
            </p>
          </>
        )}
      </main>
    </div>
  )
}
