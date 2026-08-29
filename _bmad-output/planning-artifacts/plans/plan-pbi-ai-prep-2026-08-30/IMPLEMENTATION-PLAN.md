# PBI AI Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PBI AI Prep — a static, zero-server Chromium web app that parses a local Power BI PBIP/TMDL semantic model in the browser and writes byte-faithful metadata edits (descriptions, renames, visibility, AI instructions, synonyms, AI data schema) back into the original files through the File System Access API.

**Architecture:** Hexagonal core over a source-anchored patch writer. A pure `domain/` core (model objects + source spans, dependency ObjectGraph, change journal) depends on nothing browser-y. `parse/` readers (TMDL / LSDL / PBIR) emit domain objects plus exact source byte spans; `write/` is the only thing that writes, applying half-open span patches in descending byte order to the *original* text (never re-serializing, except the enclosed LSDL JSON block). `fs/` is the File System Access adapter (pick, retained handles in IndexedDB, permission, atomic write). `state/` is the single Zustand store + worker broker. `ui/` renders React views over it. `worker/` runs deferred heavy parses off the main thread. `ai/` is a v2 BYOK stub.

**Tech Stack:** React 19.2.8, Vite 8.2.2 (Rolldown), Tailwind CSS 4.3.3 (CSS-first `@theme`, no `tailwind.config.js`), Zustand 5.0.15, @xyflow/react 12.11.5, elkjs 0.12.0, lucide-react, TypeScript ~6.0, Vitest for headless Node tests, GitHub Pages static host (Vite `base: './'`).

**Spec:**
- `_bmad-output/planning-artifacts/architecture/architecture-pbi-ai-prep-2026-08-30/ARCHITECTURE-SPINE.md` (primary — AD-1..AD-11)
- `_bmad-output/planning-artifacts/prds/prd-pbi-ai-prep-2026-08-28/prd.md` (FR-1..FR-38, NFRs, §9.1 descope order)
- `_bmad-output/planning-artifacts/prds/prd-pbi-ai-prep-2026-08-28/addendum.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-pbi-ai-prep-2026-08-30/DESIGN.md` + `EXPERIENCE.md` (visual contract)
- `mockup/index.html` (working visual contract; executors diff against it)

## Global Constraints

- **AD-1 dependency rule.** `domain/` is a leaf — imports nothing from `parse/`, `write/`, `fs/`, `state/`, `ui/`, `worker/`, `ai/`. Nothing in `domain/` references `window`, `document`, or the File System Access API. `worker/` imports `parse/` + `domain/` only, never `state/` or `ui/`. Enforce with ESLint `no-restricted-globals` + import linter (Phase 0).
- **Byte fidelity is the correctness bar.** Every file must be byte-identical after an edit-free save (FR-23 / SM-1). Unmodified spans are never touched; the writer never re-serializes except the enclosed LSDL JSON block.
- **Object identity = `lineageTag`**, minted exactly once by the reader via the shared span-derivation helper; surrogate `file#byte-span` where absent. Ids never re-key on rename.
- **Half-open byte spans.** `{ start, end }` over UTF-8 byte offsets into `originalText`; zero length = insertion. Readers record declaration, doc-comment, **and name-token** spans. Patches apply in descending order, ties broken descending end.
- **Encoding/layout.** UTF-8 without BOM; preserve each file's original line endings (CRLF preserved); TMDL tab indentation; `///` doc comments (never `//`); LSDL state values verbatim (`User`/`Generated`/`Suggested`/`Deleted`/`Authored`); doc comments at declaration indentation. Field descriptions cap 500 decoded chars (200-char Copilot cutoff marked); LSDL `CustomInstructions` cap 10,000 decoded chars; max 20 live synonyms per field.
- **Mutation only through the journal.** `journalAdd`/`journalDiscard` are the only doors (store actions wrapping a pure domain fold). Nothing writes until Save.
- **One ObjectGraph, pristine model.** Journal records never alter edges; wave-cascade deletion is a derived subgraph view. One shared name→id resolver across all edge feeders.
- **Deferred parse.** Eager: model objects within 5s. Lazy: LSDL, report layer, report-edge lineage. Heavy parses on a worker; main thread never blocks >50ms.
- **Performance floors (binding).** Grid AND pending-changes list virtualise at 2,000 rows, no frame >16ms; filter resolves ≤200ms; folder→grid ≤5s; main thread never blocks >50ms.
- **Accessibility (binding).** WCAG 2.1 AA; grid fully keyboard-operable; focus management/restore; tabs `role="tab"` + `aria-selected` + roving tabindex; modals trap and restore focus; tooltip triggers focusable.
- **Zero server.** No backend, no telemetry, no analytics, no outbound traffic except user-triggered BYOK. Theme in `localStorage 'theme'`; never `prefers-color-scheme`.
- **Disabled, never hidden.** When permission doesn't allow an action, control stays visible but disabled with an explanation (FR-34).
- **Read-path borrow, then close the gaps.** The TMDL read path adapts `lineage-tracer`'s `bridge/src/pbip/tmdl-parser.js` (MIT, Jihwan Kim → pbip-documenter — retain LICENSE + attribution header verbatim). That parser is MISSING `lineageTag` (the object id), `queryGroup`, `perspective` membership, `functions.tmdl` objects, and all source byte spans (AD-2/AD-3) — all MUST be added, and it MUST be optimized to the FR-8 performance floor. **LSDL has no borrow** — `lineage-tracer` has no LSDL reader; author `lsdl-reader.ts` fresh.
- **Commit message rule (repo `.agents/AGENTS.md`).** Commit messages and descriptions MUST use random data — never project/company names. Every commit example below uses a random token (`feat: step 7c2f`) — keep that style.
- **Descope order (PRD §9.1, user-overridden 2026-08-30):** FR-26..29 (AI) first, then FR-34..38 (chrome). **FR-19..21 (lineage canvas) is NON-OPTIONAL and must ship** — user confirmed the draggable node canvas + dependency stream trace are required. Core: FR-1..18, FR-22..25, FR-30..33.

