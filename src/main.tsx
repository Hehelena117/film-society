import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { rememberedSide } from './lib/side'
import { applyTheme } from './lib/theme'
import './lib/i18n'
import './index.css'
import './themes.css'

// Set the theme before first paint so the page never flashes the default.
// Before first paint, using the side remembered locally — the profile has
// not loaded yet, and a flash of the wrong room is worse than a guess that is
// almost always right.
applyTheme(rememberedSide() ?? 'film')

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
