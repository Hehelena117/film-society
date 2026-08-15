import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native shell config.
 *
 * webDir points at the same `dist` the web build produces — but it must be
 * built with CAPACITOR=1 so assets resolve from the filesystem root rather
 * than the /film-society/ prefix GitHub Pages needs. `npm run build:native`
 * does that; a plain `npm run build` will produce a white screen on device.
 */
const config: CapacitorConfig = {
  appId: 'com.amokproducts.filmsociety',
  appName: 'Film Society',
  webDir: 'dist',

  backgroundColor: '#0e0b0c',

  ios: {
    // Keeps the cinema-dark background behind the notch rather than white.
    contentInset: 'always',
  },

  android: {
    // Supabase and TMDB are all https; no cleartext needed.
    allowMixedContent: false,
  },
}

export default config
