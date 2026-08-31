# Task 7.3 — Selection + contextual action bar + bulk rename

**Status: DONE** · branch `feat/pbi-ai-prep` · commit `a8560be feat: step 7c35`

## What was built

### Components (all in `src/ui/grid/`)
- **`SelectionContext.tsx`** — the selection bar + dialog orchestrator. Reads the store
  (`selectedIds`, `project`, `filters`, `graph`, `pristine`, `permission`,
  `outsideFilterCount`, `journalAdd`, `clearSelection`), computes the selected pristine
  objects + the outside-filter count, owns the modal state (`none | rename | desc | delete`),
  and renders the selection bar + `<ActionBar>` + the three dialogs. **Not** a duplicate of
  the 7.2 row mechanics — it adds what FR-30/31/32 still needed.
- **`ActionBar.tsx`** — the contextual action-button group (Apply renaming, Set description,
  Include/Exclude AI, Show/Hide in model, Delete selected, Clear). Neutral `btn-outline` /
  `btn-ghost` everywhere; the only destructive button is `Delete selected` (`btn-danger`).
- **`BulkRenameDialog.tsx`** — the bulk-rename transform modal (rules, live preview,
  collision block, Stage renames).
- **`SelectionContext.tsx`** also contains two internal dialog components used by the bar:
  `SetDescriptionDialog` and `DeleteSelectedDialog` (kept in-file to honour the 3-file brief).

### Domain (pure, unit-testable)
- **`src/domain/rename.ts`** — pure leaf (AD-1, imports only `./objects`):
  - `RenameRules`, `DEFAULT_RENAME_RULES`, `RenameProposal`, `RenamePlan`,
  - `applyRenameRules(name, rules)` — the binding transform order,
  - `bulkRenamePlan(selected, rules, model)` — proposals + batch-aware FR-12 collisions.

### Modified
- **`src/ui/grid/ObjectGrid.tsx`** — renders `<SelectionContext />` between `FilterBar` and
  the grid (the bar appears only when selection > 0).
- **`src/ui/theme.css`** — added the single `--color-destructive` token (light `hsl(0 84% 60%)`,
  dark `hsl(0 72% 51%)`), `.btn-danger`, and the modal primitives `.scrim` / `.fade-up`
  + `@keyframes fadeUp`. Token-bound only; no violet/purple; red used solely for Delete +
  the collision warning.

## FR-30 compliance (selection)
- **Per-row checkbox keyed by object id** — `GridRow` checkbox → `toggleSelect(obj.id)`;
  `selectedIds` is an ordered id list, so selection survives sort/filter/search/page (verified:
  `store.test.ts` keeps `selectedIds` across `setFilter`/`setPage`).
- **shift-click contiguous range on the visible page** — `ObjectGrid.handleRowClick`
  (shift + row click → `shiftSelectRange(pageRows[lo..hi])`).
- **Space toggles the focused row** — the focused row's checkbox handles Space natively.
- **"Select all N matching" across all pages** — `FilterBar` → `selectAllMatching(matchIds)`;
  labels the live count.
- **Selection bar** — "N selected" (pill, total across any page) + "M outside current filter"
  (`outsideFilterCount()`) + one-click **Clear** (`clearSelection`). Verified live:
  `3 selected` then `2 selected / 2 outside current filter`.

## FR-31 compliance (contextual action bar)
- Bar appears **only** when `selectedIds.length > 0`; `SelectionContext` returns `null` at 0.
- Offers Apply renaming, Set description, Include/Exclude AI, Show/Hide in model,
  Delete selected, Clear.
- Neutral styling; destructive red **only** for Delete.
- Bulk writes **land as pending journal changes** (`journalAdd`), never disk (AD-4). The
  journal fold recomputes the read-model and stales delivered layers.
- **Read-only** (`permission !== 'granted'`) disables every write action — visible, never
  hidden — and carries an in-bar explanation (`Read-only — write actions disabled`).
  Verified: with `permission='denied'`, Apply renaming / Hide in model / Delete are
  `disabled:true`; Clear stays enabled; the amber note renders.

## FR-32 compliance (bulk rename)
- **Transform order (binding)**: find/replace → strip prefix → strip suffix →
  underscores→spaces → Title Case → collapse whitespace + trim (`applyRenameRules`).
- **Live preview** lists `current → new` for **every** selected object, before anything is
  staged (the plan is recomputed per keystroke).
- **FR-12 collision rule at scale**: a proposed name that *differs* and would be *shared with
  a same-table sibling after the whole batch stages* blocks Apply; the banner counts the
  collisions and **names the conflicting sibling names**; each conflicting preview row wears a
  `name taken` pill; the `Stage renames` button is disabled while any collision exists.
- **On Apply**: stages each changed proposal via `journalAdd(field:'name')` (`old`=pristine
  current, `new`=proposed). `journalAdd` coalesces on `{objectId, field}` — a bulk rename
  supersedes an earlier inline staged rename, keeping the same `recordId` and pristine `old`.

## `bulkRenamePlan` purity + collision rule
Pure (no mutation, no side effects, imports only `domain/objects`). Collision is **batch-aware**
(a refinement over the mockup, which validated per-row): it computes each object's *final* name
after the whole batch stages (a changed proposal wins over its folded name), groups by table,
and flags a name with > 1 holder in the same table. Consequences:
- a sibling **renamed off** the name in the same batch **frees** it (no false positive),
- two co-selected objects proposing the same destination are caught,
- an unchanged selected sibling keeping the proposal is caught,
- different tables never collide.

