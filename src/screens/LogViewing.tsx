import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { catalogTitle, searchTitles, type CatalogedTitle, type SearchHit } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { SupportedLanguage } from '@/lib/i18n'
import { logViewing } from '@/lib/log'

/**
 * Log a viewing: find the title, score it out of ten, keep a private note.
 *
 * Two steps rather than one form — you cannot rate a film before you have
 * said which film it is, and splitting them keeps the search results from
 * fighting the rating controls for space on a phone.
 */
export function LogViewing({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [chosen, setChosen] = useState<CatalogedTitle | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Debounce so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSearching(true)
      setError(null)
      try {
        setHits(await searchTitles(query, language))
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setSearching(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [query, language])

  async function choose(hit: SearchHit) {
    setError(null)
    try {
      // Caches the title server-side and hands back our internal id.
      setChosen(await catalogTitle(hit.tmdbId, hit.mediaType, language, profile?.country ?? 'DK'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall">
      <header className="relative z-10 bg-band px-6 py-6 transition-colors duration-500">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <h1 className="type-marquee text-lg text-band-ink">{t('log.title')}</h1>
          <button
            type="button"
            onClick={onDone}
            className="type-meta text-band-ink/70 underline underline-offset-4 hover:text-band-ink"
          >
            {t('log.close')}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-lg px-6 py-9">
        {error && (
          <p role="alert" className="mb-5 text-[0.875rem] text-velvet-500">
            {error}
          </p>
        )}

        {chosen ? (
          <RatingForm
            title={chosen}
            onCancel={() => setChosen(null)}
            onSaved={onDone}
            onError={setError}
          />
        ) : (
          <>
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('log.search')}</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('log.searchPlaceholder')}
                className="w-full rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] text-ink outline-none focus:border-brass-600 focus:ring-1 focus:ring-brass-600/50"
              />
            </label>

            <p className="type-meta mt-3 h-4 text-ink-3/70">
              {searching ? t('log.searching') : ''}
            </p>

            <ul className="mt-3 flex flex-col gap-2">
              {hits.map((hit) => (
                <li key={`${hit.mediaType}-${hit.tmdbId}`}>
                  <button
                    type="button"
                    onClick={() => void choose(hit)}
                    className="flex w-full items-center gap-3 rounded-[2px] border border-rule bg-ground-2 p-2 text-left transition-colors hover:border-brass-600"
                  >
                    <span className="h-[68px] w-[46px] shrink-0 overflow-hidden rounded-[1px] bg-frame">
                      {hit.posterUrl && (
                        <img
                          src={hit.posterUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="type-title block text-[1.0625rem] text-ink">{hit.name}</span>
                      <span className="type-meta mt-1 block text-ink-3">
                        {hit.year ?? '—'} · {t(`log.type.${hit.mediaType}`)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  )
}

function RatingForm({
  title,
  onCancel,
  onSaved,
  onError,
}: {
  title: CatalogedTitle
  onCancel: () => void
  onSaved: () => void
  onError: (message: string) => void
}) {
  const { t } = useTranslation()
  const [rating, setRating] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [watchedOn, setWatchedOn] = useState('')
  const [season, setSeason] = useState('')
  const [busy, setBusy] = useState(false)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  async function save() {
    setBusy(true)
    try {
      await logViewing({
        titleId: title.id,
        rating,
        watchedOn: watchedOn || null,
        seasonNumber: season ? Number(season) : null,
        note: note || null,
      })
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-start gap-4">
        <div className="w-24 shrink-0 overflow-hidden rounded-[2px] bg-frame p-1 shadow-frame">
          <div className="aspect-2/3 overflow-hidden bg-pitch">
            {title.posterUrl && (
              <img src={title.posterUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <div className="min-w-0 pt-1">
          <h2 className="type-title text-[1.375rem] text-ink">{title.name}</h2>
          <p className="type-meta mt-1.5 text-accent">
            {[title.year, title.director, title.certification].filter(Boolean).join(' · ')}
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 text-[0.8125rem] text-ink-3 underline underline-offset-4"
          >
            {t('log.notThisOne')}
          </button>
        </div>
      </div>

      {/* ---- Score out of ten ---------------------------------------------- */}
      <div className="mt-8">
        <span className="type-meta mb-2.5 block text-ink-3">{t('log.rating')}</span>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(rating === n ? null : n)}
              aria-pressed={rating === n}
              className={`aspect-square rounded-[2px] border text-[0.8125rem] transition-colors ${
                rating !== null && n <= rating
                  ? 'border-velvet-600 bg-velvet-600 text-plate'
                  : 'border-rule bg-ground-2 text-ink-3 hover:border-brass-600'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[0.75rem] text-ink-3">{t('log.ratingOptional')}</p>
      </div>

      {title.mediaType === 'tv' && (
        <label className="mt-6 block">
          <span className="type-meta mb-2 block text-ink-3">{t('log.season')}</span>
          <input
            type="number"
            min={1}
            max={title.seasons ?? 99}
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-28 rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
          />
        </label>
      )}

      <label className="mt-6 block">
        <span className="type-meta mb-2 block text-ink-3">{t('log.watchedOn')}</span>
        <input
          type="date"
          value={watchedOn}
          onChange={(e) => setWatchedOn(e.target.value)}
          className="rounded-[2px] border border-rule bg-ground-2 px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
        />
        <span className="mt-1.5 block text-[0.75rem] text-ink-3">{t('log.privateHint')}</span>
      </label>

      <label className="mt-6 block">
        <span className="type-meta mb-2 block text-ink-3">{t('log.note')}</span>
        <textarea
          ref={noteRef}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={t('log.notePlaceholder')}
          className="w-full resize-y rounded-[2px] border border-rule bg-ground-2 px-3.5 py-3 text-[0.9375rem] leading-relaxed text-ink outline-none focus:border-brass-600 focus:ring-1 focus:ring-brass-600/50"
        />
        <span className="mt-1.5 block text-[0.75rem] text-ink-3">{t('log.privateHint')}</span>
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy}
        className="type-marquee mt-8 w-full rounded-[2px] bg-velvet-600 py-3.5 text-[15px] text-plate transition-colors hover:bg-velvet-700 disabled:opacity-60"
      >
        {busy ? t('auth.working') : t('log.save')}
      </button>
    </div>
  )
}
