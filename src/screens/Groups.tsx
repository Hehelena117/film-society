import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/lib/auth'
import {
  addMemberByUsername,
  createGroup,
  getGroupMembers,
  getMyGroups,
  removeMember,
  type Group,
  type GroupMember,
} from '@/lib/groups'

export function Groups() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [open, setOpen] = useState<Group | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setGroups(await getMyGroups())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function create() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await createGroup(name.trim())
      setName('')
      setCreating(false)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (open) {
    return (
      <GroupDetail
        group={open}
        onBack={() => {
          setOpen(null)
          void refresh()
        }}
      />
    )
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={t('groups.title')} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {creating ? (
          <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('groups.name')}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full rounded-[2px] border border-rule bg-ground px-3 py-2.5 text-[0.9375rem] text-ink outline-none focus:border-brass-600"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => void create()}
                disabled={busy || !name.trim()}
                className="type-marquee flex-1 rounded-[2px] bg-velvet-600 py-3 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
              >
                {t('groups.create')}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="type-marquee rounded-[2px] border border-rule px-5 py-3 text-[13px] text-ink-3"
              >
                {t('log.close')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="type-marquee w-full rounded-[2px] border border-dashed border-rule-strong py-3.5 text-[13px] text-ink-3 transition-colors hover:border-brass-600 hover:text-ink-2"
          >
            + {t('groups.new')}
          </button>
        )}

        {loading ? (
          <p className="type-meta mt-8 text-center text-ink-3/70">{t('lists.loading')}</p>
        ) : groups.length === 0 && !creating ? (
          <p className="mt-10 text-center text-[0.875rem] leading-relaxed text-ink-3">
            {t('groups.empty')}
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-2.5">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setOpen(g)}
                  className="w-full rounded-[2px] border border-rule bg-ground-2 px-4 py-3.5 text-left transition-colors hover:border-brass-600"
                >
                  <span className="type-title block text-[1.125rem] text-ink">{g.name}</span>
                  <span className="type-meta mt-1.5 block text-ink-3">
                    {t('groups.members', { count: g.memberCount })}
                    {g.role === 'admin' && <> · {t('groups.admin')}</>}
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

function GroupDetail({ group, onBack }: { group: Group; onBack: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setMembers(await getGroupMembers(group.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [group.id])

  useEffect(() => {
    void load()
  }, [load])

  async function invite() {
    if (!username.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addMemberByUsername(group.id, username)
      setUsername('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function kick(userId: string) {
    try {
      await removeMember(group.id, userId)
      if (userId === user?.id) {
        onBack()
        return
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="min-h-dvh wall-ground texture-wall pb-28">
      <ScreenHeader title={group.name} onBack={onBack} />

      <main className="relative z-10 mx-auto max-w-lg px-6 py-8">
        {error && <p className="mb-5 text-[0.875rem] text-velvet-500">{error}</p>}

        {group.role === 'admin' && (
          <div className="rounded-[2px] border border-rule bg-ground-2 p-4">
            <label className="block">
              <span className="type-meta mb-2 block text-ink-3">{t('groups.addByUsername')}</span>
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
                  disabled={busy || !username.trim()}
                  className="type-marquee rounded-[2px] bg-velvet-600 px-5 text-[13px] text-plate hover:bg-velvet-700 disabled:opacity-60"
                >
                  {t('groups.add')}
                </button>
              </div>
            </label>
          </div>
        )}

        <ul className="mt-6 flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-[2px] border border-rule bg-ground-2 px-4 py-3"
            >
              <span>
                <span className="type-title block text-[1rem] text-ink">{m.username}</span>
                {m.role === 'admin' && (
                  <span className="type-meta mt-1 block text-ink-3">{t('groups.admin')}</span>
                )}
              </span>

              {(group.role === 'admin' || m.userId === user?.id) && (
                <button
                  type="button"
                  onClick={() => void kick(m.userId)}
                  className="text-[0.75rem] text-ink-3 underline underline-offset-2 hover:text-velvet-500"
                >
                  {m.userId === user?.id ? t('groups.leave') : t('groups.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