## How bulk actions stage pending changes
`stageField(field, value)` loops the selected pristine objects and calls
`journalAdd({kind:'field', objectId, file, context:'user', field, new:value})`:
- **Include / Exclude AI** → `field:'lsdlVisibility'` boolean (`false` = Visible/Include,
  `true` = Hidden/Exclude), staged against the LSDL **culture file**
  (`layers.lsdl.data.file`, default `definition/cultures/en-US.tmdl`).
- **Show / Hide in model** → `field:'hidden'` boolean (write-planner handles `hidden`);
  the button label flips to "Show in model" when every selected object is already hidden
  (folded model, so a just-staged hide flips it immediately).
- **Set description** → `field:'description'` (per selected object).
- **Delete selected** → `journalAdd({kind:'delete', ...})` per selected object, then
  `clearSelection()` (mockup behaviour).
- **Rename** → `field:'name'` for the changed proposals only.

## Files changed
- New: `src/domain/rename.ts`, `src/ui/grid/SelectionContext.tsx`,
  `src/ui/grid/ActionBar.tsx`, `src/ui/grid/BulkRenameDialog.tsx`,
  `tests/unit/rename.test.ts` (13 tests).
- Modified: `src/ui/grid/ObjectGrid.tsx` (render `SelectionContext`),
  `src/ui/theme.css` (destructive token, `.btn-danger`, `.scrim`/`.fade-up`).

## Self-review
- No duplication: reuses the 7.2 `GridRow` checkbox, `ObjectGrid` shift-select, and
  `FilterBar` select-all; the store's 6.1 selection actions are consumed, not re-added.
- `bulkRenamePlan` is pure and independently unit-tested (order, no-op never staged, collision
  naming, batch-aware free, cross-table, input immutability).
- Theme is token-bound; the single red is reserved for Delete / collision.
- AD-11 (basic): dialogs are `role="dialog"` + `aria-modal` + labelled, Escape & scrim-click
  close, first field auto-focused.

## Verification
- `npm run build` — clean (`tsc -b` + vite build, 1850 modules).
- `npm test` — 15 files / 234 tests green (includes `rename.test.ts`, `ad1-guard.ts`).
- Live render smoke (dev server + browser, `window.__pbiStore` seam, fixture project):
  rows render → clicking row checkboxes selects → action bar appears → bulk-rename dialog
  opens with a live `current → new` preview → a same-table collision blocks Apply
  (`1 name collision …`, apply disabled) → resolves to a non-colliding staging (`field:'name'`
  record `Gross_Profit -> Gross Profit`, folded name updated) → outside-filter count →
  set-description stages per-object records → hide toggle stages `hidden` + label flips →
  delete stages records + clears selection → read-only disables write actions with the
  explanation while Clear stays enabled.

## Concerns
1. **AI-inclusion field is `lsdlVisibility` (not `includedInAI`) — resolved in Fix round 1**
   below. The write-planner's sanctioned LSDL Visibility field; Include = `false` (Visible),
   Exclude = `true` (Hidden), both `State: 'Authored'`; verified `planWrites` does not throw.
2. **Delete is a simple confirmation**, not the FR-33 cascade/orphan-wave (round-2 orphans,
   M-step) — that is a separate surface. 7.3 only needs the button + staging, which it does.
3. **AD-11 focus-trap/restore is partial.** Escape + autofocus + `aria-modal` are done; a full
   focus trap and focus-return-on-close were not implemented.
4. **Placement nuance**: the selection/action bar renders *inside* the grid card after the
   filter row (7.2's card layout), not as a sibling floating strip between filter and card as
   the mockup draws it. Function is equivalent; the visual differs slightly.

---

## Fix round 1 (Main review)

**Finding (Important):** the Include/Exclude-from-AI-schema action staged
`journalAdd({field:'includedInAI'})`, but `ModelObject` has no such field and the
write-planner routes LSDL visibility through `field:'lsdlVisibility'` only
(`LSDL_FIELDS = {customInstructions, synonyms, lsdlVisibility}`); its default case throws
`unsupported journal field`, so any save carrying an `includedInAI` edit would hard-fail and
leak a phantom property onto the folded model.

**Fix:** re-keyed the AI action to `field:'lsdlVisibility'`, matching the write-planner's
LSDL Visibility contract (read from `src/write/write-planner.ts`):
- `new` is a **boolean**: `false` → `Visibility {Value:'Visible', State:'Authored'}` (Include
  in AI), `true` → `{Value:'Hidden', State:'Authored'}` (Exclude from AI).
- the record's `file` is the **LSDL culture file** (`layers.lsdl.data.file`, default
  `definition/cultures/en-US.tmdl`), since the planner buckets LSDL records by culture file.
- `SelectionContext` now reads `layers` from the store and adds `stageLsdlVisibility(hidden)`;
  `onIncludeInAI` → `stageLsdlVisibility(false)`, `onExcludeFromAI` → `stageLsdlVisibility(true)`.

**Verification:**
- `planWrites` run on a journal containing an `lsdlVisibility` record (both `new:false` and
  `new:true`) with a real LSDL layer produces patches without throwing; the re-serialized
  entity Visibility is `{Value: 'Hidden'|'Visible', State: 'Authored'}` respectively.
- Re-ran the render smoke: after loading the LSDL layer, "Exclude from AI" staged
  `lsdlVisibility true` for every selected object with `file = definition/cultures/en-US.tmdl`;
  "Include in AI" staged `false` (and coalesced over the prior records, keeping their
  `recordId`).
- `npm run build` clean; `npm test` 15 files / 234 tests green.

(Note: the write-planner's two-value bool→`Visibility` shape is its sanctioned contract; the
`includedInAI` field was never a real `ModelObject` field and is gone.)
