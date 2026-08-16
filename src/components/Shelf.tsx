import { useTranslation } from 'react-i18next'

import { PosterTile } from '@/components/PosterTile'
import type { RatedTitle } from '@/lib/profiles'
import type { TitleRef } from '@/screens/TitleDetail'

/** How many posters a shelf holds before it is worth fading its edge. */
const FITS_ON_SCREEN = 3

/**
 * One score's worth of films, on a shelf you push sideways.
 *
 * A shelf per score rather than per band, so nothing puts a word like "liked"
 * on a number the user chose deliberately. It costs page height — a score with
 * one film on it still takes a whole heading and row — but what it buys is that
 * a shelf never grows downwards: rating another fifty eights makes the eights
 * shelf longer sideways and leaves the page the same height.
 */
export function Shelf({
  score,
  titles,
  onOpenTitle,
}: {
  score: number
  titles: RatedTitle[]
  onOpenTitle: (ref: TitleRef) => void
}) {
  const { t } = useTranslation()
  const overflows = titles.length > FITS_ON_SCREEN
  const label = t('profile.outOfTen', { score })

  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="type-marquee text-[17px] text-ink">{score}</h3>
        <span className="type-meta text-ink-3">{titles.length}</span>
      </div>

      {/* Negative margin then matching padding: the shelf runs to the edge of
          the screen so posters can slide off it, while the first one still
          lines up with everything else on the page. */}
      <div
        className={`-mx-6 shelf-scroll ${overflows ? 'shelf-fade' : ''}`}
        role="group"
        aria-label={label}
      >
        <div className="flex gap-3 px-6">
          {titles.map((r) => (
            <div key={r.titleId} className="w-[6.5rem] shrink-0 snap-start">
              <PosterTile
                rated={r}
                onOpen={() => onOpenTitle({ tmdbId: r.tmdbId, mediaType: r.mediaType })}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
