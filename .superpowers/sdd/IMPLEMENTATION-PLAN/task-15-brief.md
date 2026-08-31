### Task 4.2: Write planner

**Files:**
- Create: `src/write/write-planner.ts`

**Interfaces:**
- Produces: `planWrites(model, journal, layers) → Map<file, { text, patches }>`; groups journal by file, **coalesces** records per file, applies the fold to get the final text, computes patches for: doc-comment write, rename (name-token patch), visibility `isHidden` + `changedProperty`, LSDL JSON block re-serialization (the ONE sanctioned re-serialization) for instructions/synonyms/visibility, M-step append for column deletion, TMDL block span-delete for measures/calc columns/calc items.

- [ ] **Step 1: Description write** — patch the doc-comment span (`///` lines at declaration indentation, newline-preserving) or insert a new `///` block directly above the declaration. Multi-line → consecutive `///` lines.

- [ ] **Step 2: Rename write** — patch the **name-token span**; do NOT re-key the id; if TMDL quoting is needed, quote and double embedded single quote (FR-12); if the rename is referenced in DAX elsewhere, **warn + list** the referencing expressions (v1, no rewrite, per Assumption).

- [ ] **Step 3: Visibility write** — write/remove `isHidden` and emit `changedProperty = IsHidden` (FR-13, matches reference model).

- [ ] **Step 4: LSDL write (sole exception to "never re-serialize")** — re-encode the enclosed JSON block within its own byte span (AD-3), preserving the `contentType: json` line; write `CustomInstructions`, entity `Terms` (incl `Deleted` tombstone), entity `Visibility` with `state: Authored`; preserve `Agents` timestamps verbatim (Open Question 6 default).

- [ ] **Step 5: Delete write** — source columns append `PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(PreviousStep, {...})` as a fresh final M step (never mutating user steps); measures/calc columns/calc tables/calc items deleted by span-patching their TMDL block (FR-33).

- [ ] **Step 6: Unit tests** — `tests/unit/write-planner.test.ts`: each write kind produces the right patch; edit-free save → empty patch list; rename patches name token only; description insert is `///` at declaration indentation.

- [ ] **Step 7: Commit** — `git commit -m "feat: step 4483"`

