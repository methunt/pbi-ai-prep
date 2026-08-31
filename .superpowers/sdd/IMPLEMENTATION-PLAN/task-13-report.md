# Task 3.4 Report — PBIR reader (field usage → edges)

Status: DONE. Commit `859963b` (`feat: step 9d2f`) on `feat/pbi-ai-prep`.

## Files changed

- **Created** `src/parse/pbir-reader.ts` — adapted from `.superpowers/sdd/IMPLEMENTATION-PLAN/borrowed-visual-parser.js` (attribution header kept verbatim; MIT notice travels with the file). Pure (AD-3): no fs, no browser. Imports: `buildNameIndex`/`resolveName` + `NameIndex` type from `../domain/identity`, `Edge`/`EdgeKind` types from `../domain/graph`, `ModelObject` type from `../domain/objects`.
- **Created** `tests/unit/pbir-reader.test.ts` — 15 tests, TDD (RED: module-not-found before the implementation existed; GREEN after).
- **Edited** `tests/gates/usage.gate.ts` — filled the marked Task 3.4 wiring point: the gate now feeds `parseReport(visuals, objects)` visual edges alongside the TMDL reader's relationship edges into `buildGraph`, and reads `visual.json` fixture files in the same walk.

## Signature deviation (deliberate, load-bearing)

The brief sketched `parseReport(reportFiles)`. Resolution demands the model: every binding must resolve through the ONE shared resolver (AD-6), which is impossible without the objects. Final signature:

```ts
export function parseReport(reportFiles: Map<string, string> | null, objects: ModelObject[]): ReportParse | null
```

`objects` is the same pristine `ModelObject[]` the TMDL reader produced (the reader builds its `NameIndex` via `buildNameIndex` — no per-feeder mapping, per AD-6). `reportFiles` paths may be definition-rooted or report-rooted; the walker matches `pages/*/visuals/*/visual.json` anywhere in the (backslash-normalized) key.

## ReportParse shape

```ts
export interface VisualBinding {
  visualId: string            // feeder-minted node id — the edge's `from`
  field: string               // underlying model path, e.g. Sales[Region], 'Field Slices'[Field Slices]
  objectId?: string           // resolved model object id; absent exactly when broken
  broken: boolean             // true → attributed to its visual, never an edge
  displayName?: string        // visual-local caption; display metadata ONLY, never a resolution key
  viaParameter?: boolean      // true → binding came from fieldParameters/parameterExpr (param-table attribution)
}
export interface ReportParse {
  visualEdges: VisualBinding[]          // one entry per unique (visual, field) binding, resolved or broken
  edges: Edge[]                         // resolved bindings as { from: visualId, to: objectId, kind: 'visual' }
  broken: { visual: string; field: string }[]   // refs that resolved to nothing, attributed to their visual
  errors: { file: string; message: string }[]   // visual.json files that failed JSON.parse; visual skipped, never silently dropped
}
```

`visualEdges` keeps broken entries in place (with `broken: true`) so the binding list is complete; `broken` is the filtered view consumers should render; `edges` is ready to feed `buildGraph` as-is.

