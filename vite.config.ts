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
  server: {
    host: true, // lets you open the dev server on your phone over the LAN
    port: 5173,
  },
})
