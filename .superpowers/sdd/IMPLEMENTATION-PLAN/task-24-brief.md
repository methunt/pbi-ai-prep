### Task 7.5: Relationships canvas + grid round-trip

**Files:**
- Create: `src/ui/lineage/LineageCanvas.tsx`, `src/ui/lineage/LineageNode.tsx`, `src/ui/lineage/SidePanel.tsx`

**Interfaces:**
- Consumes: store (lineage layer, graph), @xyflow/react + elkjs.
- Produces: FR-19 (tables as nodes, relationships as edges, pan/zoom/zoom-to-fit, calc-group and field-param tables marked distinctly, inactive vs active relationships, expandable table nodes, collapsed by default), FR-20 (select a column → dim everything off its path; dependents listed with counts; select a visual → trace back; side panel shows DAX of selected measure), FR-21 (canvas object → 'edit' opens grid filtered/scrolled to it; grid row 'View on canvas' switches tabs with that object selected + centred).

- [ ] **Step 1: Wire @xyflow/react + elkjs layout**, nodes keyed on object id.
- [ ] **Step 2: Implement off-path dimming** via `graph.isolateTo(id)`.
- [ ] **Step 3: Implement side panel + grid round-trip** (store-driven selection/tab switch).
- [ ] **Step 4: Manual verify** against the mockup (dims, side panel, back-to-grid retaining state).
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7e21"`

