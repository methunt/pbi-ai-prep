# Task 2.4 Report — ObjectGraph (transitive Used count)

**Status:** COMPLETE. Commit `1883e70` ("feat: step 24b5") on `feat/pbi-ai-prep`.
**Files:** `src/domain/graph.ts` (created, 205 lines), `tests/unit/graph.test.ts` (created, 21 tests).
**Verification:** `npm test` → 61/61 passed (5 files), including the AD-1 pure-leaf guard. `npx tsc --noEmit -p tsconfig.app.json` → clean.

## 1. The ObjectGraph API (`src/domain/graph.ts`)

```ts
type EdgeKind = 'visual'|'measure'|'calcObject'|'calcItem'|'fieldParam'|'function'|'relationship'
interface Edge        { from: string; to: string; kind: EdgeKind }   // from = dependent, to = depended-on
interface BrokenEdge  { from: string; to: string; kind: EdgeKind }
interface Usage       { direct: number; transitive: number; leaf: number; total: number }
interface Isolation   { inPath: Set<string>; offPath: Set<string> }
interface ObjectGraph {
  usage(id): Usage
  dependents(id): Set<string>          // raw 1-hop view (read-only)
  isolateTo(id): Isolation             // memoized (read-only)
  readonly broken: readonly BrokenEdge[]
}
buildGraph(objects: ModelObject[], edges: readonly Edge[] = []): ObjectGraph
```

`edges` defaults to `[]` so the pinned gate call shape `buildGraph(objects)` (tests/gates/usage.gate.ts, Task 8.2 wiring) compiles unchanged while feeders pass edges (Task 3.4 PBIR, Task 3.2/3.3 TMDL/relationship feeders).

**Purity (AD-1/AD-4):** imports only `ModelObject` (type) from `./objects` and `buildNameIndex`/`resolveName` from `./identity`. No parse/write/fs/state/ui/worker/ai imports, no browser globals; `objects` and `edges` are never mutated; the graph is immutable after construction (usage/isolateTo memoized on that basis).

## 2. Computation semantics

**Adjacency.** One pass over edges builds: reverse index `consumers: to → Set<from>` (the usage walk), forward index `dependencies: from → Set<to>` (the isolateTo dependency walk), `visualFroms: to → Set<from>` restricted to `kind === 'visual'` (the FR-7 leaf set), the node universe `nodes` (model object ids + resolved edge endpoints), and `broken`. Duplicate edges collapse via the Set buckets.

**Endpoint resolution — one shared resolver (AD-6).** For each endpoint string: (1) known object id wins (readers provide id-keyed edges); (2) otherwise `resolveName(index, raw)` — case-insensitive, table-qualified forms supported, ambiguous bare names return `undefined` (no guessing); (3) unresolved ⇒ **broken**, attributed to its source, never an edge, never silently dropped. *Exception (feeder-minted nodes):* the `from` of a `visual` or `relationship` edge is a PBIR/TMDL-minted node id that is **not** a ModelObject (`ObjectType` has no kind for either), so an unresolved `from` there is a legitimate node, not a broken ref. Because a visual edge's target must resolve to a model object, the excluded **visual→visual pairing (AD-6) can never become an edge** — it lands in `broken` defensively.

**`usage(id)` — union semantics.**
- `direct` = distinct 1-hop in-edge consumers (`consumers(id)` minus the subject — a self-loop never makes a node its own dependent).
- `transitive` = BFS over `consumers` with a visited set seeded by `id` (cycles terminate; each node enters once), minus the direct set — so a consumer reachable at both 1 hop and ≥2 hops counts as direct only.
- `leaf` = `visualFroms(id)` — **direct visual-kind in-edges only** (FR-7 "distinctly from visual usage"). Always a subset of `direct`.
- `total` = `| direct ∪ transitive ∪ leaf |` — computed as a literal Set union, never the sum. Structurally leaf ⊆ direct and transitive ∩ direct = ∅, so `total = |direct| + |transitive|`; the pinned error mode is the sum `direct+transitive+leaf` double-counting leaf.

**`dependents(id)`** = raw 1-hop reverse-adjacency view (a self-loop lists the subject; `usage` applies the "subject is never its own consumer" rule on top — both documented).

**`isolateTo(id)` — canvas dimming (FR-20 / UJ-3).** `inPath = {id} ∪ transitive dependents ∪ transitive dependencies` (both BFS walks, visited-guarded); `offPath = nodes \ inPath`. Both cones are required by the PRD: UJ-3 clicks a *column* and "one relationship, two measures, four visuals" stay lit (consumer cone), while FR-20 *selects a visual* and "traces back to the model objects feeding it" (dependency cone). The partition is disjoint and covers every node including visual/relationship edge-only nodes.

**Journal/deletion (AD-4/AD-6/FR-33).** The engine is built over the pristine model only; journal records never touch it and wave-cascade deletion is a derived subgraph view downstream (pending deletes filtered at the wave/action layer), never a mutation here.

## 3. TDD evidence

**RED** — tests written first, implementation absent:

```
$ npm test
Error: Cannot find module '../../src/domain/graph' imported from D:/AI/pbi-ai-prep/tests/unit/graph.test.ts
```

**GREEN** — after `src/domain/graph.ts`:

```
$ npm test
 Test Files  5 passed (5)
      Tests  60 passed (60)
```

