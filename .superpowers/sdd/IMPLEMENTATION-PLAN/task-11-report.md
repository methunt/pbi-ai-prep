# Task 3.2 Report — TMDL reader (borrowed + optimized + gap-closure)

Commit: `cb6d422 feat: step 3141` (branch `feat/pbi-ai-prep`, 7 files, +1454)

## 1. What was ported, and how

`src/parse/tmdl-reader.ts` adapts `.superpowers/sdd/IMPLEMENTATION-PLAN/borrowed-tmdl-parser.js`
(pbip-documenter, MIT, Jihwan Kim) to TypeScript. The borrowed file's LICENSE +
attribution header is retained **verbatim** at the top of the ported file, followed
by a port note listing the deliberate changes.

Kept from the borrow:

- The line-by-line **state machine** for `tables/*.tmdl` (IDLE → TABLE_BODY /
  PROPERTIES / EXPRESSION), including all its load-bearing fixes: the
  separate fence open/close tracking, `partition X = calculated` read as a
  source type via `PARTITION_SOURCE_TYPES` (kept as a module-level `ReadonlySet`),
  `source =` opening an expression with or without a colon, bare-boolean flags
  (`isHidden`/`isNameInferred`/`isKey`/`isNullable` via a `Set`, not a regex),
  annotation/extendedProperty block skipping (`skipBlockIndent`),
  `PBI_ResultType` capture, and the `ParameterMetadata` marker read.
- `readFieldParameter` / `readFieldParameterItems` (the two-signal field
  parameter decision: ParameterMetadata marker column OR NAMEOF tuples in a
  calculated partition; 3- and 4-tuple widths; quoted/bare/table-less refs).
- `_extractName` / `_detectObjectType` / `_parseColumnRef` (dot-outside-quotes
  relationship endpoint splitting, both sides unquoted).
- The `_isAutoDate` / `_isCalcGroup` / `_isFieldParameter` tagging. In this port
  the tags are computed on the internal table record and drive classification:
  `_isFieldParameter` → the table object takes `type: 'fieldParameter'`
  (+ `isFieldParameter: true`); `_isCalcGroup` → the table object takes
  `type: 'calculationGroup'`; `_isAutoDate` stays a computed boolean on the
  internal record (no ModelObject carrier — see Concerns).

Not ported, deliberately (documented dead ends in this codebase):

- `DAXReferenceExtractor` + `extractAllReferences` — DAX-reference edge
  extraction is a separate feeder concern (graph wiring lands in Task 8.2);
  the class has no consumer in the reader and the borrowed source remains
  available for that task to port.
- `parseRole` internals (tablePermissions/filterExpression) — `roles/*.tmdl`
  declarations have no ObjectType and no consumer; role/expression files are
  instead *validated* (declaration name tokens checked through
  `locateNameToken`, so a malformed file still yields `ParseError`).
- `database.tmdl` / `model.tmdl` property extraction — no carrier; both are
  routed by the file index and tolerated as input.

## 2. Gap closures (the write path)

