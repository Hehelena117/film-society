import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { applyStoredTheme } from './lib/theme'
import './lib/i18n'
import './index.css'
import './themes.css'

// Set the theme before first paint so the page never flashes the default.
applyStoredTheme()

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