## File Structure

```
src/
  domain/
    objects.ts          # ModelObject, ObjectType union, source spans, fidelity caps
    span.ts             # span-derivation helper, surrogate id, byte helpers
    identity.ts         # name->id resolver (single shared resolver) + id->name index
    journal.ts          # EditSession: field/delete records, coalescing, project(model,journal) fold
    graph.ts            # ObjectGraph: edge kinds, transitive used count, direct/transitive/leaf breakdown
  parse/
    tmdl-reader.ts      # ADAPTED+OPTIMIZED from lineage-tracer tmdl-parser.js; adds missing kinds + spans
    lsdl-reader.ts      # AUTHORED FRESH (lineage-tracer has no LSDL): block locate + JSON parse + binding index
    pbir-reader.ts      # ADAPTED from lineage-tracer visual-parser.js -> field usage -> edges
    spans.ts            # shared source-span emitter used by all readers
  write/
    patch-engine.ts     # apply half-open span patches to originalText, descending, ties desc-end
    write-planner.ts    # journal -> per-file patches; LSDL block re-serialization; M-step append
    refresh.ts          # post-save snapshot/span shift, lazy layer staleness
  fs/
    access.ts           # picker, retained handles (IndexedDB), permission lifecycle, readwrite, atomic write
  state/
    store.ts            # Zustand store: project, journal, selectedIds, filters, layers, KPI, permission
    broker.ts           # main-thread worker broker (commits worker results via parseState)
  worker/
    parse.worker.ts     # deferred LSDL/report/report-edge lineage parse; imports parse/ + domain/ only
  ui/
    theme.css           # Tailwind 4 @theme tokens (blue/sky/cyan/emerald/amber/slate, light+dark)
    App.tsx             # root, tab shell, theme toggle
    chrome/  Landing.tsx ParseStepper.tsx KpiCard.tsx ThemeToggle.tsx
    grid/    ObjectGrid.tsx GridRow.tsx DescriptionCell.tsx RenameCell.tsx UsedCell.tsx
             Heading.tsx Pagination.tsx FilterBar.tsx ActionBar.tsx SelectionContext.tsx
             BulkRenameDialog.tsx DeleteDialog.tsx
    prep/    PrepForAi.tsx InstructionsEditor.tsx VerifiedRail.tsx SchemaExplorer.tsx
             SynonymChips.tsx SubTabSelector.tsx
    lineage/ LineageCanvas.tsx LineageNode.tsx SidePanel.tsx
  ai/
    index.ts            # v2 BYOK stub (no-op boundary)
tests/
  fixtures/             # synthetic edge-case PBIP fixture (committed) + expected Used counts
  unit/                 # domain/parse/write/state unit tests (headless Node)
  gates/                # fidelity gate + Used-count gate (headless Node, fail-the-build)
  e2e/                  # Chromium smoke (manual + optional Playwright)
```

## Phase 0 — Scaffold and Foundation

### Task 0.1: Vite + React + TS scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.env.d.ts`

**Interfaces:**
- Produces: a working `npm run dev` app shell; `tsconfig` with `strict: true`.

- [ ] **Step 1: Scaffold**

```bash
npm create vite@latest . -- --template react-ts
npm i react@19.2.8 react-dom@19.2.8
npm i @tanstack/react-virtual@latest zustand@5.0.15 @xyflow/react@12.11.5 elkjs@0.12.0 lucide-react
npm i -D vite@8.2.2 vitest tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 eslint eslint-plugin-import
```

- [ ] **Step 2: Set Vite `base` to relative for GitHub Pages**

Edit `vite.config.ts` to add `base: './'`.

- [ ] **Step 3: Add Playwright-style smoke hook (only for `e2e`, never runtime)**

Add a `data-testid="app-root"` on the root in `src/main.tsx`.

- [ ] **Step 4: Verify**

```bash
npm run dev
```
Expected: app renders at localhost with a `data-testid="app-root"` element. `npm run build` completes with no errors.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: step 0a1f"`

### Task 0.2: Tailwind 4 theme tokens (binding palette)

**Files:**
- Create: `src/ui/theme.css`, wire it in `src/main.tsx`

**Interfaces:**
- Produces: CSS variable tokens + classes the whole UI consumes. Palette (LOCKED, from DESIGN.md): primary `hsl(221 83% 53%)` light / `hsl(217 91% 60%)` dark; background `hsl(210 40% 98%)` light / `hsl(222 47% 6%)` dark; card `hsl(0 0% 100%)` light / `hsl(222 40% 10%)` dark; secondary sky `hsl(199 89% 48%)`; tertiary cyan `hsl(188 94% 43%)`; success emerald `hsl(160 84% 39%)`; attention amber `hsl(38 92% 50%)`; neutrals slate scale. Zero violet/fuchsia/purple anywhere.

