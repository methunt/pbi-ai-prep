# Task 0.2 Report: Tailwind 4 Theme Tokens

**Status:** COMPLETE
**Commit:** `dc38257` `feat: step 03b2` (branch `feat/pbi-ai-prep`, 11 files changed, +113/−437)
**Verified:** `npm run build` clean (tsc -b + vite, zero warnings) + live dev-preview browser verification.

## Created: `src/ui/theme.css` (single source of design tokens)

- `@import "tailwindcss";` — Tailwind 4 CSS-first entry (no `tailwind.config.js`).
- `@custom-variant dark (&:where(.dark, .dark *));` — `.dark` class on `<html>` drives `dark:` utilities.
- `@theme { ... }` light (default) tokens; `.dark { ... }` override block so the SAME utility names resolve differently in dark. The `.dark` block is unlayered, so it beats the `@layer(theme)` `:root` emission by cascade layers.

Token names (all generate `bg-*`/`text-*`/`border-*` utilities):

| Token | Light | Dark |
|---|---|---|
| `--color-primary` | hsl(221 83% 53%) | hsl(217 91% 60%) |
| `--color-primary-foreground` | hsl(210 40% 98%) | hsl(0 0% 100%) |
| `--color-bg` | hsl(210 40% 98%) | hsl(222 47% 6%) |
| `--color-card` | hsl(0 0% 100%) | hsl(222 40% 10%) |
| `--color-foreground` | hsl(222 47% 11%) | hsl(210 40% 98%) |
| `--color-secondary` | hsl(220 14% 96%) | hsl(217 33% 15%) |
| `--color-muted` | hsl(220 14% 96%) | hsl(217 33% 15%) |
| `--color-border` | hsl(220 13% 91%) | hsl(217 33% 18%) *(derived — see Notes)* |
| `--color-sky` | hsl(199 89% 48%) | (mode-invariant, inherited) |
| `--color-cyan` | hsl(188 94% 43%) | (mode-invariant, inherited) |
| `--color-emerald` | hsl(160 84% 39%) | (mode-invariant, inherited) |
| `--color-amber` | hsl(38 92% 50%) | (mode-invariant, inherited) |

Plus `:root { color-scheme: light }` / `.dark { color-scheme: dark }` and a `body { background-color: var(--color-bg); color: var(--color-foreground) }` base so dark mode never flashes white.

## Created: `src/ui/theme.ts` (mechanism hook, no component)

- `type Theme = 'light' | 'dark'`
- `setTheme(theme)` — toggles `dark` class on `document.documentElement` + writes `localStorage 'theme'`.
- `toggleTheme()` — flips and persists, returns the new theme.
- A full ThemeToggle component lands in a later UI task; this is the mechanism it will call.

## `src/main.tsx` wiring

- Replaced `import './index.css'` with `import './ui/theme.css'`.
- Pre-paint bootstrap before `createRoot`: `setTheme(localStorage.getItem('theme') === 'dark' ? 'dark' : 'light')` — the `.dark` class is on `<html>` before React renders; light default; anything not `'dark'` falls back to light; never reads `prefers-color-scheme`.
- Divergence from brief Step 2: brief showed `data-theme` attribute; implemented as the `dark` **class** instead, because `@custom-variant dark` and later UI tasks key off the class (`data-theme` alone would not activate `dark:` utilities). Binding task description specifies add/remove `dark` class.

## Demo cleanup (palette made authoritative)

- Deleted `src/index.css` (create-vite demo: violet `--accent: #aa3bff`, `prefers-color-scheme` media query) and `src/App.css` (demo rules referencing those vars).
- Replaced demo `App.tsx` markup with a token-smoke page (its demo markup would be unstyled garbage once its CSS died): card/border/muted/secondary/foreground surfaces, primary button, sky/cyan/emerald/amber swatches, and a working Toggle theme button calling `toggleTheme()`.
- Deleted now-unreferenced demo assets: `src/assets/{hero.png,react.svg,vite.svg}`, `public/icons.svg`.
- Replaced `public/favicon.svg` — the Vite-logo favicon was violet `#863bff`, violating "zero violet anywhere"; new mark uses primary `#2563eb` (= hsl(221 83% 53%)).

