# Task 7.1 — Application chrome (landing, parse stepper, theme toggle, KPI cards)

Branch `feat/pbi-ai-prep` · commit `009e5e5` (`feat: step 7a14`)
Build: **clean** (`tsc -b && vite build`, 1831 modules) · Lint: **clean** (`eslint .`)
Render smoke: Chromium (headless) driven via the harness browser tool — see §5.

---

## 1. What was built

The demo `src/App.tsx` was **deleted** (it was the token-smoke page that preceded the real
shell; it previously referenced absolute `/icons.svg` refs in an even-earlier revision, which are
gone with it). The real chrome now lives under `src/ui/`:

- **`src/ui/App.tsx`** — root shell + tab chrome + app-phase routing.
- **`src/ui/chrome.css`** — shared chrome primitives, token-bound (shapes match `mockup/index.html`).
- **`src/ui/chrome/Landing.tsx`** — FR-34 landing.
- **`src/ui/chrome/ParseStepper.tsx`** — FR-35 parse stepper.
- **`src/ui/chrome/ThemeToggle.tsx`** — FR-36 theme toggle.
- **`src/ui/chrome/KpiCard.tsx`** — FR-37 reusable KPI card.
- **`src/ui/theme.ts`** — hardened (storage-safe) + emits a theme-change event so the toggle stays in sync.
- **`src/main.tsx`** — now imports `./ui/App.tsx` and uses the hardened theme read.

### App-shell state routing
An app has three phases, all read from the store where possible:

```
hasProject (project.name !== '')          →  app chrome (header + tab bar + KPI/panels)
else (phase==='parse' || layersActive)    →  ParseStepper
else                                       →  Landing
```

`hasProject` and `layersActive` are derived from the store; the only local state is the `phase`
flag (landing → parse transition) and the active tab id. When a project loads, the app chrome owns
the screen; if it is later cleared, the shell falls back to the landing.

### Chrome primitives (`chrome.css`)
Replicates the mockup's `.card`, `.elev`/`.elev-lg`, `.btn`/`.btn-primary|outline|ghost`, `.chip`,
`.tab`, `.lbl`, `.field`, `.bar`, `.pill`, `.t-*` tone pills, `.mono`, `.tabular`, `.mesh` backdrop,
and the global `:focus-visible` ring — **every value derives from the `theme.css` `--color-*`
tokens** via `var(--color-*)` and `color-mix()`. No hardcoded palette hues (hover shades are
`color-mix(in srgb, <token> 86%, black)` etc.), and zero violet/fuchsia/purple.

---

## 2. FR compliance map

| Requirement | Where | Status |
|---|---|---|
| **FR-34** product statement + pitch | Landing left column: brand, headline with gradient "AI-ready", copy, 3 feature cards, 3 trust badges | ✔ |
| **FR-34** capability badge (supported → engine name; unsupported → names Chrome/Edge/Opera) | `engineName()` UA sniff + `isSupported()`; badge is green (supported) or amber (unsupported) | ✔ (both branches verified in browser) |
| **FR-34** open-folder with write-permission rationale beneath | `Open PBIP folder` → `pickFolder()` (readwrite), `persistHandle`, then `requestPermission(handle)()`; the rationale paragraph sits directly under the button | ✔ |
| **FR-34** recent projects (FR-4) | `listRecent()` on mount + refresh after open; empty state "No recent projects yet." | ✔ |
| **FR-34** declined write → read-only, controls **visible but disabled** + explanation | `permission==='denied'` renders a read-only banner in the app chrome, disables the Save button, shows "Read-only" status; never hidden | ✔ |
| **FR-35** four-stage stepper | Definition tree / Model objects / Lineage graph / Report layer | ✔ |
| **FR-35** live per-stage counts from `layers[<layer>].data` | `countFromData(..)` reads each layer's committed data; solid progress + `role=progressbar` | ✔ |
| **FR-35** progress bar + driven by real `parseState` | Per-stage dot reflects `layers[<layer>].parseState` (idle/parsing/ready/error/stale); `ready/4` → bar width | ✔ |
| **FR-36** light default, `localStorage 'theme'`, no `prefers-color-scheme` | `main.tsx` calls `setTheme(readStoredTheme())` before paint; toggle flips `.dark` + persists; never touches `prefers-color-scheme` | ✔ |
| **FR-37** uppercase label + live figure + one-line plain-English definition | `KpiCard`; Description set wired: Objects/Backlog/Unused/Pending edits/Coverage | ✔ |
| **FR-37** hooks for the other tabs | `KpiCard` is generic (`label/value/definition/tone/icon/progress`); Prep-for-AI + Relationships panels are keyboard-reachable placeholders that land in 7.4/7.5 | ✔ |
| **AD-11** focus-visible ring | global `:where(...):focus-visible` ring in `chrome.css` | ✔ |
| **AD-11** skip link | `<a href="#main" class="sr-only focus:not-sr-only ...">` in the app shell; `#main` is the `<main>` | ✔ |
| **AD-11** ESC closes | not applicable to 7.1 (no dismissible modal in this chrome; the delete/pending/rename modals arrive in later tasks and will wire Escape) | noted |
| **AD-11** keyboard reachable | `role=tab`/`aria-selected`/`aria-controls` + roving tabindex + Arrow/Home/End keys; all interactive elements are real `<button>`/`<a>` | ✔ |

