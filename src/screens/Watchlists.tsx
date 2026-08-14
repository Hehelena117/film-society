import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { getMyGroups, type Group } from '@/lib/groups'
import {
  createWatchlist,
  deleteWatchlist,
  getMyWatchlists,
  getWatchlistItems,
  removeFromWatchlist,
  type Watchlist,
  type WatchlistItem,
} from '@/lib/watchlists'

export function Watchlists() {
  const { t, i18n } = useTranslation()
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
      setError(err instanceof Error ? err.message : String(err))
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
        language={i18n.resolvedLanguage ?? 'en'}
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
      onError(err instanceof Error ? err.message : String(err))
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
  language,
  onBack,
}: {
  list: Watchlist
  language: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await getWatchlistItems(list.id, language))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [list.id, language])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(titleId: number) {
    try {
      await removeFromWatchlist(list.id, titleId)
      setItems((current) => current.filter((i) => i.titleId !== titleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function destroy() {
    try {
      await deleteWatchlist(list.id)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={list.name} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

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
                <div className="overflow-hidden rounded-[2px] bg-frame p-1 shadow-lift">
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
                </div>
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

        <button
          type="button"
          onClick={() => void destroy()}
          className="type-meta mt-12 w-full text-center text-ink-3 underline underline-offset-4 hover:text-velvet-500"
        >
          {t('lists.delete')}
        </button>
      </main>
    </div>
  )
}