**Visual node id**: `visual:` + the visual.json `name` (stable across canvas edits), else `visual:` + the container path when `name` is absent. The `visual:` prefix keeps feeder-minted ids out of the lineageTag/surrogate-GUID namespace that model object ids live in (a visual `name` and a lineageTag are both GUIDs — unprefixed, they could collide; buildGraph's endpoint resolution would then misread a visual node as a known object).

## How the visual JSON is walked (ported from the borrowed parser, reduced to edges)

Per visual.json, extraction surfaces in order (dedup by `kind|table|name` key, first-write-wins — the borrowed `fieldMap` semantics; `queryState` runs first so a param binding wins over later restatements of the same identity column in sort/filter surfaces):

1. **queryState** (`visual.query.queryState`, tolerating a top-level `queryState`): each well (Values/Rows/…):
   - If the well carries `fieldParameters[]` → record ONLY the `parameterExpr` bindings (`viaParameter: true`) and skip the well's `projections` — the projections merely restate the identity column the parameterExpr points at. One binding, one edge (see attribution rule).
   - Otherwise → each projection's `field` (`Column` / `Measure` / `Hierarchy` with `Expression.SourceRef.Entity` + `Property`/`Hierarchy`).
2. **sortDefinition** (`visual.query.sortDefinition.sort[].field`) and **filterConfig** (top-level in schema 2.x, tolerated at `visual.filterConfig` — verified against the real `_test_pbip_w_ai` tableEx tooltip visual): both share the `{ field }` shape and reuse the projection extractor.
3. **Deep search** over `visual.objects` and `visual.visualContainerObjects` (conditional formatting, dynamic text): any `Column|Measure` expression node at any depth (cap 40 — a measure inside dynamic text sits ~14 levels down), with `From`-alias tracking (`Source: "m"` resolves through the nearest enclosing `From` list; aliases shadow outer scopes; arrays recurse element-wise).

Projection `displayName` is surfaced verbatim on the binding (present even when PBIR writes it with authored spacing) — per the parent ruling, it is NEVER passed to the resolver; resolution keys exclusively on the underlying Entity/Property model path.

## Param-table attribution rule (the load-bearing adaptation)

The fixture's visual.json binds Entity `"Field Slices"`, Property `"Field Slices"` — the param **identity column** textually. Attributing that ref via `resolveName(index, 'Field Slices', 'Field Slices')` would land the edge on the identity column and the visual would never reach the wrapped column (`Sales[Region]`) transitively.

Implementation:

- A well with `fieldParameters` records its `parameterExpr` binding with `viaParameter: true`; the parameterExpr's `SourceRef.Entity` names the param TABLE (its `Property` is the identity column restatement).
- `resolveParamTable(index, entity)` resolves the table through the shared index's `byType` map (the sanctioned type-aware path for type-aware feeders — `NameIndex.byType` exists precisely "for type-aware feeders"): kinds `table` + `fieldParameter` with an EMPTY parent table. Exactly one candidate → its id; zero or >1 → `undefined` (broken, never guessed — a bare-name lookup would be ambiguous with the identity column, which shares the table's name by PBIR convention).
- The emitted edge is `{ from: <visualId>, to: <paramTableId>, kind: 'visual' }`; the binding records `field: "'Field Slices'[Field Slices]"` (as authored) and `viaParameter: true`.

Chain: visual→paramTable (this reader) + paramTable→wrapped column (TMDL NAMEOF `fieldParam` feeder) ⇒ the wrapped column counts the visual transitively, the param table's `leaf` counts the visual (expected-usage rows `0917c069…` and `85397e8a…`).

## Broken-ref handling