- [ ] **Step 1: Write `theme.css`**

```css
@import "tailwindcss";
@theme {
  --color-primary: hsl(221 83% 53%);
  --color-primary-dark: hsl(217 91% 60%);
  --color-sky: hsl(199 89% 48%);
  --color-cyan: hsl(188 94% 43%);
  --color-emerald: hsl(160 84% 39%);
  --color-amber: hsl(38 92% 50%);
  --color-bg: hsl(210 40% 98%);
  --color-card: hsl(0 0% 100%);
}
```
Add `.dark` overrides and a `localStorage 'theme'` toggle hook (FR-36): light default, never `prefers-color-scheme`.

- [ ] **Step 2: Wire theme**

In `src/main.tsx` import `./ui/theme.css` and set the root `data-theme` from `localStorage` before first paint:

```ts
const t = localStorage.getItem('theme') ?? 'light'
document.documentElement.dataset.theme = t
```

- [ ] **Step 3: Verify** — light is default; toggling dark persists across reload; no `prefers-color-scheme` in code.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 03b2"`

### Task 0.3: AD-1 enforcement + test harness

**Files:**
- Create: `eslint.config.js` (flat), `vitest.config.ts`, `tests/unit/.setup.ts`

**Interfaces:**
- Produces: a test command `npm test` (vitest, node env for domain/parse/write) and lint that fails on `window`/`document`/FSA usage in `domain/`, and on `domain/` importing `parse/|write/|fs/|state/|ui/|worker/|ai/`.

- [ ] **Step 1: ESLint rules**

```js
export default [
  { rules: {
    'no-restricted-globals': ['error', { name: 'window', message: 'domain must stay pure' }],
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['../parse/*','../write/*','../fs/*','../state/*','../ui/*','../worker/*','../ai/*'], message: 'domain is a leaf' }]
    }],
  }},
]
```

- [ ] **Step 2: Vitest config**

`vitest.config.ts` → `test: { environment: 'node', include: ['tests/**/*.test.ts'] }`. Add `"test": "vitest run"` script.

- [ ] **Step 3: Verify** — `npm test` runs 0 tests green; `npm run lint` passes.

- [ ] **Step 4: Commit** — `git commit -m "chore: step 4d9e"`

## Phase 1 — Test fixtures and gates

### Task 1.1: Synthetic edge-case PBIP fixture

**Files:**
- Create: `tests/fixtures/mock-model/` — a small PBIP tree (4 tables, ~10 objects) that intentionally exercises the graph's hard cases; `tests/fixtures/mock-model/expected-usage.json`

**Interfaces:**
- Produces (consumed by the gate and by unit tests): a model directory + `expected-usage.json` mapping object id → `{ direct, transitive, leaf, total }`.

**The five edge cases the fixture MUST carry (PRD §5):**
1. **Orphaned calculation group** — a calc group whose calc items reference no columns → all items `total 0`.
2. **Field parameter wrapping a deleted column** — `fieldParam→NAMEOF(column)` where the column object does not exist → broken reference attributed to the field parameter; the param still counts as used by the visual, and total for the broken target is undefined/0.
3. **Hidden-measure transitive chain** — `measure A → measure B → measure C → column` (B hidden) → C and the column get transitive counts through B despite B's `isHidden`.
4. **Visual bound only via a field parameter** — a visual's field ref resolves through `fieldParam→column`; the column is `used` with a `visual`-kind dependent, not `0`.
5. **Circular DAX reference** — `measure A → B → A` → both counts as used; traversal terminates (no infinite loop, total reflects the cycle once).

Build the fixture on real TMDL text (tables `*.tmdl`, one `database.tmdl`, one `model.tmdl`, one `relationships.tmdl`), each object carrying a `///` doc comment where a description exists.

- [ ] **Step 1: Author `database.tmdl` / `model.tmdl` skeleton + 4 table files**

Use the real TMDL shapes from `_test_pbip_w_ai` as literal templates (tab indent, `///` comments, `lineageTag` GUIDs, `ordinal` values).

- [ ] **Step 2: Author the 5 edge-case objects + `expected-usage.json`**

Encode the expected counts by hand per the description above.

- [ ] **Step 3: Verify** — fixture parses in the (later) tmdl-reader; for now assert it is valid TMDL text by opening it in a text view and asserting `definition.pbism` has `compatibilityLevel >= 4`.

- [ ] **Step 4: Commit** — `git add tests/fixtures/mock-model && git commit -m "feat: step 15a0"`

### Task 1.2: Fidelity + Used-count gate harness (headless Node)

**Files:**
- Create: `tests/gates/fidelity.gate.ts`, `tests/gates/usage.gate.ts`, `scripts/run-gates.mjs`

**Interfaces:**
- Produces: `npm run gates` that (a) opens the fixture, saves with no edits, asserts byte-identical (FR-23/SM-1, via the Phase-4 write path), and (b) runs the graph engine against the fixture and fails on any used-count mismatch (PRD §5).

- [ ] **Step 1: Write live placeholder assertions (fails until Phase 2-4 land)**

```ts
// usage.gate.ts
import { buildGraph } from '../../src/domain/graph'
import { parseTmdl } from '../../src/parse/tmdl-reader'
import expected from '../fixtures/mock-model/expected-usage.json'
const objects = parseTmdl(fixturePath())
const graph = buildGraph(objects)
for (const [id, exp] of Object.entries(expected)) {
  const got = graph.usage(id)
  if (got.total !== exp.total) throw new Error(`${id}: expected ${exp.total}, got ${got.total}`)
}
```

