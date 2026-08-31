# Task 1.1 Report — Synthetic edge-case PBIP fixture

Commit: `0450a3e feat: step 8e70` (branch `feat/pbi-ai-prep`, 9 files, +190)
Reference fixture `_test_pbip_w_ai/` was only read, never modified.

## 1. Fixture tree

```
tests/fixtures/mock-model/
├── definition.pbism                      ← {"version": "4.0", "settings": {}}
├── expected-usage.json                   ← 16 lineageTag → {direct, transitive, leaf, total}
└── definition/
    ├── database.tmdl                     ← compatibilityLevel: 1702 (copied from reference)
    ├── model.tmdl                        ← model Model + 4 ref table lines
    ├── relationships.tmdl                ← 1 relationship (Sales.Region → Region.Region)
    └── tables/
        ├── Sales.tmdl                    ← table + 3 columns (1 calculated) + 3 measures
        ├── Region.tmdl                   ← table + 1 column (relationship target)
        ├── Field Slices.tmdl             ← field parameter, full real shape (4 plumbing columns + calculated partition)
        └── Time Calc.tmdl                ← calculation group + 1 calculation item
```

Layout note: this mirrors a real PBIP `.SemanticModel` folder (`definition.pbism` beside a `definition/` subfolder). Consumers should open the model at `tests/fixtures/mock-model/` and read TMDL under `definition/`. If downstream tasks assumed a flat layout, the fix is a one-line path change.

16 lineageTag-bearing objects total (4 tables, 8 columns, 3 measures, 1 calculation item) — above the "~10" target because a real field-parameter table mandates 4 plumbing columns and the 4-table minimum is binding. Every object serves a case or copies a reference convention.

## 2. Conventions copied from `_test_pbip_w_ai/Programmatic Insights - CI.SemanticModel/definition/`

