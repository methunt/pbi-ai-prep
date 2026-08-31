### Task 7.6: Delete flow with wave cascade + blast radius

**Files:**
- Create: `src/ui/grid/DeleteDialog.tsx`

**Interfaces:**
- Consumes: store (journal), graph, write planner.
- Produces: FR-33 (delete selected → grouped-by-table dialog with counts + expandable lists; per-object named downstream dependents that break (facts, never a verdict); confirmation warning: 'Removal writes an M-query step and cannot be undone here — only via Git'; wave cascade — each round applies in memory, graph recomputes, newly orphaned objects named+confirmed as next round, nothing writes to disk until the user stops). Deletion writes: source columns → `PBIPreAI_RemoveUnusedCols` M step; measures/calc columns/calc items → TMDL span delete.

- [ ] **Step 1: Build the dialog** with grouped-by-table rows, blast-radius dependents, wave-round UI.
- [ ] **Step 2: Wire cascade** — each confirm round calls the delete-plan then offers the next orphan set.
- [ ] **Step 3: Manual verify** — orphan wave appears, nothing touches disk until Save.
- [ ] **Step 4: Commit** — `git commit -m "feat: step 7f5d"`

## Phase 8 — Verification gates + acceptance

