import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { errorMessage } from '@/lib/errors'
import {
  getCandidates,
  getParticipantCount,
  getSession,
  joinSession,
  swipe,
  watchParticipants,
  watchSession,
  type SwipeCandidate,
  type SwipeSession,
} from '@/lib/swipe'

/**
 * Swipe to decide.
 *
 * Right is yes, left is no. Two people must agree; three or more decide by
 * majority. The rule lives in a database trigger, so this screen only reports
 * the verdict — it never computes it.
 */
export function Swipe({ sessionId, onExit }: { sessionId: string; onExit: () => void }) {
  const { t, i18n } = useTranslation()

  const [session, setSession] = useState<SwipeSession | null>(null)
  const [cards, setCards] = useState<SwipeCandidate[]>([])
  const [index, setIndex] = useState(0)
  const [participants, setParticipants] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [drag, setDrag] = useState(0)
  const startX = useRef<number | null>(null)

  const language = i18n.resolvedLanguage ?? 'en'

  useEffect(() => {
    let active = true

    ;(async () => {
      try {
        await joinSession(sessionId)
        const [s, c, n] = await Promise.all([
          getSession(sessionId),
          getCandidates(sessionId, language),
          getParticipantCount(sessionId),
        ])
        if (!active) return
        setSession(s)
        setCards(c)
        setParticipants(n)
      } catch (err) {
        if (active) setError(errorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [sessionId, language])

  // A match is an UPDATE on the session row, so everyone hears about it at once.
  useEffect(() => {
    const stopSession = watchSession(sessionId, setSession)
    const stopParticipants = watchParticipants(sessionId, () => {
      void getParticipantCount(sessionId).then(setParticipants)
    })
    return () => {
      stopSession()
      stopParticipants()
    }
  }, [sessionId])

  const decide = useCallback(
    async (liked: boolean) => {
      const card = cards[index]
      if (!card) return
      setIndex((i) => i + 1)
      setDrag(0)
      try {
        await swipe(sessionId, card.titleId, liked)
      } catch (err) {
        setError(errorMessage(err))
      }
    },
    [cards, index, sessionId],
  )

  const decided = session?.status === 'decided'
  const winner = decided ? cards.find((c) => c.titleId === session?.decidedTitleId) : null
  const card = cards[index]

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
        <p className="type-script text-2xl text-ink-3">{t('lists.loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall">
      <ScreenHeader title={t('swipe.title')} onBack={onExit} />

      <main className="relative z-10 mx-auto max-w-md px-6 py-6">
        <p className="type-meta mb-6 text-center text-ink-3">
          {t('swipe.watching', { count: participants })}
          {participants >= 3 ? ` · ${t('swipe.majority')}` : ` · ${t('swipe.unanimous')}`}
        </p>

        {error && <p className="mb-4 text-center text-[0.875rem] text-velvet-500">{error}</p>}

        {decided && winner ? (
          <Verdict card={winner} onExit={onExit} />
        ) : card ? (
          <>
            <div
              className="relative touch-pan-y select-none"
              onPointerDown={(e) => {
                startX.current = e.clientX
              }}
              onPointerMove={(e) => {
                if (startX.current !== null) setDrag(e.clientX - startX.current)
              }}
              onPointerUp={() => {
                if (Math.abs(drag) > 90) void decide(drag > 0)
                else setDrag(0)
                startX.current = null
              }}
              onPointerCancel={() => {
                setDrag(0)
                startX.current = null
              }}
              style={{
                transform: `translateX(${drag}px) rotate(${drag / 28}deg)`,
                transition: startX.current === null ? 'transform 0.25s var(--ease-curtain)' : 'none',
              }}
            >
              <div className="relative rounded-[3px] bg-frame p-2 shadow-frame">
                <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2.5 bulbs-h bulb-breathe" />
                <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2.5 bulbs-h bulb-breathe bulb-offset-2" />

                <div className="relative aspect-2/3 overflow-hidden rounded-[2px] bg-pitch">
                  {card.posterUrl && (
                    <img
                      src={card.posterUrl}
                      alt={card.name}
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {/* Verdict stamps, revealed by the drag itself. */}
                  <Stamp label={t('swipe.yes')} show={drag > 45} tone="yes" />
                  <Stamp label={t('swipe.no')} show={drag < -45} tone="no" />
                </div>
              </div>
            </div>

            <div className="mt-5 text-center">
              <h2 className="type-title text-[1.5rem] text-ink">{card.name}</h2>
              <p className="type-meta mt-1.5 text-accent">
                {[card.year, card.director, card.genres[0]].filter(Boolean).join(' · ')}
              </p>
              <p className="type-meta mt-1 text-ink-3">
                {t('swipe.remaining', { count: cards.length - index })}
              </p>
            </div>

            <div className="mt-7 flex justify-center gap-4">
              <button
                type="button"
                onClick={() => void decide(false)}
                className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-4 text-[14px] text-ink-2 hover:border-velvet-500 hover:text-velvet-500"
              >
                {t('swipe.no')}
              </button>
              <button
                type="button"
                onClick={() => void decide(true)}
                className="type-marquee flex-1 rounded-[2px] bg-velvet-600 py-4 text-[14px] text-plate hover:bg-velvet-700"
              >
                {t('swipe.yes')}
              </button>
            </div>
          </>
        ) : (
          <div className="py-16 text-center">
            <p className="type-script text-[1.75rem] text-ink-2">{t('swipe.waiting')}</p>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-3">
              {t('swipe.waitingHint')}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function Stamp({ label, show, tone }: { label: string; show: boolean; tone: 'yes' | 'no' }) {
  return (
    <span
      aria-hidden
      className={`type-marquee absolute top-8 rounded-[2px] border-4 px-4 py-2 text-[1.5rem] transition-opacity ${
        tone === 'yes'
          ? 'left-6 -rotate-12 border-brass-500 text-brass-500'
          : 'right-6 rotate-12 border-velvet-400 text-velvet-400'
      } ${show ? 'opacity-100' : 'opacity-0'}`}
    >
      {label}
    </span>
  )
}

/** "The End", as on the mood board. */
function Verdict({ card, onExit }: { card: SwipeCandidate; onExit: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="py-4 text-center">
      <p className="type-script text-[2.5rem] leading-none text-accent">{t('swipe.itsAMatch')}</p>

      <div className="mx-auto mt-6 w-56">
        <div className="relative rounded-[3px] bg-frame p-2 shadow-frame">
          <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2 bulbs-h bulb-breathe" />
          <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2 bulbs-h bulb-breathe bulb-offset-2" />
          <div className="aspect-2/3 overflow-hidden rounded-[2px] bg-pitch">
            {card.posterUrl && (
              <img src={card.posterUrl} alt={card.name} className="h-full w-full object-cover" />
            )}
          </div>
        </div>
      </div>

      <h2 className="type-title mt-6 text-[1.75rem] text-ink">{card.name}</h2>
      <p className="type-meta mt-2 text-accent">
        {[card.year, card.runtimeMinutes && t('title.runtime', { minutes: card.runtimeMinutes })]
          .filter(Boolean)
          .join(' · ')}
      </p>

      <button
        type="button"
        onClick={onExit}
        className="type-marquee mt-9 rounded-[2px] bg-velvet-600 px-8 py-3.5 text-[14px] text-plate hover:bg-velvet-700"
      >
        {t('swipe.done')}
      </button>
    </div>
  )
}
