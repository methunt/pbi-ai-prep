// Theme mechanism hook (FR-36): class-driven dark mode persisted in
// localStorage 'theme'. Light is the default; never follows
// prefers-color-scheme. A full ThemeToggle component lands in a later task.

export type Theme = 'light' | 'dark'

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem('theme', theme)
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.classList.contains('dark')
    ? 'light'
    : 'dark'
  setTheme(next)
  return next
}