A ref that resolves to nothing (or a param table lookup with zero/ambiguous candidates): `broken: true`, `objectId` absent, pushed to `broken: { visual, field }` — attributed to its visual (FR-7), never silently dropped, never fed to buildGraph as an edge (the reader already knows; buildGraph's own `broken` stays reserved for name-endpoint resolution it performs itself). A visual.json that fails `JSON.parse` lands in `errors: { file, message }` and the visual is skipped — the failure is visible, never thrown past the reader.

## No Report folder → unavailable (FR-7)

`parseReport(null, …)` and `parseReport(new Map(), …)` return **null** — usage renders *unavailable*, not zero. A non-empty map yields a ReportParse even when it contains no `visual.json` (available, zero bindings) — the map is the caller's declaration that a Report folder exists; distinguishing "report without visuals" from "no report" is the caller's job, and the reader's null is reserved for absent report content.

## TDD evidence

- RED: `npx vitest run tests/unit/pbir-reader.test.ts` before implementation → `Failed to resolve import "../../src/parse/pbir-reader"` (1 file failed, no tests).
- GREEN: after implementation → `Test Files 1 passed (1)`, `Tests 15 passed (15)`.
- Mid-run fix (RED→GREEN iteration): the `byType` param-table lookup initially built its key without lowercasing the kind part (`fieldParameter` vs the index's canonical `fieldparameter`) — the fixture binding came back broken and the exact-equality tests caught it; fixed by lowercasing at lookup. A second test bug (the path-derived-id test reused the `name: 'v-1'` helper) was caught in the same run and the test now builds a nameless visual.json.
- Typecheck: `npx tsc --noEmit -p tsconfig.app.json` clean (one real error caught and fixed mid-run: the alias-scope `Map.set` on a `ReadonlyMap`-typed local — restructured to build a fresh mutable map, then assign to the `ReadonlyMap`-typed `scope`).

## Test results (tests/unit/pbir-reader.test.ts, 15/15 green)

- **Unavailable (FR-7)**: null map → null; empty map → null (NOT `[]`); non-empty map without visual.json → available, zero bindings.
- **Shared-resolver resolution**: queryState column binding → `Sales[Region]` resolves to the Region column id, edge `{ from: 'visual:v-1', to: <regionId>, kind: 'visual' }`; measure binding → `Sales[Chain C]`; table names quote only when non-word characters are present.
- **displayName ruling**: a projection renamed to `'Region Label'` still resolves to the real Region column id; `displayName: 'Region Label'` surfaces on the binding; the edge lands on the model object, never the alias.
- **Broken refs (FR-7)**: `'Sales'[Ghost]` → broken binding + `broken: [{ visual, field: 'Sales[Ghost]' }]`, zero edges; mixed good/broken in one visual → only the resolved ref becomes an edge; the same field projected twice dedups to one binding.
- **Param-table attribution (load-bearing, committed fixture)**: single binding `"'Field Slices'[Field Slices]"` → `objectId === paramTable.id` (`0917c069-…`), `not.toBe(identityColumn.id)` (`bb4ee2c0-…`), `viaParameter: true`, `broken: []`.
- **Transitive reach (case 4)**: with the simulated Task-3.2 fieldParam edge (see concerns), `dependents(paramTable)` ∋ the visual node; `dependents(region)` ∋ the param table; `usage(paramTable)` and `usage(region)` equal their `expected-usage.json` rows exactly; `dependents(identityColumn)` does NOT contain the visual node — proof the visual edge never landed on the identity column.
- **Real PBIR shapes**: filterConfig read from the visual-container top level (trimmed from the real `_test_pbip_w_ai` tableEx tooltip visual, schema 2.9.0, entities mapped onto the fixture model) alongside queryState; From-alias conditional-formatting deep search resolves `Source: 'm'` → `Sales[Chain A]`; missing `name` → path-derived `visual:definition/pages/p1/visuals/visual9`; malformed JSON → `errors` entry, no throw.

## Gate wiring (tests/gates/usage.gate.ts)

The gate now walks the fixture tree once (TMDL + visual.json), builds the graph with `[...tmdlEdges, ...(report?.edges ?? [])]`, and asserts all 16 expected-usage rows. **The gate is still RED** — on rows owned by a pending feeder, not on this task's rows (details in concerns). Wiring is in place so those rows resolve green when that feeder lands; no further gate change required.

## Self-review

- All name→id resolution goes through `buildNameIndex` + `resolveName` (+ the `byType` type-aware lookup) — no per-feeder mapping (AD-6). The param lookup is a type-scoped read of the SAME shared index, documented in-code.
- Edge direction and shape match the graph contract: `from` = feeder-minted visual node (buildGraph's `mintedSource` rule treats it as a legitimate node), `to` = resolved model object id, `kind: 'visual'`.
- Borrowed-parser behaviors kept: multi-surface extraction, dedup, alias shadowing, depth cap with the "guard not statement" comment. Behaviors deliberately dropped: the usage map/lookup API (replaced by edges), rename detection (`_renameOf` — superseded by surfacing `displayName` verbatim per the parent ruling), `fpSelections` (selection index is not usage).
- Deterministic output: input paths sorted; wells/bodies in authored order; dedup first-write-wins with queryState processed before sort/filter surfaces.

## Concerns

1. **The usage gate stays red on rows owned by a missing feeder, not on this task.** My context said "the paramTable→column edge already comes from the TMDL fieldParam NAMEOF (Task 3.2)" — in the current code, `parseTmdlProject` emits ONLY relationship edges: `readFieldParameter`/`readFieldParameterItems` parse the NAMEOF items but their edges are never emitted; measure-DAX (`measure`) and calculated-column (`calcObject`) reference edges do not exist anywhere either. The gate fails today on `6cd82fce` (Sales[Amount]: expected direct 2 via a measure + the `Amount Doubled` calc column) and the Chain-A/B/C + identity-column rows — all DAX-reference rows. Per the assignment's "simulate" wording, my transitive test feeds the `fieldParam` edge itself (`{ from: paramTable.id, to: region.id, kind: 'fieldParam' }`) with an in-test comment naming it as the Task 3.2 feeder simulation; exact-row assertions for the param table and Region pass with it. **The pending DAX-reference feeder task must emit `fieldParam` edges from the already-parsed NAMEOF items (plus `measure`/`calcObject` DAX edges); with those + this wiring, the gate reaches 16/16.** I did not touch `tmdl-reader.ts` — outside my task and owned elsewhere.
2. **Param precedence under dedup**: first-write-wins means a param binding (queryState, processed first) wins over a later restatement of the same identity column in sort/filter surfaces. If a future real shape binds the identity column genuinely-independent in an earlier well than the parameterExpr, the param attribution would shadow it — accepted (matches borrowed semantics; no known producer).
3. **`Aggregation` projections** (implicit measures like "Sum of Amount") are not extracted — the borrowed parser doesn't handle them either; kept at parity, noted as a fidelity cap for a later task.
4. **Signature deviation** documented above: `parseReport(reportFiles, objects)` — the one-arg sketch could not resolve refs through the shared resolver.
