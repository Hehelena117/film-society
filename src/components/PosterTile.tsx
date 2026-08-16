import type { RatedTitle } from '@/lib/profiles'

/**
 * One small framed poster with its score.
 *
 * Shared by the profile shelves and the full collection grid so a film looks
 * the same wherever it is met — the width is set by whatever lays it out.
 */
export function PosterTile({
  rated,
  onOpen,
  showName = true,
}: {
  rated: RatedTitle
  onOpen: () => void
  showName?: boolean
}) {
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left">
      <div className="relative overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift">
        <div className="aspect-2/3 overflow-hidden bg-pitch">
          {rated.posterUrl ? (
            <img
              src={rated.posterUrl}
              alt={rated.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            // No artwork is still a film, so it keeps its slot on the shelf
            // rather than collapsing into an empty frame.
            <span className="type-title flex h-full items-center justify-center px-1.5 text-center text-[0.7rem] leading-tight text-plate/70">
              {rated.name}
            </span>
          )}
        </div>
        <span className="type-marquee absolute right-1.5 bottom-1.5 rounded-[2px] bg-velvet-600 px-1.5 py-0.5 text-[11px] text-plate">
          {rated.rating}
        </span>
      </div>

      {showName && (
        <p className="mt-1.5 line-clamp-2 text-[0.7rem] leading-tight text-ink">{rated.name}</p>
      )}
    </button>
  )
}