- [ ] **Step 2: Wire `npm run gates`** — runs both gates; exit non-zero on any failure.

- [ ] **Step 3: Verify** — `npm run gates` fails with "module not found" (expected: parse/graph not built yet).

- [ ] **Step 4: Commit** — `git commit -m "test: step 2b13"`

## Phase 2 — domain/ (pure core)

### Task 2.1: ModelObject, types, and spans

**Files:**
- Create: `src/domain/objects.ts`, `src/domain/span.ts`

**Interfaces:**
- Produces: `ObjectType` union; `Span { start: number; end: number }` (half-open); `SourceSpans`; `ModelObject`; `spanDerive(...)` surrogate id helper; `byteLen(s)`.

```ts
export type ObjectType =
  | 'table' | 'column' | 'calculatedColumn' | 'measure' | 'hierarchy'
  | 'hierarchyLevel' | 'calculationGroup' | 'calculationItem' | 'fieldParameter' | 'daxFunction'

export interface Span { start: number; end: number } // half-open over UTF-8 bytes

export interface ModelObject {
  id: string               // lineageTag or surrogate file#byte-span; minted once
  type: ObjectType
  name: string
  table: string            // parent table name ('' for tables / funcs / dax)
  file: string             // project-relative POSIX path
  declarationSpan: Span
  docCommentSpan?: Span
  nameSpan: Span           // REQUIRED for rename (AD-3)
  dax?: string
  hidden: boolean
  isFieldParameter: boolean
  description?: string
  queryGroup?: string
  displayFolder?: string
  perspectiveMembership?: string[]
  ordinal?: number
}
```

- [ ] **Step 1: Write `span.ts`** — surrogate id derivation (`file#${start}-${end}`), exact URI-escape of file, and a `byteLen` that counts UTF-8 bytes.

- [ ] **Step 2: Write `objects.ts`** — the unions + a `FIDELITY_CAPS = { description: 500, copilotCutoff: 200, customInstructions: 10000, synonyms: 20 }`.

- [ ] **Step 3: Unit test** — `tests/unit/span.test.ts`: surrogate id stable for same file+span; byteLen counts a multi-byte char as 2+ bytes.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 2c47"`

### Task 2.2: Change journal and the pure fold

**Files:**
- Create: `src/domain/journal.ts`

**Interfaces:**
- Produces: `JournalRecord = { kind:'field', recordId, objectId, field, old, new, file, context } | { kind:'delete', objectId, file, context, recordId }`; `journalAdd(model, journal, rec)`, `journalDiscard(model, journal, recordId)`, `project(model, journal)` (single pure fold → folded model), `coalesce` on `{objectId, field}`.

- [ ] **Step 1: Implement records as a discriminated union with a stable `recordId`** (`crypto.randomUUID()`).

- [ ] **Step 2: Implement the fold** — `project(model, journal)` applies field records (last wins per `{objectId, field}`) and filter-outs deletes onto a fresh read-model; surfaces never fold it themselves (AD-4).

- [ ] **Step 3: Unit test** — `tests/unit/journal.test.ts`: re-edit coalesces (old stays pristine), discard removes a record, `project` reflects both, delete removes the object.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 22e1"`

### Task 2.3: One shared name→id resolver

**Files:**
- Create: `src/domain/identity.ts`

**Interfaces:**
- Produces: `NameIndex`; `resolveName(index, name, tableHint?) → string | undefined`; `buildNameIndex(objects)`. ONE resolver for all edge feeders (AD-6) — no feeder keeps its own mapping.

- [ ] **Step 1: Implement index** — map `type|table|name` (and a bare name fallback) → id.

- [ ] **Step 2: Unit test** — resolved vs. unresolved (undefined) + ambiguous table hint.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 2fe0"`

### Task 2.4: ObjectGraph (transitive Used count)

**Files:**
- Create: `src/domain/graph.ts`

**Interfaces:**
- Produces: `EdgeKind = 'visual'|'measure'|'calcObject'|'calcItem'|'fieldParam'|'function'|'relationship'`; `buildGraph(objects, edges) → ObjectGraph`; `graph.usage(id) → { direct, transitive, leaf, total }`; `graph.dependents(id) → Set<string>`; `graph.isolateTo(id) → { inPath, offPath }`. Edge kinds fixed; **visual→visual excluded** (AD-6). Built from the **pristine** model; deletion is a derived subgraph view.

- [ ] **Step 1: Build adjacency over the fixed edge kinds**, keyed by object id, resolving names through the shared resolver.

- [ ] **Step 2: Implement transitive traversal with cycle guard** (visited set — circular references terminate, PRD §5 case 5).

- [ ] **Step 3: Implement `usage(id)`** — direct = in-edges, transitive = reachable-through, leaf = terminal dependents, total = card of union (no double count).

- [ ] **Step 4: Unit tests** — `tests/unit/graph.test.ts`: chain counts, hidden-measure transitivity, cycle termination, fieldParam indirection, no double-count.

- [ ] **Step 5: Commit** — `git commit -m "feat: step 24b5"`

## Phase 3 — parse/ readers

### Task 3.1: Source-span emitter

**Files:**
- Create: `src/parse/spans.ts`

