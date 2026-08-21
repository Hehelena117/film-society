import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import type { TitleRef } from '@/screens/TitleDetail'
import { useAuth } from '@/lib/auth'
import { errorMessage } from '@/lib/errors'
import { groupLog, isLogGrouping, LOG_GROUPINGS, type LogGrouping } from '@/lib/groupLog'
import { deleteEntry, getMyLog, type LoggedEntry } from '@/lib/log'
import { updateMyProfile } from '@/lib/profiles'

/** Your own shelf: everything you have logged, with the notes only you can see. */
export function Me({
  onOpenTitle,
  onFindPeople,
  onOpenProfile,
  onEditProfile,
  onSwitchSide,
  onFrontDoor,
}: {
  onOpenTitle: (ref: TitleRef) => void
  onFindPeople: () => void
  onOpenProfile: (userId: string) => void
  onEditProfile: () => void
  onSwitchSide: () => void
  onFrontDoor: () => void
}) {
  const { t, i18n } = useTranslation()
  const { profile, signOut, user, refreshProfile } = useAuth()
  const [entries, setEntries] = useState<LoggedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Which row is open. One at a time: the log is meant to be scannable, and a
  // screen of expanded rows is the wall of text this replaced.
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  // Held locally as well as on the profile so the log restacks on the tap
  // rather than after a round trip. The write follows.
  const [grouping, setGrouping] = useState<LogGrouping>(() =>
    isLogGrouping(profile?.log_grouping) ? profile.log_grouping : 'month',
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await getMyLog(i18n.resolvedLanguage ?? 'en'))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [i18n.resolvedLanguage])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(id: string) {
    try {
      await deleteEntry(id)
      setEntries((current) => current.filter((e) => e.id !== id))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const rated = entries.filter((e) => e.rating !== null)
  const average = rated.length
    ? (rated.reduce((sum, e) => sum + (e.rating ?? 0), 0) / rated.length).toFixed(1)
    : null
  const distinctTitles = new Set(entries.map((e) => e.title.id)).size

  /**
   * The log broken into months, newest first.
   *
   * Read as a diary rather than a heap: "August 2026" tells you where you are
   * in a way that row 47 of 200 does not. Entries arrive newest-first already,
   * so the groups come out in order without a second sort.
   *
   * Dated by when it was watched where that is known, and by when it was logged
   * where it is not — an entry with no date still has to sit somewhere, and the
   * day you wrote it down is the honest fallback.
   */
  const groups = useMemo(
    () => groupLog(entries, grouping, i18n.resolvedLanguage ?? 'en', t),
    [entries, grouping, i18n.resolvedLanguage, t],
  )

  function regroup(next: LogGrouping) {
    const previous = grouping
    setGrouping(next)
    // A display preference is not worth an error banner if it fails to save —
    // but it is worth putting the control back where it was, so the choice on
    // screen is never one that will not survive a reload.
    updateMyProfile({ log_grouping: next })
      .then(refreshProfile)
      .catch(() => setGrouping(previous))
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={profile?.username ?? t('me.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {/* ---- Ticket stub of totals -------------------------------------- */}
        <div className="rounded-[2px] border border-rule bg-ground-2 px-5 py-4">
          <dl className="flex justify-around text-center">
            <div>
              <dt className="type-meta text-ink-3">{t('me.watched')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{distinctTitles}</dd>
            </div>
            <div>
              <dt className="type-meta text-ink-3">{t('me.entries')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{entries.length}</dd>
            </div>
            <div>
              <dt className="type-meta text-ink-3">{t('me.average')}</dt>
              <dd className="type-title mt-1 text-[1.5rem] text-ink">{average ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => user && onOpenProfile(user.id)}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('people.myProfile')}
          </button>
          <button
            type="button"
            onClick={onEditProfile}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('edit.open')}
          </button>
          <button
            type="button"
            onClick={onFindPeople}
            className="type-marquee rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
          >
            {t('people.find')}
          </button>
        </div>

        {/* The door back to the other half. */}
        <button
          type="button"
          onClick={onSwitchSide}
          className="type-marquee mt-3 w-full rounded-[2px] border border-rule-strong py-3 text-[12px] text-ink-2 transition-colors hover:border-brass-600 hover:text-ink"
        >
          {t('me.toBooks')}
        </button>

        {error && <p className="mt-5 text-[0.875rem] text-velvet-500">{error}</p>}

        <div className="rule-pip mt-8 mb-4">
          <span className="type-meta whitespace-nowrap text-ink-3">{t('me.log')}</span>
        </div>

        {/* How you want the log stacked. Sits on the log rather than in
            settings: it is a way of looking at this screen, and you want to
            see what it does the moment you press it. */}
        {entries.length > 0 && (
          <div
            className="mb-5 flex flex-wrap items-center justify-center gap-1.5"
            role="group"
            aria-label={t('me.groupBy')}
          >
            {LOG_GROUPINGS.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => regroup(mode)}
                aria-pressed={grouping === mode}
                className={`type-marquee rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                  grouping === mode
                    ? 'border-brass-600 bg-brass-600/15 text-ink'
                    : 'border-rule-strong text-ink-3 hover:border-brass-600 hover:text-ink-2'
                }`}
              >
                {t(`me.grouping.${mode}`)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : entries.length === 0 ? (
          <p className="mt-6 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('me.empty')}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="mb-8">
              {/* No box around the group. A bordered card per month, dividers
                  inside it and a border on every row was four frames deep and
                  read as clutter — the heading and a hairline are enough to
                  say where one group ends. */}
              {group.label !== null && (
                <div className="mb-1 flex items-baseline gap-3 border-b border-rule pb-2">
                  <h3 className="type-marquee text-[14px] text-ink">{group.label}</h3>
                  <span className="type-meta ml-auto text-ink-3">{group.entries.length}</span>
                </div>
              )}

              <ul className="flex flex-col divide-y divide-rule/60">
                {group.entries.map((entry) => (
                  <LogRow
                    key={entry.id}
                    entry={entry}
                    open={openEntry === entry.id}
                    onToggle={() => setOpenEntry((c) => (c === entry.id ? null : entry.id))}
                    onOpenTitle={() =>
                      onOpenTitle({
                        tmdbId: entry.title.tmdbId,
                        mediaType: entry.title.mediaType,
                      })
                    }
                    onDelete={() => void remove(entry.id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {/* The way out, and the way back to the front door, kept together at
            the foot of the page rather than up among the profile buttons —
            they are both leaving, not doing. */}
        <button
          type="button"
          onClick={onFrontDoor}
          className="type-meta mt-12 w-full text-center text-ink-3 underline underline-offset-4 hover:text-ink-2"
        >
          {t('chooser.frontDoor')}
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          className="type-meta mt-3 w-full text-center text-ink-3 underline underline-offset-4 hover:text-velvet-500"
        >
          {t('auth.signOut')}
        </button>
      </main>
    </div>
  )
}

/**
 * One viewing, one line.
 *
 * The note used to be printed in full on every row, which read beautifully at
 * three entries and became a wall of text at forty. It is folded to a single
 * line here and opens on a tap — and since the row has to expand anyway,
 * deleting lives inside that too, where it cannot be hit by accident while
 * scrolling.
 */
function LogRow({
  entry,
  open,
  onToggle,
  onOpenTitle,
  onDelete,
}: {
  entry: LoggedEntry
  open: boolean
  onToggle: () => void
  onOpenTitle: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation()

  // The month is already written above the row, so repeating "2026-08-11" on
  // every line was noise in a date format nobody reads aloud. Weekday and day
  // is what makes a log read as a diary.
  // Composed from two formatters rather than asking for both at once: given
  // weekday and day together, Intl returns "19 Wed", which is not how anyone
  // says it. Each part is still localised, only the order is ours.
  const day = entry.watchedOn
    ? (() => {
        const lang = i18n.resolvedLanguage ?? 'en'
        const on = new Date(entry.watchedOn)
        const weekday = new Intl.DateTimeFormat(lang, { weekday: 'short' }).format(on)
        return `${weekday} ${new Intl.DateTimeFormat(lang, { day: 'numeric' }).format(on)}`
      })()
    : t('me.noDate')

  const meta = [
    day,
    entry.title.year,
    entry.seasonNumber && t('log.seasonN', { n: entry.seasonNumber }),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <div className="flex items-center gap-3 py-2.5">
        <button
          type="button"
          onClick={onOpenTitle}
          aria-label={entry.title.name}
          className="w-11 shrink-0 overflow-hidden rounded-[2px] bg-frame p-0.5"
        >
          <div className="aspect-2/3 overflow-hidden bg-pitch">
            {entry.title.posterUrl && (
              <img
                src={entry.title.posterUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          {/* The year has moved down to the meta line: it was competing with
              the title for the same width and cutting it mid-word. */}
          <p className="type-title truncate text-[0.9375rem] leading-tight text-ink">
            {entry.title.name}
          </p>
          <p className="type-meta mt-1 truncate text-ink-3">{meta}</p>

          {/* Sentence case, not type-meta. That utility uppercases, so every
              note previewed as SHOUTING and read like a label rather than
              something someone wrote. */}
          {entry.note && !open && (
            <p className="mt-1 truncate text-[0.75rem] leading-snug text-ink-3/90 italic">
              {entry.note}
            </p>
          )}
        </button>

        {entry.rating !== null && (
          <span className="type-marquee shrink-0 rounded-[2px] border border-velvet-600/40 px-1.5 py-0.5 text-[12px] text-velvet-600">
            {entry.rating}
          </span>
        )}
      </div>

      {open && (
        <div className="pb-3 pl-[3.5rem]">
          {entry.note && (
            <p className="border-l-2 border-brass-600/40 pl-3 text-[0.8125rem] leading-relaxed text-ink-2 italic">
              {entry.note}
            </p>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="mt-2 text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
          >
            {t('me.delete')}
          </button>
        </div>
      )}
    </li>
  )
}
