### Task 7.1: Application chrome — landing, parse stepper, theme toggle

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/chrome/Landing.tsx`, `src/ui/chrome/ParseStepper.tsx`, `src/ui/chrome/ThemeToggle.tsx`, `src/ui/chrome/KpiCard.tsx`

**Interfaces:**
- Consumes: store (permission, layers, kpi), fs (pickFolder, recent).
- Produces: FR-34 (landing: product statement, capability badge naming Chrome/Edge/Opera, open-with-rationale, recent projects; declined → read-only with controls visible but disabled + explanation), FR-35 (4-stage parse stepper: definition tree / model objects / lineage graph / report layer, live per-stage counts, progress bar), FR-36 (light default, localStorage toggle, no `prefers-color-scheme`), FR-37 (per-tab KPI cards: uppercase label + live figure + one-line plain-English definition).

- [ ] **Step 1: Build `Landing.tsx`** per FR-34 + mockup.
- [ ] **Step 2: Build `ParseStepper.tsx`** per FR-35 (reads real layer `parseState`).
- [ ] **Step 3: Build `ThemeToggle.tsx`** + wire `localStorage 'theme'`.
- [ ] **Step 4: Build `KpiCard.tsx`** + wire the three tabs' KPI groups (FR-37).
- [ ] **Step 5: Manual Chromium verify** against the mockup (shapes, palette, spacing).
- [ ] **Step 6: Commit** — `git commit -m "feat: step 7a14"`

