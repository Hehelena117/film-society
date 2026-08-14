import { useTranslation } from 'react-i18next'

/** Shared header: the marquee band, with an optional way back. */
export function ScreenHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { t } = useTranslation()

  return (
    <header className="relative z-10 bg-band px-6 py-5 transition-colors duration-500">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t('nav.back')}
            className="type-marquee text-[13px] text-band-ink/70 hover:text-band-ink"
          >
            ←
          </button>
        )}
        <h1 className="type-marquee truncate text-lg text-band-ink">{title}</h1>
      </div>
    </header>
  )
}
