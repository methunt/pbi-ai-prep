### Task 1.1: Synthetic edge-case PBIP fixture

**Files:**
- Create: `tests/fixtures/mock-model/` — a small PBIP tree (4 tables, ~10 objects) that intentionally exercises the graph's hard cases; `tests/fixtures/mock-model/expected-usage.json`

**Interfaces:**
- Produces (consumed by the gate and by unit tests): a model directory + `expected-usage.json` mapping object id → `{ direct, transitive, leaf, total }`.

**The five edge cases the fixture MUST carry (PRD §5):**
1. **Orphaned calculation group** — a calc group whose calc items reference no columns → all items `total 0`.
2. **Field parameter wrapping a deleted column** — `fieldParam→NAMEOF(column)` where the column object does not exist → broken reference attributed to the field parameter; the param still counts as used by the visual, and total for the broken target is undefined/0.
3. **Hidden-measure transitive chain** — `measure A → measure B → measure C → column` (B hidden) → C and the column get transitive counts through B despite B's `isHidden`.
4. **Visual bound only via a field parameter** — a visual's field ref resolves through `fieldParam→column`; the column is `used` with a `visual`-kind dependent, not `0`.
5. **Circular DAX reference** — `measure A → B → A` → both counts as used; traversal terminates (no infinite loop, total reflects the cycle once).

Build the fixture on real TMDL text (tables `*.tmdl`, one `database.tmdl`, one `model.tmdl`, one `relationships.tmdl`), each object carrying a `///` doc comment where a description exists.

- [ ] **Step 1: Author `database.tmdl` / `model.tmdl` skeleton + 4 table files**

Use the real TMDL shapes from `_test_pbip_w_ai` as literal templates (tab indent, `///` comments, `lineageTag` GUIDs, `ordinal` values).

- [ ] **Step 2: Author the 5 edge-case objects + `expected-usage.json`**

Encode the expected counts by hand per the description above.

- [ ] **Step 3: Verify** — fixture parses in the (later) tmdl-reader; for now assert it is valid TMDL text by opening it in a text view and asserting `definition.pbism` has `compatibilityLevel >= 4`.

- [ ] **Step 4: Commit** — `git add tests/fixtures/mock-model && git commit -m "feat: step 15a0"`

