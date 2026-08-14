import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PosterFrame } from '@/components/PosterFrame'
import { getMockPage } from '@/data/mockRecommendations'
import type { Recommendation } from '@/types'

const PAGE_SIZE = 6

/**
 * The Lobby — the recommendation wall.
 *
 * Scrolling walks you down a cinema corridor past bulb-lit poster frames.
 * Recommendations keep loading as long as you keep scrolling; the first six
 * are the day's programme.
 */
export function Lobby() {
  const { t } = useTranslation()
  const [recs, setRecs] = useState<Recommendation[]>(() => getMockPage(0, PAGE_SIZE))
  const [loading, setLoading] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef(0)
  // Refs, not state: the observer callback must see the current value without
  // being torn down and rebuilt on every load.
  const busyRef = useRef(false)

  const loadMore = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)

    // Stands in for the recommend Edge Function; see supabase/functions/recommend.
    window.setTimeout(() => {
      pageRef.current += 1
      setRecs((current) => [...current, ...getMockPage(pageRef.current, PAGE_SIZE)])
      setLoading(false)
      busyRef.current = false
    }, 450)
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore()
      },
      { rootMargin: '600px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  return (
    <div className="relative min-h-dvh wall-oxblood texture-grain">
      {/* ---- Marquee header ------------------------------------------------ */}
      <header className="relative z-10 px-5 pt-10 pb-8 text-center">
        <div className="relative mx-auto inline-block bg-ink px-1 py-1 shadow-[0_18px_40px_-8px_rgba(0,0,0,0.9)]">
          <div className="pointer-events-none absolute inset-x-2 top-[2px] h-2 bulbs-h bulb-breathe" />
          <div className="pointer-events-none absolute inset-x-2 bottom-[2px] h-2 bulbs-h bulb-breathe" />
          <div className="bg-linear-to-b from-cream-100 to-cream-200 px-7 py-3">
            <h1 className="type-marquee text-3xl text-oxblood-800">{t('app.name')}</h1>
          </div>
        </div>

        <p className="type-script mt-5 text-2xl text-cream-100/90">{t('lobby.subtitle')}</p>
      </header>

      {/* ---- The poster corridor ------------------------------------------- */}
      <main className="relative z-10 flex flex-col gap-14 px-6 pb-40">
        {recs.map((rec) => (
          <PosterFrame key={rec.title.id} rec={rec} />
        ))}

        <div ref={sentinelRef} aria-hidden className="h-px" />

        <p
          className="type-marquee text-center text-xs text-brass-500/60"
          role="status"
          aria-live="polite"
        >
          {loading ? t('lobby.loading') : ''}
        </p>
      </main>

      {/* ---- Tile floor ----------------------------------------------------- */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-16">
        <div className="h-full w-full floor-checker opacity-90" />
        <div className="absolute inset-0 bg-linear-to-b from-pitch via-pitch/50 to-transparent" />
      </div>

      {/* ---- Room falloff ---------------------------------------------------- */}
      <div className="pointer-events-none fixed inset-0 z-30 vignette" />
    </div>
  )
}
