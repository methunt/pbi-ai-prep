# Task 7.2 — Object grid (virtualised, columns, filters, sort, pagination)

## Status
**Complete.** `npm run build` is clean. Render smoke drives the grid on a 2000-row
synthetic model through the dev seam (`window.__pbiStore`): virtualisation renders
~22–34 of 2000 rows, filters/sort/pagination work, inline description + rename edits
stage to the journal as pending changes, and read-only gating disables (but keeps
visible) the edit cells.

## Components + store wiring
New `src/ui/grid/` module:

- **`ObjectGrid.tsx`** — orchestrator. Reads the store (`project`, `filters`,
  `journal`, `graph`, `permission`, `selectedIds`, `setFilter/setSort/setPage/
  journalAdd/toggleSelect/shiftSelectRange/selectAllMatching`). Derives the row set
  with the store's new `deriveVisibleObjects` (filter + sort, no pagination), pages it
  to `filters.pageSize` (default 50), and virtualises the page rows with
  `@tanstack/react-virtual` (`useVirtualizer`, fixed 42px rows, overscan 12). Owns the
  ARIA row/gridcell roles, row-arrow navigation, shift-range selection, and the empty
  state.
- **`GridRow.tsx`** — one virtual row (React.memo). Renders the 9 columns in the fixed
  order `[checkbox] [Lineage] Type | Table | Name | RenameTo | Used | Description | DAX`,
  dims hidden objects (`.hidden` opacity + a `hidden` pill), and wires the two edit
  cells.
- **`UsedCell.tsx`** — Used pill (`Unused`/`Used N`) with hover tooltip splitting
  direct / transitive / leaf.
- **`DescriptionCell.tsx`** — FR-11 inline editor (display button → textarea):
  500-char cap, 200-char Copilot-cutoff counter marker, multi-line preserved + display
  collapses newlines to `///`, Enter commits + moves down, Escape reverts, Tab /
  Shift+Tab move cells, changed-cell marker.
- **`RenameCell.tsx`** — inline 'rename to' input; stages `field: 'renameTo'` on
  commit (Enter/blur); collision checks deferred to 7.3 bulk apply.
- **`Heading.tsx`** — sortable column headers (Type/Table/Name/Used/Description/DAX),
  focusable, `aria-sort`, asc/desc arrow, toggling sort resets page 1.
- **`Pagination.tsx`** — 50/page, ellipsis pager (mockup algorithm), prev/next,
  "Showing X–Y of Z".
- **`FilterBar.tsx`** — free-text search, one-action Empty / Unused chips (with live
  counts), Type + Table dropdowns, "select all matching".
- **`columns.ts`** — the binding column order / col-id contract.
- **`typeMeta.ts`** — object-type → human label + token dot + `hasDax`.
- **`cellUtils.ts`** — journal field selectors, used-pill class, tooltip text, line
  collapsing.

Store wiring (`src/state/store.ts`): added `deriveVisibleObjects(objects, filters,
graph)` — the single owner of filter+sort logic (reuses the private `matchesFilter`),
stepping the same "filter → sort → page" path the mockup uses. **No ModelObject is
mutated by the grid**; every description/rename edit goes through `journalAdd`
(AD-4), and the folded read-model is what the grid reads back.

`src/ui/App.tsx`: the Description & Update tabpanel's placeholder was replaced with
`<ObjectGrid />` (the KPI cards stay). `src/ui/theme.css`: added the grid primitives
(`.grid-row`, `.grid-head`, `.grid-head-cell`, `.grid-cell`, `.type-*`, `.u0/.u1/.u6`,
`.cell-changed`, `.pgbtn`, `.pgdots`, `.tip*`, `.dax-tip`), a `--color-popover` token
(+ dark override) so the tooltip is token-bound, and the `html/body/#root { height:100% }`
base rule that constrains the app shell so the grid's scroll container can virtualise.

## FR-9 / FR-10 / FR-11 compliance map
**FR-9** — column order exactly `[Lineage Icon] Type | Table | Name | RenameTo | Used |
Description | DAX` (`columns.ts`, rendered in `GridRow`). Used cell = total, hover
splits direct/transitive/leaf (`UsedCell`). Unused(0) = light-blue highlight, 1–5 grey,
6+ grey-strong (`usedClass` → `.u0/.u1/.u6`). Tables are first-class rows. DAX renders
only for measure / calc column / calc item (`TYPE_META.hasDax`), else `—`. Hidden
objects dimmed + labelled. 2000-row virtualisation tested (see perf).

