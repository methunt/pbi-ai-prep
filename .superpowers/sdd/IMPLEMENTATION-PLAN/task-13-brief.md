### Task 3.4: PBIR reader (field usage → edges)

**Files:**
- Create: `src/parse/pbir-reader.ts`

**Interfaces:**
- Produces: `parseReport(reportFiles) → { visualEdges: {visualId, field, objectId?, broken}[] , broken: {visual, field}[] }`. Field refs resolve to model objects via the shared resolver; a ref resolving to nothing is a **broken reference attributed to its visual** (FR-7). Fields reached only through a field parameter count as used; no Report folder → usage renders **unavailable, not zero** (FR-7).

- [ ] **Step 1: Walk `definition/pages/*/visuals/*/visual.json`** for `queryState` / field bindings, resolving each field to an object id.

- [ ] **Step 2: Emit edges** (visual→object) to feed the graph; tag broken refs to the visual.

- [ ] **Step 3: Unit tests** — `tests/unit/pbir-reader.test.ts`: field ref resolves; broken ref attributed to visual; fieldParam-only reach counts used; no report folder → `null` (unavailable), not `[]` (zero).

- [ ] **Step 4: Commit** — `git commit -m "feat: step 3911"`

## Phase 4 — write/ (the byte-faithful writer)

