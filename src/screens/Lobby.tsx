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

        <p className="type-script mt-5 text-[1.65rem] text-band-ink">{t('app.tagline')}</p>
      </header>

      {/* ---- Tile dado, as along the lobby wall ---------------------------- */}
      <div className="relative z-10 h-7 floor-checker opacity-[0.18]" aria-hidden />

      {/* ---- The poster corridor ------------------------------------------- */}
      <main className="relative z-10 px-6 pt-12 pb-24">
        <div className="rule-pip mb-11" aria-hidden={false}>
          <span className="type-meta whitespace-nowrap text-ink-3">{t('lobby.nowShowing')}</span>
        </div>

        <div className="flex flex-col gap-16">
          {recs.map((rec) => (
            <PosterFrame key={rec.title.id} rec={rec} />
          ))}
        </div>

        <div ref={sentinelRef} aria-hidden className="h-px" />

        <p
          className="type-meta mt-14 text-center text-ink-3/70"
          role="status"
          aria-live="polite"
        >
          {loading ? t('lobby.loading') : ''}
        </p>
      </main>
    </div>
  )
}
