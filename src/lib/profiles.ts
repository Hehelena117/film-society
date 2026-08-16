import { supabase } from '@/lib/supabase'

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
 * A profile as anyone may see it.
 *
 * The counts come from public_watch_counts rather than log_entries, which is
 * owner-only — that view exists precisely so a profile can show how much
 * someone has watched without exposing when they watched it.
 */
export async function getProfile(userId: string): Promise<PublicProfile | null> {
  const [profileRes, watchRes, followersRes, followingRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, username, avatar_url, bio, country')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('public_watch_counts').select('titles_watched').eq('user_id', userId).maybeSingle(),
    supabase
      .from('follows')
      .select('follower_id', { count: 'exact', head: true })
      .eq('followee_id', userId),
    supabase
      .from('follows')
      .select('followee_id', { count: 'exact', head: true })
      .eq('follower_id', userId),
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
): Promise<PublicProfile[]> {
  const [selectCol, matchCol] =
    direction === 'followers' ? ['follower_id', 'followee_id'] : ['followee_id', 'follower_id']

  const { data: edges, error } = await supabase
    .from('follows')
    .select(selectCol)
    .eq(matchCol, userId)
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

export async function isFollowing(userId: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return false

  const { data, error } = await supabase
    .from('follows')
    .select('followee_id')
    .eq('follower_id', auth.user.id)
    .eq('followee_id', userId)
    .maybeSingle()

  if (error) throw error
  return !!data
}

export async function follow(userId: string): Promise<void> {
  // follower_id defaults to auth.uid(); already following is not an error.
  const { error } = await supabase.from('follows').insert({ followee_id: userId })
  if (error && error.code !== '23505') throw error
}

export async function unfollow(userId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return

  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', auth.user.id)
    .eq('followee_id', userId)

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
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) throw new Error('Not signed in')

  const { error } = await supabase.from('profiles').update(patch).eq('id', auth.user.id)
  if (error) throw error
}
