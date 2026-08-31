# SDD ledger — plan: _bmad-output/planning-artifacts/plans/plan-pbi-ai-prep-2026-08-30/IMPLEMENTATION-PLAN.md

## Pre-flight scan

### Task-pair / interface conflicts
- 3.2 (TMDL reader) ↔ 2.1 (ModelObject/span types): 3.2 produces `ModelObject[]` with `declarationSpan`/`docCommentSpan`/`nameSpan`; 2.1 defines those exactly (half-open `Span {start,end}`). No conflict.
- 3.3 (LSDL reader) ↔ 3.2 (TMDL reader): 3.3 builds a binding index `objectId → {file, span, state}`; 3.2 mints `id` via the shared span-derivation helper and a `name→id` resolver (2.3). Consistent — both consume `ModelObject.id` = `lineageTag`/surrogate.
- 4.1 patch-engine ↔ 4.2 write-planner: 4.1 defines `Patch {start,end,replacement}` half-open, descending, overlap-reject. 4.2 produces patches that contract. No conflict.
- 4.2 write-planner ↔ 3.2 spans: 4.2 patches the `name-token`/doc-comment spans 3.2 emits. The added "Step 2" of 3.2 (optimization) does not change span semantics.
- 1.1 fixture ↔ 2.4 graph / 8.2 gate: fixture's `expected-usage.json` uses `{direct, transitive, leaf, total}`; 2.4 `usage()` returns exactly that shape. Consistent.
- 0.3 test harness ↔ all unit tasks: `npm test` (vitest node) is the run target named in every unit task. Consistent.
- 0.2 palette ↔ 7.x UI: theme tokens named in 0.2 (blue/sky/cyan/emerald/amber/slate) are the exact set the DESIGN.md contract uses. No conflict.

### Self-consistency per task
- 0.1: `npm create vite@latest . -- --template react-ts` against a repo that ALREADY has `.gitignore` + `_bmad-output`. `npm create vite` on a non-empty dir prompts to overwrite/ignore. Ruling needed at execution: run scaffold into a temp dir then copy, or accept the prompt. (See Ruling below.)
- 0.2: theme.css uses `@theme` + `localStorage`. Consistent with AD-9/FR-36 (no `prefers-color-scheme`).
- 3.2 Step 1 (port tmdl-parser.js) — the borrowed parser is JS, plan targets TS. Porting is a plan expectation. OK.
- Global Constraints vs 0.3: no-restricted-imports patterns listed `../parse/*` etc. — these are relative to `domain/`. Fine.

### Ruling (pre-flight, Task 0.1)
- `npm create vite@latest .` on the existing repo dir: the repo root already contains tracked files (`.gitignore`, `_bmad-output/`). The Vite scaffolder will refuse/prompt. Decision: scaffold into a sibling temp dir (`npm create vite@latest tmp-scaffold`), move the scaffolded files (`package.json`, `index.html`, `src/`, `vite.config.ts`, `tsconfig*.json`, `.gitignore` merge, `public/`) into the repo root, then delete the temp dir. Cost if wrong: stray files if a file name collides (mitigated by moving explicitly). Keeps tracked specs untouched.

### Ruling (harness constraint)
- The `task` subagent tool exposes no `model` field; agent classes are fixed (`task`/`scout`/`designer`/`security-reviewer`/`librarian`/`sonic`). Model tiering is therefore by agent class: implementers + reviewers use `task` (general-purpose floor); read-only scouts use `scout`. Cost if wrong: reviewers use the most-general model for small diffs (slower than a cheap tier, but correct). Noted for the final review.

