import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import {
  findBookMatch,
  getBookDeck,
  getBookSession,
  settleOn,
  swipeBook,
  type BookCandidate,
  type BookSession,
} from '@/lib/bookSwipe'
import { errorMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/**
 * Deciding on a book together.
 *
 * Two people must both say yes; three or more need a majority — the rule
 * agreed for films, carried over unchanged so nobody has to learn a second one.
 */
export function BookSwipe({
  sessionId,
  onExit,
}: {
  sessionId: string
  onExit: () => void
}) {
  const { t } = useTranslation()

  const [session, setSession] = useState<BookSession | null>(null)
  const [deck, setDeck] = useState<BookCandidate[]>([])
  const [matched, setMatched] = useState<BookCandidate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    try {
      const bookId = await findBookMatch(sessionId)
      if (bookId === null) return
      const { data } = await supabase
        .from('books')
        .select('id, ol_key, title, authors, first_published_year, cover_id')
        .eq('id', bookId)
        .maybeSingle()
      if (!data) return

      const b = data as Record<string, any>
      setMatched({
        bookId: b.id,
        olKey: b.ol_key,
        title: b.title,
        authors: b.authors ?? [],
        year: b.first_published_year,
        coverUrl: b.cover_id ? `https://covers.openlibrary.org/b/id/${b.cover_id}-L.jpg` : null,
      })
      await settleOn(sessionId, bookId)
    } catch (err) {
      setError(errorMessage(err))
    }
  }, [sessionId])

  useEffect(() => {
    let active = true
    Promise.all([getBookSession(sessionId), getBookDeck(sessionId)])
      .then(([s, d]) => {
        if (!active) return
        setSession(s)
        setDeck(d)
      })
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [sessionId])

  /**
   * Everyone else's votes, as they arrive.
   *
   * Without this you would sit on "waiting for the others" until you reloaded,
   * which for a thing two people do in the same room is the difference between
   * working and not.
   */
  useEffect(() => {
    const channel = supabase
      .channel(`book-swipe-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'book_swipes', filter: `session_id=eq.${sessionId}` },
        () => void check(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, check])

  async function judge(liked: boolean) {
    const card = deck[0]
    if (!card) return
    setDeck((d) => d.slice(1))
    try {
      await swipeBook(sessionId, card.bookId, liked)
      await check()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (matched) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center wall-ground texture-wall px-6">
        <p className="type-script text-[2rem] text-accent">{t('book.swipe.agreed')}</p>

        <div className="mt-6 w-48 overflow-hidden rounded-[2px] bg-frame p-1.5 shadow-frame">
          <div className="aspect-[2/3] overflow-hidden bg-pitch">
            {matched.coverUrl && (
              <img src={matched.coverUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <h2 className="type-title mt-5 text-center text-[1.5rem] leading-tight text-ink">
          {matched.title}
        </h2>
        <p className="type-meta mt-2 text-accent">{matched.authors[0]}</p>

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

  const card = deck[0]

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-10">
      <ScreenHeader title={session?.listName ?? t('book.swipe.title')} onBack={onExit} />

      <main className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-6 py-6">
        {error && <p className="mb-4 text-[0.875rem] text-accent">{error}</p>}

        <p className="type-meta text-ink-3">
          {session
            ? [
                t('swipe.watching', { count: session.participants }),
                session.participants === 2 ? t('swipe.unanimous') : t('swipe.majority'),
              ].join(' · ')
            : ''}
        </p>

        {loading ? (
          <p className="type-meta mt-16 text-ink-3/70">{t('lists.loading')}</p>
        ) : !card ? (
          <div className="mt-16 text-center">
            <p className="type-script text-[1.75rem] text-ink-2">{t('swipe.waiting')}</p>
            <p className="mx-auto mt-3 max-w-[32ch] text-[0.875rem] leading-relaxed text-ink-3">
              {deck.length === 0 && session ? t('book.swipe.waitingHint') : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 w-full max-w-[16rem] overflow-hidden rounded-[2px] bg-frame p-2 shadow-frame">
              <div className="aspect-[2/3] overflow-hidden bg-pitch texture-grain">
                {card.coverUrl ? (
                  <img src={card.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="type-title flex h-full items-center justify-center px-4 text-center text-[1.1rem] text-plate">
                    {card.title}
                  </span>
                )}
              </div>
            </div>

            <h2 className="type-title mt-5 text-center text-[1.4rem] leading-tight text-ink">
              {card.title}
            </h2>
            <p className="type-meta mt-1.5 text-accent">
              {[card.authors[0], card.year].filter(Boolean).join(' · ')}
            </p>

            <div className="mt-8 flex w-full max-w-[18rem] gap-3">
              <button
                type="button"
                onClick={() => void judge(false)}
                className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-4 text-[14px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              >
                {t('swipe.no')}
              </button>
              <button
                type="button"
                onClick={() => void judge(true)}
                className="type-marquee flex-1 rounded-[2px] bg-accent py-4 text-[14px] text-plate"
              >
                {t('swipe.yes')}
              </button>
            </div>

            <p className="type-meta mt-4 text-ink-3">
              {t('swipe.remaining', { count: deck.length })}
            </p>
          </>
        )}
      </main>
    </div>
  )
}
