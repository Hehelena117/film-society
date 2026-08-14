import { useTranslation } from 'react-i18next'
import type { Recommendation } from '@/types'

/** Deterministic hue per title, so each fallback poster reads as its own artwork. */
function hueFor(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

/**
 * A poster in a bulb-lit lobby surround, after the Cinemark frames in the
 * mood-board: black outer frame, brass reveal, marquee plate top and bottom,
 * bulbs running the full perimeter.
 */
export function PosterFrame({ rec }: { rec: Recommendation }) {
  const { t } = useTranslation()
  const { title } = rec
  const hue = hueFor(title.name)

  return (
    <article className="mx-auto w-full max-w-sm">
      {/* ---- The lit frame ------------------------------------------------ */}
      <div className="relative rounded-sm bg-ink p-2 shadow-[0_28px_60px_-12px_rgba(0,0,0,0.9)] ring-1 ring-black/60">
        {/* bulb perimeter */}
        <div className="pointer-events-none absolute inset-x-3 top-[3px] h-[10px] bulbs-h bulb-breathe" />
        <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-[10px] bulbs-h bulb-breathe" />
        <div className="pointer-events-none absolute inset-y-3 left-[3px] w-[10px] bulbs-v bulb-breathe" />
        <div className="pointer-events-none absolute inset-y-3 right-[3px] w-[10px] bulbs-v bulb-breathe" />

        <div className="relative rounded-[2px] bg-ink p-[6px] ring-1 ring-brass-700/70">
          {/* top marquee plate */}
          <MarqueePlate />

          {/* ---- The poster itself ---------------------------------------- */}
          <div className="relative my-[6px] aspect-[2/3] overflow-hidden bg-pitch ring-1 ring-brass-700/40 texture-grain">
            {title.posterUrl ? (
              <img
                src={title.posterUrl}
                alt={title.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <FallbackPoster name={title.name} year={title.year} hue={hue} />
            )}

            {/* glass reflection from the lobby lights */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/12 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 vignette" />
          </div>

          {/* bottom marquee plate */}
          <MarqueePlate />
        </div>
      </div>

      {/* ---- Caption below the frame -------------------------------------- */}
      <div className="mt-4 px-1 text-center">
        <h2 className="type-title text-xl text-cream-100">
          {title.name} <span className="text-cream-300/70">({title.year})</span>
        </h2>

        <p className="type-marquee mt-1.5 text-[11px] text-brass-500/90">
          {[
            title.director && t('title.directedBy', { name: title.director }),
            title.mediaType === 'tv' && title.seasons
              ? t('title.seasons', { count: title.seasons })
              : title.runtimeMinutes && t('title.runtime', { minutes: title.runtimeMinutes }),
            title.certification,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </p>

        <p className="mx-auto mt-3 max-w-[34ch] text-[13px] leading-relaxed text-cream-200/60 italic">
          {rec.reason}
        </p>
      </div>
    </article>
  )
}

/** The cream plate with the house name, as on every frame in the lobby. */
function MarqueePlate() {
  const { t } = useTranslation()
  return (
    <div className="flex h-6 items-center justify-center bg-linear-to-b from-cream-100 to-cream-200 shadow-inner">
      <span className="type-marquee text-[13px] text-oxblood-800">{t('app.name')}</span>
    </div>
  )
}

/**
 * Stands in for artwork we cannot fetch yet. Designed as a repertory-cinema
 * letterpress bill rather than a grey box, so the layout reads honestly.
 */
function FallbackPoster({ name, year, hue }: { name: string; year: number; hue: number }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 px-5 text-center"
      style={{
        background: `radial-gradient(120% 80% at 50% 0%, hsl(${hue} 45% 22%) 0%, hsl(${hue} 55% 8%) 70%, #060405 100%)`,
      }}
    >
      <div className="h-px w-10 bg-brass-500/60" />
      <h3 className="type-title text-2xl leading-tight text-cream-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">
        {name}
      </h3>
      <div className="h-px w-10 bg-brass-500/60" />
      <span className="type-marquee text-sm text-brass-500">{year}</span>
    </div>
  )
}
