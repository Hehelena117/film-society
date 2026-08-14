import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PosterFrame } from '@/components/PosterFrame'
import { getRatingSeeds, getRecommendations, type RatingSeed } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { SupportedLanguage } from '@/lib/i18n'
import type { Recommendation } from '@/types'

const PAGE_SIZE = 6

/**
 * The Lobby — the recommendation wall.
 *
 * Scrolling walks you down a cinema corridor past bulb-lit poster frames.
 * Recommendations keep loading as long as you keep scrolling.
 */
export function Lobby() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()

  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  // Titles already shown, so each page asks the model for something new.
  const seenRef = useRef<string[]>([])
  const seedsRef = useRef<RatingSeed[] | null>(null)

  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage

  const loadMore = useCallback(async () => {
    if (busyRef.current || exhausted) return
    busyRef.current = true
    setLoading(true)
    setError(null)

    try {
      // Read the user's own ratings once — they do not change mid-scroll.
      if (seedsRef.current === null) {
        seedsRef.current = await getRatingSeeds(language)
      }

      const batch = await getRecommendations({
        ratings: seedsRef.current,
        excludeNames: seenRef.current,
        filters: {},
        language,
        count: PAGE_SIZE,
      })

      if (!batch.length) {
        setExhausted(true)
        return
      }

      seenRef.current = [...seenRef.current, ...batch.map((b) => b.title.name)]

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
      setError(err instanceof Error ? err.message : String(err))
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
            <PosterFrame key={rec.title.id} rec={rec} />
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
    </div>
  )
}