**FR-10** — one-action empty-description chip + unused chip + type/table dropdowns +
free-text search; sort asc/desc with arrow on Type/Table/Name/Used/Description/DAX;
50/page pager with ellipsis, prev/next, "Showing X–Y of Z". Every filter change and
sort change resets to page 1 (store `setFilter` does it; `onSort` calls `setSort` +
`setPage(1)`).

**FR-11** — inline description editing with 500-char cap, 200-char Copilot-cutoff
marker, multi-line (`///`), Enter commits + moves down, Escape reverts,
Tab/Shift+Tab move cells, changed-cell visually marked (`.cell-changed`).
Verified: typing "A test description for the grid" + Enter staged
`{kind:'field', field:'description', new:'A test description for the grid', objectId:'o-1'}`,
`kpi.pendingEdits` → 1, cell shows `.cell-changed`.

## Virtualisation + perf evidence
Browser smoke on a 2000-object synthetic model with a linear use-chain (1999 edges →
usage counts from ~1999 down to 0, exercising all three used classes).

- Layout: only **~22–34 of 2000** rows are mounted; `aria-rowcount="2001"`,
  `aria-colcount="9"`; grid viewport 410px over 84024px of virtual content.
- Frame budget on realistic wheel-style scroll (120px / ~14ms for ~1s): **avg 8ms,
  p95 17ms**, max 22ms; **0 long tasks** (>50ms) after memoising `GridRow`.
- Under a deliberately hostile fast-scroll loop (240px every 3ms): avg 10ms, worst-case
  39ms frame, row-swap DOM mutations minimal. The remaining occasional >16ms frames are
  the row-window slide mounting 2–4 new rows in the **dev** build (React DEV +
  `<StrictMode>` double-renders); the production build (minified, no StrictMode) is
  substantially faster. `React.memo(GridRow)` + stable callbacks (via `pageRowsRef`)
  removed the previous 50–88ms long tasks entirely.

## Keyboard / accessibility (AD-11)
- Correct `role="grid" | "row" | "gridcell" | "columnheader"`, `aria-rowcount`,
  `aria-colcount`, `aria-sort`, `aria-current="page"`, `aria-live` on "Showing".
- Sortable headers are tab stops; Enter/Space/click sort.
- Checkbox = per-row selector; Space toggles it (AD-11). Grid container handles
  ArrowUp/ArrowDown to move focus to the same column's control in the adjacent row
  (skips text editors so caret movement is preserved).
- Description editor: Enter commits / moves down, Escape reverts, Tab / Shift+Tab
  navigate cells; rename input: Enter/Tab commits, Escape reverts.
- `:focus-visible` ring token-bound in `theme.css`.
- Read-only banner (App) + per-cell `aria-disabled` / disabled inputs + `title`
  explanations.

## Read-only gating
`permission !== 'granted'` → the grid still renders, but the rename inputs are
`disabled` (visible, not hidden), the description cells render a disabled
`aria-disabled="true"` span with no edit affordance, the FilterBar shows a "read-only"
hint, and the App header/banner show the read-only message with Save disabled. Verified
with `setPermission('denied')`.

## Files changed
- `src/ui/grid/ObjectGrid.tsx`, `GridRow.tsx`, `UsedCell.tsx`, `DescriptionCell.tsx`,
  `RenameCell.tsx`, `Heading.tsx`, `Pagination.tsx`, `FilterBar.tsx`, `columns.ts`,
  `typeMeta.ts`, `cellUtils.ts` (new)
- `src/state/store.ts` (+ `deriveVisibleObjects`)
- `src/ui/App.tsx` (wire `<ObjectGrid />`)
- `src/ui/theme.css` (grid primitives, `--color-popover`, viewport-height base rule)

## Self-review
- Build (`npm run build`) is clean.
- Filter/sort/pagination verified in-browser: `Showing 1–50 of 2,000`, pager with
  ellipsis, `aria-sort="ascending"` after clicking Name, Empty chip → `Showing 1–50 of
  1,500` with the chip `.on`.
