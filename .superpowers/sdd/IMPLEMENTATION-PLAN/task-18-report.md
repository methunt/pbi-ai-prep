# Task 6.1 Report — single Zustand store (`src/state/store.ts`)

**Status:** Complete. 16/16 unit tests green under `npm test` (scoped file run), scoped `tsc` clean under the project's strict flags. Committed as `feat: step 6a22`.

## Deliverable

Created `src/state/store.ts` (the one UI-facing projection / cross-surface owner, AD-10) and `tests/unit/store.test.ts` (16 tests). The store imports only `../domain/*` (never `../ui/*`); the AD-1 guard scans `src/domain/**` so this is out of its scope, matching the brief.

## Store shape (slices + actions)

```ts
export type Permission = 'granted' | 'denied' | 'prompt' | 'unknown'
export type ParseState  = 'idle' | 'parsing' | 'ready' | 'error' | 'stale'
export type LayerName   = 'lsdl' | 'report' | 'lineage'
interface LayerState { parseState: ParseState; data?: unknown }
type LayerMap = Record<LayerName, LayerState>
interface FileRecord  { text: string; spans: unknown }
interface ProjectResult { objectsById: Record<string,ModelObject>; objects: ModelObject[]; files: Record<string,FileRecord>; name: string }
interface SortSpec { key: string; dir: 'asc' | 'desc' }
interface Filters { query: string; type: string|null; table: string|null; noDescription: boolean; unused: boolean; sort: SortSpec|null; page: number; pageSize: number }
interface Kpi { total: number; missingDescription: number; unused: number; pendingEdits: number; coverage: number; aiReach: number }
```

State fields: `project`, `journal: JournalRecord[]`, `selectedIds: string[]` (ordered, unique, keyed by `ModelObject.id`), `filters`, `layers: LayerMap`, `kpi`, `permission`, plus two surface-read-only bookkeeping fields `pristine: ModelObject[]` and `graph: ObjectGraph`.

Actions: `setProject`, `journalAdd`, `journalDiscard`, `setFilter`, `setSort`, `setPage`, `toggleSelect`, `shiftSelectRange`, `selectAllMatching`, `clearSelection`, `outsideFilterCount`, `setLayerState`, `setPermission`.

## How journalAdd / journalDiscard wrap the fold

The store keeps the **pristine** model (from `setProject`) and the journal. Every mutation goes through a single private `refold(nextJournal)` helper:

```ts
const refold = (nextJournal) => {
  const { pristine, graph } = get()
  const objects = projectModel(pristine, nextJournal)   // the domain fold
  set({
    journal: nextJournal,
    project: { ...get().project, objects, objectsById: indexObjects(objects) },
    kpi: computeKpi(objects, graph, nextJournal),
    layers: staleReady(get().layers),                    // ready → stale (AD-5)
  })
}
journalAdd(rec)      { refold(domainJournalAdd(get().pristine, get().journal, rec)) }
journalDiscard(id)   { refold(domainJournalDiscard(get().pristine, get().journal, id)) }
```

This is the **only** place `journal` and the folded `project.objects` are written. No component calls `setState` on journal/KPI (AD-4). `project.objects` / `project.objectsById` always hold the folded read-model; surfaces read them via a selector.

`setProject` resets the journal, rebuilds the graph over the pristine model (built once; the graph is immutable, AD-6), and folds the empty journal.

## Selection semantics (FR-30)

- `toggleSelect(id)`: add if absent, remove if present; preserves order.
- `shiftSelectRange(ids)`: replaces the selection with `ids`, de-duplicated, order-preserving (a contiguous shift-range).
- `selectAllMatching(ids)`: replaces the selection with `ids` (all matching rows, de-duplicated).
- `clearSelection()`: `selectedIds = []`.
- `selectedIds` is **never** touched by `setFilter`/`setSort`/`setPage` (verified by reference + content in tests), so selection survives filter/page/search/tab nav. Canvas selection is a one-element instance of the same shape.
- `outsideFilterCount()`: counts `selectedIds` not present in the current filtered view (`query/type/table/noDescription/unused`), read from current `project.objects` + `filters` + `graph`.

## Layer state machine (AD-7)

