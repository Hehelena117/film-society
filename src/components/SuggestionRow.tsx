import type { ReactNode } from 'react'

/** What a suggestion row shows. Deliberately the least a poster needs. */
export interface Suggestion {
  key: string
  name: string
  year: number | null
  posterUrl: string | null
  onOpen: () => void
}

/**
 * A labelled row of posters you can push sideways.
 *
 * Search screens were a heading, a box and a thousand pixels of nothing until
 * you typed. These fill that with the answers most likely to be wanted, all of
 * them things the app already knows — so nothing new is fetched from TMDB to
 * put something on the page.
 */
export function SuggestionRow({
  title,
  hint,
  items,
  empty,
}: {
  title: string
  hint?: string
  items: Suggestion[]
  /** Shown instead of the row when there is nothing yet. */
  empty?: ReactNode
}) {
  if (!items.length && !empty) return null

  return (
    <section className="mt-8">
      <div className="mb-1 flex items-baseline gap-3 border-b border-rule pb-2">
        <h2 className="type-marquee text-[13px] text-ink">{title}</h2>
        {hint && <span className="type-meta ml-auto text-ink-3">{hint}</span>}
      </div>

      {items.length ? (
        <div className="-mx-6 mt-3 shelf-scroll">
          <div className="flex gap-3 px-6">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={item.onOpen}
                className="w-[5.5rem] shrink-0 snap-start text-left"
              >
                <div className="overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift">
                  <div className="aspect-2/3 overflow-hidden bg-pitch">
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="type-title flex h-full items-center justify-center px-1 text-center text-[0.65rem] leading-tight text-plate/70">
                        {item.name}
                      </span>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[0.7rem] leading-tight text-ink">
                  {item.name}
                </p>
                {item.year && <p className="type-meta text-ink-3">{item.year}</p>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-center text-[0.8125rem] leading-relaxed text-ink-3">{empty}</p>
      )}
    </section>
  )
}
