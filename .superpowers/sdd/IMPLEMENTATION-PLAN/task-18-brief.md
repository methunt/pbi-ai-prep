### Task 6.1: Zustand store (single cross-surface owner)

**Files:**
- Create: `src/state/store.ts`

**Interfaces:**
- Produces: `useStore` with slices: `project { tree, objectsById, files, originalTexts, spans }`, `journal`, `selectedIds: string[]` (ordered, unique, keyed by object id), `filters { query, type, table, noDescription, unused, sort, page }`, `layers { lsdl, report, lineage } → { parseState, data }` (status-only `idle|parsing|ready|error|stale`), `kpi`, `permission`. All mutation through `journalAdd`/`journalDiscard` (AD-4). Selection survives filter/page/search/tab nav. Canvas selection is a one-element `selectedIds` instance (AD-10).

- [ ] **Step 1: Implement slices** + store actions that wrap the domain fold; NO component calls `setState` on journal/KPI directly.

- [ ] **Step 2: Selection semantics** — `toggleSelect(id)`, `shiftSelectRange`, `selectAllMatching`, `clearSelection`, `outsideFilterCount` (FR-30).

- [ ] **Step 3: Unit tests** — `tests/unit/store.test.ts`: selection survives filter+page change; journal add/discard only via actions; `layers` state machine.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 6a22"`