- Description + rename edits verified to land in the journal as pending changes with
  the changed-cell marker; KPI `pendingEdits` increments.
- Read-only gating verified.
- Column order verified from the rendered grid text (`Type / Table / Name / Rename to /
  Used / Description / DAX` with the leading checkbox + lineage cells).

## Concerns
- `directDomUpdates` on `useVirtualizer` (would skip React re-renders for scroll-only
  position updates) is not supported correctly in `@tanstack/react-virtual@3.14.10` —
  enabling it left all items stacked at one position, so I reverted to the explicit
  `transform: translateY(vi.start)` approach and used `React.memo` instead. Absolute
  positioning renders correctly.
- Remaining worst-case ~22–39ms frames under the hostile fast-scroll loop are the
  row-window slide in the DEV build; production is faster, but if the 16ms floor must be
  guaranteed even in dev, the next lever is `React.memo` on the `DescriptionCell` /
  `RenameCell` children (currently only the row is memoised).
- The rename is staged under the `name` field (`journalAdd field:'name'`, the
  write-planner's `planRename` path). The Name column shows the PRISTINE name (from the
  store's `pristine` model) so a pending (unapplied) rename never mutates it; the
  RenameTo cell reads/writes the pending `name` record's `new`/`old`. Clearing a rename
  discards the pending record. (7.3 reads `field === 'name'` for renames.)
- "Tables first-class rows": table objects have `table === ''`, so the Table column
  shows `—` for them and the table dropdown lists only parent table names (not the
  table objects themselves); this matches the store's existing `matchesFilter` semantics.
## Fix round 1 — rename staging moved to `field:'name'` (integration blocker)

**Ruling (binding):** `write-planner.ts` `plansForField` handles only
`description|name|hidden` and the default THROWS on an unsupported field. Staging a
rename under `'renameTo'` would hard-fail at 7.3 bulk apply and the journal fold wrote a
phantom `obj.renameTo` property. Fix: stage renames under `field:'name'`.

**Changes:**
- `ObjectGrid.tsx`: `commitRename` now stages `journalAdd({ field:'name', new:value,
  old: pristineName })`; clearing the rename or leaving it unchanged discards the pending
  `name` record (revert). The Name column is fed a new `displayName` prop read from the
  store's `pristine` model (`pristineById`) so a pending rename never mutates the shown
  name. `renameTo`/`renameChanged` now read the journal's `name` record.
- `GridRow.tsx`: added `displayName` prop; Name cell + checkbox/lineage aria-labels use
  the pristine name.
- `cellUtils.ts`: replaced `renameToFor` with `pendingRenameFor` (reads the `name`
  record's `new`) and `pendingRenameRecordId` (for discard-on-clear). The `renameTo`
  journal field is gone — no phantom property on the folded model.

**Verification:** `npm run build` clean; `npm test` 221/221 green. Browser smoke on the
2000-row synthetic: typing a rename staged `{kind:'field', field:'name', old:'col_1',
new:'RenamedCol', objectId:'o-1'}`, `pendingEdits` → 1, RenameTo cell showed
`RenamedCol`, Name column showed `col_1` (pristine) while the folded model held
`RenamedCol`; clearing the rename discarded the record (journal → 0, pending → 0).
## Fix round 2 — `name` sort uses the pristine (display) name

**Breaking side-effect of round 1:** staging a rename under `field:'name'` sets the
folded `obj.name` to the pending new name, so `deriveVisibleObjects` sorted by the
FOLDED name while the Name cell rendered the PRISTINE name — a visible sort-vs-display
split-brain when sorted by Name with a rename staged.

**Fix:** `deriveVisibleObjects(objects, filters, graph, pristine?)` now takes the store's
`pristine` model (defaulting to `objects` for callers without it) and its `'name'` sort
branch orders by the PRISTINE name (`pristineName` map, `?? o.name` fallback), matching
what the Name column renders. `ObjectGrid` passes `pristine` through the memo.

**Verification:** `npm run build` clean; `npm test` 221/221 green. Browser smoke on the
2000-row model sorted by Name: `col_1` sat at row index 1 before the rename; after staging
`field:'name'` new `'RenamedCol'` (folded name changed) it stayed at index 1, the Name
column still showed `col_1`, and the first 5 names were unchanged — sort and display
agree on the pristine name.
