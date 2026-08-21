import { supabase } from '@/lib/supabase'
import type { Side } from '@/lib/side'

export interface Group {
  id: string
  name: string
  avatarUrl: string | null
  memberCount: number
  role: 'admin' | 'member'
}

export interface GroupMember {
  userId: string
  username: string
  avatarUrl: string | null
  role: 'admin' | 'member'
}

/**
 * Groups are named collections of people, in the WhatsApp sense. "Family" is
 * not a special concept — it is a group somebody called Family.
 *
 * RLS restricts this to groups the caller belongs to, and  restricts
 * it to the half being looked at. Without that filter a book group would turn
 * up on the film side and vice versa — the tables are shared deliberately, so
 * the separation has to be asked for at every read.
 */
export async function getMyGroups(side: Side = 'film'): Promise<Group[]> {
  const { data: auth } = await supabase.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []

  const { data, error } = await supabase
    .from('group_members')
    .select('role, group:groups!inner(id, name, avatar_url, side, members:group_members(count))')
    .eq('group.side', side)
    // Without this the query returns one row per MEMBER, not per group: RLS
    // lets you read every membership row of a group you belong to, so a group
    // of three appeared in the list three times.
    .eq('user_id', uid)
    .order('joined_at', { ascending: false })

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.group.id,
    name: row.group.name,
    avatarUrl: row.group.avatar_url,
    memberCount: row.group.members?.[0]?.count ?? 0,
    role: row.role,
  }))
}

/**
 * Goes through an RPC rather than a plain insert.
 *
 * A direct `insert(...).select()` cannot work here: RETURNING is evaluated
 * before the AFTER-insert trigger seats the creator as a member, so the
 * groups SELECT policy filters the row out and PostgREST reports it as a
 * WITH CHECK violation. See migration 20260814000006.
 */
export async function createGroup(name: string, side: Side = 'film'): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    group_name: name,
    group_side: side,
  })
  if (error) throw error
  return data as string
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, role, profile:profiles!inner(username, avatar_url)')
    .eq('group_id', groupId)
    .order('joined_at')

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    userId: row.user_id,
    username: row.profile.username,
    avatarUrl: row.profile.avatar_url,
    role: row.role,
  }))
}

/**
 * Adds someone by username. Profiles are world-readable, so the lookup needs
 * no privilege; the insert is what RLS gates, and only an admin may do it.
 */
export async function addMemberByUsername(groupId: string, username: string): Promise<void> {
  const { data: profile, error: lookupErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username.trim())
    .maybeSingle()

  if (lookupErr) throw lookupErr
  if (!profile) throw new Error(`No member called "${username.trim()}"`)

  const { error } = await supabase
    .from('group_members')
    .upsert(
      { group_id: groupId, user_id: profile.id, role: 'member' },
      { onConflict: 'group_id,user_id' },
    )

  if (error) throw error
}

/** Anyone may remove themselves; only admins may remove others. */
export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) throw error
}
