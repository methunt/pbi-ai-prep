### Task 7.2: Object grid — virtualised, columns, filters, sort, pagination

**Files:**
- Create: `src/ui/grid/ObjectGrid.tsx`, `src/ui/grid/GridRow.tsx`, `src/ui/grid/Heading.tsx`, `src/ui/grid/Pagination.tsx`, `src/ui/grid/FilterBar.tsx`, `src/ui/grid/UsedCell.tsx`

**Interfaces:**
- Consumes: store (filters, sort, page, objects, graph.usage), domain (folded model).
- Produces: FR-9 (column order `[Lineage Icon] Type Table Name RenameTo Used Description DAX`; Used cell = total + hover direct/transitive/leaf; Unused=0 light-blue attention / 1-5 grey / 6+ grey heavier; tables first-class rows; DAX only for measure/calc column/calc item; 2000-row virtualisation no frame >16ms; hidden distinguished from visible), FR-10 (empty-description one-action filter, type/table/free-text filter, sort asc/desc with arrow, 50/page pager with ellipsis, 'Showing X–Y of Z', reset-to-page-1), FR-11 (inline editable description, 500-char cap, 200-char cutoff marker, multi-line, Enter/Tab/Escape, changed-cell mark).

- [ ] **Step 1: Build the virtualised row renderer** — use `@tanstack/react-virtual` (or equivalent) to hit the 16ms floor; column order fixed.
- [ ] **Step 2: Implement filter/sort/pagination** to the store, resetting page on change.
- [ ] **Step 3: Implement inline description editing** (keyboard-first, FR-11 / AD-11). Wire the 500-char cap + 200-char marker.
- [ ] **Step 4: Manual verify** against the mockup at ~2000 synthetic rows (no frame >16ms, filter <200ms).
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7b20"`

