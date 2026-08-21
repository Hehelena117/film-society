import { useTranslation } from 'react-i18next'

import type { Side } from '@/lib/side'

/**
 * Two doors off one foyer.
 *
 * Shown once, on the first login, and then remembered.
 *
 * They are drawn as doors rather than cards because that is what they are —
 * a card with a name on it says "pick an option", and a panelled door with a
 * brass handle says "there is a room through here". The film door is painted
 * the oxblood of a cinema; the book door is the green of the shopfront in
 * resources/mood-board/book app, which is where the whole book palette came
 * from.
 *
 * Deliberately not themed by the current data-theme: this screen belongs to
 * neither side yet, so the values are fixed and the doors do the talking.
 */
export function Chooser({
  onPick,
  onBack,
}: {
  onPick: (side: Side) => void
  /** Absent on the first login — there is nowhere to go back to yet. */
  onBack?: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-5 py-10"
      style={{ backgroundColor: '#1a1416' }}
    >
      <p className="type-script mb-1 text-center text-[1.6rem] text-[#c9922e]">
        {t('chooser.welcome')}
      </p>
      <p className="type-meta mb-8 text-center text-[#8d8375]">{t('chooser.subtitle')}</p>

      <div className="flex w-full max-w-[26rem] items-end justify-center gap-4">
        <Door
          onClick={() => onPick('film')}
          name={t('chooser.film')}
          note={t('chooser.filmNote')}
          paint="#5d1720"
          paintDark="#3a0d14"
          plate="#f4eddf"
          plateInk="#5d1720"
        />
        <Door
          onClick={() => onPick('book')}
          name={t('chooser.book')}
          note={t('chooser.bookNote')}
          paint="#41513c"
          paintDark="#2b352a"
          plate="#f0ede5"
          plateInk="#2f3a2c"
        />
      </div>

      {/* The tiled floor of the entrance, running under both doors. */}
      <div
        className="mt-0 h-8 w-full max-w-[26rem] opacity-25"
        aria-hidden
        style={{
          backgroundImage:
            'repeating-conic-gradient(from 30deg at 50% 50%, #f4eddf 0deg 60deg, transparent 60deg 120deg)',
          backgroundSize: '18px 31px',
        }}
      />

      <p className="type-meta mt-8 max-w-[32ch] text-center leading-relaxed text-[#8d8375]">
        {t('chooser.switchHint')}
      </p>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="type-meta mt-6 underline underline-offset-4"
          style={{ color: '#8d8375' }}
        >
          {t('chooser.back')}
        </button>
      )}
    </div>
  )
}

/**
 * One painted door: architrave, fanlight, four recessed panels, brass handle.
 *
 * The panels are drawn with insets rather than images so they take the paint
 * colour with them and stay crisp at any size.
 */
function Door({
  onClick,
  name,
  note,
  paint,
  paintDark,
  plate,
  plateInk,
}: {
  onClick: () => void
  name: string
  note: string
  paint: string
  paintDark: string
  plate: string
  plateInk: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${name} — ${note}`}
      className="group flex-1 text-left transition-transform duration-300 hover:-translate-y-1"
    >
      {/* Architrave */}
      <span
        className="block rounded-t-[10px] p-[6px] pb-0"
        style={{ backgroundColor: '#2a211d', boxShadow: '0 20px 44px -18px rgb(0 0 0 / 0.8)' }}
      >
        {/* Fanlight over the door, lit from inside the room beyond. */}
        <span
          className="mb-[5px] flex h-9 items-center justify-center rounded-t-[7px] px-2"
          style={{
            backgroundImage: `radial-gradient(120% 150% at 50% 120%, ${plate} 0%, #c9922e 55%, #6b4c17 100%)`,
          }}
        >
          <span
            className="type-marquee text-center text-[11px] leading-none"
            style={{ color: '#2a211d' }}
          >
            {name}
          </span>
        </span>

        {/* The door leaf */}
        <span
          className="relative flex h-[15rem] flex-col gap-2 p-2.5"
          style={{
            backgroundColor: paint,
            backgroundImage: `linear-gradient(100deg, rgb(255 255 255 / 0.08) 0%, transparent 38%, ${paintDark} 100%)`,
          }}
        >
          {/* Four recessed panels. */}
          {[0, 1].map((row) => (
            <span key={row} className="flex flex-1 gap-2">
              {[0, 1].map((col) => (
                <span
                  key={col}
                  className="flex-1 rounded-[2px]"
                  style={{
                    backgroundColor: paintDark,
                    boxShadow: `inset 0 1px 0 ${paint}, inset 0 -1px 2px rgb(0 0 0 / 0.45)`,
                  }}
                />
              ))}
            </span>
          ))}

          {/* Brass handle, on the opening edge. */}
          <span
            className="absolute top-1/2 right-1.5 size-2.5 -translate-y-1/2 rounded-full"
            style={{
              backgroundImage: 'radial-gradient(circle at 35% 30%, #f0d089, #c9922e 55%, #6b4c17)',
              boxShadow: '0 1px 2px rgb(0 0 0 / 0.6)',
            }}
          />
        </span>
      </span>

      {/* The brass plate screwed to the wall beside the door. */}
      <span
        className="mt-2 block rounded-[2px] px-2.5 py-2 text-center"
        style={{ backgroundColor: plate }}
      >
        <span
          className="block text-[0.68rem] leading-snug"
          style={{ color: plateInk, opacity: 0.85 }}
        >
          {note}
        </span>
      </span>
    </button>
  )
}
