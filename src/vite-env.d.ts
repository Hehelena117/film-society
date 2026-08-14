/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Public — it appears in every request the browser makes. */
  readonly VITE_SUPABASE_URL: string
  /**
   * Supabase anon key. Public by design: it ships inside the JS bundle and is
   * meant to. Row-level security is what protects the data, not this key.
   * Anything that must stay secret belongs in a Supabase Edge Function.
   */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
