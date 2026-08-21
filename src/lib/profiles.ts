import { supabase } from '@/lib/supabase'
import type { Side } from '@/lib/side'

export interface PublicProfile {
  id: string
  username: string
  avatarUrl: string | null
  bio: string | null
  country: string
  titlesWatched: number
  followers: number
  following: number
}

export interface RatedTitle {
  titleId: number
  tmdbId: number
  mediaType: 'movie' | 'tv'
  name: string
  year: number | null
  posterUrl: string | null
  rating: number
}

const POSTER = 'https://image.tmdb.org/t/p/w342'

export async function findProfiles(query: string, limit = 20): Promise<PublicProfile[]> {
  if (!query.trim()) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, country')
    .ilike('username', `%${query.trim()}%`)
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    country: row.country,
    titlesWatched: 0,
    followers: 0,
    following: 0,
  }))
}

/**
 * Who to offer before anything has been typed.
 *
 * People in your groups come first, because they are the ones you already
 * watch things with and the ones whose ratings you will actually see on a
 * title page — following them is the obvious next move and there is no reason
 * to make anyone type a username they already share a group with.
 *
 * Anyone you already follow is left out, as is you. Profiles are public, so
 * none of this needs privilege — it is a shortcut, not a disclosure.
 */
export async function getSuggestedPeople(
  side: Side = 'film',
  limit = 12,
): Promise<PublicProfile[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return []

  const [{ data: myGroups }, { data: following }] = await Promise.all([
    supabase
      .from('group_members')
      .select('group_id, group:groups!inner(side)')
      .eq('user_id', me)
      .eq('group.side', side),
    supabase.from('follows').select('followee_id').eq('follower_id', me).eq('side', side),
  ])

  const skip = new Set<string>([me, ...(following ?? []).map((f: Record<string, any>) => f.followee_id)])

  const groupIds = (myGroups ?? []).map((g: Record<string, any>) => g.group_id)
  let candidates: string[] = []
  if (groupIds.length) {
    const { data: peers } = await supabase
      .from('group_members')
      .select('user_id')
      .in('group_id', groupIds)
    candidates = (peers ?? []).map((p: Record<string, any>) => p.user_id).filter((id) => !skip.has(id))
  }

  if (!candidates.length) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, country')
    .in('id', [...new Set(candidates)])
    .limit(limit)

  if (error) {
    console.error('Could not read suggested people', error)
    return []
  }

  return ((data ?? []) as Array<Record<string, any>>).map((row) => ({
    id: row.id,
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    country: row.country,
    titlesWatched: 0,
    followers: 0,
    following: 0,
  }))
}

/**
 * The newest members, for someone who is not in a group yet.
 *
 * A brand-new account has no groups, so the row above is empty for exactly
 * the person who most needs somewhere to start. This exposes nothing that was
 * not already reachable — findProfiles matches on a substring, so typing one
 * letter lists half the membership anyway — it just does not require guessing
 * a username you have never heard.
 */
export async function getNewMembers(
  side: Side = 'film',
  exclude: string[] = [],
  limit = 12,
): Promise<PublicProfile[]> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) return []

  const { data: following } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', me)
    .eq('side', side)

  const skip = new Set<string>([
    me,
    ...exclude,
    ...(following ?? []).map((f: Record<string, any>) => f.followee_id),
  ])

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, country, created_at')
    .order('created_at', { ascending: false })
    .limit(limit + skip.size)

  if (error) {
    console.error('Could not read new members', error)
    return []
  }

  return ((data ?? []) as Array<Record<string, any>>)
    .filter((row) => !skip.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      username: row.username,
      avatarUrl: row.avatar_url,
      bio: row.bio,
      country: row.country,
      titlesWatched: 0,
      followers: 0,
      following: 0,
    }))
}

/**
 * A profile as anyone may see it.
 *
 * The counts come from public_watch_counts rather than log_entries, which is
 * owner-only — that view exists precisely so a profile can show how much
 * someone has watched without exposing when they watched it.
 */
export async function getProfile(
  userId: string,
  side: Side = 'film',
): Promise<PublicProfile | null> {
  const [profileRes, watchRes, followersRes, followingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, avatar_url, bio, country')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('public_watch_counts').select('titles_watched').eq('user_id', userId).maybeSingle(),
    // Counted per side. Following someone for books is a separate act from
    // following them for films, so a film profile counting both would report a
    // number that means nothing on either.
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('followee_id', userId)
      .eq('side', side),
    supabase
      .from('follows')
      .select('followee_id', { count: 'exact', head: true })
      .eq('follower_id', userId)
      .eq('side', side),
  ])

  if (profileRes.error) throw profileRes.error
  if (!profileRes.data) return null

  const p = profileRes.data as Record<string, any>
  return {
    id: p.id,
    username: p.username,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    country: p.country,
    titlesWatched: (watchRes.data as Record<string, any> | null)?.titles_watched ?? 0,
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
  }
}

