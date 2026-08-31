# Task 7.6 — Delete flow with visible blast radius + wave cascade (FR-33) — report

## Status
Complete. `npm run build` clean; `npm test` 253/253 green (incl. 10 new cascade tests); browser render smoke verified end-to-end (grouping, blast radius, round 1 stages + names round-2 orphan, round 2 closes cascade, nothing to disk until Save, Escape/Cancel stage nothing, read-only disables confirm, AD-11 focus trap + restore).

## Files changed
- **New** `src/ui/grid/DeleteDialog.tsx` — the FR-33 delete-cascade confirmation dialog.
- **New** `src/ui/grid/deleteCascade.ts` — the pure cascade logic (grouping, blast radius, orphan round machine, title, confirm label), unit-tested outside React.
- **Modified** `src/ui/grid/SelectionContext.tsx` — wired the ActionBar's "Delete selected" to `DeleteDialog`; removed the obsolete one-shot `DeleteSelectedDialog` and its `confirmDelete` (and the now-unused `Trash2` import).
- **New** `tests/unit/delete-cascade.test.ts` — 10 tests pinning `groupByTable`, `remainingDependents`, `newlyOrphaned`, `deleteTitle`, `confirmLabel`.
- **Report** `.superpowers/sdd/IMPLEMENTATION-PLAN/task-25-report.md`.

## Dialog structure (visual contract: `mockup/index.html` `#mDelete`)
- Header: rose/destructive icon (inline SVG), the confirmation **title variant**, the ONE warning line, and a Close (`X`) button.
- Body: `max-h-[300px]` scrollable, `space-y-3` grouped-by-table cards.
- Wave panel: amber (token-bound `color-mix`) round box shown at Round ≥ 2 with the round indicator, the named orphans, and the include checkbox.
- Footer: `Round N · PBIPreAI_RemoveUnusedCols` mono label on the left, `Cancel` + `Remove N objects` (danger) on the right. (The mono label names the M-step that source-column deletes append, matching the mockup.)

## Grouping (grouped-by-table, counts + expandable lists)
- `groupByTable(objects)` groups the round's objects by parent Table in **stable insertion order**, each group carrying a `count`. Table-classified kinds (`table`, `calculationGroup`, `fieldParameter`) group under their own name (their `table` is `''`).
- Each group header is a button: chevron, table name, and a `t-blue` count pill. Groups default **expanded** so the per-object blast radius is visible immediately (the requirement is a *visible* blast radius); the header toggles `aria-expanded` to collapse/expand.
- Inside an expanded group each row shows a `TYPE_META` kind pill + the object name (mono), then its blast radius line.

## Per-object blast radius (facts, never a verdict)
- `remainingDependents(graph, id, deleted)` returns the distinct `graph.dependents(id)` that **still** depend on `id` once the objects already committed to deletion are removed. These are named downstream objects that break — facts only, no safety verdict.
- Zero dependents → the neutral line `No downstream references.`; non-zero → `Breaks N downstream: <names>` (names in `text-destructive/85` signalling breakage, count/label neutral).
- The deletion plan excludes dependents that are themselves being deleted, so the line reports the genuinely-remaining breakage.

## Warning line + title variants
- Warning line (exact, one line): `Removal writes an M-query step and cannot be undone here — only via Git.`
- Clean variant: `These N objects have no downstream references.` (singular: `This object has no downstream references.`).
- Partially-referenced variant: `N of M selected objects are still referenced.` (singular: `This object is still referenced.`). `still` counts objects whose remaining dependents (outside the plan) are non-empty.

