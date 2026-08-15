import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AddToList, type AddTarget } from '@/components/AddToList'
import { PosterFrame } from '@/components/PosterFrame'
import { getLogSnapshot, getRecommendations, type LogSnapshot } from '@/lib/api'
import { forgetShown, getShown, rememberShown } from '@/lib/shown'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import type { SupportedLanguage } from '@/lib/i18n'
import type { TitleRef } from '@/screens/TitleDetail'
import type { Recommendation } from '@/types'

const PAGE_SIZE = 6

/**
 * The Lobby — the recommendation wall.
 *
 * Scrolling walks you down a cinema corridor past bulb-lit poster frames.
 * Recommendations keep loading as long as you keep scrolling.
 */
export function Lobby({ onOpenTitle }: { onOpenTitle: (ref: TitleRef) => void }) {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()

  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [adding, setAdding] = useState<AddTarget | null>(null)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  // Seeded from localStorage, so a new visit does not re-offer last visit's
  // wall. Everything already logged goes in too — being recommended a film you
  // have already rated is the clearest possible sign of not being listened to.
  const seenRef = useRef<string[]>(getShown())
  const snapshotRef = useRef<LogSnapshot | null>(null)

  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage

  const loadMore = useCallback(async () => {
    if (busyRef.current || exhausted) return
    busyRef.current = true
    setLoading(true)
    setError(null)

    try {
      // Read the log once — it does not change mid-scroll.
      if (snapshotRef.current === null) {
        snapshotRef.current = await getLogSnapshot(language)
        seenRef.current = [...new Set([...seenRef.current, ...snapshotRef.current.loggedNames])]
      }

      const batch = await getRecommendations({
        ratings: snapshotRef.current.ratings,
        excludeNames: seenRef.current,
        filters: {},
        language,
        count: PAGE_SIZE,
      })

      if (!batch.length) {
        setExhausted(true)
        return
      }

      const names = batch.map((b) => b.title.name)
      seenRef.current = [...seenRef.current, ...names]
      rememberShown(names)

      setRecs((current) => [
        ...current,
        ...batch.map((b) => ({
          title: {
            id: `${b.title.mediaType}-${b.title.tmdbId}`,
            tmdbId: b.title.tmdbId,
            mediaType: b.title.mediaType,
            name: b.title.name,
            year: b.title.year,
            posterUrl: b.title.posterUrl,
            runtimeMinutes: null,
            seasons: null,
            genres: [],
            director: null,
            certification: null,
          },
          reason: b.reason,
        })),
      ])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
  }, [language, exhausted])

  // First page.
  useEffect(() => {
    void loadMore()
    // Deliberately once on mount; loadMore guards itself against re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || exhausted) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: '800px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, exhausted])

  return (
    <div className="min-h-dvh wall-ground texture-wall">
      {/* ---- Marquee header ------------------------------------------------ */}
      <header className="relative z-10 bg-band px-6 pt-12 pb-9 text-center transition-colors duration-500">
        <div className="relative inline-block rounded-[3px] bg-frame px-1.5 py-1.5 shadow-frame">
          <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2 bulbs-h bulb-breathe" />
          <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2 bulbs-h bulb-breathe bulb-offset-2" />

          <div className="bg-linear-to-b from-plate to-plate-2 px-8 py-3.5">
            <h1 className="type-marquee text-[2rem] text-velvet-600">{t('app.name')}</h1>
          </div>
        </div>

        <p className="type-script mt-5 text-[1.65rem] text-band-ink">{t('lobby.subtitle')}</p>

        <button
          type="button"
          onClick={() => {
            // A deliberate reshuffle: drop the memory of what has been offered
            // so far, otherwise "show me something else" gets narrower rather
            // than fresher once the history is long.
            forgetShown()
            seenRef.current = snapshotRef.current?.loggedNames ?? []
            setRecs([])
            setExhausted(false)
            void loadMore()
          }}
          disabled={loading}
          className="type-meta mt-4 rounded-full border border-band-ink/30 px-4 py-2 text-band-ink/80 transition-colors hover:border-band-ink/60 hover:text-band-ink disabled:opacity-50"
        >
          {t('lobby.reshuffle')}
        </button>

        {profile && (
          <p className="type-meta mt-4 text-band-ink/70">
            {profile.username}
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-3 underline underline-offset-4 hover:text-band-ink"
            >
              {t('auth.signOut')}
            </button>
          </p>
        )}
      </header>

      <div className="relative z-10 h-7 floor-checker opacity-[0.18]" aria-hidden />

      {/* ---- The poster corridor ------------------------------------------- */}
      <main className="relative z-10 px-6 pt-12 pb-24">
        <div className="rule-pip mb-11">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('lobby.nowShowing')}</span>
        </div>

        <div className="flex flex-col gap-16">
          {recs.map((rec) => (
            <PosterFrame
              key={rec.title.id}
              rec={rec}
              onAddToList={
                rec.title.tmdbId
                  ? () =>
                      setAdding({
                        tmdbId: rec.title.tmdbId as number,
                        mediaType: rec.title.mediaType,
                        name: rec.title.name,
                      })
                  : undefined
              }
              onOpen={
                rec.title.tmdbId
                  ? () =>
                      onOpenTitle({
                        tmdbId: rec.title.tmdbId as number,
                        mediaType: rec.title.mediaType,
                      })
                  : undefined
              }
            />
          ))}
        </div>

        <div ref={sentinelRef} aria-hidden className="h-px" />

        <p className="type-meta mt-14 text-center text-ink-3/70" role="status" aria-live="polite">
          {error ? '' : loading ? t('lobby.loading') : exhausted ? t('lobby.endOfReel') : ''}
        </p>

        {error && (
          <div className="mt-10 text-center">
            <p className="mx-auto max-w-[36ch] text-[0.875rem] leading-relaxed text-velvet-500">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="type-marquee mt-4 rounded-[2px] bg-velvet-600 px-6 py-2.5 text-[13px] text-plate hover:bg-velvet-700"
            >
              {t('lobby.retry')}
            </button>
          </div>
        )}
      </main>

      {adding && <AddToList target={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}
