import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AddToList, type AddTarget } from '@/components/AddToList'
import { PosterFrame } from '@/components/PosterFrame'
import { getLogSnapshot, getRecommendations, type LogSnapshot } from '@/lib/api'
import { getMyFeedback, setFeedback, type FeedbackEntry, type Verdict } from '@/lib/feedback'
import { getShown, rememberShown } from '@/lib/shown'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/lib/auth'
import type { SupportedLanguage } from '@/lib/i18n'
import type { TitleRef } from '@/screens/TitleDetail'
import type { Recommendation } from '@/types'

const PAGE_SIZE = 6

/**
 * The Lobby — the recommendation wall.
 *
 * Scrolling walks you down a cinema corridor past bulb-lit poster frames.
 * Recommendations keep loading as long as you keep scrolling.
 */
export function Lobby({ onOpenTitle }: { onOpenTitle: (ref: TitleRef) => void }) {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()

  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [adding, setAdding] = useState<AddTarget | null>(null)
  // Keyed by `${mediaType}-${tmdbId}`, matching Recommendation.title.id.
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const busyRef = useRef(false)
  // Seeded from localStorage, so a new visit does not re-offer last visit's
  // wall. Everything already logged goes in too — being recommended a film you
  // have already rated is the clearest possible sign of not being listened to.
  const seenRef = useRef<string[]>(getShown())
  const snapshotRef = useRef<LogSnapshot | null>(null)
  // Read once and kept current locally. A verdict must survive a reload — "never
  // show me this again" that forgets by tomorrow is worse than no button at all.
  const feedbackRef = useRef<FeedbackEntry[]>([])
  // How many posters are actually up. Mirrors recs.length so loadMore can read
  // it without taking recs as a dependency and rebuilding itself on every page.
  const countRef = useRef(0)

  const language = (i18n.resolvedLanguage ?? 'en') as SupportedLanguage
  // Off unless the profile explicitly says otherwise — including while the
  // profile is still loading, so a slow load cannot send notes by accident.
  const useNotes = profile?.use_notes_for_recommendations === true

  const loadMore = useCallback(async () => {
    if (busyRef.current || exhausted) return
    busyRef.current = true
    setLoading(true)
    setError(null)

    try {
      // Read the log once — it does not change mid-scroll.
      if (snapshotRef.current === null) {
        snapshotRef.current = await getLogSnapshot(language, useNotes)
        seenRef.current = [...new Set([...seenRef.current, ...snapshotRef.current.loggedNames])]
        feedbackRef.current = await getMyFeedback()
        setVerdicts(
          Object.fromEntries(
            feedbackRef.current.map((f) => [`${f.mediaType}-${f.tmdbId}`, f.verdict]),
          ),
        )
      }

      const rejected = feedbackRef.current.filter((f) => f.verdict === 'less')

      const batch = await getRecommendations({
        ratings: snapshotRef.current.ratings,
        notes: snapshotRef.current.notes,
        feedback: {
          more: feedbackRef.current
            .filter((f) => f.verdict === 'more')
            .map((f) => ({ name: f.name, year: f.year })),
          less: rejected.map((f) => ({ name: f.name, year: f.year })),
        },
        // Belt and braces. The prompt is told not to offer these, but a model
        // is not a filter — the exclusion list is what actually guarantees a
        // turned-down title cannot come back.
        // Turned-down titles go first: the function trims this list at 200, and
        // these are the ones that must never be dropped from it.
        excludeNames: [...new Set([...rejected.map((f) => f.name), ...seenRef.current])],
        filters: {},
        language,
        count: PAGE_SIZE,
      })

      if (!batch.length) {
        // An empty batch usually means the wall is genuinely out of ideas. A
        // single failed model call looks exactly the same from here though, and
        // when that happens on the first page the result is an empty wall
        // announcing you have seen everything — which is both wrong and a dead
        // end. With nothing up yet, offer the retry instead. Observed happening
        // for real while testing, not a hypothetical.
        if (countRef.current === 0) setError(t('lobby.noneCame'))
        else setExhausted(true)
        return
      }

      const names = batch.map((b) => b.title.name)
      // Capped so the prompt cannot grow without bound over a long session.
      // Oldest out, so the wall eventually comes back round to things rather
      // than exhausting itself.
      seenRef.current = [...new Set([...seenRef.current, ...names])].slice(-150)
      rememberShown(names)
      countRef.current += batch.length

      setRecs((current) => [
        ...current,
        ...batch.map((b) => ({
          title: {
            id: `${b.title.mediaType}-${b.title.tmdbId}`,
            tmdbId: b.title.tmdbId,
            mediaType: b.title.mediaType,
            name: b.title.name,
            year: b.title.year,
            posterUrl: b.title.posterUrl,
            runtimeMinutes: null,
            seasons: null,
            genres: [],
            director: null,
            certification: null,
          },
          reason: b.reason,
        })),
      ])
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      busyRef.current = false
    }
    // Turning notes on mid-session does not rebuild the wall by itself — the
    // snapshot is already taken and the wall changes only when asked. Pressing
    // "show me something else" nulls the snapshot and picks the notes up.
  }, [language, exhausted, useNotes, t])

  /**
   * Records a verdict.
   *
   * The button reflects the press immediately and the write follows, because a
   * button that waits on a round trip before moving feels broken on a phone.
   * If the write fails the button goes back to where it was — better a control
   * that visibly refuses than one that lies.
   */
  const judge = useCallback(
    async (rec: Recommendation, next: Verdict | null) => {
      const { title } = rec
      if (!title.tmdbId) return
      const key = `${title.mediaType}-${title.tmdbId}`
      const previous = verdicts[key] ?? null

      setVerdicts((current) => {
        const copy = { ...current }
        if (next === null) delete copy[key]
        else copy[key] = next
        return copy
      })

      const entry = {
        tmdbId: title.tmdbId,
        mediaType: title.mediaType,
        name: title.name,
        year: title.year ?? null,
      }
      feedbackRef.current = [
        ...feedbackRef.current.filter(
          (f) => !(f.tmdbId === title.tmdbId && f.mediaType === title.mediaType),
        ),
        ...(next ? [{ ...entry, verdict: next }] : []),
      ]

      try {
        await setFeedback(entry, next)
      } catch (err) {
        setVerdicts((current) => {
          const copy = { ...current }
          if (previous === null) delete copy[key]
          else copy[key] = previous
          return copy
        })
        setError(errorMessage(err))
      }
    },
    [verdicts],
  )

  // First page.
  useEffect(() => {
    void loadMore()
    // Deliberately once on mount; loadMore guards itself against re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || exhausted) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: '800px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore, exhausted])

  return (
    <div className="min-h-dvh wall-ground texture-wall">
      {/* ---- Marquee header ------------------------------------------------ */}
      <header className="relative z-10 bg-band px-6 pt-12 pb-9 text-center transition-colors duration-500">
        <div className="relative inline-block rounded-[3px] bg-frame px-1.5 py-1.5 shadow-frame">
          <div className="pointer-events-none absolute inset-x-3 top-[3px] h-2 bulbs-h bulb-breathe" />
          <div className="pointer-events-none absolute inset-x-3 bottom-[3px] h-2 bulbs-h bulb-breathe bulb-offset-2" />

          <div className="bg-linear-to-b from-plate to-plate-2 px-8 py-3.5">
            <h1 className="type-marquee text-[2rem] text-velvet-600">{t('app.name')}</h1>
          </div>
        </div>

        <p className="type-script mt-5 text-[1.65rem] text-band-ink">{t('lobby.subtitle')}</p>

        <button
          type="button"
          onClick={() => {
            // Keep everything already offered in the exclusion list. Clearing
            // it — which is what this used to do — sends the model an
            // identical prompt and gets the identical wall back, which is the
            // one thing this button must not do.
            //
            // Re-read the log though, so anything rated since the wall was
            // built counts: this is now the only moment it changes.
            snapshotRef.current = null
            countRef.current = 0
            setRecs([])
            setExhausted(false)
            void loadMore()
          }}
          disabled={loading}
          className="type-meta mt-4 rounded-full border border-band-ink/30 px-4 py-2 text-band-ink/80 transition-colors hover:border-band-ink/60 hover:text-band-ink disabled:opacity-50"
        >
          {t('lobby.reshuffle')}
        </button>

        {profile && (
          <p className="type-meta mt-4 text-band-ink/70">
            {profile.username}
            <button
              type="button"
              onClick={() => void signOut()}
              className="ml-3 underline underline-offset-4 hover:text-band-ink"
            >
              {t('auth.signOut')}
            </button>
          </p>
        )}
      </header>

      <div className="relative z-10 h-7 floor-checker opacity-[0.18]" aria-hidden />

      {/* ---- The poster corridor ------------------------------------------- */}
      <main className="relative z-10 px-6 pt-12 pb-24">
        <div className="rule-pip mb-11">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('lobby.nowShowing')}</span>
        </div>

        <div className="flex flex-col gap-16">
          {recs.map((rec) => (
            <PosterFrame
              key={rec.title.id}
              rec={rec}
              onAddToList={
                rec.title.tmdbId
                  ? () =>
                      setAdding({
                        tmdbId: rec.title.tmdbId as number,
                        mediaType: rec.title.mediaType,
                        name: rec.title.name,
                      })
                  : undefined
              }
              onOpen={
                rec.title.tmdbId
                  ? () =>
                      onOpenTitle({
                        tmdbId: rec.title.tmdbId as number,
                        mediaType: rec.title.mediaType,
                      })
                  : undefined
              }
              verdict={verdicts[rec.title.id] ?? null}
              onVerdict={
                rec.title.tmdbId ? (next) => void judge(rec, next) : undefined
              }
            />
          ))}
        </div>

        <div ref={sentinelRef} aria-hidden className="h-px" />

        <p className="type-meta mt-14 text-center text-ink-3/70" role="status" aria-live="polite">
          {error ? '' : loading ? t('lobby.loading') : exhausted ? t('lobby.endOfReel') : ''}
        </p>

        {error && (
          <div className="mt-10 text-center">
            <p className="mx-auto max-w-[36ch] text-[0.875rem] leading-relaxed text-velvet-500">
              {error}
            </p>
            <button
              type="button"
              onClick={() => void loadMore()}
              className="type-marquee mt-4 rounded-[2px] bg-velvet-600 px-6 py-2.5 text-[13px] text-plate hover:bg-velvet-700"
            >
              {t('lobby.retry')}
            </button>
          </div>
        )}
      </main>

      {adding && <AddToList target={adding} onClose={() => setAdding(null)} />}
    </div>
  )
}