`setLayerState(layer, state)` sets `layers[layer] = { ...current, ...state }`. **Idempotent**: re-applying the same `parseState` without new `data` is a no-op (so a duplicate `parsing` trigger never fires an extra request). Supported transitions (any): `idle → parsing`, `parsing → ready|error`, `ready → stale`, plus direct `stale`. Additionally, a journal mutation marks any `ready` layer `stale` (the cross-layer invalidation rule of AD-5), so a lazy re-parse is requested only when a layer's data is genuinely outdated.

## KPI computation

Computed from the folded model + graph on every fold/setProject (ADR-37 "counts move as the user edits or deletes"):

- `total` — folded object count (Description "Objects").
- `missingDescription` — count without a non-blank description (Description "Backlog").
- `unused` — count whose `graph.usage(id).total === 0` (zero downstream consumers; "Unused", FR-9).
- `pendingEdits` — `journal.length` ("Pending edits").
- `coverage` — `round(described / total * 100)`, `0` when `total === 0` ("Coverage").
- `aiReach` — expression-bearing objects (non-blank `dax`); the computable proxy for "AI reach" until the LSDL include-set lands with the AI-schema layer. Documented in the `Kpi` doc comment.

## TDD evidence

**RED** — before `src/state/store.ts` existed, `tests/unit/store.test.ts` failed at import:

```
Error: Cannot find module '../../src/state/store' imported from D:/AI/pbi-ai-prep/tests/unit/store.test.ts
```

**GREEN** — after implementing the store:

```
 RUN  v4.1.11 D:/AI/pbi-ai-prep
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

Scoped typecheck of the store under the project's strict flags (`--strict --verbatimModuleSyntax --noUnusedLocals --noUnusedParameters --erasableSyntaxOnly`): `tsc exit: 0`.

## Files changed

- `src/state/store.ts` (new) — the Zustand store.
- `tests/unit/store.test.ts` (new) — 16 tests.

## Test results

16/16 pass (selection semantics 5, journal doors 2, fold projection 3, layer machine 5, permission 1). Selection survives `setFilter`/`setPage`; journal (reference + content) is untouched by non-journal actions and changes only through `journalAdd`/`journalDiscard`; a field edit and a delete both flow through `journalAdd → project → folded model`; KPI recomputes (incl. `unused` via an edge, `coverage` rounding); the layer machine walks `idle→parsing→ready|error`, auto-stales ready on journal change, and is idempotent.

## Self-review

- **Correctness:** projection is recomputed only via the domain fold inside `refold`; the immutable principles hold (no `ModelObject` or journal mutation; `project()` and graph never mutated).
- **AD-10:** one store owns project/journal/selection/filter/layers/kpi/permission; components never hold their own copies of cross-surface state.
- **AD-4:** journal + KPI written only in `refold`, never by a component.
- **AD-6:** graph built once over pristine; journal never alters edges; KPI queries it, never mutates it.
- **AD-7:** layer state is status-only + `data`; idempotent set; worker/broker lands later in `broker.ts`.
- **Types:** no `any`; type-only imports use `import type` (verbatim module syntax); `erasableSyntaxOnly` (no enums); no unused locals/params (confirmed by scoped tsc).

## Concerns

1. **`aiReach` is a proxy.** The real "AI reach" is the LSDL include/exclude set (Prep-for-AI tab), which arrives with the AI-schema layer. Until then `aiReach` counts non-blank `dax` objects and is documented as such; the field name is frozen now, so the real definition can slot in without a breaking change.
2. **`outsideFilterCount` reads `filters`/`graph` synchronously.** It computes the filtered set inline; if filtering ever gets virtualized/paginated, keep it pre-pagination (it intentionally ignores `page` so selection-on-other-pages isn't counted as "outside"). The choice (filter-only, not page) is deliberate per "selection survives pagination".
3. **Graph edges come only from `setProject.edges`.** The store has no edge discovery of its own; the parse surfaces pass them. Until then `unused` reads a graph with whatever edges were supplied.
4. **Auto-stale on journal change** marks `ready` layers `stale` but leaves `error` layers as `error` (an error doesn't claim data correctness). Revisit if the parse card wants every delivered/generated layer to restale uniformly.
