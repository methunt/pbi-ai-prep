# Deferred Work — PBI AI Prep (durable record)

> **Purpose.** The subagent-driven-development ledger (`.superpowers/sdd/IMPLEMENTATION-PLAN/progress.md`) was originally gitignored scratch; it is now **git-tracked for version history** (ledger + per-task briefs/reports; regenerable review diffs and borrowed parser sources are cleaned per wave via `.superpowers/sdd/.gitignore`). This file remains the **durable, distilled** record of deferred work, rulings, and open questions so nothing is silently discarded.

## 1. Deferred Minors (non-blocking; consciously parked per SDD rules)

### Foundation (Tasks 0.1–0.3)
- **0.1** `.env.d.ts` not picked up by any tsconfig include — harmless today; move to `src/.env.d.ts` if env augmentation is added later.
- **0.1** `eslint.config.js` lints `**/*.{js,mjs,cjs}` only, not `.ts/.tsx` — the TS gate is `tsc -b`; typescript-eslint is a new dep (out of whitelist).
- **0.1** demo `App.tsx` uses absolute `/icons.svg#...` public-asset refs in JS → 404 on a GH Pages subpath; dies when the demo UI is replaced.
- **0.2** unguarded `localStorage` at `src/main.tsx:9` + `src/ui/theme.ts:10` could throw in privacy-hardened browsers (module-scope throw boots the app) — harden when the real App shell lands (Task 7.1).
- **0.2** unlayered body base rule in `theme.css` beats future body-level utilities — move into `@layer base` if ever needed.
- **0.2** `public/favicon.svg` hardcodes `#2563eb` (favicons can't read CSS vars) — palette-change checklist item.
- **0.3** `ad1-guard.test.ts` blind to template-literal / line-wrapped dynamic-import specifiers (real but rare; 99% case covered).
- **0.3** `ad1-guard.test.ts` doesn't match `node:`-prefixed builtins (asymmetric with bare fs) — a node builtin in `domain/` fails the browser build anyway.
- **0.3** comment-stripper can false-positive on trailing prose after a block-comment closer (errs strict).
- **0.3** guard walk scans only `.ts`, not `.tsx` (domain is pure logic; `.tsx` is itself a breach).
- **0.3** vitest `passWithNoTests: true` is now dead config (moot after `ad1-guard.test.ts` landed).

### Fixtures & gates (Tasks 1.1–1.2)
- **1.1** stale `Region.tmdl:1/:5` and `Sales.tmdl:14` comments still assert pre-fix semantics (relationship not counted) — contradict the corrected counts now; touch up in a follow-up.
- **1.2** `run-gates.mjs` `spawnSync` has no timeout — a hung gate hangs `npm run gates`; add a timeout when CI gates on this.

### domain/ (Tasks 2.1–2.4)
- **2.1** `span.test.ts` template mirrors `encodeURIComponent` (tautological for escape behavior) — add a literal full-id assertion for a plain-ASCII case.
- **2.1** `FIDELITY_CAPS` untested (object literal; one-line `toEqual` later).
- **2.2** report-prose count inaccuracies (journal actually 11 tests + 2 guard, not 10/3) — report-only, no code change.
- **2.2** two documented journal edge behaviors untested (`journalAdd` unknown objectId → `old` undefined; `project` drops edits for an absent objectId) — add one-line tests or consciously accept.
- **2.3** stray closing brace at `src/domain/identity.ts:77` (cosmetic re-indent).
- **2.3** quoted bare name with a literal dot splits at the first dot in `parseRef`; no current feeder produces it (DAX quotes table names; dotted names parse correctly when a bracket follows).
- **2.4** `dependents()`/`isolateTo()` return live internal Sets — consumers must treat as read-only (mutating desyncs memoized queries).
- **2.4** edge-only nodes (visual/relationship endpoint ids not in `objects`) discoverable only via `isolateTo` offPath — consumers must use the graph's node universe, not `objects` alone.

### parse/ (Tasks 3.1–3.4)
- **3.1** indentation guard is exact-string (tabs-vs-spaces mismatch rejected) — errs toward NOT capturing (safe for writes); `scanBracketed` ignores `]]` escaping (no current producer); `locateNameToken` admits non-declaration lines (reader owns classification).
- **3.2** `src/parse/tmdl-reader.ts` header references a LICENSE file that doesn't exist — drop the MIT text into `src/parse/LICENSE` or inline the notice.
- **3.2** `changedProperty` under a partition `Pending` is silently dropped (no known producer hits it; fix in 4.2 if needed).
- **3.2** `extractName` doesn't unescape doubled quotes (`'It''s'` → name `It`) — inherited borrow limitation; no known PBIP producer.
- **3.2** `buildFileIndex` buckets on `/` paths; Windows backslash keys would silently miss all buckets — add a normalize (`\\ → /`).
- **3.2** inherited DAX-reference regex gaps (from the borrowed parser): `//` inside a DAX string literal eats to EOL (undercount only); whitespace/newline between a quoted table + bracket drops the ref (silent, low freq); doubled single-quote table names produce a phantom broken edge (inherited). None produce a wrong RESOLVED edge.
- **3.3** LSDL binding-index `state` = entity top-level State (Visibility.State left on the entity) — one-line swap if rename planning needs authored-ness.
- **3.3** dangling binding span = the whole LSDL block (not per-entity) — rename planning locating an exact binding would need position-tracking; fine for read-only/recompute.
- **3.4** dedup key uses `|` separator (legal in model names) — pathological table/col pairs could collapse; reuse the NUL separator.
- **3.4** a well with fieldParameters + genuine non-param projections drops the latter (continue skips all projections) — documented assumption.
- **3.4** `extractParameterExpr` resolves with `NO_ALIASES`; From/Source aliasing silently skipped — borrowed-parser parity.

### write/ (Tasks 4.1–4.3)
- **4.1** `patch-engine.ts:105` uses a non-fatal `TextDecoder` — a caller bug splitting a multi-byte char yields silent `U+FFFD` (`'éx'` `[1,2)→'Y'` → `'�Yx'`). **RECOMMENDED FIX** before the write path ships: `new TextDecoder('utf-8', { fatal: true })`.
- **4.2** `extractName` returns bracketed tokens with brackets as `obj.name` → `planRename` no-op check can miss a same-logical-name rename (harmless no-op patch).
- **4.2** `findMPartition` locates only the FIRST partition per file (multi-partition/incremental tables plan the M step on the first only) — documented; fixture is one-partition-per-file.
- **4.2** no CRLF M-step / LSDL re-serialization test; unhide expected value is LF-specific (coverage gap; the logic uses `lineEol`).
- **4.3** `dataTouchesFile` BFS heuristic (40k-node budget) may miss deeply-nested file refs — tighten when the report/lineage layer shapes land (8.x).
- **4.3** `applyRefresh` guard requires non-empty patches for a brand-new file (`priorText=''`) — the orchestrator must pass `[0,0,content]`; documented.

## 2. Accepted / Rulings (decisions that stand — do not re-litigate)

- **Ruling (relationship-edge shape)** — relationship edges are `{from: feederMintedRelNode, to: endpointColumnId, kind:'relationship'}`, 2 edges per relationship. Reproduces `expected-usage.json` 16/16 + the graph's minted-source rule.
- **Ruling (ModelObject extension)** — `ModelObject` gained `changedProperty?: string[]` (additive/optional) for FR-5/FR-13 retention; no field removed.
- **Ruling (FR-8 framing)** — the ≤50ms main-thread budget is delivered by the AD-7 parsing **worker** (Task 6.2), not the sync reader. Sync parse ~114ms for 2000 objects is a worker-side metric.
- **Ruling (AD-1 enforcement)** — AD-1 purity is enforced by a headless Node guard test (`tests/unit/ad1-guard.test.ts`), not eslint-on-TS (which would need typescript-eslint, outside the dep whitelist).
- **Ruling (scaffold on non-empty dir)** — Vite scaffold into a temp dir then move files (repo root non-empty).
- **Accepted** — vitest `vitest.config.ts` added to `tsconfig.node.json` include (canonical, necessary).
- **Accepted** — `parseReport(reportFiles, objects)` two-arg (the one-arg sketch can't resolve refs through the shared resolver).
- **Accepted** — `planWrites` returns `Map<file, {patches: Patch[]}>`; the fidelity gate reads `.patches`.

## 3. Open questions to verify against Power BI Desktop before the corresponding write ships

(from the Architecture Spine §Open Questions + PRD §11 — facts, not decisions)
1. Does renaming emit `changedProperty = Name`? (resolve by renaming in Desktop + diffing the TMDL)
2. Can a culture file be created from scratch if the model never had Q&A enabled, or must Power BI author it first?
3. Is `State: Deleted` the correct tombstone for a removed generated synonym, and does Power BI honour it?
4. Does the appended `PBIPreAI_RemoveUnusedCols` M step survive Power BI Desktop's step consolidation when a user later edits the query?
5. Does a Web Worker suffice for the 2000-object parse, or is a chunked/streaming split needed? (measure against the reference fixture before ship)
6. Do LSDL `Agents` timestamps need updating when the tool writes the blob, and does stale metadata cause Power BI to regenerate synonyms? (until verified: preserve verbatim)

## 4. Scope / descope (PRD §9.1-9.2, agreed)

- **FR-26..29 (BYOK / AI drafting)** — deferred to v2 (first descope candidate; SM-C3 dilution risk).
- **FR-19..21 (lineage canvas)** — NON-OPTIONAL for v1 (user-confirmed; the draggable node canvas + dependency stream trace must ship).
- **Out of v1 scope (v2):** translation cultures beyond primary; in-tool diff preview; offline review round-trip; description template library + house-style; DAX reference rewriting on rename (warning only in v1); undo history beyond pending-changes discard.

## 5. Post-final-review bug wave (user-reported; all fixed + regression-tested, commit `921ee5b`)

### Root causes worth remembering (architecture lessons, not one-offs)
- **Worker dropped a field**: `parseLineage` returned `{edges, broken, errors}` without `visualMeta` — the parse→broker→store→dialog chain was otherwise correct. Any layer-shape change must re-check EVERY hop in the worker boundary (plain-data contract).
- **M step names**: Power Query mints `#"Changed Type"` quoted identifiers; bare `xyz`/`xyz_dsds` also legal. `M_STEP_LINE`/`M_STEP_REF` initially accepted neither — regexes now cover both plus `""` escapes.
- **Second-wave deletes**: minting a second `PBIPreAI_RemoveUnusedCols` binding is INVALID M (duplicate `let` names). The planner now extends its own existing step's list in place; suffixed fallback when the line can't be parsed. Corollary: line-span patches must re-emit the EOL (`byteEnd` includes the terminator).
- **Source-column delete = 3 layers**: TMDL block delete + M step + `in` re-key. Missing the TMDL block left a `sourceColumn:` the query no longer produces → Power BI load error. This gap existed from the first ship.
- **Table-delete cascades must share ONE rule**: `deletedIdsWithChildren` (domain/journal.ts) feeds BOTH `project()` (read-model fold) and the write planner's strand guard. Drift made the guard blind to children's dependents on table-only deletes (silent strand).
- **Calculated tables** (`partition … = calculated`): no M query exists — whole-table delete skips M surgery; deleting a column of a SURVIVING calculated table still refuses (dangling sourceColumn).
- **"Table-classified" ≠ `type === 'table'`**: fieldParameter + calculationGroup are separate ObjectTypes. Any parent/child index built on bare `'table'` silently excludes them (the usage containment roll-up had exactly this bug).
- **Used/Unused display contract**: table-classified rows show plain `Used`/`Unused` (the total is a boolean roll-up, "Used 1" misreads); fields show `Used N`. Shared predicate `isTableLikeType` in cellUtils — grid, AI schema, and lineage panel must agree.

### Hard guard added (Group B) — saves now BLOCK instead of corrupting
`planDeleteBlockers` refuses the save naming every blocker: surviving DAX refs (measure/calcColumn/calcItem), field-parameter wraps, calculated-table partition refs, DAX function bodies, relationship endpoints (non-`byId` non-`visual:` dependents = feeder rel nodes), and `sortByColumn`/`groupByColumn` lines from surviving blocks. Same-batch deletes never block (dying together strands nothing).

### Still WARNING-level (dialog names them; guard does not block — deliberate)
- RLS role filter expressions referencing deleted objects
- Hierarchy levels
- Report visuals (report-level breakage; "Breaks N downstream" in the delete dialog)
- `findMPartition` still plans on the FIRST partition only (multi-partition tables — inherited from 4.2)

### Open question added (Power BI Desktop verification)
7. Does Power BI Desktop's step consolidation preserve or rewrite our appended `PBIPreAI_RemoveUnusedCols` step on later manual query edits, and does the extend-in-place list survive re-save from Desktop? (until verified: assume the planner re-reads the file fresh each save, which it does)