**Interfaces:**
- Produces: `locateDeclaration(text, line) → Span`, `locateDocComment(text, declStart) → Span | undefined`, `locateNameToken(text, declLine) → Span`. Text = the file's original bytes.

- [ ] **Step 1: Implement** — find the declaration line start/end, the preceding `///` block, and the name token's byte range within the declaration line. Spans are half-open over UTF-8 byte offsets (decode via `TextEncoder`).

- [ ] **Step 2: Unit test** — `tests/unit/spans.test.ts`: comment+decl+name spans resolve on a real TMDL snippet; multi-byte names offset correctly.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 3907"`

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

### Task 3.3: LSDL reader + binding index (authored fresh)

**Files:**
- Create: `src/parse/lsdl-reader.ts` — **no borrow: `lineage-tracer` has no LSDL reader.** Every line is new; do not look to the repo for this.

**Interfaces:**
- Produces: `parseLSDL(cultureText) → { customInstructions, entities, relationships, agents, block: { start, end }, contentTypeLine }`; `LSDLBindingIndex`; `buildBindingIndex(lsdl, objects) → Map<objectId, { file, span, state }>` (AD-8 — rename planning reads the index, never text search). A dangling binding is retained + flagged, not dropped (FR-6); no `linguisticMetadata` → empty LSDL; no culture file → Prep tab empty (not error).

- [ ] **Step 1: Locate the triple-backtick block** and its `contentType: json` line without disturbing either (FR-6/FR-23). Parse the JSON; split `CustomInstructions` / `Entities` / `Relationships` / `Agents`.
- [ ] **Step 2: Build the binding index** — map LSDL entity `Definition.Binding` (`[Table].[Column]`) → object id via the shared resolver; retain + flag dangling bindings.
- [ ] **Step 3: Unit tests** — `tests/unit/lsdl-reader.test.ts`: block boundary + contentType line preserved; entity↔object association; dangling binding flagged; empty LSDL; no culture file → empty.
- [ ] **Step 4: Commit** — `git commit -m "feat: step 3508"`

### Task 3.4: PBIR reader (field usage → edges)

**Files:**
- Create: `src/parse/pbir-reader.ts`

**Interfaces:**
- Produces: `parseReport(reportFiles) → { visualEdges: {visualId, field, objectId?, broken}[] , broken: {visual, field}[] }`. Field refs resolve to model objects via the shared resolver; a ref resolving to nothing is a **broken reference attributed to its visual** (FR-7). Fields reached only through a field parameter count as used; no Report folder → usage renders **unavailable, not zero** (FR-7).

- [ ] **Step 1: Walk `definition/pages/*/visuals/*/visual.json`** for `queryState` / field bindings, resolving each field to an object id.

- [ ] **Step 2: Emit edges** (visual→object) to feed the graph; tag broken refs to the visual.

- [ ] **Step 3: Unit tests** — `tests/unit/pbir-reader.test.ts`: field ref resolves; broken ref attributed to visual; fieldParam-only reach counts used; no report folder → `null` (unavailable), not `[]` (zero).

- [ ] **Step 4: Commit** — `git commit -m "feat: step 3911"`

## Phase 4 — write/ (the byte-faithful writer)

### Task 4.1: Patch engine

**Files:**
- Create: `src/write/patch-engine.ts`

**Interfaces:**
- Produces: `applyPatches(originalText, patches: Patch[]) → string`; `Patch = { start, end, replacement }` (half-open UTF-8 byte offsets; `end - start === 0` = insertion). Applies **descending** start, ties descending end, and **never touches** a span it wasn't given. Rejects overlaps (two patches sharing a byte) as a bug.

```ts
export function applyPatches(src: string, patches: Patch[]): string {
  const bytes = new TextEncoder().encode(src)
  if (!patches.length) return src
  const sorted = [...patches].sort((a, b) =>
    b.start - a.start || b.end - a.end)
  const out: Uint8Array[] = []
  let prev = new Uint8Array(0)
  for (const p of sorted) {
    if (prev.length && p.end > firstStartOfApplied) throw new Error('overlapping patches')
    out.push(bytes.subarray(p.end))
    out.push(new TextEncoder().encode(p.replacement))
    out.push(bytes.subarray(0, p.start))  // careful: slice the tail first
    prev = bytes.subarray(p.start, p.end)
  }
  return new TextDecoder().decode(concat(out))
}
```

- [ ] **Step 1: Implement with the descending sort + overlap guard** (a correct, simpler implementation is fine; the contract is descending + overlap-reject, not this exact sketch).

- [ ] **Step 2: Unit tests** — `tests/unit/patch-engine.test.ts`: single replace, insertion, two disjoint patches descend, same-span tie, overlap throws, multi-byte (emoji) offsets preserved.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 4472"`

### Task 4.2: Write planner

**Files:**
- Create: `src/write/write-planner.ts`

**Interfaces:**
- Produces: `planWrites(model, journal, layers) → Map<file, { text, patches }>`; groups journal by file, **coalesces** records per file, applies the fold to get the final text, computes patches for: doc-comment write, rename (name-token patch), visibility `isHidden` + `changedProperty`, LSDL JSON block re-serialization (the ONE sanctioned re-serialization) for instructions/synonyms/visibility, M-step append for column deletion, TMDL block span-delete for measures/calc columns/calc items.