/**
 * Someone's ratings, highest first. Read through the public view.
 *
 * The whole set rather than a page of it: the profile sorts these into a shelf
 * per score and prints a count on each, and a count taken from a truncated list
 * is a wrong count. 400 is a generous ceiling for a personal film log — past
 * that the shelves stay honest about what they hold, they just stop growing.
 */
export async function getProfileRatings(
  userId: string,
  language: string,
  limit = 400,
): Promise<RatedTitle[]> {
  const { data, error } = await supabase
    .from('public_ratings')
    .select(
      'rating, title:titles!inner(id, tmdb_id, media_type, year, poster_path, ' +
        'translations:title_translations(name, language))',
    )
    .eq('user_id', userId)
    .order('rating', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as Array<Record<string, any>>).map((row) => {
    const translations = row.title?.translations ?? []
    const name =
      translations.find((t: Record<string, unknown>) => t.language === language)?.name ??
      translations[0]?.name ??
      '—'

    return {
      titleId: row.title.id,
      tmdbId: row.title.tmdb_id,
      mediaType: row.title.media_type,
      name,
      year: row.title.year,
      posterUrl: row.title.poster_path ? `${POSTER}${row.title.poster_path}` : null,
      rating: row.rating,
    }
  })
}

/**
 * Who follows this person, or who they follow.
 *
 * Two queries rather than an embed: follows has two foreign keys into profiles,
 * so PostgREST cannot tell which one to join through without disambiguation
 * that breaks the moment a constraint gets renamed.
 */
export async function getFollowList(
  userId: string,
  direction: 'followers' | 'following',
  side: Side = 'film',
): Promise<PublicProfile[]> {
  const [selectCol, matchCol] =
    direction === 'followers' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id']

  const { data: edges, error } = await supabase
    .from('follows')
    .select(selectCol)
    .eq(matchCol, userId)
    .eq('side', side)
    .order('created_at', { ascending: false })

  if (error) throw error

  const ids = (edges ?? []).map((e: Record<string, any>) => e[selectCol])
  if (!ids.length) return []

  const { data: people, error: peopleErr } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, country')
    .in('id', ids)

  if (peopleErr) throw peopleErr

  // Preserve the follow order rather than whatever order the id lookup returns.
  const byId = new Map((people ?? []).map((p: Record<string, any>) => [p.id, p]))

  return ids
    .map((id) => byId.get(id))
    .filter((p): p is Record<string, any> => p !== undefined)
    .map((p) => ({
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      bio: p.bio,
      country: p.country,
      titlesWatched: 0,
      followers: 0,
      following: 0,
    }))
}

export async function isFollowing(userId: string, side: Side = 'film'): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return false

  const { data, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', auth.user.id)
    .eq('followee_id', userId)
    .eq('side', side)
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function follow(userId: string, side: Side = 'film'): Promise<void> {
  // follower_id defaults to auth.uid(); already following is not an error.
  const { error } = await supabase.from('follows').insert({ followee_id: userId, side })
  if (error && error.code !== '23505') throw error
}

export async function unfollow(userId: string, side: Side = 'film'): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', auth.user.id)
    .eq('followee_id', userId)
    .eq('side', side)

  if (error) throw error
}

/**
 * Uploads an avatar and returns its public URL.
 *
 * The path is `<user id>/avatar.<ext>` because storage policy pins the first
 * folder to the uploader's id — that is what stops one person overwriting
 * another's. Upsert on a fixed name so replacing an avatar does not leave the
 * old file behind forever.
 */
export async function uploadAvatar(file: File): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.id}/avatar.${ext}`

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)

  // Cache-bust: the path is stable, so browsers would keep showing the old one.
  const url = `${data.publicUrl}?v=${Date.now()}`
  await updateMyProfile({ avatar_url: url })
  return url
}

export async function updateMyProfile(patch: {
  avatar_url?: string | null
  bio?: string | null
  country?: string
  language?: string
  use_notes_for_recommendations?: boolean
  log_grouping?: string
  last_side?: string
  use_book_notes_for_recommendations?: boolean
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id)
  if (error) throw error
}