- Tab indentation (verified: 0 space-indented lines in all 7 TMDL files), `///` doc comments above every declaration, table-level `annotation SummarizationSetBy = Automatic`, `isHidden` on its own line.
- Measure conventions from `Metrics.tmdl`: single-line `measure X = <dax>` and the triple-backtick multi-line DAX body (`Chain C` uses the ``` form, mirroring `Metrics!'Media Cost'`).
- Field-parameter conventions from `Field Metric.tmdl`: hidden table, identity/`Fields`/`Order`/`Name` columns, `sourceColumn: [Value1..3]`, `sortByColumn`, `relatedColumnDetails groupByColumn`, `extendedProperty ParameterMetadata = {"version":3,"kind":2}`, `partition = calculated` with `(name, NAMEOF(target), ordinal)` tuples, `annotation PBI_Id`.
- Relationship conventions from `relationships.tmdl`: `relationship <guid>` + `fromColumn:/toColumn:`.
- `ordinal: 1` on the calculation item (TOM `CalculationItem.Ordinal`).
- No project/company names anywhere; all names are generic (Sales, Region, Field Slices, Time Calc, Chain A/B/C).

## 3. Locked count semantics (for Task 2.4 `usage()` and the 8.2 gate)

`expected-usage.json` was hand-computed under these rules; the recomputation script in §6 implements exactly them.

- **Node set**: every lineageTag-bearing object (tables, columns, measures, calculation items). The `calculationGroup` object itself has no lineageTag (TOM `CalculationGroup` has no Name/LineageTag) → no JSON entry.
- **Counted edges**:
  - DAX references in measure expressions (`[Measure]`, `'Table'[Column]`), calculated-column expressions, and calculation-item expressions → `direct` (1 hop) / `transitive` (≥2 hops, distinct objects with no direct edge).
  - Field-parameter `NAMEOF` wrap (param table → wrapped column) → **leaf** bucket on the wrapped column (visual-proxy edge; the visual binds the param, the param exposes the column).
  - Visual binding → **leaf** on the bound object. Encoded once: the visual binds `'Field Slices'` (param table), which is how case 2's param "still counts as used by the visual" even though report parsing does not exist yet.
- **Not counted** (structural, not usage): relationship `fromColumn/toColumn`, `sortByColumn`, `relatedColumnDetails groupByColumn`, `sourceColumn`, M partition code, `formatString`, annotations.
- `total = direct + transitive + leaf`. Used ⟺ total > 0; Unused ⟺ zero downstream ⟹ total 0.
- Broken reference (`NAMEOF('Sales'[Deleted Column])`, target object absent): attributed to the field parameter; the broken target has no lineageTag so it has **no key** in the JSON (the "undefined/0" of the brief). The param's own count is unaffected.
- Table objects carry `{0,0,0,0}` by construction: usage edges bind at column/measure granularity; table rows exist so the gate can key every lineageTag.

## 4. The five edge cases → encoding

1. **Orphaned calculation group** — `'Time Calc'.calculationGroup` with item `No Calc = SELECTEDMEASURE()` (references no columns/measures) → item `total 0`.
2. **Field parameter wrapping a deleted column** — `'Field Slices'` partition row `("Deleted", NAMEOF('Sales'[Deleted Column]), 1)`; the column object does not exist → broken ref attributed to the param; the param keeps `leaf 1` (visual binding) → `total 1`; the broken target has no JSON key.
3. **Hidden-measure transitive chain** — `Chain A = [Chain B]`, `Chain B = [Chain A] + [Chain C]` (isHidden), `Chain C = SUM(Sales[Amount])` (triple-backtick body). `Chain C` gets `transitive 1` via A (through B); `Sales[Amount]` gets `transitive 2` (B and A) despite B's `isHidden` — hiding does not block traversal.
4. **Visual bound only via a field parameter** — `("Region", NAMEOF(Sales[Region]), 0)` is the param's only live wrap; `Sales[Region]` = `{direct 0, transitive 0, leaf 1, total 1}` — used, not 0. Memo: the report-edge wiring lands in Task 3.4; until then the param's wrap edge **is** the visual binding stand-in, and the column's expected count reflects that field-parameter edge (leaf bucket).
5. **Circular DAX reference** — `Chain A → Chain B → Chain A` (B also → C, so the cycle feeds the chain). Both measures `total 1` (each other, direct, counted once); the recompute BFS marks visited nodes and terminates.

## 5. Full object → expected-count table

| Object (qualified name) | lineageTag | direct | transitive | leaf | total |
|---|---|---|---|---|---|
| table Sales | `4aa1fc9f-dac2-4236-9131-fff8085f4f0f` | 0 | 0 | 0 | 0 |
| Sales[Amount] | `6cd82fce-d18c-49c0-8df7-0abbbc7ae407` | 2 | 2 | 0 | **4** |
| Sales[Region] | `85397e8a-8ad4-48dc-aa7c-6c275ab3a11e` | 0 | 0 | 1 | **1** (case 4) |
| Sales[Amount Doubled] (calc col) | `8cbf77b5-c1ee-4e12-b03d-7ca158b1c96d` | 0 | 0 | 0 | 0 |
| measure Chain A | `323953cf-dc3b-487f-b86f-fcb7d88c5d00` | 1 | 0 | 0 | **1** (case 5) |
| measure Chain B (hidden) | `4b186f1d-6de8-4cb1-9b08-40b2fc043611` | 1 | 0 | 0 | **1** (cases 3+5) |
| measure Chain C | `c482f4ec-ff3e-4a79-9209-7fc40425721a` | 1 | 1 | 0 | **2** (case 3) |
| table Region | `906e15ec-223e-4074-bd2a-491a2afe83a5` | 0 | 0 | 0 | 0 |
| Region[Region] | `e53c09ce-73bf-4e06-bae9-310a967f11a2` | 0 | 0 | 0 | 0 (relationship not counted) |
| table 'Field Slices' | `0917c069-c173-407a-9732-21ec0b326313` | 0 | 0 | 1 | **1** (case 2) |
| 'Field Slices'[Field Slices] | `bb4ee2c0-ff65-41d9-a715-03828b3a2b14` | 1 | 0 | 0 | 1 (via `Name` calc col) |
| 'Field Slices'[Field Slices Fields] | `d5667c9a-4530-4731-a3f1-857281847bfb` | 0 | 0 | 0 | 0 |
| 'Field Slices'[Field Slices Order] | `7b209786-5d35-472e-a739-dd1224531366` | 0 | 0 | 0 | 0 |
| 'Field Slices'[Name] (calc col) | `3dc8daa4-20c4-4671-847c-5bdde7a7510b` | 0 | 0 | 0 | 0 |
| table 'Time Calc' | `b4d7bf83-d6a1-4dad-8607-c23083e1faea` | 0 | 0 | 0 | 0 |
| calculationItem 'No Calc' | `da86d8ed-40a4-4df9-8c87-ab170a74628b` | 0 | 0 | 0 | **0** (case 1) |

Dependency edge inventory (6 DAX + 2 param wraps): AmountDoubled→Amount, ChainC→Amount, ChainB→ChainA, ChainB→ChainC, ChainA→ChainB, Name→FS[Field Slices]; param→Sales[Region] (leaf), param→Sales['Deleted Column'] (broken).

## 6. Verification performed

- **pbism**: `JSON.parse` → `version: "4.0"`, major ≥ 4 ✓. (Per the official microsoft/json-schemas `definitionProperties/1.0.0` schema, pbism allows only `$schema`/`version`/`settings` — there is no `compatibilityLevel` field in pbism; the TOM compatibility level lives in `database.tmdl` as `compatibilityLevel: 1702` (≥ 1470 required by calc groups; 1702 copied from the reference). The "compatibilityLevel >= 4" acceptance is satisfied by the pbism format version 4.x, which per MS docs is exactly the version that enables TMDL storage.)
- **TMDL text validity spot-check** (throwaway script, not committed, no unit tests per constraint): every file non-empty, LF-only, zero space-indentation lines, balanced triple-backtick blocks, all 16 lineageTags well-formed GUIDs and globally unique, 1:1 coverage between TMDL lineageTags and `expected-usage.json` keys, and `direct + transitive + leaf == total` for all 16 entries. All passed.
- **Self-review (independent recompute)**: a second throwaway script re-extracted the 6 DAX edges + 2 NAMEOF wraps directly from the committed TMDL text, rebuilt the graph, BFS-computed direct/transitive/leaf under the §3 semantics (cycle-safe visited set), and diffed all 16 rows against the JSON — **16/16 match**; exactly 1 broken ref (`Sales[Deleted Column]`) detected and excluded. The first recompute run flagged 1 mismatch that was a bug in the checker (param table id registered after the scan; wrap edges not leaf-classed), not in the fixture — fixed and re-run to a clean pass.

## 7. Concerns / rulings needed downstream

1. **`lineageTag` on `calculationItem` is a deliberate TOM deviation.** TOM v19.x `CalculationGroup`/`CalculationItem` expose no `LineageTag` property (verified against current MS docs), so Desktop would not serialize one and strict deserialization would reject it. It is required here so the gate can key the calc item by id per the task contract. If Task 3.2's reader turns out strict, the fallback is 2.3's name→id surrogate for this one object.
2. **`calculationGroup` is serialized nameless** (`calculationGroup` + `precedence`), since TOM's CalculationGroup has no Name. The reference fixture contains no calc group to copy from; shape derived from TOM structure. Worth a glance in Task 3.2.
3. **Leaf-bucket anticipation**: `expected-usage.json` encodes the two report-layer edges (visual→param; param→Region as leaf) before Task 3.4 wires real visuals. The 8.2 gate must run after 3.4 (or 2.4 must class param wraps as leaf from the start) or these two rows will mismatch. This is the documented intent of the brief's case-4 memo.
4. **Layout**: `definition.pbism` + `definition/` subfolder (real PBIP `.SemanticModel` shape). Flag to any consumer that assumed a flat `mock-model/*.tmdl` layout.
5. **Git autocrlf**: index stores LF; on a fresh checkout Windows may materialize CRLF. The future TMDL reader should be CRLF-tolerant (one-line `\r?` handling).
6. **Table rows are all-zero by construction** (usage binds at column/measure granularity). If the PRD wants tables to inherit column usage, that is a 2.4 semantic decision — the JSON currently does not do it.

---

## 8. Fix Round 1 (Main ruling) — unified bucket convention + PBIR report artifact

Main ruled 3 Important defects fixed with a binding single convention: `direct` = immediate in-edges of every kind (measure→obj, calcObject→source, calcItem→DAX, fieldParam→NAMEOF column, function→body, table→table relationship, visual→object); `transitive` = reachable through those; `leaf` = terminal dependents; `total` = |direct ∪ transitive ∪ leaf| (union — buckets may overlap). The original §3 semantics (param wrap → leaf; relationships uncounted; tables all-zero) are **superseded** by this section.

### 8.1 Changes

1. **Region[Region]** (`e53c09ce-…`): the relationship in-edge now counts (FR-7: relationship-key columns are used) → `{direct:1, transitive:0, leaf:0, total:1}`.
2. **Sales[Region]** (`85397e8a-…`): relationship fromColumn in-edge (direct) + field-param wrap as a direct in-edge + visual transitive through the param → `{direct:2, transitive:1, leaf:0, total:3}`.
3. **Report artifact added (PBIR 2.x)** — the fixture now explicitly HAS a report:
   - `definition/version.json` — versionMetadata 1.0.0 schema, `"version": "2.0.0"`.
   - `definition/pages/page1/visuals/visual1/visual.json` — visualContainer 2.0.0 schema; one `tableEx` visual whose `queryState.Values` has one projection + one `fieldParameters` entry, both referencing Entity `Field Slices` / Property `Field Slices` (shapes grounded against microsoft/json-schemas `fabric/item/report/definition/{versionMetadata,visualContainer,semanticQuery}/…`).
   - Layout note: in a real PBIP these live in a sibling `<Name>.Report/definition/`; kept under `mock-model/definition/` at Main's explicitly specified paths.
   - FR-7's no-report→unavailable rule is untouched elsewhere: this is the fixture's only report surface.

### 8.2 Param-binding attribution (for Task 3.4's reader)

PBIR `Entity`/`Property` textually names the param table's identity column, but the graph attributes the visual's binding edge to the **param table object** (the field parameter as a model entity — the node that carries the NAMEOF wrap edges). This is what makes Main's mandated path real: visual → param table → Sales[Region] (param direct, visual transitive). A PBIR projection is recognized as a field-parameter binding by the `fieldParameters` entry (`parameterExpr`) in the ProjectionState. The recompute first attributed the edge to the identity column and produced 4 mismatches — the corrected attribution yields 16/16.

### 8.3 Corrected object → expected-count table (all 16 rows)

| Object | lineageTag | direct | transitive | leaf | total |
|---|---|---|---|---|---|
| table Sales | `4aa1fc9f-…5f4f0f` | 0 | 0 | 0 | 0 |
| Sales[Amount] | `6cd82fce-…7ae407` | 2 (Chain C, Amount Doubled) | 2 (Chain B, Chain A) | 0 | **4** |
| Sales[Region] | `85397e8a-…5ab3a11e` | 2 (relationship, param wrap) | 1 (visual via param) | 0 | **3** |
| Sales[Amount Doubled] | `8cbf77b5-…1c96d` | 0 | 0 | 0 | 0 |
| measure Chain A | `323953cf-…d88c5d00` | 1 (Chain B) | 0 | 0 | **1** |
| measure Chain B (hidden) | `4b186f1d-…c043611` | 1 (Chain A) | 0 | 0 | **1** |
| measure Chain C | `c482f4ec-…425721a` | 1 (Chain B) | 1 (Chain A) | 0 | **2** |
| table Region | `906e15ec-…afe83a5` | 0 | 0 | 0 | 0 |
| Region[Region] | `e53c09ce-…67f11a2` | 1 (relationship) | 0 | 0 | **1** |
| table 'Field Slices' | `0917c069-…2631313` | 1 (visual) | 0 | 1 (visual, terminal) | **1** |
| 'Field Slices'[Field Slices] | `bb4ee2c0-…3a2b14` | 1 (Name calc col) | 0 | 0 | 1 |
| 'Field Slices'[Field Slices Fields] | `d5667c9a-…847bfb` | 0 | 0 | 0 | 0 |
| 'Field Slices'[Field Slices Order] | `7b209786-…531366` | 0 | 0 | 0 | 0 |
| 'Field Slices'[Name] | `3dc8daa4-…7510b` | 0 | 0 | 0 | 0 |
| table 'Time Calc' | `b4d7bf83-…e1faea` | 0 | 0 | 0 | 0 |
| calculationItem 'No Calc' | `da86d8ed-…74628b` | 0 | 0 | 0 | **0** (case 1) |

Edge inventory (12 committed, 1 broken excluded): 6 DAX, 2 relationship (from+to columns), 2 param NAMEOF wraps (1 live → Sales[Region], 1 broken → Sales['Deleted Column'], keyless), 2 visual binding records (projection + fieldParameters, same edge, deduped).

### 8.4 Recompute evidence (fix round)

Independent re-extraction from the committed files (TMDL + relationships.tmdl + visual.json), BFS over the unified graph, `total` as union: **16/16 rows match** `expected-usage.json`; exactly 1 broken ref (`Sales[Deleted Column]`, keyless, attributed to the param). `total = |direct ∪ transitive ∪ leaf|` verified per row (the param row's `direct 1 + leaf 1` intentionally double-counts the same visual; total 1).

### 8.5 Residual interpretation note (for Task 2.4 confirmation)

`leaf` is implemented as **visual dependents landing at 1 hop** (direct visual bindings — the FR-7 "distinct from visual usage" bucket); Main's mandate 3 enumeration ("the visual transitively" for the wrapped column) excludes 2-hop visuals from leaf, and a leaf-only relationship was never eligible. If 2.4 instead reads "leaf = ANY terminal dependent", the only row that changes is Sales[Region] (`leaf 0→1`, total stays 3 via union). Flagged for Main to pin in the 2.4 contract.
