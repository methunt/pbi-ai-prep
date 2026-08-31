### Task 3.2: TMDL reader (borrowed + optimized)

**Files:**
- Create: `src/parse/tmdl-reader.ts` — adapted from `bridge/src/pbip/tmdl-parser.js` in `lineage-tracer`, itself adopted from `pbip-documenter` (MIT, Jihwan Kim; retain the LICENSE + attribution header verbatim)

**Interfaces:**
- Produces: `parseTmdlProject(files: Map<path, text>) → { objects: ModelObject[], errors: ParseError[] }`; `ParseError = { file, line, message }`. Reads `database.tmdl`, `model.tmdl`, `tables/*.tmdl`, `relationships.tmdl`, `roles/*.tmdl`, `expressions.tmdl`, `functions.tmdl`, `perspectives/*.tmdl` → one object per declaration (FR-5).

**Borrow, then close the gaps the write path needs.** The borrowed parser is a line-by-line state machine that already tags auto-date tables, calc-group tables, and field-parameter tables, and reads `isHidden`/`ordinal`/`displayFolder`. It is **missing** — and MUST be added for AD-2 / AD-3 / FR-5:
- `lineageTag` (the object id — the borrowed parser reads none)
- `queryGroup`, `perspective` membership, `changedProperty`
- `functions.tmdl` → `daxFunction` objects (triple-backtick body preserved verbatim)
- **source byte spans** (declaration, doc-comment, name-token) — the borrowed parser emits none

- [ ] **Step 1: Port `tmdl-parser.js` → `parse/tmdl-reader.ts`** — keep the state-machine structure, the `PARTITION_SOURCE_TYPES` set, and the `_isAutoDate`/`_isCalcGroup`/`_isFieldParameter` tags; add the missing kinds and spans; keep the MIT attribution header.
- [ ] **Step 2: Optimize for 2000 objects (FR-8).** Replace the per-file `content.split('\n')` into arrays with a single offset-tracked line scan (running byte offset). Replace the two `Object.keys(files).filter(f => f.startsWith(...))` full scans with ONE prefix-bucketed file index built once. Avoid RegExp-per-line; use `startsWith`/`charCodeAt` fast paths. Target: folder→grid ≤5s, main-thread block ≤50ms.
- [ ] **Step 3: Capture every source span** via the emitter (declaration, doc-comment, name-token) and a `function` triple-backtick body preserved verbatim.
- [ ] **Step 4: Error path** — a file that fails to parse yields a `ParseError{file, line}` and the remaining files still load (FR-5).
- [ ] **Step 5: Unit tests** — `tests/unit/tmdl-reader.test.ts`: table+column+measure counts; calculated vs column; calc group + items; field parameter; `functions.tmdl` → `daxFunction` + verbatim body; `lineageTag`/`queryGroup`/`perspective`/`changedProperty` retained; every object carries declaration/doc-comment/name-token spans; a file parse error names file+line and the rest still parse.
- [ ] **Step 6: Commit** — `git commit -m "feat: step 3141"`