- [ ] **Step 1: Description write** — patch the doc-comment span (`///` lines at declaration indentation, newline-preserving) or insert a new `///` block directly above the declaration. Multi-line → consecutive `///` lines.

- [ ] **Step 2: Rename write** — patch the **name-token span**; do NOT re-key the id; if TMDL quoting is needed, quote and double embedded single quote (FR-12); if the rename is referenced in DAX elsewhere, **warn + list** the referencing expressions (v1, no rewrite, per Assumption).

- [ ] **Step 3: Visibility write** — write/remove `isHidden` and emit `changedProperty = IsHidden` (FR-13, matches reference model).

- [ ] **Step 4: LSDL write (sole exception to "never re-serialize")** — re-encode the enclosed JSON block within its own byte span (AD-3), preserving the `contentType: json` line; write `CustomInstructions`, entity `Terms` (incl `Deleted` tombstone), entity `Visibility` with `state: Authored`; preserve `Agents` timestamps verbatim (Open Question 6 default).

- [ ] **Step 5: Delete write** — source columns append `PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(PreviousStep, {...})` as a fresh final M step (never mutating user steps); measures/calc columns/calc tables/calc items deleted by span-patching their TMDL block (FR-33).

- [ ] **Step 6: Unit tests** — `tests/unit/write-planner.test.ts`: each write kind produces the right patch; edit-free save → empty patch list; rename patches name token only; description insert is `///` at declaration indentation.

- [ ] **Step 7: Commit** — `git commit -m "feat: step 4483"`

### Task 4.3: Post-save refresh (one owner)

**Files:**
- Create: `src/write/refresh.ts`

**Interfaces:**
- Produces: `applyRefresh(file, writtenText, priorSpans, priorText) → { text, spans }` — commits `originalText ← written`, shifts that file's spans by patch deltas, and marks touched lazy layers `parseState = 'stale'` (AD-5). Critical bar: a second in-session save does not false-conflict and a second rename targets current spans.

- [ ] **Step 1: Implement span shifting** by accumulating the delta of applied patches for that file.

- [ ] **Step 2: Unit test** — `tests/unit/refresh.test.ts`: after two sequential renames, the second rename targets the shifted (correct) span.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 4b91"`

## Phase 5 — fs/ (File System Access adapter)

### Task 5.1: Picker, retained handles, permission, atomic write

**Files:**
- Create: `src/fs/access.ts`

**Interfaces:**
- Produces: `pickFolder() → { handle, name }` (readwrite in one gesture, FR-1); `persistHandle(handle, name)` / `listRecent()` / `dropRecent(name)` (IndexedDB; handles survive only structured-clone stores, AD-7); `requestPermission(handle)` (user gesture required — return a function that calls it on click, FR-24); `readFile(handle, path)`, `readDir`, `writeFileAtomic(handle, path, bytes)` via `createWritable` (atomic replace); `isSupported()` (Chromium/`window.showDirectoryPicker`), `isSensitiveRoot(path)`; `changedOnDisk(handle, expectedBytes)` (FR-25 conflict check).

- [ ] **Step 1: Implement**, blocking sensitive system roots (`C:\Windows`, `/Program Files`), surfacing browser refusals readably (FR-1).

- [ ] **Step 2: Manual Chromium check** — open the app, pick a folder, read a file, write a temp file atomically, verify byte-identical content. (This is browser-dependent; document manual steps in `tests/e2e/README.md`.)

- [ ] **Step 3: Commit** — `git commit -m "feat: step 5a11"`

## Phase 6 — state/ + worker

### Task 6.1: Zustand store (single cross-surface owner)

**Files:**
- Create: `src/state/store.ts`

**Interfaces:**
- Produces: `useStore` with slices: `project { tree, objectsById, files, originalTexts, spans }`, `journal`, `selectedIds: string[]` (ordered, unique, keyed by object id), `filters { query, type, table, noDescription, unused, sort, page }`, `layers { lsdl, report, lineage } → { parseState, data }` (status-only `idle|parsing|ready|error|stale`), `kpi`, `permission`. All mutation through `journalAdd`/`journalDiscard` (AD-4). Selection survives filter/page/search/tab nav. Canvas selection is a one-element `selectedIds` instance (AD-10).

- [ ] **Step 1: Implement slices** + store actions that wrap the domain fold; NO component calls `setState` on journal/KPI directly.

- [ ] **Step 2: Selection semantics** — `toggleSelect(id)`, `shiftSelectRange`, `selectAllMatching`, `clearSelection`, `outsideFilterCount` (FR-30).

- [ ] **Step 3: Unit tests** — `tests/unit/store.test.ts`: selection survives filter+page change; journal add/discard only via actions; `layers` state machine.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 6a22"`

### Task 6.2: Worker parse dispatcher + broker

**Files:**
- Create: `src/state/broker.ts`, `src/worker/parse.worker.ts`

**Interfaces:**
- Produces: `requestLayer(layer) → Promise<data>` (idempotent — at most one in-flight parse per layer, later subscribers await the same promise, AD-7); `worker` imports `parse/` + `domain/` only, returns plain domain objects over `postMessage`; broker is the only commit path into `store.layers`.

- [ ] **Step 1: Implement the worker `onmessage` dispatch** for `lsdl` / `report` / `report-edge lineage` parses.

- [ ] **Step 2: Implement the broker** — memoize in-flight promise per layer; on resolve commit into `layers[<layer>] = { parseState:'ready', data }`.

