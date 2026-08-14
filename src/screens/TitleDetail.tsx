import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AddToList } from '@/components/AddToList'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Attribution } from '@/components/Attribution'
import { catalogTitle, type CatalogedTitle, type Provider } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import type { SupportedLanguage } from '@/lib/i18n'

export interface TitleRef {
  tmdbId: number
  mediaType: 'movie' | 'tv'
}

const IMG = 'https://image.tmdb.org/t/p'

/**
 * Everything known about one title.
 *
 * Reads through the catalog function, which caches as a side effect — so
 * opening a title page is also what puts it in the database for watchlists and
 * swipe decks to point at.
 */
export function TitleDetail({
  title: ref,
  onBack,
  onLog,
}: {
  title: TitleRef
  onBack: () => void
  onLog: (t: CatalogedTitle) => void
}) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage

  const [data, setData] = useState<CatalogedTitle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    let active = true
    setData(null)
    setError(null)

    catalogTitle(ref.tmdbId, ref.mediaType, language, profile?.country ?? 'DK')
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)))

    return () => {
      active = false
    }
  }, [ref.tmdbId, ref.mediaType, language, profile?.country])

  if (error) {
    return (
      <div className="min-h-dvh wall-ground texture-wall pb-28">
        <ScreenHeader title={t('detail.title')} onBack={onBack} />
        <p className="mx-auto max-w-lg px-6 py-10 text-center text-[0.875rem] text-velvet-500">
          {error}
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-dvh items-center justify-center wall-ground texture-wall">
        <p className="type-script text-2xl text-ink-3">{t('lists.loading')}</p>
      </div>
    )
  }

  const streaming = data.providers.filter((p) => p.offer_type === 'flatrate' || p.offer_type === 'free')
  const rentBuy = data.providers.filter((p) => p.offer_type === 'rent' || p.offer_type === 'buy')

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={data.name} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {/* ---- Poster and headline ---------------------------------------- */}
        <div className="flex gap-5">
          <div className="w-32 shrink-0">
            <div className="rounded-[3px] bg-frame p-1.5 shadow-frame">
              <div className="aspect-2/3 overflow-hidden rounded-[2px] bg-pitch">
                {data.posterUrl && (
                  <img src={data.posterUrl} alt={data.name} className="h-full w-full object-cover" />
                )}
              </div>
            </div>
          </div>

          <div className="min-w-0 pt-1">
            <h1 className="type-title text-[1.5rem] leading-tight text-ink">{data.name}</h1>
            {data.tagline && (
              <p className="type-script mt-1.5 text-[1.125rem] leading-snug text-ink-2">
                {data.tagline}
              </p>
            )}

            <p className="type-meta mt-3 text-accent">
              {[
                data.year,
                data.mediaType === 'tv' && data.seasons
                  ? t('title.seasons', { count: data.seasons })
                  : data.runtimeMinutes && t('title.runtime', { minutes: data.runtimeMinutes }),
                data.certification,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            {data.tmdbRating !== null && (
              <p className="type-meta mt-2 text-ink-3">
                ★ {data.tmdbRating}
                <span className="text-rule-strong"> / 10 · </span>
                {t('detail.votes', { count: data.tmdbVotes ?? 0 })}
              </p>
            )}
          </div>
        </div>

        {/* ---- Actions ----------------------------------------------------- */}
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => onLog(data)}
            className="type-marquee flex-1 rounded-[2px] bg-velvet-600 py-3.5 text-[13px] text-plate hover:bg-velvet-700"
          >
            {t('detail.logIt')}
          </button>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="type-marquee flex-1 rounded-[2px] border border-rule-strong py-3.5 text-[13px] text-ink-2 hover:border-brass-600 hover:text-ink"
          >
            + {t('actions.addToWatchlist')}
          </button>
        </div>

        {/* ---- Trailer ------------------------------------------------------
            Loaded only on tap: an iframe per title page would pull YouTube's
            player onto every visit whether or not anyone wants to watch. */}
        {data.trailerKey && (
          <section className="mt-8">
            <SectionLabel>{t('detail.trailer')}</SectionLabel>
            <div className="mt-3 overflow-hidden rounded-[2px] bg-frame p-1.5 shadow-frame">
              <div className="relative aspect-video overflow-hidden rounded-[2px] bg-pitch">
                {playing ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${data.trailerKey}?autoplay=1`}
                    title={`${data.name} — ${t('detail.trailer')}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPlaying(true)}
                    className="group absolute inset-0 h-full w-full"
                    aria-label={t('detail.trailer')}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${data.trailerKey}/hqdefault.jpg`}
                      alt=""
                      className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-90"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="type-marquee rounded-full border-2 border-bulb bg-pitch/60 px-6 py-3 text-[14px] text-bulb">
                        ▶ {t('detail.play')}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {data.overview && (
          <section className="mt-8">
            <SectionLabel>{t('detail.synopsis')}</SectionLabel>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{data.overview}</p>
          </section>
        )}

        {/* ---- Where to watch ---------------------------------------------- */}
        {(streaming.length > 0 || rentBuy.length > 0) && (
          <section className="mt-8">
            <SectionLabel>
              {t('detail.whereToWatch', { country: profile?.country ?? 'DK' })}
            </SectionLabel>

            {streaming.length > 0 && (
              <>
                <p className="type-meta mt-3 mb-2 text-ink-3">{t('detail.streaming')}</p>
                <ProviderRow providers={streaming} />
              </>
            )}
            {rentBuy.length > 0 && (
              <>
                <p className="type-meta mt-4 mb-2 text-ink-3">{t('detail.rentBuy')}</p>
                <ProviderRow providers={rentBuy} />
              </>
            )}

            <p className="mt-3 text-[0.7rem] text-ink-3">{t('detail.justwatch')}</p>
          </section>
        )}

        {/* ---- Credits ------------------------------------------------------ */}
        <section className="mt-8">
          <SectionLabel>{t('detail.credits')}</SectionLabel>
          <dl className="mt-3 flex flex-col gap-2 text-[0.875rem]">
            {data.director && (
              <Row label={data.mediaType === 'tv' ? t('detail.createdBy') : t('detail.director')}>
                {data.director}
              </Row>
            )}
            {data.writers.length > 0 && (
              <Row label={t('detail.writers')}>{data.writers.join(', ')}</Row>
            )}
            {data.genres.length > 0 && (
              <Row label={t('detail.genres')}>{data.genres.join(', ')}</Row>
            )}
          </dl>
        </section>

        {data.castTop.length > 0 && (
          <section className="mt-8">
            <SectionLabel>{t('detail.cast')}</SectionLabel>
            <ul className="mt-3 -mx-6 flex gap-3 overflow-x-auto px-6 pb-2">
              {data.castTop.map((person) => (
                <li key={`${person.name}-${person.character}`} className="w-20 shrink-0">
                  <div className="aspect-2/3 overflow-hidden rounded-[2px] bg-ground-2">
                    {person.profilePath ? (
                      <img
                        src={`${IMG}/w185${person.profilePath}`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-ink-3">—</span>
                    )}
                  </div>
                  <p className="mt-1.5 text-[0.7rem] leading-tight text-ink">{person.name}</p>
                  {person.character && (
                    <p className="text-[0.65rem] leading-tight text-ink-3">{person.character}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- Themes ------------------------------------------------------- */}
        {data.keywords.length > 0 && (
          <section className="mt-8">
            <SectionLabel>{t('detail.themes')}</SectionLabel>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.keywords.map((k) => (
                <li
                  key={k}
                  className="rounded-full border border-rule px-3 py-1.5 text-[0.75rem] text-ink-2"
                >
                  {k}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Age certification only. The detailed IMDb-style severity breakdown
            is a paid licence — see docs/DECISIONS.md. */}
        <section className="mt-8">
          <SectionLabel>{t('detail.parental')}</SectionLabel>
          <p className="mt-3 text-[0.875rem] text-ink-2">
            {data.certification
              ? t('detail.rated', { rating: data.certification, country: profile?.country ?? 'DK' })
              : t('detail.noRating')}
          </p>
        </section>

        <Attribution />
      </main>

      {adding && (
        <AddToList
          target={{ tmdbId: data.tmdbId, mediaType: data.mediaType, name: data.name }}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rule-pip">
      <span className="type-meta whitespace-nowrap text-ink-3">{children}</span>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="type-meta w-24 shrink-0 pt-0.5 text-ink-3">{label}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  )
}

function ProviderRow({ providers }: { providers: Provider[] }) {
  // TMDB returns a service once per offer type; a viewer only cares that it is there.
  const unique = [...new Map(providers.map((p) => [p.provider_name, p])).values()]

  return (
    <ul className="flex flex-wrap gap-2">
      {unique.map((p) => (
        <li
          key={p.provider_name}
          className="flex items-center gap-2 rounded-[2px] border border-rule bg-ground-2 py-1.5 pr-3 pl-1.5"
        >
          {p.logo_path && (
            <img
              src={`${IMG}/w45${p.logo_path}`}
              alt=""
              loading="lazy"
              className="size-7 rounded-[2px]"
            />
          )}
          <span className="text-[0.8125rem] text-ink">{p.provider_name}</span>
        </li>
      ))}
    </ul>
  )
}
