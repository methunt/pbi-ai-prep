import { toggleTheme } from './ui/theme'

// Token-smoke page: exercises every theme token family until the real
// UI (AppShell + ThemeToggle) lands in later tasks.
const accents = [
  ['bg-sky', 'sky'],
  ['bg-cyan', 'cyan'],
  ['bg-emerald', 'emerald'],
  ['bg-amber', 'amber'],
] as const

function App() {
  return (
    <div className="min-h-screen bg-bg text-foreground">
      <main className="mx-auto max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-semibold">Theme tokens</h1>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-foreground">card surface on bg</p>
          <p className="text-muted dark:text-sky">muted text, sky in dark</p>
          <p className="text-secondary">secondary surface swatch</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-secondary px-2 py-1">secondary</span>
          {accents.map(([cls, name]) => (
            <span key={name} className={`rounded-md px-2 py-1 text-primary-foreground ${cls}`}>
              {name}
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
          >
            primary
          </button>
          <button
            type="button"
            onClick={() => toggleTheme()}
            className="rounded-md border border-border px-3 py-1.5"
          >
            Toggle theme
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
