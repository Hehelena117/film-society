import { useTranslation } from 'react-i18next'

/**
 * Required attribution — not decoration.
 *
 * TMDB's terms oblige us to identify our use of them with their logo and to
 * carry the "not endorsed, certified, or otherwise approved" wording verbatim.
 * Watch-provider data reaches TMDB from JustWatch, who must be credited
 * wherever it appears.
 *
 * The logo is served from our own /public rather than hotlinked, so it cannot
 * break when TMDB reshuffles their asset hashes.
 *
 * See docs/DECISIONS.md. Do not remove this from any screen showing TMDB data.
 */
export function Attribution({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const base = import.meta.env.BASE_URL

  return (
    <footer
      className={`${compact ? 'mt-8' : 'mt-12'} border-t border-rule pt-5 text-center`}
    >
      <a
        href="https://www.themoviedb.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block"
      >
        <img
          src={`${base}tmdb.svg`}
          alt="The Movie Database"
          width={110}
          height={14}
          className="mx-auto h-3.5 w-auto opacity-80"
        />
      </a>

      <p className="mx-auto mt-3 max-w-[42ch] text-[0.7rem] leading-relaxed text-ink-3">
        {t('attribution.tmdb')}
      </p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-[0.7rem] leading-relaxed text-ink-3">
        {t('attribution.justwatch')}
      </p>
    </footer>
  )
}
