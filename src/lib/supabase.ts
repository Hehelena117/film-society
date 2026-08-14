import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill them in — see docs/SETUP.md.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // We use email + password rather than magic links for now, so there is no
    // token to pick out of the URL on load.
    detectSessionInUrl: false,
  },
})

/** Calls one of our Edge Functions with the caller's session attached. */
export async function callFunction<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) throw error
  if (data === null) throw new Error(`${name} returned no data`)
  return data
}
