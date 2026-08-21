/**
 * A book seen edge-on, as it sits on a shelf.
 *
 * Open Library serves front covers, not spine photographs, so these are drawn
 * rather than fetched — which is honest as long as they stay background, and
 * is why they carry no lettering. The book being recommended is the only one
 * with anything written on it.
 *
 * Colour, height and width come from the seed, so the same neighbour is always
 * the same neighbour, and a row of them looks like a row of different books
 * rather than a repeated pattern.
 */
const CLOTHS = [
  '#4a5240', // Chive
  '#594536', // Cocoa
  '#00263e', // 2965 C
  '#4e0000', // Red Inferno
  '#a1ad92', // Reseda
  '#7a6a53',
  '#2f3a44',
  '#6b4c17',
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

export function Spine({ title, tall = false }: { title: string; tall?: boolean }) {
  const h = hash(title)
  const cloth = CLOTHS[h % CLOTHS.length]
  // Real shelves are not level along the top. A few millimetres of variation
  // is the difference between a shelf and a bar chart.
  const height = tall ? 100 : 88 + (h % 11)
  const width = 15 + (h % 14)

  return (
    <div
      aria-hidden
      className="relative shrink-0 self-end overflow-hidden rounded-[1px]"
      style={{ width, height: `${height}%`, backgroundColor: cloth }}
    >
      {/* Gilt bands near the head and tail, as on a cloth binding. */}
      <span className="absolute inset-x-1 top-2 h-px" style={{ backgroundColor: '#c9922e88' }} />
      <span className="absolute inset-x-1 top-3.5 h-px" style={{ backgroundColor: '#c9922e55' }} />
      <span className="absolute inset-x-1 bottom-3 h-px" style={{ backgroundColor: '#c9922e66' }} />

      {/* No lettering. These are the books either side of the one being
          recommended, and titles on them pulled the eye away from the only
          book on the shelf that is actually being offered. A binding with
          blind tooling and no title is a perfectly ordinary thing. */}

      {/* The rounded shoulder catching the light. */}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ backgroundImage: 'linear-gradient(90deg, rgb(255 255 255 / 0.22), transparent)' }}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-1.5"
        style={{ backgroundImage: 'linear-gradient(270deg, rgb(0 0 0 / 0.35), transparent)' }}
      />
    </div>
  )
}
