### Task 7.4: Prep for AI — sub-tabs, instructions, schema & synonyms

**Files:**
- Create: `src/ui/prep/PrepForAi.tsx`, `src/ui/prep/InstructionsEditor.tsx`, `src/ui/prep/VerifiedRail.tsx`, `src/ui/prep/SchemaExplorer.tsx`, `src/ui/prep/SynonymChips.tsx`, `src/ui/prep/SubTabSelector.tsx`

**Interfaces:**
- Consumes: store (LSDL layer, folded model), write planner.
- Produces: FR-38 (segmented sub-tab selector below KPI row: 'AI instructions' / 'AI schema & synonyms'; live N/M badge), FR-15 (instructions editor full-height, live 10,000-char gauge, char cap refuses excess, JSON-escaped save), FR-18 (verified-answers read-only rail on the right of the editor), FR-16 (synonyms per object: list state, add→`User`, remove generated→`Deleted` tombstone, auto-create entity, 20 live cap + 'N/20' counter, max 6 chips inline + '+N more', state labels), FR-17 (per-table collapsed rows: field count, included/total, synonym totals; expand → per-field include toggle + synonym chips; grey dot when all excluded, blue when any included; bulk include/exclude; excluding a depended-on measure warns naming both).

- [ ] **Step 1: Build `SubTabSelector` + two views**, full-height (FR-38).
- [ ] **Step 2: Build `InstructionsEditor`** (char gauge, cap, JSON escape on save).
- [ ] **Step 3: Build `VerifiedRail`** (read-only, reads `VerifiedAnswers/definitions/<guid>/definition.json`).
- [ ] **Step 4: Build `SchemaExplorer` + `SynonymChips`** (table-level tree, per-field toggles, 20-cap, tombstone, dot rule).
- [ ] **Step 5: Manual verify** against the mockup (10k budget bar, sub-tab structure, grey dot rule).
- [ ] **Step 6: Commit** — `git commit -m "feat: step 7d9c"`