## Task 0.1
- Task 0.1: complete (commits 1eec122..0020824, review clean)
- Task 0.1: minor (deferred): .env.d.ts not picked up by tsconfig includes — harmless today; move to src/.env.d.ts if env augmentation added later.
- Task 0.1: minor (deferred): eslint.config.js lints **/*.{js,mjs,cjs} only, no .ts/.tsx — TS gate is `tsc -b`; typescript-eslint is a new dep (not in whitelist).
- Task 0.1: minor (deferred): demo App.tsx uses absolute `/icons.svg#...` public-asset refs in JS — 404 on a GH Pages subpath; dies when the demo UI is replaced.

## Task 0.2
- Task 0.2: fix round 1/5 (1 addressed, 0 open — color-scheme ordering; commits dc38257..16861cf)
- Task 0.2: complete (commits 0020824..16861cf, review clean)
- Task 0.2: minor (deferred): unguarded localStorage at src/main.tsx:9 + src/ui/theme.ts:10 could throw in privacy-hardened browsers (module-scope throw boots). Harden when real App shell lands (Task 7.1).
- Task 0.2: minor (deferred): unlayered body base rule in theme.css beats future body-level utilities — move into @layer base if ever needed.
- Task 0.2: minor (deferred): public/favicon.svg hardcodes #2563eb (favicons can't read CSS vars) — palette-change checklist item.
- Task 0.2: accepted: dark border hsl(217 33% 18%) is a reasonable blue-slate derivation; accent tokens mode-invariant by inheritance is fine (locked palette).

## Task 0.3
- Task 0.3: complete (commits 16861cf..a9fb830, review clean)
- Task 0.3: minor (deferred): ad1-guard.test.ts blind to template-literal/line-wrapped dynamic import specifiers (real but rare shapes; 99% case covered).
- Task 0.3: minor (deferred): ad1-guard.test.ts doesn't match `node:`-prefixed builtins (asymmetric with bare fs) — node builtin in domain fails the browser build anyway.
- Task 0.3: minor (deferred): comment-stripper can false-positive on trailing prose after a block-comment closer (errs strict).
- Task 0.3: minor (deferred): walk scans only `.ts`, not `.tsx` (domain is pure logic by architecture; .tsx is itself a breach).
- Task 0.3: minor (deferred): vitest `passWithNoTests: true` now dead config (moot at head).
- Task 0.3: accepted: vitest.config.ts added to tsconfig.node.json include (canonical; necessary).

## Cross-task contract (carry into dispatches) — from Task 1.1
- Task 2.4 (ObjectGraph): pin `leaf` semantics — implementer used "leaf = direct visual bindings" (FR-7 'distinctly from visual usage'); if leaf = "any terminal dependent", Sales[Region] leaf 0→1 but total stays 3. Fix ONE convention and match the fixture.
- Task 3.4 (PBIR reader): the fixture's visual.json names the param IDENTITY column textually; the reader must attribute the visual binding edge to the param TABLE (via fieldParameters/parameterExpr) so the visual reaches the wrapped column transitively. Recompute (without this) mismatched 4 rows.

## Task 1.1
- Task 1.1: complete (commits a9fb830..ca74971, review clean after 1 fix round; 16/16 count-consistent rows)
- Task 1.1: minor (deferred): stale Region.tmdl:1/:5 and Sales.tmdl:14 comments still assert pre-fix semantics (relationship not counted) — contradict corrected counts now; touch up in a follow-up. Non-blocking.
- Task 1.1: note: fixture uses merged `definition/pages/` (no sibling `.Report/`); acceptable for the contracted readers (TMDL reads .tmdl; PBIR reader keys on visual.json). If an end-to-end FR-2 Report-folder discovery test ever runs on it, it'd find no Report folder — note for final review.
- Task 1.1: refined contract note (carry to Task 2.4): `graph.usage(id)` total = SIZE OF UNION of distinct consumers, NOT (direct+transitive+leaf) additive — a fixture row {direct:1, transitive:0, leaf:1, total:1} is only consistent if total is union-size. Pin `leaf` = direct visual bindings (FR-7 'distinctly from visual usage').

## Cross-task contract (carry) — from Task 1.2
- Task 3.2 must export `parseTmdlProject(files) -> {objects, errors}`; the usage gate imports THIS exact name (the brief sketch used `parseTmdl` informally; the plan's Task 3.2 signature is authoritative).
- Task 3.4 (PBIR reader) must feed visual edges into `buildGraph(objects, edges)` so the usage gate's case-4 leaf counts resolve; without them those rows fail by design until 3.4.
- Task 8.1 repoints the fidelity gate's MODEL_DIR to `_test_pbip_w_ai` (the reference model).

## Cross-task contract (carry) — from Task 1.2 review
- Task 4.2: `planWrites(model, journal, layers)` must return a `Map<file, { patches: Patch[] }>` — the fidelity gate reads `.patches` (reject a different field name; the zero-patch / byte-identity assertions would vacuously pass otherwise).
- Task 3.2: export `parseTmdlProject` (authoritative plan name).

## Task 1.2
- Task 1.2: complete (commits ca74971..04d4569, review clean after 1 fix round)
- Task 1.2: minor (deferred): run-gates.mjs spawnSync without timeout (a hung gate hangs npm run gates) — add timeout when CI gates on this.

## Task 2.1
- Task 2.1: complete (commits 04d4569..677570c, review clean)
- Task 2.1: minor (deferred): span.test.ts template mirrors encodeURIComponent (tautological for escape) — add a literal full-id assertion for the plain-ASCII case.
- Task 2.1: minor (deferred): FIDELITY_CAPS untested (object literal; one-line toEqual later).
- Cross-task (carry to reader tasks): spanDerive is the SINGLE id-minting helper; readers MUST reuse it (never hand-build `file#byte-span`). Enforce in reader dispatches; consider extending the ad1-guard test to reject `${...}#${...}` id templates outside src/domain/span.ts (AD-2 double-key prevention).

## Task 2.2
- Task 2.2: complete (commits 677570c..ad9901b, review clean)
- Task 2.2: minor (deferred): report-prose count inaccuracies (journal actually 11 tests + 2 guard; report says 10/3) — report-only, no code change.
- Task 2.2: minor (deferred): two documented journal edge behaviors untested (journalAdd unknown objectId → old undefined; project drops edits for absent objectId) — add one-line tests or consciously accept.

## Task 2.3
- Task 2.3: complete (commits ad9901b..6bc48f2, review clean)
- Task 2.3: minor (deferred): re-indent stray closing brace at src/domain/identity.ts:77 (cosmetic).
- Task 2.3: minor (deferred): quoted bare name with a literal dot splits at first dot in parseRef; no current feeder produces it (DAX quotes table names; dotted names parse correctly when a bracket follows).

## Task 2.4 (domain phase complete)
- Task 2.4: complete (commits 6bc48f2..1883e70, review clean)
- Task 2.4: minor (deferred): dependents()/isolateTo() return live internal Sets — consumers must treat as read-only (mutating desyncs memoized queries).
- Task 2.4: minor (deferred): edge-only nodes (visual/relationship endpoint ids not in objects) discoverable only via isolateTo offPath — note in 3.x handoff.
- Cross-task (carry to 3.x): the graph's `usage`/`isolateTo` node universe = objects ∪ edge endpoints; consumers must not iterate `objects` alone as the node list. Relationship edges are column-level ({from,to}=column endpoints); Task 3.2's feeder must emit that shape.

## Task 3.1
- Task 3.1: complete (commits 1883e70..13a779d, review clean after 1 fix round)
- Task 3.1: accepted: indentation guard is exact-string (tabs-vs-spaces mismatch rejected) — errs toward NOT capturing (safe for writes); scanBracketed ignores ']]' escaping (Minor, no current producer); locateNameToken admits non-declaration lines (reader owns classification).

## Task 3.2 (rulings)
- RULING (acceptability): relationship edges are emitted as `{from: <feeder-minted relNodelId>, to: <endpointColumnId>, kind:'relationship'}` — 2 edges per relationship (one per endpoint column). This is the only shape reproducing expected-usage.json 16/16 AND the graph's minted-source rule; the rel-node is an edge-only node the graph already covers via its node-universe note. Final count semantics firmed for Task 8.2.
- RULING (acceptability): `ModelObject` gained `changedProperty?: string[]` (additive, optional — for FR-5/FR-13 retention). Downstream consumers compile (no field removed); the plan's Task 2.1 interface was extended, not violated.

## Task 3.2 (final)
- Task 3.2: complete (commits 13a779d..cb6d422, code approved; report-corrected for FR-8 framing)
- RULING (FR-8): the ≤50ms main-thread budget is delivered by the AD-7 parsing worker (Task 6.2), not the sync reader; sync parse ~114ms for 2000 objects is a worker-side metric. Final performance gate = Task 8.3 (smoke, measured on the worker).
- minor (deferred): src/parse/tmdl-reader.ts header references a LICENSE file that doesn't exist — drop the MIT text into src/parse/LICENSE or inline the notice.
- minor (deferred): changedProperty under a partition Pending is silently dropped (no known producer hits it; fix in 4.2 if needed).
- minor (deferred): extractName doesn't unescape doubled quotes ('It''s' → name 'It') — inherited borrow limitation; no known PBIP producer.
- minor (deferred): buildFileIndex buckets on '/' paths; Windows backslash keys would silently miss all buckets — add a normalize (\\ → /).

## Task 3.3
- Task 3.3: complete (commits cb6d422..0732ded, review clean)
- Task 3.3: carry-to-4.2 note: LSDL binding-index `state` = entity top-level State (Visibility.State left on the entity) — if rename planning needs authored-ness, one-line swap.
- Task 3.3: carry-to-4.2 note: dangling binding span = whole LSDL block (not per-entity) — rename planning locating an exact binding would need position-tracking; fine for read-only/recompute, note for 4.2.
- Task 3.3: note: the real reference culture file is UNFENCED (JSON as direct indented expression); the reader supports both fenced and unfenced — fixtures use fences, real file is unfenced.

## Task 3.4
- Task 3.4: complete (commits 0732ded..859963b, review clean) — PBIR reader: displayName never used for resolution; param-table attribution via fieldParameters/parameterExpr; no-report -> null (unavailable); broken attributed to visual; visual edges feed buildGraph.
- Task 3.4: minor (deferred): dedup key uses '|' separator (legal in model names) — pathological table/col pairs could collapse; reuse NUL separator.
- Task 3.4: minor (deferred): a well with fieldParameters + genuine non-param projections drops the latter (continue skips all projections) — documented assumption.
- Task 3.4: minor (deferred): extractParameterExpr resolves with NO_ALIASES; From/Source aliasing silently skipped — borrowed-parser parity.

## Task 3.2 (final — model-edge emission)
- Task 3.2: complete (commits ..5ebeab6; usage gate GREEN 16/16; 141/141 tests; build+lint clean)
- Task 3.2: minor (deferred, inherited borrow): FN-1 `//` inside a DAX string literal eats to EOL (undercount only); FN-2 whitespace/newline between quoted table + bracket drops the ref (silent, low freq); FP-1 doubled single-quote table names `'It''s'[Amt]` → phantom broken edge + real ref lost (inherited). None produce a wrong RESOLVED edge.
- Cross-task (done): the write/ phase must now flip the FIDELITY gate green (it currently fails on missing src/write/patch-engine + write-planner).

## Task 4.1
- Task 4.1: complete (commits 5ebeab6..01db508, review clean)
- Task 4.1: minor (deferred, RECOMMENDED fix): patch-engine.ts:105 uses non-fatal TextDecoder — a caller bug that splits a multi-byte char silently yields U+FFFD ('éx' [1,2)→'Y' → '�Yx'). One line: `new TextDecoder('utf-8', {fatal:true})` to make it throw. Unreachable from a correct planner; address before the write path ships.

## Task 4.2
- Task 4.2: complete (commits 01db508..5becca5, review clean; fidelity gate GREEN 1/1)
- Task 4.2: minor (deferred): extractName returns bracketed tokens with brackets as obj.name → planRename no-op check can miss a same-logical-name rename (harmless no-op patch).
- Task 4.2: minor (deferred): findMPartition locates only the FIRST partition per file (multi-partition/incremental tables plan M step on first only) — documented; fixture is one-partition-per-file.
- Task 4.2: minor (deferred): no CRLF M-step / LSDL re-serialization test; unhide expected value is LF-specific (coverage gap; logic uses lineEol).

## Task 4.3
- Task 4.3: complete (commits 5becca5..88df392, review clean)
- Task 4.3: minor (deferred): dataTouchesFile BFS heuristic (40k budget) may miss deeply-nested file refs — tighten when report/lineage layer shapes land (8.x).
- Task 4.3: minor (deferred): applyRefresh guard requires non-empty patches for a brand-new file (priorText='') — orchestrator must pass [0,0,content]; documented.

## Write phase complete (4.1-4.3): fidelity gate GREEN

## Task 5.1
- Task 5.1: complete (commits 88df392..0b72c27, review clean after 1 fix round)
- Task 5.1: minor (deferred): recents keyed by basename — equal-basename folders collide (lossless cross-session restore needs a composite key). FSA exposes no path-unique key.
- Task 5.1: minor (deferred): isSensitiveRoot name-only best-effort (Windows-centric blocklist; nested non-listed subtrees allowed). Not a security hole — no path-escape exists; broaden the list if desired.

## Task 6.1
- Task 6.1: complete (commits 0b72c27..a7968be, review clean)
- Task 6.1: minor (deferred): project slice shape is {objectsById, objects, files, name}; brief sketched {tree, objectsById, files, originalTexts, spans} — reconcile the vocabulary before downstream surfaces (align brief or store) — carry to 7.x.
- Task 6.1: minor (deferred): setProject does NOT reset filters/selectedIds — a fresh project load keeps prior selection/filter/page; consider resetting to initial if a project should start clean.
- Task 6.1: minor (deferred): aiReach is a non-blank-DAX proxy until the LSDL include-set lands — label the KPI card with a caveat or land real compute before user-facing release.

## Task 6.2
- Task 6.2: complete (commits a7968be..12e8f6d, review clean)
- Task 6.2: minor (deferred): requestLayer returns Promise<unknown> — make it generic `<T>` for type-safety.
- Task 6.2: minor (deferred): the module-level inFlight map is never cleared on setProject — an in-flight parse can settle and commit an OLD project's data into the NEW project's layers. Clear inFlight + reset layers on a fresh project (cross-cutting with the 6.1 setProject-reset note).
- Task 6.2: minor (deferred): broker.test beforeEach resets only the store, not the inFlight map (fragile/order-dependent) — expose resetBroker() and call it.

## State phase complete (6.1-6.2)

## Task 7.1
- Task 7.1: (pending final — chrome.css merge in flight)
- Task 7.1: minor (deferred): ParseStepper 'Model objects' is a pseudo-layer — the store LayerName union has only lsdl/report/lineage; the 4th stage needs a Model-objects layer or bind to the primary load (carry to 7.2/store).
- Task 7.1: minor (deferred): requestPermission after await pickFolder() may lose transient activation (7.2 save orchestration must re-request from a direct user gesture).
- Task 7.1: minor (deferred): Unused KPI card uses the sky tone (no rose token in the locked palette) — acceptable.
- Task 7.1: minor (deferred): system fonts instead of the mockup's Outfit/Work Sans — add the font stack if visual fidelity to the mockup demands it.

## Task 7.1
- Task 7.1: complete (commits 12e8f6d..99861a4, review clean after 1 fix round; chrome.css merged into theme.css @layer components)

## Task 7.2
- Task 7.2: complete (commits 99861a4..812ec97, review clean after 2 fix rounds)
- Task 7.2: minor (deferred): aria-rowcount counts all page rows but virtual rows lack aria-rowindex — add aria-rowindex={vi.index+2} on each GridRow for correct grid ARIA.
- Task 7.2: minor (deferred): AD-11 'Space toggles focused row' only works on the focused checkbox, not a focused cell/row — add row-level Space handling.
- Task 7.2: minor (deferred): perf p95 17ms / worst ~22ms in the DEV build (above the 16ms floor) — production build is faster; re-measure in the production build at Task 8.3.
- Task 7.2: minor (deferred): free-text search matches the folded name for a pending rename (transient, self-resolves on apply/discard).

## Task 7.3
- Task 7.3: minor (deferred): AD-11 focus trap/restore incomplete in the dialogs (role/aria-modal/label/Escape/scrim/autofocus present; no trap/return) — hardened in 7.6.
- Task 7.3: minor (deferred): Title Case regex capitalizes after apostrophes/acronyms ("don't" → "Don'T") — naive Title Case, cosmetic.
- Task 7.3: minor (deferred): no explicit unit test for two co-selected objects BOTH transforming to the same destination (logic handles it; add a true-convergence regression test).
- Task 7.3: carry-to-7.4: SelectionContext/ActionBar re-keyed Include/Exclude-AI to field 'lsdlVisibility' (false=Visible/Include, true=Hidden/Exclude, State:'Authored') against the LSDL culture file. 7.4's AI-schema toggles should use the SAME field.

## Task 7.3
- Task 7.3: complete (commits 812ec97..f7934b7, review clean after 1 fix round)

## Task 7.4
- Task 7.4: complete (commits f7934b7..442e072, review clean after 1 fix round)
- Task 7.4: minor (deferred): InstructionsEditor draft useState(initial) captures initial once — won't refresh if lsdl.customInstructions/staged record changes after mount (low impact).
- Task 7.4: minor (deferred): overLimit red badge effectively unreachable via normal input (maxLength clamps before onChange) — defensive only.
- Task 7.4: minor (deferred): SchemaExplorer 'which depend/depends' grammar (both branches identical).

## Task 7.5
- Task 7.5: complete (commits 442e072..c3dba4c, review clean)
- Task 7.5: minor (deferred): ~1.9MB bundle from @xyflow/react+elkjs eagerly imported — lazy-load the Relationships tab.
- Task 7.5: minor (deferred): active/inactive rendered as on/off-path (parsed relationship has no isActive flag) — plumb Edge.isActive if exposed later.
- Task 7.5: minor (deferred): elk lays collapsed-size nodes → minor overlap on expand (cosmetic; drag/re-fit fixes).
- Task 7.5: minor (deferred): self-relationships (both endpoints same table) dropped by `a !== b` guard (invisible loop).

## Task 7.6
- Task 7.6: complete (commits c3dba4c..49027ee, review clean)
- Task 7.6: minor (deferred): AD-11 Shift+Tab-from-panel initial-focus edge escapes the focus trap ("mostly correct") — minor.
- Task 7.6: note: the mockup collapses the cascade into one confirm; FR-33's 'each round confirmed' wording is implemented iteratively (per-round confirm) — the literal spec reading.

## UI phase complete (7.1-7.6)

## Verification phase
- Task 8.1: complete (fidelity gate GREEN at HEAD 49027ee — npm run gates 2/2).
- Task 8.2: complete (usage gate GREEN 16/16 at HEAD 49027ee — npm run gates 2/2).

## Task 8.5
- Task 8.5: complete (commits 49027ee..b940df0, review clean)
- Task 8.5: minor (deferred): LICENSE `<copyright holder>` placeholder + inferred lineage-tracer copyright year/author — replace with the real holder + mirror the upstream LICENSE exactly BEFORE publish (project not published yet).

## Task 8.3
- Task 8.3: measured (commits none — no source change). PASS: folder→grid ~407ms (10x headroom), grid-scroll worst 13.9ms (virtualisation verified, 23 DOM rows/2000), filter ~33ms. 
- Task 8.3: LOAD-BEARING finding (must fix before final review): (1) the primary parseTmdlProject is SYNC (~97-273ms) and NOT a worker layer (worker covers only lsdl/report/lineage) → FR-8 main-thread block floor FAIL-latent; (2) the PROD load pipeline is UNWIRED — no production caller of parseTmdlProject/setProject, so the app can't load a model end-to-end. Fix: add an 'objects' worker layer + route folder→grid through the broker + wire the landing open-folder → parse → setProject pipeline.
- Task 8.3: minor (deferred): 1.94MB single JS chunk (elkjs) — lazy-load the 7.5 lineage tab to split.

## Task 8.3 (resolved by load-orchestration fix)
- Task 8.3: complete (perf floors PASS; the FR-8 parse-block + unwired-pipeline findings FIXED by commit a19a080 — worker 'objects' layer + production folder→grid wiring; review clean)
- Task 8.3: minor (deferred): 1.94MB single JS chunk (elkjs) — lazy-load the 7.5 lineage tab.
- Load-orchestration fix (a19a080): minor (deferred): src/fs/load.ts file reads are serial (async, non-blocking) — parallelize with Promise.all for large models.
- Load-orchestration fix: note: report/lineage lazy layers not auto-triggered on load — the Prep/Lineage tabs must call requestLayer('report'/'lineage') on mount; verify in the final review.

## Final review wave (DONE)
- FINAL whole-branch review: NOT-READY, 2 Critical (Save inert; LSDL/report layers untriggered) + 1 must-fix (fatal decode).
- FINAL fix wave (2e9f3f8): all 3 ADDRESSED (Save orchestrator wired; lazy-layer triggers; fatal decode). Gates 2/2, 253 tests, build+lint clean.
- FINAL re-review: all 3 findings ADDRESSED, NO new breakage in the fix diff.
- RESIDUAL (load-bearing, parked/surfaced to user): post-save span re-derivation on invalidated (null) spans uses last-known span, not a re-parse — a rename-then-rename SECOND save in the same session may mis-target. Adjudicated Important.
- RESIDUAL note: mergeReportEdges/applySaveCommit are monotone unions; applySaveCommit doesn't rebuild the base TMDL graph → post-save stale/dangling edges can linger in project.edges (low severity).

## Bug-fix wave (post-final-review, user-reported)
- FIX (cascade dialog raw ids): worker parseLineage dropped visualMeta → dialog showed visual:<hash> — forwarded + regression test.
- FIX (cascade density): 65 raw dependents → category buckets (Downstream Visuals/Measures/...) via summarizeDependents.
- FIX (delete dialog label): hardcoded placeholder → dynamic "Remove X" per round.
- FIX (AI schema duplicate table + dead synonyms): table self-row rendered as FieldRow + static synonym union → editable Synonyms line + include switch staging the whole group; Used/Unused pill.
- FIX (pending review never existed in real app): built PendingChangesDialog (per-row discard, Discard all, AI-schema rows); KPI card/chip entry points; modal exits hardened (scrim click + document Escape).
- FIX (stale pendingEdits after save): applySaveCommit set journal without recomputing kpi → recomputed.
- FIX (M #quoted steps): M_STEP_LINE/M_STEP_REF rejected #"Changed Type" (2 throw shapes) → both forms parsed; second-wave delete DUPLICATED the step binding (invalid M) → extend-in-place + suffixed fallback; line rewrite re-emits EOL; source-column TMDL block now also span-deleted (dangling sourceColumn would break Desktop load).
- FIX (calculated tables): partition = calculated threw "no M partition" on table+columns cascade → M surgery skipped when the table dies; surviving-table column delete still refuses.
- FIX (fold cascade): table delete left ghost children in the folded model → project() cascades via shared deletedIdsWithChildren.
- FIX (guard parity): table-only delete skipped children's dependents → guard uses the expanded set.
- NEW GUARD (Group B): save blocks on stranded DAX refs (measure/calcColumn/calcItem), field-parameter wraps, calculated-table partition refs, DAX functions, relationship endpoints, sortByColumn/groupByColumn from surviving blocks.
- FIX (usage roll-up): containment index missed fieldParameter/calculationGroup parents → param table "Unused" while fields "Used N" → TABLE_CLASSIFIED set; calculated tables were already fine (typed 'table').
- FIX (display): fieldParameter/calcGroup rows showed "Used N" → shared isTableLikeType predicate (grid + AI schema + lineage panel).
- FIX (dark mode): raw buttons inherited UA buttontext → explicit text-foreground.
- Verified in-browser via __pbiStore harness: toggle clicks never auto-open the pending modal; all exits work.
