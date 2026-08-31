### Task 3.3: LSDL reader + binding index (authored fresh)

**Files:**
- Create: `src/parse/lsdl-reader.ts` — **no borrow: `lineage-tracer` has no LSDL reader.** Every line is new; do not look to the repo for this.

**Interfaces:**
- Produces: `parseLSDL(cultureText) → { customInstructions, entities, relationships, agents, block: { start, end }, contentTypeLine }`; `LSDLBindingIndex`; `buildBindingIndex(lsdl, objects) → Map<objectId, { file, span, state }>` (AD-8 — rename planning reads the index, never text search). A dangling binding is retained + flagged, not dropped (FR-6); no `linguisticMetadata` → empty LSDL; no culture file → Prep tab empty (not error).

- [ ] **Step 1: Locate the triple-backtick block** and its `contentType: json` line without disturbing either (FR-6/FR-23). Parse the JSON; split `CustomInstructions` / `Entities` / `Relationships` / `Agents`.
- [ ] **Step 2: Build the binding index** — map LSDL entity `Definition.Binding` (`[Table].[Column]`) → object id via the shared resolver; retain + flag dangling bindings.
- [ ] **Step 3: Unit tests** — `tests/unit/lsdl-reader.test.ts`: block boundary + contentType line preserved; entity↔object association; dangling binding flagged; empty LSDL; no culture file → empty.
- [ ] **Step 4: Commit** — `git commit -m "feat: step 3508"`

