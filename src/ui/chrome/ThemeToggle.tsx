import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { THEME_EVENT, readTheme, setTheme } from '../theme'

/** Subscribe to theme writes so the toggle icon stays in sync with the DOM. */
function subscribeTheme(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb)
  return () => window.removeEventListener(THEME_EVENT, cb)
}

/**
 * FR-36 theme toggle: class-driven light/dark, pinned in localStorage 'theme',
 * never reads prefers-color-scheme. Light is the default.
 */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme)
  const next = theme === 'dark' ? 'light' : 'dark'
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      aria-label={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
