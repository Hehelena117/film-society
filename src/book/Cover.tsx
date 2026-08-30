import { useState } from 'react'

/**
 * A book's jacket, with something to show when there isn't one.
 *
 * Covers fail more often than you would think. Open Library's cover CDN rate
 * limits, and it answers a missing image with a blank rather than an error
 * unless asked not to — so a naked <img> leaves a black rectangle, which is
 * what the reading list showed the first time a shoot ran into their limits.
 *
 * object-contain rather than cover: jackets are nothing like as uniform as
 * film posters, and cropping a square art book to 2:3 loses the title.
 */
export function Cover({
  url,
  title,
  className = '',
}: {
  url: string | null
  title: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const show = url && !failed

  return (
    <span className={`block overflow-hidden rounded-[2px] bg-frame p-0.5 ${className}`}>
      <span className="flex aspect-[2/3] items-center justify-center overflow-hidden bg-pitch">
        {show ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="type-title line-clamp-4 px-1 text-center text-[0.6rem] leading-tight text-plate/75">
            {title}
          </span>
        )}
      </span>
    </span>
  )
}
