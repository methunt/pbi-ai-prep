### Task 0.2: Tailwind 4 theme tokens (binding palette)

**Files:**
- Create: `src/ui/theme.css`, wire it in `src/main.tsx`

**Interfaces:**
- Produces: CSS variable tokens + classes the whole UI consumes. Palette (LOCKED, from DESIGN.md): primary `hsl(221 83% 53%)` light / `hsl(217 91% 60%)` dark; background `hsl(210 40% 98%)` light / `hsl(222 47% 6%)` dark; card `hsl(0 0% 100%)` light / `hsl(222 40% 10%)` dark; secondary sky `hsl(199 89% 48%)`; tertiary cyan `hsl(188 94% 43%)`; success emerald `hsl(160 84% 39%)`; attention amber `hsl(38 92% 50%)`; neutrals slate scale. Zero violet/fuchsia/purple anywhere.

- [ ] **Step 1: Write `theme.css`**

```css
@import "tailwindcss";
@theme {
  --color-primary: hsl(221 83% 53%);
  --color-primary-dark: hsl(217 91% 60%);
  --color-sky: hsl(199 89% 48%);
  --color-cyan: hsl(188 94% 43%);
  --color-emerald: hsl(160 84% 39%);
  --color-amber: hsl(38 92% 50%);
  --color-bg: hsl(210 40% 98%);
  --color-card: hsl(0 0% 100%);
}
```
Add `.dark` overrides and a `localStorage 'theme'` toggle hook (FR-36): light default, never `prefers-color-scheme`.

- [ ] **Step 2: Wire theme**

In `src/main.tsx` import `./ui/theme.css` and set the root `data-theme` from `localStorage` before first paint:

```ts
const t = localStorage.getItem('theme') ?? 'light'
document.documentElement.dataset.theme = t
```

- [ ] **Step 3: Verify** — light is default; toggling dark persists across reload; no `prefers-color-scheme` in code.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 03b2"`

