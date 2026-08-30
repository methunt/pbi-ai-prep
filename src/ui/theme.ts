// Theme mechanism hook (FR-36): class-driven dark mode persisted in
// localStorage 'theme'. Light is the default; never follows
// prefers-color-scheme. A full ThemeToggle component lives in Task 7.1.

export type Theme = 'light' | 'dark'

/** Custom event dispatched after every theme write so React can react. */
export const THEME_EVENT = 'pbi-theme-change'

/** Read the current theme from the DOM (the single source of truth). */
export function readTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** Read the persisted theme; hardened against privacy modes that block storage. */
function readStoredTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    // Privacy-hardened browser blocked storage; the class toggle still applies
    // for this session (FR-36 persists only where storage is available).
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT))
}

export function toggleTheme(): Theme {
  const next: Theme = readTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export { readStoredTheme }
