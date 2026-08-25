import { useTranslation } from 'react-i18next'

import type { RatedBook } from '@/lib/books'

/** How many covers fit before the edge is worth fading. */
const FITS_ON_SCREEN = 3

/**
 * One score's worth of books, on a shelf pushed sideways.
 *
 * The same arrangement as the film profile, and for the same reason: a shelf
 * never grows downwards, so rating another fifty eights makes the eights shelf
 * longer rather than the page taller. Only scores actually given appear.
 */
export function BookShelfRow({
  score,
  books,
  onOpenBook,
}: {
  score: number
  books: RatedBook[]
  onOpenBook: (olKey: string) => void
}) {
  const { t } = useTranslation()
  const overflows = books.length > FITS_ON_SCREEN

  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-0.5">
        <h3 className="type-marquee text-[17px] text-ink">{score}</h3>
        <span className="type-meta text-ink-3">{books.length}</span>
      </div>

      {/* Negative margin then matching padding: the shelf runs to the edge of
          the screen so covers can slide off it, while the first one still lines
          up with everything else on the page. */}
      <div
        className={`-mx-6 shelf-scroll ${overflows ? 'shelf-fade' : ''}`}
        role="group"
        aria-label={t('profile.outOfTen', { score })}
      >
        <div className="flex gap-3 px-6">
          {books.map((b) => (
            <button
              key={b.bookId}
              type="button"
              onClick={() => onOpenBook(b.olKey)}
              className="w-[6.5rem] shrink-0 snap-start text-left"
            >
              <span className="relative block overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift">
                <span className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-pitch">
                  {b.coverUrl ? (
                    <img
                      src={b.coverUrl}
                      alt={b.title}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="type-title px-1.5 text-center text-[0.7rem] leading-tight text-plate/70">
                      {b.title}
                    </span>
                  )}
                </span>
                <span className="type-marquee absolute right-1.5 bottom-1.5 rounded-[2px] bg-accent px-1.5 py-0.5 text-[11px] text-plate">
                  {b.rating}
                </span>
              </span>
              <span className="mt-1.5 line-clamp-2 block text-[0.7rem] leading-tight text-ink">
                {b.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