## Verification evidence

1. **`npm run build`**: passes, zero warnings; compiled `dist` CSS contains `--color-primary:` and (after adding a `dark:` utility to the smoke page) `:where(.dark` — proving `@custom-variant` compiles.
2. **Browser (dev server, headless Chromium)**:
   - First visit: `html.className=""` (no dark class), `localStorage.theme="light"`, body bg `rgb(248,250,252)`=hsl(210 40% 98%), fg `rgb(15,23,41)`, card `rgb(255,255,255)` — LIGHT default confirmed.
   - Click Toggle: `className="dark"`, `localStorage.theme="dark"`, bg `rgb(8,12,22)`=hsl(222 47% 6%), card `rgb(15,21,36)`=hsl(222 40% 10%), primary `rgb(60,131,246)`=hsl(217 91% 60%) — dark palette exact.
   - Reload: dark persists (pre-paint bootstrap re-applies class).
   - `dark:` variant: muted paragraph flips hsl(220 14% 96%) → sky `rgb(13,162,231)`=hsl(199 89% 48%) under `.dark`.
   - Toggle back: `className=""`, `localStorage.theme="light"` — clean cycle. Screenshots captured of both themes.
3. **Audits**: `grep prefers-color-scheme` in `src/` → only comments stating we never follow it (demo asset with its own media query deleted). `grep violet|fuchsia|purple|<purple hexes>` → zero in code/assets.

## Files changed

- Created: `src/ui/theme.css`, `src/ui/theme.ts`
- Modified: `src/main.tsx`, `src/App.tsx`, `public/favicon.svg`
- Deleted: `src/index.css`, `src/App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg`, `public/icons.svg`

## Self-review & concerns

- Rule `ts-no-tiny-functions` fired on an early draft; slimmed `theme.ts` to `setTheme`/`toggleTheme` (stable exported contract consumed by later tasks) and inlined the main.tsx bootstrap.
- No `--color-*-dark` static variants: the `.dark` override is the single source of dark values (avoids two sources of truth drifting). Brief's sample `--color-primary-dark` was superseded by the binding task text ("`--color-*dark` variants OR a `.dark` override").
- **Derived value**: DESIGN.md pins `border` light only; dark border `hsl(217 33% 18%)` derived on the slate hue (near-white light border would glare on dark bg). Flag for design confirmation.
- Accent tokens (sky/cyan/emerald/amber) are mode-invariant by inheritance — intentional per palette (single values given).
- Untracked-by-design: none. Working tree clean after commit.

## Fix round 1: color-scheme source-order bug (Main review)

**Commit:** `16861cf` `fix: step 03b2`

**Finding (valid):** `:root { color-scheme: light }` was declared AFTER the `.dark { ...; color-scheme: dark }` block. Both match `<html class="dark">`, both unlayered author rules, equal specificity (0,1,0) — source order won, so `color-scheme` stayed `light` in dark mode (light scrollbars/widgets/UA canvas on dark surfaces).

**Change (minimal reorder, no restructure):** moved the `:root { color-scheme: light }` block above the `.dark` block in `src/ui/theme.css` (now theme.css:27-29, `.dark` at :31-42), so `.dark` wins by source order. Removed a stray double blank line left by the move. Nothing else touched.

**Verification:**

1. `npm run build` → clean, zero warnings (`tsc -b && vite build`, built in 373ms).
2. Dev server + headless Chromium, `getComputedStyle(document.documentElement).colorScheme`:
   - no class (light): `{ htmlClass: "", colorScheme: "light" }`
   - after toggle: `{ htmlClass: "dark", colorScheme: "dark" }` (was `light` before fix)
   - toggle back: light restored. Dev server stopped after check.
