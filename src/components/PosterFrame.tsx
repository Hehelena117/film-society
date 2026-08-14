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
 * mood-board: dark outer frame, brass reveal, cream marquee plate top and
 * bottom, bulbs running the full perimeter.
 *
 * The frame stays constant across all four themes. It is the anchor — whatever
 * the wall does, the poster is always presented the same way.
 */
export function PosterFrame({
  rec,
  onAddToList,
}: {
  rec: Recommendation
  onAddToList?: () => void
}) {
  const { t } = useTranslation()
  const { title } = rec
  const hue = hueFor(title.name)

  const meta = [
    title.mediaType === 'tv' && title.seasons
      ? t('title.seasons', { count: title.seasons })
      : title.runtimeMinutes && t('title.runtime', { minutes: title.runtimeMinutes }),
    title.genres[0],
    title.certification,
  ].filter(Boolean)

  return (
    <article className="mx-auto w-full max-w-[22rem]">
      {/* ---- The lit frame ------------------------------------------------ */}
      <div className="relative rounded-[3px] bg-frame p-2 shadow-frame">
        {/* Bulb perimeter. Each side is offset so they never breathe in sync. */}
        <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2.5 bulbs-h bulb-breathe" />
        <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2.5 bulbs-h bulb-breathe bulb-offset-2" />
        <div className="pointer-events-none absolute inset-y-3 left-[3px] w-2.5 bulbs-v bulb-breathe bulb-offset-1" />
        <div className="pointer-events-none absolute inset-y-3 right-[3px] w-2.5 bulbs-v bulb-breathe bulb-offset-3" />

        <div className="relative rounded-[2px] bg-frame p-[7px] ring-1 ring-brass-600/40">
          <MarqueePlate />

          {/* ---- The poster itself ---------------------------------------- */}
          <div className="relative my-[7px] aspect-[2/3] overflow-hidden bg-pitch texture-grain">
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

            {/* Glass reflection from the lobby lights. */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white/14 via-transparent to-transparent" />
            <div className="pointer-events-none absolute inset-0 vignette-warm" />
          </div>

          <MarqueePlate />
        </div>
      </div>

      {/* ---- Caption, set on the wall ------------------------------------- */}
      <div className="mt-5 px-2 text-center">
        <h2 className="type-title text-[1.6rem] text-ink">{title.name}</h2>

        <p className="type-meta mt-2 text-accent">
          {title.year}
          {meta.length > 0 && <span className="text-rule-strong"> · </span>}
          {meta.join(' · ')}
        </p>

        {title.director && (
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">
            {t('title.directedBy', { name: title.director })}
          </p>
        )}

        <div className="rule-pip my-4" aria-hidden>
          <span className="size-1 rotate-45 bg-brass-600/70" />
        </div>

        <p className="mx-auto max-w-[32ch] text-[0.875rem] leading-relaxed text-ink-2">
          {rec.reason}
        </p>

        {onAddToList && (
          <button
            type="button"
            onClick={onAddToList}
            className="type-marquee mt-5 rounded-full border border-rule-strong px-5 py-2.5 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            + {t('actions.addToWatchlist')}
          </button>
        )}
      </div>
    </article>
  )
}

/** The cream plate with the house name, as on every frame in the lobby. */
function MarqueePlate() {
  const { t } = useTranslation()
  return (
    <div className="flex h-[26px] items-center justify-center bg-linear-to-b from-plate to-plate-2 shadow-plate">
      <span className="type-marquee text-[13px] text-velvet-600">{t('app.name')}</span>
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
      className="flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center"
      style={{
        background: `radial-gradient(125% 85% at 50% 0%, hsl(${hue} 42% 26%) 0%, hsl(${hue} 52% 11%) 65%, #0b0809 100%)`,
      }}
    >
      <span className="type-marquee text-[10px] text-brass-500/70">Film Society</span>
      <div className="h-px w-12 bg-brass-500/50" />
      <h3 className="type-title text-[1.75rem] leading-[1.15] text-plate drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
        {name}
      </h3>
      <div className="h-px w-12 bg-brass-500/50" />
      <span className="type-marquee text-[15px] text-brass-500">{year}</span>
    </div>
  )
}
