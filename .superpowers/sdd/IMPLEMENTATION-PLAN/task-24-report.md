# Task 24 — 7.5 Relationships canvas + grid round-trip — Report

**Status: COMPLETE.** `npm run build` clean; `npm test` 243/243 pass; render smoke verified (canvas renders tables+edges, off-path dimming, side panel DAX/dependents, grid round-trip both directions, drag/pan/zoom/reset).

**Commit:** `c3dba4c feat: step 7e21`

## Canvas components (`src/ui/lineage/`)

- **`LineageCanvas.tsx`** — the Relationships surface. `<ReactFlowProvider>` wraps an inner component that builds the table graph, runs the elkjs auto-layout, and renders `<ReactFlow>` (pan/zoom/zoom-to-fit, node drag, `<Background>` dots, `<Controls>`). Top bar: "Back to Description & Update" (`setActiveTab('desc')`), a "Focused" chip, a "Reset view" button (`fitView`), and a "Table-level · upstream + downstream · drag any node" hint. Left = dotted canvas card, right = `<SidePanel>`.
- **`LineageNode.tsx`** — one table card. Collapsed by default (FR-19); the header toggles expansion (`data-expand-toggle`) to reveal the member objects. Each member row (`data-nodefocus`) selects/focuses an object. Reads `lineageFocusId` + `graph.isolateTo` from the store to compute `hot` (the focused object's table) and `dim` (off-path). Kind dot + pill (`t-slate` table / `t-cyan` calc group / `t-amber` field param / `t-blue` column etc.). Source handle on the right, target on the left (left→right stream).
- **`SidePanel.tsx`** — the focus inspector. "Selected" header (kind pill + `Used N`), Downstream list (direct / transitive / leaf + visuals with counts), Upstream list (rel key / transitive), the focused measure's DAX + the columns it references, its description, and a "Select & return to grid" footer button (FR-21). Names resolve through the folded model; non-model feeder-mints (visuals/relationships) render as `leaf`/rel chips.

## Node/edge wiring
- **Nodes = tables** (FR-19). `buildLineage` groups `project.objects` by parent table (a `table`/`calculationGroup`/`fieldParameter` object is its own group; other objects group under `obj.table`). `daxFunction`s are excluded (no parent table). Groups sorted by name; members sorted by name. Node id = `table:<name>`, `type: 'lineage'`.
- **Edges = table-level.** Relationship edges are grouped by the minted relationship id (`edge.from`) and joined by its two endpoint columns' tables → one edge between the two tables. Dependency edges (`measure`/`calcObject`/`calcItem`/`fieldParam`/`function`) are collapsed per table pair; a `from`/`to` that maps to no table (visual/rel mints, broken refs) is skipped. For display, the edge is drawn `depended-on (source, left) → dependent (target, right)`, matching the mockup's source-column → measure flow.
- **Distinct marks:** calc-group (`calculationGroup` → `t-cyan`) and field-param (`fieldParameter` → `t-amber`) table nodes are visibly distinct from ordinary tables (`t-slate`), per FR-19.

## Off-path dimming (FR-20)
`LinkageNode` reads `graph.isolateTo(focusId)`; a table is on-path when it (or any member object) is in `isolateTo.inPath`, hot when it contains the focused object, dim (`opacity: .32`) otherwise. Edges are styled via `edgeStyle`/`edgeMarker` — a table-pair edge is "active" (solid, primary/emerald + arrow) when both endpoint tables are on-path, else "inactive" (dashed, muted). No focus → everything lit. Verified: focusing `m1` dims 3 tables, hot = Media, member row highlighted, side panel shows the measure's `SUMX(…)`.

## Side panel content
Focus object + kind/used pill; downstream dependents (direct/transitive from `graph.dependents` BFS + visual/leaf count from `graph.usage().leaf`); upstream feeders (`isolateTo.inPath` minus the consumer cone, split into direct rel-keys vs transitive); DAX `<pre>` + the referenced columns; description. Clicking a downstream/upstream item re-focuses via `focusLineage`.

## Grid round-trip (FR-21)
- **Grid → canvas:** the grid row's lineage button (was `disabled`; now enabled) calls `store.openOnCanvas(id)` → sets `activeTab='rel'`, `lineageFocusId`, bumps `lineageFocusNonce`. Verified by clicking the real button (`tabAfter='rel'`, `focusAfter` set).
- **Canvas → grid:** the side panel's "Select & return to grid" calls `store.editOnGrid(id)` → sets `activeTab='desc'`, narrows `filters` (table filter for a column/measure, type filter for a table/group object, `page:1`), and sets `gridFocusId` (bumps `gridFocusNonce`). `ObjectGrid` reacts: pages to the row's page, `virtualizer.scrollToIndex`, and flashes it via a `.grid-row-flash` animation. Verified (tab/filter/gridFocus after `editOnGrid('m1')`).

## elkjs layout + node drag
`elkjs/lib/elk.bundled.js` (browser bundle; the package `main` needs the `web-worker` package, which isn't installed — the bundled build's default workerFactory uses its own bundled worker and never requires `web-worker`). `runElkLayout` runs `elk.layout` with `layered`/`RIGHT` layout options and estimated node dims (200×92), then `setNodes` the positioned nodes once per project. Thereafter ReactFlow owns positions: `nodesDraggable` (default) lets the user move any node; drag/pan/zoom are ReactFlow primitives (not rebuilt). `Reset view` calls `reactFlow.fitView`.

## Restore-view
The Relationships panel stays mounted (App.tsx hides panels, never unmounts them), so ReactFlow's node positions, viewport, and expansion persist across tab switches. `fitView` runs exactly once per project and only once the tab is visible (`didInitialFit` ref) — never re-fits on re-entry. Re-entering via a grid lineage action bumps the nonce and re-centres on the focus (the intended navigation), which also auto-expands the focused object's table.

## FR compliance map
- **FR-19:** tables as nodes; relationships as edges; pan/zoom/zoom-to-fit; calc-group + field-param tables marked distinct; active vs inactive relationships distinguished (lit+solid vs dashed+muted); table node expands to columns; collapsed by default; elkjs auto-layout then drag any node. ✔
- **FR-20:** select a column/object → `graph.isolateTo` dims everything off its path; dependents (measures/visuals/pages) listed with counts; selecting a visual traces back (side panel leaf/visual + upstream); side panel shows the selected measure's DAX and the columns it references. ✔
- **FR-21:** canvas object → 'edit' opens the grid filtered/scrolled to it; grid row 'View on canvas' switches to the canvas tab with that object selected + centred (store tab state + `selectedIds`/`lineageFocusId` + a `setCenter`/`getNode` canvas-centre hook). ✔
- **AD-11:** top-bar buttons, expand headers, member rows, and the ReactFlow `<Controls>` are real focusable elements; `aria-label`/`aria-expanded` set. ✔
- **Theme:** token-bound only (`.lnode`, `.lnode-dots`, `edgeStyle` use `var(--color-*)`); no violet/purple. ✔

## Files changed
- **New:** `src/ui/lineage/LineageCanvas.tsx`, `LineageNode.tsx`, `SidePanel.tsx`
- **Modified:** `src/state/store.ts` (TabId, `activeTab` + `lineageFocusId/nonce` + `gridFocusId/nonce`, `setActiveTab`/`openOnCanvas`/`focusLineage`/`editOnGrid`, `project.edges` retained), `src/ui/App.tsx` (tab state from store, `LineageCanvas` mounted), `src/ui/grid/ObjectGrid.tsx` (grid-focus scroll/flash effect, `openOnCanvas` wiring), `src/ui/grid/GridRow.tsx` (lineage button enabled + wired, `flash` prop), `src/ui/theme.css` (`.lnode`, `.lnode-dots`, `.grid-row-flash`), `tests/unit/store.test.ts` (+7 tests for the FR-21 round-trip API).

## Self-review
- `tsc -b` and the production `vite build` both clean (only the >500 kB chunk-size warning for the large elk+xyflow bundle — informational, not an error).
- Store interface got significantly reworked; cross-checked interface vs implementation method sets manually after several edits (no missing/duplicate members).
- No `web-worker` dep needed: imports `elkjs/lib/elk.bundled.js`, which provides its own worker.

## Concerns / follow-ups
- **Active vs inactive relationships:** the parsed TMDL relationship carries no `isActive` flag (only `fromColumn`/`toColumn` endpoints). The "inactive vs active" distinction is therefore rendered as the on-path (solid/lit) vs off-path (dashed/muted) edge state tied to the current focus, not a model-level flag. This is a defensible reading of the mockup's dim/inactive presentation; if a real active flag is later exposed it should be plumbed into `Edge` and `edgeStyle`.
- **Report/visual edges:** the canvas reads `project.edges` (the TMDL edges the graph was built from). The report layer's visual→object edges are not merged into `project.edges` in this task's scope, so visuals are represented in the side panel (leaf count + traceback) rather than as table-level edges. If the lineage layer should overlay visual edges, they must be fed into the graph/`project.edges`.
- **Visual focus centring:** focusing a pure visual/minted id has no table node, so `setCenter` is skipped (the side panel still shows the trace). Safe no-op.
- **elk layout on expanded nodes:** elk lays out collapsed-size nodes; expanding a node grows it over its neighbours with a possible minor overlap until the user drags or re-fits. Acceptable for the smoke/drag model.
- **Chunk size:** the combined `@xyflow/react` + `elkjs` bundle is ~1.9 MB (597 kB gzip); a future task might lazy-load the Relationships tab.