- [ ] **Step 3: Verify** — main thread does not block >50ms during a 2000-object parse (perf smoke, see Task 8.3).

- [ ] **Step 4: Commit** — `git commit -m "feat: step 6b87"`

## Phase 7 — ui/

The mockup `mockup/index.html` is the visual contract. Diff styling/layout against it. Every described behavior above (columns, filters, badges, keyboard nav) is binding.

### Task 7.1: Application chrome — landing, parse stepper, theme toggle

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/chrome/Landing.tsx`, `src/ui/chrome/ParseStepper.tsx`, `src/ui/chrome/ThemeToggle.tsx`, `src/ui/chrome/KpiCard.tsx`

**Interfaces:**
- Consumes: store (permission, layers, kpi), fs (pickFolder, recent).
- Produces: FR-34 (landing: product statement, capability badge naming Chrome/Edge/Opera, open-with-rationale, recent projects; declined → read-only with controls visible but disabled + explanation), FR-35 (4-stage parse stepper: definition tree / model objects / lineage graph / report layer, live per-stage counts, progress bar), FR-36 (light default, localStorage toggle, no `prefers-color-scheme`), FR-37 (per-tab KPI cards: uppercase label + live figure + one-line plain-English definition).

- [ ] **Step 1: Build `Landing.tsx`** per FR-34 + mockup.
- [ ] **Step 2: Build `ParseStepper.tsx`** per FR-35 (reads real layer `parseState`).
- [ ] **Step 3: Build `ThemeToggle.tsx`** + wire `localStorage 'theme'`.
- [ ] **Step 4: Build `KpiCard.tsx`** + wire the three tabs' KPI groups (FR-37).
- [ ] **Step 5: Manual Chromium verify** against the mockup (shapes, palette, spacing).
- [ ] **Step 6: Commit** — `git commit -m "feat: step 7a14"`

### Task 7.2: Object grid — virtualised, columns, filters, sort, pagination

**Files:**
- Create: `src/ui/grid/ObjectGrid.tsx`, `src/ui/grid/GridRow.tsx`, `src/ui/grid/Heading.tsx`, `src/ui/grid/Pagination.tsx`, `src/ui/grid/FilterBar.tsx`, `src/ui/grid/UsedCell.tsx`

**Interfaces:**
- Consumes: store (filters, sort, page, objects, graph.usage), domain (folded model).
- Produces: FR-9 (column order `[Lineage Icon] Type Table Name RenameTo Used Description DAX`; Used cell = total + hover direct/transitive/leaf; Unused=0 light-blue attention / 1-5 grey / 6+ grey heavier; tables first-class rows; DAX only for measure/calc column/calc item; 2000-row virtualisation no frame >16ms; hidden distinguished from visible), FR-10 (empty-description one-action filter, type/table/free-text filter, sort asc/desc with arrow, 50/page pager with ellipsis, 'Showing X–Y of Z', reset-to-page-1), FR-11 (inline editable description, 500-char cap, 200-char cutoff marker, multi-line, Enter/Tab/Escape, changed-cell mark).

- [ ] **Step 1: Build the virtualised row renderer** — use `@tanstack/react-virtual` (or equivalent) to hit the 16ms floor; column order fixed.
- [ ] **Step 2: Implement filter/sort/pagination** to the store, resetting page on change.
- [ ] **Step 3: Implement inline description editing** (keyboard-first, FR-11 / AD-11). Wire the 500-char cap + 200-char marker.
- [ ] **Step 4: Manual verify** against the mockup at ~2000 synthetic rows (no frame >16ms, filter <200ms).
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7b20"`

### Task 7.3: Selection + contextual action bar + bulk rename

**Files:**
- Create: `src/ui/grid/SelectionContext.tsx`, `src/ui/grid/ActionBar.tsx`, `src/ui/grid/BulkRenameDialog.tsx`

**Interfaces:**
- Consumes: store selection (FR-30), journal.
- Produces: FR-30 (per-row checkbox; keyed by object id survives sort/filter/search/page; shift-click range on visible page; Space toggles focused row; 'Select all N matching' all-pages; selection bar shows total + outside-filter count + one-click clear), FR-31 (contextual bar on selection: Apply renaming, Set description, Include/Exclude AI, Show/Hide, Delete selected, Clear; neutral styling except destructive delete; bulk writes land as pending changes), FR-32 (bulk rename transform: find/replace, strip prefix, strip suffix, underscores-to-spaces, Title Case, in stated order; live current→new preview; FR-12 collision blocks apply and names conflicts).

- [ ] **Step 1: Build selection semantics store actions** (done in 6.1) + checkbox UI.
- [ ] **Step 2: Build `ActionBar.tsx`** (appears on selection, neutral; delete destructive-red).
- [ ] **Step 3: Build `BulkRenameDialog.tsx`** (rules, live preview, collision block).
- [ ] **Step 4: Manual verify** against the mockup.
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7c35"`

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

### Task 7.5: Relationships canvas + grid round-trip

**Files:**
- Create: `src/ui/lineage/LineageCanvas.tsx`, `src/ui/lineage/LineageNode.tsx`, `src/ui/lineage/SidePanel.tsx`