## Wave-cascade round machine
- Pure logic in `newlyOrphaned(graph, model, priorDeleted, deleted)`: an object becomes "newly orphaned" when it had ≥1 remaining dependent before the round (`priorDeleted`) and zero after applying `deleted` (the cumulative set including the round). Deleted objects and already-orphaned objects are excluded. This matches edge direction — deleting consumers orphans a depended-on object that had *only* those consumers.
- Round 1 shows the user's selected set grouped by table. **Confirm** — `onStage(batch)` stages the round's `{kind:'delete', objectId, file, context:'user', recordId}` records IN MEMORY via `journalAdd` (the write-planner materialises them only on Save); the dialog then computes `newlyOrphaned`. Non-empty → the next round (Round 2, 3, …) with a new wave panel naming the orphans + an "Include the N newly orphaned (M total)" checkbox (checked by default). Empty → the cascade lands and `onDone()` closes (every accepted round already staged; nothing to disk until Save).
- Confirm label grows with the wave checkbox: `Remove ${planned total} objects` (Round 2 showed `Remove 3 objects` for 2 staged + 1 orphan). Unchecking the box + Confirm stops the cascade (keeps already-staged rounds, closes).
- Cancelling/escaping a round stages nothing new; already-confirmed rounds stay pending.

## Focus trap / restore (AD-11)
- On mount the dialog captures `document.activeElement` (the Delete trigger) BEFORE focusing the panel, then focuses the `role="dialog"` panel.
- `onKeyDown` on the panel: `Escape` → `onCancel`; `Tab`/`Shift+Tab` → if focus is on the last/first focusable (or escaped the panel) it wraps to the first/last, keeping focus trapped inside.
- On unmount focus is restored to the captured trigger if still connected. Verified in-browser: open → focus on dialog; Escape/close → focus back on `Delete selected`.

## Read-only gating
- The dialog takes `readOnly` (`permission !== 'granted'`). When set, the confirm button is `disabled` but visible and the footer shows `Read-only — delete is disabled`. (The ActionBar's Delete button is disabled in read-only too, so the dialog is normally unreachable; the gate is defensive and verified by flipping `permission` while open.)

## Self-review
- **Correctness**: cascade is a pure function over the immutable pristine graph + the cumulative committed set — equivalent to "recompute the graph on the folded model" (deleting an object removes its edges, so dependents not in the delete set are exactly `dependents(id) \ committed`). Journal records are exactly the required delete shape.
- **Scoping**: `DeleteDialog` reads nothing from disk; staging flows only through the store's `journalAdd`. Nothing writes to disk until Save (verified: journal grew to 3 pending; no file changes without Save).
- **Clean cutover**: removed the obsolete `DeleteSelectedDialog`/`confirmDelete` and the then-unused `Trash2` import; no shims/aliases.
- **Conventions**: theme tokens only (no violet/purple), destructive red `--color-destructive` for icon/confirm, token-bound amber for the wave panel, `import type` under `verbatimModuleSyntax`, no unused locals (build green).
- **Testability**: the cascade machine is exported pure functions tested in a node env (vitest `environment: 'node'` — no DOM harness is configured, so component rendering isn't unit-tested; it was verified by a browser render smoke instead).

## Concerns
- `npm run build` emits the pre-existing "chunk larger than 500 kB" warning (unrelated to this change).
- The `#mDelete` mockup collapses the whole cascade into one confirm with a single checkbox; the binding FR-33 wording ("each round … with its own confirmation") is implemented iteratively (Round 1, Round 2, …) with one wave panel per round, which is the stricter reading of the spec.
- The render smoke used the `window.__pbiStore` dev seam to seed a fixture project rather than a real PBIP folder (which lives under `_test_pbip_w_ai/`, out of scope); the cascade machinery is otherwise unchanged in production.

## Verify
- `npm run build` — clean (tsc -b + vite build).
- `npm test` — 16 files / 253 tests pass, including `tests/unit/delete-cascade.test.ts` (10).
- Browser render smoke — dialog groups selected objects by table (counts + expandable), per-object blast radius names `Total A, Total B` for the column; confirm Round 1 stages 2 deletes + names the newly-orphaned `Amount` as Round 2 ("Include the 1 newly orphaned object (3 total)"/"Remove 3 objects"); confirm Round 2 → journal 3 pending, dialog closes, folded model trimmed to 2 objects, nothing to disk until Save.