---

## 3. How the stepper and KPI read the store

Both are **purely store-driven** (no local recompute).

**ParseStepper** — `useStore` selectors `layers`, `project.objects.length`:
- Stage 1 "Definition tree" → `layers.lsdl` (`parseState` + `countFromData(layers.lsdl.data)`)
- Stage 2 "Model objects" → primary load: `project.objects.length` (state `ready` once > 0)
- Stage 3 "Lineage graph" → `layers.lineage`
- Stage 4 "Report layer" → `layers.report`
- `countFromData` handles an array (`length`), an object with `.count`, `.entities` (definition
  tree), `.visualEdges` (report) or `.edges` (lineage) — so a committed layer's plain domain data
  yields a live number. The bar is `ready/4 %`.

**KPI (Description tab)** — `useStore` selector `kpi` (the store's `computeKpi` projection):
- Objects → `kpi.total` · Backlog → `kpi.missingDescription` · Unused → `kpi.unused`
- Pending edits → `kpi.pendingEdits` · Coverage → `kpi.coverage` (+ inline progress bar)

During the smoke the fixture `setProject` (6 objects, 1 measure→column edge, 2 described)
rendered **6 / 4 / 5 / 0 / 33%**, matching the store's `computeKpi`.

---

## 4. Accessibility handling

- Tabs: `role=tablist` → `role=tab` (`aria-selected`, `aria-controls`) → `role=tabpanel`
  (`aria-labelledby`, `hidden` when inactive). **Roving tabindex**: only the selected tab is
  `tabIndex=0`; the rest `-1`. ArrowRight/ArrowLeft wrap, Home/End jump; selection + focus move
  together (automatic activation). `preventDefault()` on handled keys.
- Verified in-browser: after `ArrowRight` from the Description tab, `aria-selected` moved to
  "Prep for AI", tabindex became `[-1, 0, -1]`, focus landed on the new tab, `#panel-ai` un-hidden,
  `#panel-desc` hidden.
- Skip link is the first focusable element and visually appears only on focus (AD-11).
- `:focus-visible` ring on every button/a/input/tabindex (2px primary outline + offset).
- Read-only state keeps controls visible but `disabled` (Save), with the explanation banner —
  nothing is hidden.

---

## 5. Render smoke evidence

Dev server: `vite dev --host 127.0.0.1 --port 5173` (Vite v8.2.2, ready in 557 ms).
Driven with the harness Chromium browser tool; each state observed in the live DOM.

**Landing (FR-34, supported):**
- `PBI AI PREP / SEMANTIC MODEL STUDIO`, `Make your Power BI model AI-ready in one pass.`, feature
  cards, capability badge `Chrome — fully supported`, `Open PBIP folder` button present, write-access
  rationale beneath, "No recent projects yet.", theme toggle present.
- Screenshot: `C:\Users\ASUNAY~1\AppData\Local\Temp\omp-sshots-156bd8d8b68df5cc.webp`

**App chrome + KPI (FR-37):** after injecting a fixture project via the dev seam:
- tab bar `Description & Update / Prep for AI / Relationships`, project chip `Programmatic Insights - CI`, 3 tabpanels (2 hidden), skip link present
- KPI cards all five present: Objects **6**, Backlog **4**, Unused **5**, Pending edits **0**, Coverage **33%** (+ coverage progress bar), roving tabindex `[0,-1,-1]`
- Screenshot: `C:\Users\ASUNAY~1\AppData\Local\Temp\omp-sshots-156bd82e2b0df5c9.webp`

**Parse stepper (FR-35):** with no project + layers committed via the store:
- "Preparing your model", `2/4 stages ready`, stage rows with live counts (`Definition tree 3`, `Lineage graph 1`), `role=progressbar`, "Nothing leaves your machine — parsing runs locally."

**Read-only (FR-34):** `setPermission('denied')` + a project → banner "Write access was
declined — the model is read-only. Save and edit controls are disabled…" and the header Save button
`disabled=true`; tab bar still fully visible.

**Theme toggle (FR-36):** click → `html.dark=true` and `localStorage['theme']='dark'`; toggle
back → `dark=false, stored='light'`; reload → stays light (persistence). Dark screenshot:
`C:\Users\ASUNAY~1\AppData\Local\Temp\omp-sshots-156bd86ada0df5cb.webp`

**Unsupported browser (FR-34):** with `window.showDirectoryPicker` undefined → badge
"Unsupported browser" + "Please use Chrome, Edge, or Opera"; the open button is `disabled=true`.

---

## 6. Files changed

Added:
- `src/ui/App.tsx` (shell + tab chrome)
- `src/ui/chrome.css` (shared primitives)
- `src/ui/chrome/Landing.tsx`
- `src/ui/chrome/ParseStepper.tsx`
- `src/ui/chrome/ThemeToggle.tsx`
- `src/ui/chrome/KpiCard.tsx`

Modified:
- `src/main.tsx` (import `./ui/App.tsx`, use `readStoredTheme()`)
- `src/ui/theme.ts` (storage-safe `setTheme`, `readTheme`, `readStoredTheme`, `THEME_EVENT`)

Deleted:
- `src/App.tsx` (demo scaffold)

Committed as `009e5e5` `feat: step 7a14`.

---

## 7. Self-review

- Build + lint clean; no `@ts-ignore`/hacks; all `noUnusedLocals`/`verbatimModuleSyntax`/
  `erasableSyntaxOnly` constraints respected.
- All styling binds to `theme.css` tokens (`var(--color-*)`, Tailwind `bg-*/text-*/border-*`),
  with `color-mix()` for hover/opacity shades — no hardcoded hex/hsl palette colors anywhere in
  `src/ui/`.
- The store is only ever **read** (selectors) — no mutation of domains beyond legitimate store
  setters (`setProject`/`setLayerState`/`setPermission`) that already exist as the sanctioned API.
- Removed the demo and its `src/App.tsx` entirely; `mockup/`, `_agents/`, `_bmad-output/`,
  `_bmad/`, `.superpowers/`, `_test_pbip_w_ai/` all untouched.
- The mockup's third tab is labelled "Lineage"; the task explicitly enumerates the tab bar as
  "Description & Update / Prep for AI / **Relationships**", so I followed the task wording and kept
  the lineage/graph icon shape and the Relationships placeholder panel.

## 8. Concerns

1. **4 stepper stages over 3 store layers.** The store exposes exactly `layers = { lsdl, report,
   lineage }`, but FR-35/mockup drive a 4-stage stepper. I bound "Definition tree"→`lsdl`,
   "Lineage graph"→`lineage`, "Report layer"→`report`, and "Model objects"→the primary load
   (`project.objects`, count from `project.objects.length`, state derived from it). If a later task
   wants the Model-objects stage to be a real layer parseState, the store's `LayerName` union would
   need a fourth member — flagging for 7.2's parse orchestration.
2. **`requestPermission` after `await pickFolder()`.** The picker (`mode:'readwrite'`) already
   grants write, so the follow-up `requestPermission(handle)()` inside the click handler is
   belt-and-suspenders. FR-24 notes it must run from a user gesture; the async picker may consume
   transient activation. The landing wires the intent; the orchestration refinement (whether the
   permission query belongs before/after the picker) is a 7.2 decision.
3. **Dev-only store seam.** `App.tsx` exposes `window.__pbiStore` under `import.meta.env.DEV` so the
   render-smoke/e2e harness can inject a fixture project. It is stripped from the production bundle
   and does not change default behaviour (no project → landing). If the team prefers no window
   global, drop the block and drive the smoke through a fixture-loaded entry instead.
4. **Unused KPI tone.** `theme.css` has no rose/red token (blue family only), so the mockup's
   "Unused" rose card is rendered with the `sky` tone instead; all five Description cards use the
   five available blue-family tokens (primary/amber/sky/cyan/emerald). When a destructuring/red tone
   token is added, `KpiTone` can grow and the card can adopt it.
5. **Fonts.** Not loaded (no Google Fonts; local-first ethos), so Inter/JetBrains Mono from the
   mockup fall back to system `ui-sans` / `ui-monospace` stacks. Typography scales/weights match the
   mockup; the literal family differs. Worth a build-time decision if pixel-identical fonts are
   required.
6. **Read-only coverage.** The read-only state is wired at the chrome level (Save disabled + banner).
   The grid's per-row editing controls arrive in 7.2 and will need to inherit the same `readOnly`
   gate (they don't exist yet).

---

## 9. Review round 1 — CSS merge (standalone stylesheet rule)

**Finding:** `src/ui/chrome.css` was a **standalone stylesheet**, which violates the project rule
"creating standalone CSS or external loader files is strictly forbidden." The colors were already
token-bound (`var(--color-*)` / `color-mix()`), so the palette was preserved — but declaration-level
styling (shadows, radii, font stacks, the `.btn`/`.tab`/`.chip`/`.pill`/`.field`/`.t-*` primitives,
`.mono`/`.tabular`, the mesh backdrop, and the focus-visible ring) must not live in a separate file.

**Fix (`99861a4`):** merged the entire `@layer components { ... }` block into `src/ui/theme.css`
(the "single source of design tokens" stylesheet, now the ONLY stylesheet), then **deleted**
`src/ui/chrome.css` and removed `import './chrome.css'` from `src/ui/App.tsx`. All class names, token
binding, and `.dark` behavior preserved verbatim; `main.tsx` already imports `./ui/theme.css` before
`./ui/App.tsx`, so the merged rules resolve in the same cascade order.

**Verification after merge:** `npm run build` clean (1830 modules; CSS bundle grew 42.74→45.79 kB,
proving the merged rules are emitted); `npm run lint` clean; render smoke re-run against the dev
server:
- `.btn-primary` computed `background-color: rgb(36, 99, 235)` (= `hsl(221 83% 53%)`, #2463EB);
  `.card` computed `border-radius: 12px` (0.75rem) — the `@layer components` rules are applied.
- Tab chrome: 3 `role=tab`, roving tabindex `0,-1,-1`, selected tab tint
  `color(srgb 0.14 0.387 0.92 / 0.1)` (the 10% primary tint). KPI figures rendered `[4, 2, 4, 0, 50%]`
  for the fixture (Objects 4 / Backlog 2 / Unused 4 / Pending 0 / Coverage 50%).
- Parse stepper: "Preparing your model", all 4 stages present, progress bar `25%` (1 of 4 ready).
- Landing supported badge + open button confirmed with styled primitives.

No behavioral regression.
