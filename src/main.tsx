import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { setTheme } from './ui/theme'
import './ui/theme.css'
import App from './App.tsx'

// Apply the persisted theme before first paint (FR-36): light default,
// class-driven dark, never follows prefers-color-scheme.
setTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
