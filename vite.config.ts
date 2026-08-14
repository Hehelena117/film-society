import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// On GitHub Pages the app is served from https://<user>.github.io/film-society/,
// so assets need that prefix. Locally it is served from the root.
const base = process.env.GITHUB_ACTIONS ? '/film-society/' : '/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separate the dependencies that never change from app code that
        // changes constantly, so a deploy does not evict React and Supabase
        // from everyone's cache along with it.
        manualChunks: {
          // react-dom/client and react/jsx-runtime are separate specifiers:
          // listing only 'react-dom' leaves the bulk of it in the app chunk.
          react: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          supabase: ['@supabase/supabase-js'],
          i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
        },
      },
    },
  },
  server: {
    host: true, // lets you open the dev server on your phone over the LAN
    port: 5173,
  },
})