| Gap | Closure |
|---|---|
| `lineageTag` | Read on every declaration (colon property). Object `id` = lineageTag, else the surrogate — see §4. |
| `queryGroup` | Read from partitions; surfaced on the table object (`table.queryGroup`, last partition wins). Retained through `ModelObject.queryGroup`. |
| `perspective` membership | `perspectives/*.tmdl` parsed (`perspectiveTable` / `perspectiveColumn` / `perspectiveMeasure` / `perspectiveHierarchy`); membership attached to existing objects post-parse as `perspectiveMembership: string[]`. Matching is case-insensitive by (table, name) with kind filters; missing or ambiguous members are skipped, never guessed. A `perspectiveTable` naming an unknown table is ignored. |
| `changedProperty` | Read at object level (deeper than the declaration) and table level (a table-level marker may follow a partition block — the partition is still "open" there, so routing is by indent, not by what's open). Stored as `string[]`. **`ModelObject` grew an optional `changedProperty?: string[]`** — the plan's pinned interface had no carrier and the write path (4.2) needs the existing entries to update rather than duplicate them. Additive and optional; no consumer breaks. |
| `functions.tmdl` | New parser: `function <name> = ``` … ``` ` declarations → `daxFunction` objects (`table: ''`), lineageTag ids, descriptions, verbatim bodies (below). |
| Source byte spans | Every object carries `declarationSpan` (declaration line incl. terminator), `nameSpan` (token, quotes/brackets included), `docCommentSpan?` (`///` run immediately above at the same indentation, ending exactly at the declaration start) — all via `src/parse/spans.ts`, the single pinned emitter. |

Classification (FR-5 consequences):

- Column with an expression on the declaration (`column X = …`) →
  `calculatedColumn`, else `column`. A column carrying
  `extendedProperty ParameterMetadata` → `isFieldParameter: true` (the marker
  column keeps its column type).
- Table containing a `calculationGroup` block → the **table object** takes
  `type: 'calculationGroup'`; its `calculationItem` entries are separate
  objects (`calculationItem`, `dax`, `ordinal`). No separate object is minted
  for the nameless block — TOM serializes it nameless/lineage-less, and
  duplicating the entity would double the node. This reads FR-5's "a table
  containing a calculationGroup block is classified as a calculation group"
  literally, and it is why the spine's ObjectType note ("calculated tables are
  `table`") exists as the *exception*: calc-group and field-parameter tables DO
  take their special kinds.
- A field-parameter table (per `readFieldParameter`) takes `type:
  'fieldParameter'`, `isFieldParameter: true`, `table: ''` — it is the param
  entity that carries the NAMEOF wrap edges (Task 1.1 §8.2) and the visual
  binding target (Task 3.4's contract).

Verbatim triple-backtick bodies: `dax` for fenced measures, calculated columns,
calc items, and functions is the **exact source lines between the fences**
(fences excluded, terminators normalized to `\n`, final terminator omitted —
tabs/blank lines preserved byte-for-byte; the fixture asserts `'\t\t(v:expr) =>
v * 2'` and the multi-line `fx_pick` body exactly). Unfenced multi-line bodies
(M partition `source`) keep the borrowed common-indentation cleanup.

**Port fix (kept deliberately, documented in the header):** the borrowed parser
assigned `expressionIndent = indent + 1` but tested the continuation with
`indent > baseIndent`, so every property line after a same-line or fenced
expression was swallowed into the expression — on a real model,
`formatString`/`isHidden`/`lineageTag` after `measure X = SUM(...)` were all
lost (verified by running the borrowed file on a probe: `isHidden: false`,
`formatString: null`). The port tests `indent > expressionIndent`, which ends
the expression exactly at the first property line and completes the borrowed
author's evident intent. A closing fence also ends the expression, so
post-fence properties parse normally.

## 3. Exported interface

```ts
export interface ParseError { file: string; line: number | null; message: string }
export interface TmdlParseResult {
  objects: ModelObject[]
  edges: Edge[]          // relationship edges, §5
  brokenEdges: BrokenEdge[]  // endpoints the reader's resolver pass could not resolve
  errors: ParseError[]
}
export function parseTmdlProject(files: Map<string, string>): TmdlParseResult
```

`parseTmdlProject` is the authoritative plan name (Task 1.2's carry note). The
gates destructure `{ objects, errors }` — extra fields are additive. Input keys
may be definition-rooted (`tables/Sales.tmdl`) or project-rooted
(`X.SemanticModel/definition/tables/Sales.tmdl`); `ModelObject.file` and
`ParseError.file` are the **caller's original key verbatim** (POSIX), so the
write path patches the file the caller handed over.

## 4. Spans and id minting

- Spans: per object, `locateDeclaration(text, line)` → `locateDocComment(text,
  declarationSpan.start)` → `locateNameToken(text, line)` from the Task 3.1
  emitter (its 0-based line indexing matches the scanner's). A malformed
  declaration (e.g. an unterminated quoted name) throws inside the emitter —
  caught per object and reported as `ParseError{file, line: <declaration
  line>}`, so the error names the *declaration's* line, not EOF.
- Ids: `pending.properties.lineageTag ?? spanDerive(file, declarationSpan)` —
  the SINGLE `spanDerive` helper (`src/domain/span.ts`); no hand-built
  `file#span` anywhere in the reader. Relationship node ids (§5) are minted
  the same way.
- AD-2 note: `declarationSpan` is the declaration *line* (the pinned emitter's
  contract), so surrogate ids survive property edits elsewhere in the block.

## 5. Relationship edges

Per relationship in `relationships.tmdl`, the reader emits **two** edges — one
per endpoint column:

```
{ from: <relationship node id>, to: <fromColumn id>, kind: 'relationship' }
{ from: <relationship node id>, to: <toColumn id>, kind: 'relationship' }
```

- The `from` id is **feeder-minted** via `spanDerive(file, relationship
  declaration span)` — exactly the "TMDL relationships are feeder-minted node
  ids that are not model objects" rule buildGraph's ingestion documents
  (`mintedSource` exception). 
- Endpoints resolve through the ONE shared resolver (AD-6): `resolveName(
  buildNameIndex(objects), columnRef, tableHint)` — table-qualified, so the
  ambiguous-bare-name rule cannot misfire. Both endpoint columns receive the
  in-edge, which is the shape that reproduces `expected-usage.json` 16/16
  (Task 1.1 §8.3: Sales[Region] `direct 2 (relationship, param wrap)` AND
  Region[Region] `direct 1` — a single fromColumn→toColumn edge cannot produce
  both). The dispatch context phrased this as "{from,to}=column ids"; the
  load-bearing part is *column-level endpoints*, and the committed fixture
  contract pins the both-endpoints-receive-in-edges behavior. Flagged in
  Concerns for Main to confirm.
- An endpoint that resolves to nothing is emitted as a resolved-by-name attempt
  (`to: 'Table[Column]'` — a form buildGraph's resolver parses) and mirrored in
  `brokenEdges`; buildGraph independently attributes it as broken. A missing
  endpoint is **not** a ParseError (the file parsed fine; the fixture gate
  requires `errors.length === 0`).

## 6. Optimizations (FR-8)

- **ONE prefix-bucketed file index**: a single pass over the input `Map`
  classifies every path into `tables/functions/relationships/perspectives/
  expressions/roles` buckets (path normalized past the last `definition/`
  segment), replacing the borrowed `Object.keys(files).filter(startsWith)`
  full rescans. No bucket is scanned twice.
- **Single offset-tracked line scan**: `scanLines` walks the text with a
  running position (`indexOf('\n')`), yielding content/trimmed/indent/line —
  no materialized line array, CRLF stripped exactly like spans.ts's line table
  (a lone `\r` stays content). Line indices align with `split('\n')` so span
  locators agree.
- **No regex on the hot path**: property lines dispatch via
  `startsWith`/`includes`/`charCodeAt` and `Set` lookups. The three remaining
  regexes run only on rare lines (the anchored expression-opener fallback for
  non-canonical spacing, the ParameterMetadata marker, the NAMEOF tuple
  pattern per partition body — the latter ported verbatim).
- **Measured**: 2,000 synthetic objects (250 tables × 8 objects, all surrogate
  ids — the heaviest path, every object minting spans) parse in **~114 ms**
  median (5-run sample; test asserts < 2000 ms). The real read-only reference
  model (`_test_pbip_w_ai`, 40 TMDL files, 216 objects: 28 tables, 118 columns,
  55 measures, 4 field parameters, 2 daxFunctions, 2 hierarchies + 5 levels)
  parses in **~103 ms** with 0 errors, 0 broken edges, 196/216 objects carrying
  a docCommentSpan (the other 20 legitimately follow no `///` lines; every
  object has declaration + name-token spans), 44 relationship edges, 85
  perspective memberships, 76 changedProperty entries on 75 objects (one
  table-level marker lists two properties), 24 queryGroups, and the
  `fx_reportingmonth` body byte-identical to the file.

  Reproducibility note: timings vary by machine and load (the original run
  reported 42.4 ms / 25 ms; the review round measured ~114 ms / ~103 ms median
  on the same workstation under different load). Both are far inside the FR-8
  folder→grid budget; the order of magnitude is what matters.

  Budget framing: the **main-thread ≤50 ms block budget (FR-8) is satisfied by
  the AD-7 parsing-worker offload (Task 6.2), not by this synchronous reader**.
  The synchronous parse time above is a worker-side metric; the main thread
  only receives the plain domain result over postMessage.

## 7. TDD evidence

- **RED**: `tests/unit/tmdl-reader.test.ts` written first (22 tests);
  `npx vitest run tests/unit/tmdl-reader.test.ts` → `1 failed (module-not-found
  on ../../src/parse/tmdl-reader)`, `no tests` run.
- **GREEN**: after implementation → `22 passed (22)`.
- Full unit suite (scoped, no project-wide run): `npx vitest run tests/unit`
  → **7 files, 103 tests, all passing** (spans, span, identity, journal,
  graph, ad1-guard untouched and green after the `objects.ts` extension).
- `npx tsc -b` clean.
- The committed gates stay red by design until Phase 4 / 3.4 / 8.2 land
  (`fidelity.gate` imports the not-yet-written write modules; `usage.gate`
  feeds `buildGraph` without DAX/visual edges). The reader now satisfies both
  gates' `parseTmdlProject` call shape and the fixture parses with
  `errors.length === 0` as they require.

## 8. Fixture changes (committed)

- `definition/functions.tmdl` (new) — two DAX functions with `///` doc
  comments, lineageTags, triple-backtick bodies (one single-line, one
  multi-line with blank-line structure).
- `definition/perspectives/Fixture.tmdl` (new) — one perspective including the
  Sales table, Sales[Amount], measure 'Chain A', the Region table, and a
  `perspectiveTable Ghost` (unknown-table tolerance).
- `tables/Sales.tmdl` — `queryGroup: Fact` on the partition; `changedProperty =
  IsHidden` under measure 'Chain B' (real-shape: `Advertiser.tmdl`).
- `tables/Field Slices.tmdl` — table-level `changedProperty = Name` after the
  partition block (real-shape: `Calendar.tmdl`).
- `src/domain/objects.ts` — `ModelObject.changedProperty?: string[]` (only
  domain change; additive, optional).

## 9. Self-review notes

- Initial fixture edit misapplied against a stale line snapshot (measure
  declaration clobbered, duplicate `mode` line) — caught immediately, re-read,
  repaired before any test ran against it; final file verified byte-level.
- Two defects found and fixed during GREEN: the table object initially carried
  its own name as `table` (broke (table,name) resolution → Region[Region]
  unresolved); the inline opening fence was pushed into the verbatim body
  (`dax` started with '```'). Both now covered by the tests that caught them.
- The TUPLE regex was restructured with a literal `(` preserved and group
  indices re-checked against the borrow (m[1] caption … m[6] group).
- `readFieldParameter`'s marker/tuple logic and `parseColumnRef` are ported
  verbatim; field-parameter item data itself has no ModelObject carrier (the
  plan's interface has none) — the boolean tag is what survives; wrap edges
  are a later feeder's concern (8.2/3.4 recompute from the table's partition
  text via their own pass).

## 10. Concerns / rulings needed downstream

1. **Relationship edge `from` is the feeder-minted relationship node id, not
   the fromColumn id.** The dispatch context said "({from,to}=column ids)";
   the committed `expected-usage.json` + buildGraph's minted-source rule
   require in-edges on BOTH endpoint columns, which only the
   rel-node→column-pair shape produces. If Main wants strict single-edge
   `{from: fromColumnId, to: toColumnId}`, Sales[Region]'s expected `direct 2`
   row cannot be reproduced — please confirm before 8.2 wires the gate.
2. **`ModelObject.changedProperty?: string[]` added** (plan interface had no
   carrier; FR-5 requires retention). Consumers that spread ModelObject
   literally are unaffected (optional field).
3. **`_isAutoDate` stays internal** (name-prefix detection kept; no
   ModelObject carrier). If the grid (Task 6) needs to filter
   `LocalDateTable_*`/`DateTableTemplate_*` rows, either expose the tag or
   accept a trivial name-prefix check downstream. Same for `_isCalcGroup`
   (derivable from a `calculationGroup`-typed table's existence).
4. **Expressions/roles emit no objects** — no ObjectType exists for them
   (vocabulary is pinned); their declarations are validated so malformed files
   still surface ParseErrors. If FR-5's "one object per declaration" is later
   read to include M expressions, the ObjectType union must grow first.
5. **Descriptions are stored uncapped** — FIDELITY_CAPS.description (500) is a
   display/formatting concern; the reader preserves source bytes so writes
   round-trip (AD-9 capping belongs to the presentation layer).
6. **Unfenced multi-line expressions opened by a bare `=`** (e.g. `measure X =`
   newline body at exactly one level deeper) would end early under the
   expressionIndent rule; Desktop always fences multi-line DAX, and M
   `source =`/`expression =` bodies sit two levels deeper, so no known
   producer hits this. Same limitation existed in the borrow (worse).
7. **Known borrowed-parser limitation kept**: `extractName` does not unescape
   doubled quotes (`'It''s'` → name `It`), matching the borrow; spans locate
   the token correctly either way, and no known PBIP producer writes doubled
   quotes in names.

## 11. Files changed

- `src/parse/tmdl-reader.ts` (new, 1080 lines) — the reader.
- `tests/unit/tmdl-reader.test.ts` (new, 341 lines) — 22 tests.
- `src/domain/objects.ts` — `changedProperty?: string[]`.
- `tests/fixtures/mock-model/definition/functions.tmdl` (new).
- `tests/fixtures/mock-model/definition/perspectives/Fixture.tmdl` (new).
- `tests/fixtures/mock-model/definition/tables/Sales.tmdl` — queryGroup +
  changedProperty.
- `tests/fixtures/mock-model/definition/tables/Field Slices.tmdl` — table-level
  changedProperty.

---

# Fix round 2 — model edges (AD-6 feeders)

Commit: `5ebeab6 feat: step 7f3a` (2 files, +265/−10: `src/parse/tmdl-reader.ts`, `tests/unit/tmdl-reader.test.ts`)

## What was added

`parseTmdlProject` now emits ALL model edges (same function, same `{objects, edges, brokenEdges, errors}` return):

| Kind | From → To | Source text |
|---|---|---|
| `measure` | measure object → referenced measure/column | the measure's DAX body (`object.dax`) |
| `calcObject` | calculatedColumn object (or calculated-table object) → referenced object | the calculated column's DAX / the calculated partition's `source` |
| `calcItem` | calculationItem object → referenced object | the item's `expression` |
| `fieldParam` | fieldParameter table object → wrapped column | the NAMEOF tuples in the parameter's calculated partition body |
| `function` | daxFunction object → referenced object | the function's triple-backtick body |

## How references are extracted and resolved

- **Extraction** ports the borrowed `DAXReferenceExtractor` faithfully:
  `_cleanDAX` (block comments, `//` comments, `"…"` string literals stripped so
  bracket refs inside literals are not extracted), `_extractMeasureRefs` (bare
  `[Name]`, with the lookbehind + prefix checks so `'T'[C]` / `T[C]` / `.C`
  forms are not double-counted) and `_extractColumnRefs` (`'Table'[Column]` /
  `Table[Column]`, deduped per (table,column)). `_extractTableRefs` is not
  ported — tables are not graph nodes, edges bind at column/measure
  granularity (AD-6, Task 1.1 edge inventory).
- **Resolution** through the ONE shared resolver (AD-6): qualified refs via
  `resolveName(index, column, table)`, bare refs via `resolveName(index, name)`
  — an ambiguous bare name stays unresolved rather than guessing (pinned
  resolver behavior).
- **Unresolved** references are NOT dropped: the edge is emitted with the raw
  reference as `to` (`[Name]` / `Table[Name]` — forms buildGraph's resolver
  parses) and mirrored in `brokenEdges`, so the broken reference is attributed
  to its source object, and buildGraph independently lands it in `graph.broken`.
  (Not `errors`: a missing reference is not a parse failure, and the fixture
  gates require `errors.length === 0`.)
- **Dedupe**: a `Set` over `from \u0000 to \u0000 kind` — identical references
  within one expression emit one edge.
- **Field parameter vs calculated table**: a field-parameter table's calculated
  partition body feeds `fieldParam` edges ONLY (the NAMEOF wrap semantics);
  a non-parameter table's calculated partition feeds `calcObject` from the
  table object. Seeds are collected during table emission (`EdgeSeeds`:
  paramTables/calcTables) and consumed in the edge phase after the full name
  index exists.

## Verification

- **Fixture edge inventory** (10 edges) — exactly Task 1.1 §8.3 minus the 2
  visual edges owned by Task 3.4: 4 `measure` (ChainA→ChainB, ChainB→ChainA,
  ChainB→ChainC, ChainC→Amount), 2 `calcObject` (Amount Doubled→Amount,
  Name→FS[Field Slices]), 2 `fieldParam` (param→Sales[Region] live,
  param→Sales[Deleted Column] broken), 2 `relationship`. `calcItem` 'No Calc'
  correctly emits none (SELECTEDMEASURE() references nothing — case 1).
- **Usage gate is now GREEN** (`npm run gates`: usage ✓): the gate (rewired by
  Task 3.4's sibling, commit `859963b`) feeds `parseTmdlProject(files).edges` +
  PBIR visual edges into `buildGraph` and all 16 rows of
  `expected-usage.json` match. The fidelity gate remains red on
  `src/write/patch-engine` / `write-planner` (Task 4.x scope, pre-existing).
- **New tests** (`tests/unit/tmdl-reader.test.ts`, 30 total): measure edges
  from fixture DAX; calcObject edges; calcItem behavior (orphaned item emits
  none); fieldParam live + broken; function edge (synthetic function
  referencing a column); unresolvable bare + qualified refs attributed broken
  and confirmed through `buildGraph.broken`; dedupe of a repeated reference;
  and a direct `buildGraph(objects, edges)` check that all non-visual rows of
  `expected-usage.json` reproduce.
- **Validation**: `npx tsc -b` clean; `npm test` → 9 files, 141/141 green
  (includes the concurrently-landed 3.3/3.4 sibling suites); `npm run build` ✓;
  `npm run lint` ✓; `npm run gates` → usage ✓ / fidelity ✗ (pre-existing,
  Task 4.x modules not yet written).