Two real defects were caught between RED and GREEN (TDD doing its job):
1. **BFS seeding bug:** `cone` initialized the frontier from `adj.get(start)` without marking those nodes visited, dropping the 1-hop ring from every cone. `usage.transitive` was *accidentally* still correct (it excludes 1-hop by definition), but `isolateTo` lost all direct neighbors — 3 isolateTo tests failed with `m-1` missing from `inPath`. Fixed by enqueue-with-visit seeding.
2. **Relationship sources misclassified as broken:** the first draft extended the "unresolved `from` is a node" grace only to `kind === 'visual'`. The relationship test failed (`usage(col-a).direct 0`); since `ObjectType` has no relationship kind, relationship ids are edge-only nodes exactly like visuals — generalized to `mintedSource`.

A follow-up typecheck caught `buildGraph(objects: readonly ModelObject[])` clashing with `buildNameIndex(objects: ModelObject[])`; signature aligned to `ModelObject[]` (Task 2.3's file untouched). A final test ("selecting a column keeps a relationship dependent on-path (UJ-3)") was added pinning the combined relationship + isolateTo + union behavior:

```
$ npm test
 Test Files  5 passed (5)
      Tests  61 passed (61)
```

## 4. The union-vs-sum tests (total = |union|, never the sum)

1. **Field-param wrap:** param P with edges `visual-1 → P` (visual) and `P → "Amount"` (fieldParam, name-resolved). `usage(P) = {direct: 1, transitive: 0, leaf: 1, total: 1}` — direct 1 + leaf 1 are the SAME consumer (`visual-1`); the sum would say 2. Also `usage(column) = {direct: 1, transitive: 1, total: 2}` (visual reached through the param).
2. **Visual bound to a column AND its measure:** edges `visual-1 → col` (visual), `m-1 → col` (measure), `visual-1 → m-1` (visual). `usage(col) = {direct: 2, transitive: 0, leaf: 1, total: 2}` — `visual-1` is 1-hop (direct + leaf) AND 2-hop (through `m-1`); union `{visual-1, m-1}` = 2 while direct+transitive+leaf would say 3. `usage(m-1) = {direct: 1, transitive: 0, leaf: 1, total: 1}` (same consumer direct and leaf).

## 5. Coverage of the required cases (all hand-computed)

| Case | Pinned counts |
|---|---|
| measure→column chain (single + two-hop) | col `{direct 1}`; two-hop col `{direct 1, transitive 1, total 2}` |
| hidden-measure chain (B hidden, A→B→C-col) | identical to visible chain — hidden is metadata the graph ignores |
| field-param NAMEOF wrap | param `{direct 1, leaf 1, total 1}`; column `{direct 1, transitive 1, total 2}` |
| relationship endpoints | both endpoint columns `{direct 1, total 1}` (consumer = the relationship id) |
| circular A→B→A | both `{direct 1, transitive 0, total 1}` — terminates, cycle counted once, subject never its own consumer |
| 3-cycle A→B→C→A | each `{direct 1, transitive 1, total 2}` |
| union ≠ sum | the two §4 cases |
| isolateTo partition | 5 tests: column/measure/visual selection, edgeless object, disjointness + unknown id |

Plus: id-keyed edges, bare + table-qualified name resolution, ambiguous bare name → broken (no guessing), unresolved ref → broken attributed to source, identical-edge dedupe, unknown-id zeros.

## 6. Self-review

- **Contract conformance:** every name in the task brief exists with the pinned shape; `edges` optional to keep the pinned gate call `buildGraph(objects)` valid.
- **Gate-fixture cross-check:** my semantics reproduce the fixture's shapes — e.g. the field param entry `{direct 1, transitive 0, leaf 1, total 1}` is exactly my union case (leaf ⊆ direct, counted once), and `{direct 1, transitive 1, leaf 0, total 2}` matches a column reached by a measure with a visual above it. Actual gate run waits on Task 3.2 (tmdl-reader) + Task 8.2.
- **AD-1 guard:** green in the same suite run; graph.ts adds only domain-internal imports.
- **Consistency choice worth recording:** `dependents()` is the raw 1-hop view while `usage().direct` excludes the subject for self-loops; both documented in-code. `isolateTo` returns memoized read-only sets (documented) to avoid per-render copies in the virtualised grid.

## 7. Concerns

1. **Relationship edge shape assumed column-level.** My ticket pins "a column that is a relationship fromColumn/toColumn is USED — direct 1 for the relationship", so edges are `{from: relationshipId, to: columnId}`. The AD-6 spine sentence says "table→table relationship"; if the Task 3.2 feeder instead emits table→table edges, the feeder (not the engine) changes — the engine is shape-agnostic. Flagging for Task 3.2's implementer.
2. **Ambiguity between "visual→visual excluded" and "broken" at engine level:** a visual edge whose target is a visual id and one whose target is a deleted column are indistinguishable without visual node registration; both land in `broken` (never silently counted), which satisfies AD-6 defensively. If Task 3.4 wants them reported differently, it owns that distinction at the feeder.
3. **Graph node universe includes feeder-minted ids** (visuals, relationships) that are not in `objects`; `isolateTo().offPath` covers them so canvas dimming is complete, but any future consumer that iterates `objects` as the node list will miss edge-only nodes.