**Interfaces:**
- Consumes: store (lineage layer, graph), @xyflow/react + elkjs.
- Produces: FR-19 (tables as nodes, relationships as edges, pan/zoom/zoom-to-fit, calc-group and field-param tables marked distinctly, inactive vs active relationships, expandable table nodes, collapsed by default), FR-20 (select a column → dim everything off its path; dependents listed with counts; select a visual → trace back; side panel shows DAX of selected measure), FR-21 (canvas object → 'edit' opens grid filtered/scrolled to it; grid row 'View on canvas' switches tabs with that object selected + centred).

- [ ] **Step 1: Wire @xyflow/react + elkjs layout**, nodes keyed on object id.
- [ ] **Step 2: Implement off-path dimming** via `graph.isolateTo(id)`.
- [ ] **Step 3: Implement side panel + grid round-trip** (store-driven selection/tab switch).
- [ ] **Step 4: Manual verify** against the mockup (dims, side panel, back-to-grid retaining state).
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7e21"`

### Task 7.6: Delete flow with wave cascade + blast radius

**Files:**
- Create: `src/ui/grid/DeleteDialog.tsx`

**Interfaces:**
- Consumes: store (journal), graph, write planner.
- Produces: FR-33 (delete selected → grouped-by-table dialog with counts + expandable lists; per-object named downstream dependents that break (facts, never a verdict); confirmation warning: 'Removal writes an M-query step and cannot be undone here — only via Git'; wave cascade — each round applies in memory, graph recomputes, newly orphaned objects named+confirmed as next round, nothing writes to disk until the user stops). Deletion writes: source columns → `PBIPreAI_RemoveUnusedCols` M step; measures/calc columns/calc items → TMDL span delete.

- [ ] **Step 1: Build the dialog** with grouped-by-table rows, blast-radius dependents, wave-round UI.
- [ ] **Step 2: Wire cascade** — each confirm round calls the delete-plan then offers the next orphan set.
- [ ] **Step 3: Manual verify** — orphan wave appears, nothing touches disk until Save.
- [ ] **Step 4: Commit** — `git commit -m "feat: step 7f5d"`

## Phase 8 — Verification gates + acceptance

### Task 8.1: Fidelity gate green

**Files:**
- Modify: `tests/gates/fidelity.gate.ts`

- [ ] **Step 1: Run** `npm run gates` — open the fixture, save unmodified, assert byte-identical (FR-23/SM-1). Must pass on the committed fixture.
- [ ] **Step 2: Repair any drift** (encoding, line endings, span off-by-one, LSDL block re-serialization) until every file is byte-identical.

### Task 8.2: Used-count gate green

- [ ] **Step 1: Run** `npm run gates` — the 5 edge cases (orphaned calc group, fieldParam→deleted column, hidden-measure chain, fieldParam-only visual, circular DAX) produce the expected Used counts. Fix `graph.ts` / `edge feeders` until all pass.

### Task 8.3: Performance smoke

- [ ] **Step 1: Folder→grid ≤5s** and **main thread never blocks >50ms** on the reference model (`_test_pbip_w_ai`), measured in Chromium devtools. Fix `AD-7` deferral/worker if exceeded.

### Task 8.4: Manual acceptance pass (SM-2, SM-3)

- [ ] **Step 1: SM-2** — edit the reference model with renames + descriptions + visibility + instructions + synonyms + AI schema; open in Power BI Desktop; verify no error and every change present.
- [ ] **Step 2: SM-3** — write 100 descriptions in under 10 minutes keyboard-only (validates FR-11).

### Task 8.5: Attribution + open-source polish

- [ ] **Step 1: MIT + retained notices** of both reused projects in the UI footer and README (AD-11 convention, §5 NFR).
- [ ] **Step 2: Vite `base: './'`** confirmed for GitHub Pages; document deployment in README.
- [ ] **Step 3: Action** `npm run build && npm run gates && npm run lint` — all green.

## Self-Review

**Spec coverage** (38 FRs):
- FR-1..4 → Task 5.1, 7.1 · FR-5..8 → 3.1-3.4, 6.1-6.2, 8.3 · FR-9..14 → 2.4, 6.1, 7.2, 7.3 · FR-15..18 → 3.3, 7.4 · FR-19..21 → 7.5 · FR-22..25 → 4.1-4.3, 5.1 · FR-30..33 → 6.1, 7.3, 7.6 · FR-34..38 → 7.1, 7.2, 7.4.
- FR-26..29 (AI) → deliberately OUT of the build tasks (v2). Not a gap; a descope per §9.1.
- Verification gates (PRD §5) → Tasks 1.2, 8.1, 8.2. Round-trip fidelity → 4.3, 8.1.
- **Read-path provenance:** Task 3.2 adapts + optimizes `lineage-tracer`'s `tmdl-parser.js` (MIT, Jihwan Kim → pbip-documenter) and MUST add `lineageTag`/`queryGroup`/`perspective`/`changedProperty`/`functions.tmdl`/source spans. Task 3.3 (LSDL) is authored fresh — `lineage-tracer` has no LSDL reader.

**Placeholder scan:** No TBD/TODO. Every core correctness task has real test code or a code contract. UI tasks specify exact files + behaviors, diffing against the mockup for styling (the mockup is the visual contract, not a placeholder).

**Type consistency:** `ModelObject.id` (lineageTag/surrogate), `Span {start,end}` half-open, `JournalRecord` discriminated union `{kind:'field'|'delete'}`, `ObjectType` union, `usage() → {direct, transitive, leaf, total}`, `layers[<layer>] = {parseState, data}` — used identically across tasks.
