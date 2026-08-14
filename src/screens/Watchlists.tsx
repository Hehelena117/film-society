import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import type { TitleRef } from '@/screens/TitleDetail'
import { useAuth } from '@/lib/auth'
import { getMyGroups, type Group } from '@/lib/groups'
import { errorMessage } from '@/lib/errors'
import {
  addWatchlistMember,
  createWatchlist,
  deleteWatchlist,
  getMyWatchlists,
  getWatchlistItems,
  getWatchlistMembers,
  removeFromWatchlist,
  removeWatchlistMember,
  setWatchlistGroup,
  type Watchlist,
  type WatchlistItem,
  type WatchlistMember,
} from '@/lib/watchlists'
import { getFilterOptions, startSession } from '@/lib/swipe'

export function Watchlists({
  onStartSwipe,
  onOpenTitle,
}: {
  onStartSwipe: (sessionId: string) => void
  onOpenTitle: (ref: TitleRef) => void
}) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [lists, setLists] = useState<Watchlist[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState<Watchlist | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [l, g] = await Promise.all([getMyWatchlists(), getMyGroups()])
      setLists(l)
      setGroups(g)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (open) {
    return (
      <WatchlistDetail
        list={open}
        groups={groups}
        isOwner={open.ownerId === userId}
        language={i18n.resolvedLanguage ?? 'en'}
        onStartSwipe={onStartSwipe}
        onOpenTitle={onOpenTitle}
        onBack={() => {
          setOpen(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('lists.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {creating ? (
          <NewListForm
            groups={groups}
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false)
              void refresh()
            }}
            onError={setError}
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-3.5 text-[13px] text-ink-3 transition-colors hover:border-brass-600 hover:text-ink-2"
          >
            + {t('lists.new')}
          </button>
        )}

        {loading ? (
          <p className="type-meta mt-8 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : lists.length === 0 && !creating ? (
          <p className="mt-10 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('lists.empty')}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2.5">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => setOpen(list)}
                  className="w-full rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span className="type-title block text-[1.125rem] text-ink">{list.name}</span>
                  <span className="type-meta mt-1.5 block text-ink-3">
                    {t('lists.count', { count: list.itemCount })}
                    {list.groupName && <> · {list.groupName}</>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-[0.8125rem] transition-colors ${
        on
          ? 'border-velvet-600 bg-velvet-600 text-plate'
          : 'border-rule text-ink-2 hover:border-brass-600'
      }`}
    >
      {label}
    </button>
  )
}

function NewListForm({
  groups,
  onCancel,
  onCreated,
  onError,
}: {
  groups: Group[]
  onCancel: () => void
  onCreated: () => void
  onError: (m: string) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createWatchlist(name.trim(), null, groupId || null)
      onCreated()
    } catch (err) {
      onError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
      <label className="block">
        <span className="type-meta mb-2 block text-ink-3">{t('lists.name')}</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
        />
      </label>

      <label className="mt-4 block">
        <span className="type-meta mb-2 block text-ink-3">{t('lists.shareWith')}</span>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
        >
          <option value="">{t('lists.justMe')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className="type-marquee flex-1 rounded-[2px] bg-velvet-600 py-3 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
        >
          {t('lists.create')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="type-marquee rounded-[2px] border border-rule px-5 py-3 text-[13px] text-ink-3"
        >
          {t('log.close')}
        </button>
      </div>
    </div>
  )
}

function WatchlistDetail({
  list,
  groups,
  isOwner,
  language,
  onBack,
  onStartSwipe,
  onOpenTitle,
}: {
  list: Watchlist
  groups: Group[]
  isOwner: boolean
  language: string
  onBack: () => void
  onStartSwipe: (sessionId: string) => void
  onOpenTitle: (ref: TitleRef) => void
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const country = profile?.country ?? 'DK'
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [members, setMembers] = useState<WatchlistMember[]>([])
  const [groupId, setGroupId] = useState(list.groupId ?? '')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [options, setOptions] = useState<{ genres: string[]; services: string[] }>({
    genres: [],
    services: [],
  })
  const [pickedGenres, setPickedGenres] = useState<string[]>([])
  const [pickedServices, setPickedServices] = useState<string[]>([])
  const [maxMinutes, setMaxMinutes] = useState('')

  // Answers "who can see this?" without anyone having to open the panel.
  const sharingSummary = groupId
    ? (groups.find((g) => g.id === groupId)?.name ?? t('lists.aGroup'))
    : members.length > 0
      ? members.map((m) => m.username).join(', ')
      : t('lists.justMe')

  async function beginSwipe() {
    setStarting(true)
    setError(null)
    try {
      onStartSwipe(
        await startSession(
          list.id,
          groupId || null,
          {
            genres: pickedGenres,
            services: pickedServices,
            maxMinutes: maxMinutes ? Number(maxMinutes) : null,
          },
          country,
        ),
      )
    } catch (err) {
      const message = errorMessage(err)
      setError(
        message === 'empty-watchlist'
          ? t('swipe.needTitles')
          : message === 'no-matches'
            ? t('swipe.noMatches')
            : message,
      )
      setStarting(false)
    }
  }

  function toggle(list: string[], value: string) {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  const activeFilterCount =
    pickedGenres.length + pickedServices.length + (maxMinutes ? 1 : 0)

  async function changeGroup(next: string) {
    setGroupId(next)
    setError(null)
    try {
      await setWatchlistGroup(list.id, next || null)
    } catch (err) {
      setError(errorMessage(err))
      setGroupId(list.groupId ?? '') // put the control back where it was
    }
  }

  async function invite() {
    if (!username.trim()) return
    setSharing(true)
    setError(null)
    try {
      await addWatchlistMember(list.id, username)
      setUsername('')
      setMembers(await getWatchlistMembers(list.id))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSharing(false)
    }
  }

  async function uninvite(userId: string) {
    try {
      await removeWatchlistMember(list.id, userId)
      setMembers((current) => current.filter((m) => m.userId !== userId))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [i, m, o] = await Promise.all([
        getWatchlistItems(list.id, language),
        getWatchlistMembers(list.id),
        getFilterOptions(list.id, country),
      ])
      setItems(i)
      setMembers(m)
      setOptions(o)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [list.id, language, country])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(titleId: number) {
    try {
      await removeFromWatchlist(list.id, titleId)
      setItems((current) => current.filter((i) => i.titleId !== titleId))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function destroy() {
    try {
      await deleteWatchlist(list.id)
      onBack()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={list.name} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {/* ---- Decide together --------------------------------------------- */}
        {items.length > 0 &&
          (groupId ? (
            <div className="mb-7">
              <button
                type="button"
                onClick={() => void beginSwipe()}
                disabled={starting}
                className="type-marquee w-full rounded-[2px] bg-velvet-600 py-3.5 text-[14px] text-plate hover:bg-velvet-700 disabled:opacity-60"
              >
                {starting ? t('auth.working') : t('swipe.start')}
              </button>

              <button
                type="button"
                onClick={() => setFilterOpen((o) => !o)}
                aria-expanded={filterOpen}
                className="type-meta mt-2 w-full py-2 text-center text-ink-3 hover:text-ink-2"
              >
                {activeFilterCount > 0
                  ? t('swipe.filtersOn', { count: activeFilterCount })
                  : t('swipe.narrowIt')}
              </button>

              {filterOpen && (
                <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
                  {options.genres.length > 0 && (
                    <>
                      <span className="type-meta mb-2 block text-ink-3">{t('detail.genres')}</span>
                      <ul className="flex flex-wrap gap-2">
                        {options.genres.map((g) => (
                          <li key={g}>
                            <Chip
                              label={g}
                              on={pickedGenres.includes(g)}
                              onClick={() => setPickedGenres((p) => toggle(p, g))}
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {options.services.length > 0 && (
                    <>
                      <span className="type-meta mt-4 mb-2 block text-ink-3">
                        {t('detail.streaming')}
                      </span>
                      <ul className="flex flex-wrap gap-2">
                        {options.services.map((s) => (
                          <li key={s}>
                            <Chip
                              label={s}
                              on={pickedServices.includes(s)}
                              onClick={() => setPickedServices((p) => toggle(p, s))}
                            />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <label className="mt-4 block">
                    <span className="type-meta mb-2 block text-ink-3">{t('swipe.maxLength')}</span>
                    <input
                      type="number"
                      min={30}
                      step={15}
                      value={maxMinutes}
                      onChange={(e) => setMaxMinutes(e.target.value)}
                      placeholder="120"
                      className="w-28 rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
                    />
                    <span className="mt-1.5 block text-[0.7rem] text-ink-3">
                      {t('swipe.seriesKept')}
                    </span>
                  </label>

                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickedGenres([])
                        setPickedServices([])
                        setMaxMinutes('')
                      }}
                      className="type-meta mt-4 text-ink-3 underline underline-offset-4 hover:text-velvet-500"
                    >
                      {t('swipe.clearFilters')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Deciding needs a group: that is where the others find the session
            // to join. Offering the button on a private list would open a room
            // nobody else can reach, which is exactly the dead end it replaces.
            <p className="mb-7 rounded-[2px] border border-dashed border-rule-strong px-4 py-3.5 text-center text-[0.8125rem] leading-relaxed text-ink-3">
              {t('swipe.needsGroup')}
            </p>
          ))}

        {loading ? (
          <p className="type-meta text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : items.length === 0 ? (
          <p className="mt-8 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('lists.emptyList')}
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {items.map((item) => (
              <li key={item.titleId} className="group">
                <button
                  type="button"
                  onClick={() => onOpenTitle({ tmdbId: item.tmdbId, mediaType: item.mediaType })}
                  className="block w-full overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift"
                >
                  <div className="aspect-2/3 overflow-hidden bg-pitch">
                    {item.posterUrl && (
                      <img
                        src={item.posterUrl}
                        alt={item.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                </button>
                <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-tight text-ink">
                  {item.name}
                </p>
                <button
                  type="button"
                  onClick={() => void remove(item.titleId)}
                  className="mt-1 text-[0.7rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
                >
                  {t('lists.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* ---- Who can see this list ---------------------------------------
            Below the titles and folded away: changing a list's audience is a
            once-in-a-while act, and it was crowding out the thing people
            actually came for. The summary line still says who can see it, so
            it does not have to be opened to be answered. */}
        {isOwner && (
          <section className="mt-12 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => setShareOpen((o) => !o)}
              aria-expanded={shareOpen}
              className="flex w-full items-center justify-between py-2 text-left"
            >
              <span className="type-meta text-ink-3">
                {t('lists.sharedWith')}
                <span className="ml-2 text-ink-2">{sharingSummary}</span>
              </span>
              <span aria-hidden className="text-ink-3 transition-transform">
                {shareOpen ? '−' : '+'}
              </span>
            </button>

            {shareOpen && (
              <div className="mt-3 rounded-[2px] border border-rule bg-ground-2 p-4">
                <span className="type-meta mb-2 block text-ink-3">{t('lists.shareWith')}</span>
                <select
                  value={groupId}
                  onChange={(e) => void changeGroup(e.target.value)}
                  className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
                >
                  <option value="">{t('lists.justMe')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>

                <span className="type-meta mt-4 mb-2 block text-ink-3">
                  {t('lists.alsoPeople')}
                </span>
                <div className="flex gap-2">
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('groups.usernamePlaceholder')}
                    className="min-w-0 flex-1 rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
                  />
                  <button
                    type="button"
                    onClick={() => void invite()}
                    disabled={sharing || !username.trim()}
                    className="type-marquee rounded-[2px] bg-velvet-600 px-5 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
                  >
                    {t('groups.add')}
                  </button>
                </div>

                {members.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {members.map((m) => (
                      <li
                        key={m.userId}
                        className="flex items-center gap-2 rounded-full border border-rule px-3 py-1.5"
                      >
                        <span className="text-[0.8125rem] text-ink">{m.username}</span>
                        <button
                          type="button"
                          onClick={() => void uninvite(m.userId)}
                          aria-label={`${t('lists.remove')} ${m.username}`}
                          className="text-[0.8125rem] text-ink-3 hover:text-velvet-500"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <button
          type="button"
          onClick={() => void destroy()}
          className="type-meta mt-8 w-full text-center text-ink-3 underline underline-offset-4 hover:text-velvet-500"
        >
          {t('lists.delete')}
        </button>
      </main>
    </div>
  )
}
