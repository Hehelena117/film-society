import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

export interface Profile {
  id: string
  username: string
  avatar_url: string | null
  bio: string | null
  country: string
  language: string
  theme: string
  /** Opt-in, default false. Governs whether note text may reach the recommender. */
  use_notes_for_recommendations: boolean
}

interface AuthValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until we know whether there is a stored session — avoids a sign-in flash. */
  loading: boolean
  signUp: (email: string, password: string, username: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user.id ?? null

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return
    }

    let active = true
    void loadProfile(userId).then((p) => {
      if (active) setProfile(p)
    })

    return () => {
      active = false
    }
  }, [userId])

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,

      async signUp(email, password, username) {
        // The username rides along in user metadata; the handle_new_user
        // trigger reads it when it creates the profile row.
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username } },
        })
        if (error) throw error
      },

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },

      async signOut() {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },

      async refreshProfile() {
        if (!userId) return
        setProfile(await loadProfile(userId))
      },
    }),
    [session, profile, loading, userId],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

async function loadProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, username, avatar_url, bio, country, language, theme, use_notes_for_recommendations',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Could not load profile', error)
    return null
  }
  return data as Profile | null
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
