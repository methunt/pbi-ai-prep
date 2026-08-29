# Addendum: PBI AI Prep

Technical depth that belongs downstream (PRD, architecture) rather than in the brief. All findings verified against the user's real PBIP at `_test_pbip_w_ai/Atrium Sigma.SemanticModel` unless marked otherwise.

## Ground truth: Prep data for AI on disk

The three "Prep data for AI" artifacts are all file-writable. Microsoft's own [semantic-model-ai-readiness.md](https://github.com/microsoft/skills-for-fabric/blob/main/skills/semantic-model-authoring/references/semantic-model-ai-readiness.md) says they are UI-only; that document is stale. The [official Learn page](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai) states "AI instructions and AI data schemas save to the LSDL and you can edit them as needed," and the real folder confirms it.

### 1. AI instructions — `CustomInstructions`

Location: `definition/cultures/en-US.tmdl`, inside the `linguisticMetadata` JSON, as a sibling of `Entities`, `Relationships`, and `Agents`.

```tmdl
cultureInfo en-US

	linguisticMetadata =
			{
			  "Version": "4.2.0",
			  "Language": "en-US",
			  "Entities": { ... },
			  "Relationships": { ... },
			  "Agents": {
			    "Internal": { "Version": "1.1.0" },
			    "PowerBI.OrganizationLsdlSharing": { "LastModified": "2026-02-23T10:06:32.1651019Z" },
			    "PowerBI.AzureOpenAISynonyms": { "LastModified": "2026-02-23T10:06:36.0402394Z" }
			  },
			  "CustomInstructions": "# Atrium Sigma\n\nmedia-platform ordering...\n\n## DATA GRAIN - CRITICAL\n..."
			}
		contentType: json
```

Notes for implementation:
- Single JSON string with `\n` escapes. Markdown inside is conventional, not required.
- 10,000-character cap ([Learn](https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-prepare-data-ai-instructions)). Count against the decoded string.
- `contentType: json` trails the closing brace at one tab less than the JSON body.
- The `Agents` timestamps record which service last touched the LSDL. Unclear whether writing without updating them causes drift. [UNVERIFIED]

### Description length rule

Two limits, not one:

| Limit | Source | Behaviour |
|---|---|---|
| 200 characters | [semantic-model-ai-readiness.md](https://github.com/microsoft/skills-for-fabric/blob/main/skills/semantic-model-authoring/references/semantic-model-ai-readiness.md) — "only the first 200 characters are read by Copilot" | Truncation point for AI consumption, not a write limit |
| 500 characters | Product decision | Editor cap. Humans read descriptions in the field list and in Desktop's tooltip; 200 is too short for a human-useful description. |

The editor accepts up to 500 and marks where the 200th character falls, so the author can front-load disambiguation for Copilot while writing the fuller text for people. TMDL itself imposes no length limit on `///` doc comments. [UNVERIFIED: whether Power BI Desktop truncates long descriptions anywhere in its own UI.]

### 2. AI data schema — per-entity `Visibility`

Exclusion is not `State: Deleted` (the earlier hypothesis). It is an explicit `Visibility` object on the entity:

```json
"metrics.last_refreshed": {
  "Definition": { "Binding": { "ConceptualEntity": "Metrics", "ConceptualProperty": "LastRefreshed" } },
  "State": "Generated",
  "Visibility": { "Value": "Hidden", "State": "Authored" },
  "Terms": [ ... ]
}
```

In the sample: 118 `"Value": "Hidden"`, 54 `"State": "Authored"`. `State: Authored` marks a deliberate user choice versus a system default — the LSDL analogue of `changedProperty` in TMDL. Writing visibility changes must set `State: Authored`.

### 3. Synonyms — `Terms`

Array of single-key objects, one per synonym:

```json
"Terms": [
  { "last refreshed": { "State": "Generated" } },
  { "LastRefreshed": { "Type": "Noun", "State": "Generated", "Weight": 0.99 } },
  { "end refreshed": { "Type": "Noun", "State": "Suggested", "Source": { "Agent": "Thesaurus" }, "Weight": 0.727 } }
]
```

State machine: `Generated` (from object name), `Suggested` (thesaurus/LLM proposal), `Authored`/`User` (human), `Deleted` (tombstoned). User-added synonyms must be written as authored, not generated, or Power BI may regenerate over them. [ASSUMPTION — inferred from the `State: Authored` convention on `Visibility`.]

### 4. Verified Answers — on disk, but out of scope

Not in the LSDL. They live in a sibling directory:

```
<Model>.SemanticModel/VerifiedAnswers/
  version.json                                    → { "version": "1.0.0", "$schema": ".../versionMetadata/1.0.0/schema.json" }
  definitions/<guid>/definition.json              → triggerPrompts[], contactObjectId, sourceMetadata (visual + theme)
  definitions/<guid>/filters.json
  definitions/<guid>/visualSource.json
```

`definition.json` follows `https://developer.microsoft.com/json-schemas/fabric/verifiedAnswers/definition/2.0.0/schema.json`. Example trigger prompt set: "How does media cost change month by month in 2026?" plus five variants, bound to a visual with theme version pins (`CY24SU08`, custom theme with `reportVersionAtImport`).

Reading and listing these is cheap. Authoring them means synthesising visual definitions and theme metadata — a report-layer job.

## TMDL parser requirements

### Format detection

| Signal | Meaning |
|---|---|
| `definition.pbism` → `"version": "4.2"` | TMDL |
| `definition/` folder present | TMDL |
| `model.bim` present | legacy TMSL — reject |
| `<Report>/definition/version.json` → `"version": "2.0.0"` | PBIR — required |

Sample `definition.pbism` also carries `"settings": { "qnaEnabled": true }`. Q&A must be on for the Prep data for AI tabs to be enabled in Power BI at all, so this is worth surfacing as a precondition check.

### Descriptions are `///` doc comments

Confirmed empirically: zero `description:` property lines across all 32 table files, `///` used throughout — on tables and columns alike.

```tmdl
/// Currency switcher. Leave unfiltered for USD. Never group or break down by Currency Mode.
table 'Currency View'
	lineageTag: 5c237c1c-409a-47b2-9af8-7dbe73879558

	/// Do not use in queries or reporting
	column 'Field Currency'
		isHidden
		lineageTag: 1f471397-92b7-427d-8fae-9841913f72f6
		summarizeBy: none
		sourceColumn: [Value1]
		sortByColumn: 'Field Currency Order'
```

Write descriptions as `///` immediately above the declaration, at the declaration's indent level. Multi-line descriptions repeat the `///` prefix per line.

### Object type detection

| Object | Signal |
|---|---|
| Regular column | `column X` + `sourceColumn:` |
| Calculated column | `column X = <DAX>` + `type: calculated` |
| Measure | `measure X = <DAX>` |
| Field parameter | column carries `extendedProperty ParameterMetadata = { "version": 3, "kind": 2 }` |
| Calculation group | table contains `calculationGroup` block with `calculationItem` children |
| Hierarchy | `hierarchy X` with nested `level` + `ordinal:` |

The field-parameter columns in the sample also carry a `relatedColumnDetails` / `groupByColumn` block — another nested structure the parser must round-trip verbatim.

### Round-trip hazards — the correctness bar

1. **`lineageTag` GUIDs.** Report visuals bind to these. Mutating one silently breaks a visual. Never regenerate, never reorder.
2. **`annotation` lines.** `SummarizationSetBy`, `PBI_ResultType`, `Format`. Preserve verbatim.
3. **`changedProperty`.** Records that a user overrode a default (e.g. a rename). Renaming an object may require emitting `changedProperty = Name`. [UNVERIFIED — not present in the sample; confirm by renaming in Desktop and diffing.]
4. **Line endings: CRLF.** The sample culture file is 24,360 CRLF lines, zero bare LF. Writing LF would produce a 24,000-line diff for a one-word change. Detect and preserve per file.
5. **Encoding: UTF-8 without BOM.** Verified on the sample. Read with BOM tolerance, write without.
6. **Tab indentation.** TMDL is indentation-sensitive; Power BI serialises with tabs. Embedded JSON blocks sit at a deeper tab level than their property key, and the closing-delimiter indent sets the block margin.
7. **`ordinal` integers.** Hierarchy levels and calculation items depend on exact zero-based ordinals.

The safest architecture is a lossless CST: parse to a tree that retains every byte of untouched content, mutate only targeted nodes, re-serialise. A property-bag parse-and-regenerate approach will not survive an unedited-save byte-identity test.

## Scale reference

The sample is a mid-size real model, useful as a parser fixture but not as a perf target:

| Metric | Count |
|---|---|
| Tables | 32 |
| Columns | 120 |
| Measures | 55 |
| Hierarchies | 2 |
| Total grid rows | 209 |
| Culture file lines | 24,360 |

The 2,000-object target is roughly 10× this. The culture file scales worse than the table files — synonym `Terms` and `Relationships` phrasings dominate, and at 2,000 objects a ~250,000-line LSDL blob is plausible. Parsing it as JSON once (after extracting the block) is fine; re-serialising the whole blob on every keystroke is not. Debounce and write on explicit save.

## BYOK provider matrix

Browser-origin calls from a static origin, no proxy available.

| Provider | Works | Requirement |
|---|---|---|
| [OpenRouter](https://openrouter.ai/docs/quickstart) | Yes | `Authorization: Bearer`; designed for client-side use |
| [Groq](https://console.groq.com/docs/quickstart) | Yes | `Authorization: Bearer`; OpenAI-compatible |
| [Anthropic](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) | Conditional | `anthropic-dangerous-direct-browser-access: true` + `x-api-key` |
| [Gemini](https://ai.google.dev/gemini-api/docs/api-key) | Conditional | `x-goog-api-key`; Google advises referrer restriction |
| [OpenAI](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) | Fragile | Works, not officially supported for browser origins |
| [Ollama](https://github.com/ollama/ollama/blob/main/docs/faq.md) | Conditional | User sets `OLLAMA_ORIGINS` |
| [LM Studio](https://lmstudio.ai/docs/basics/server) | Conditional | User enables the CORS toggle |
| Azure OpenAI | **No** | Hard-blocked; needs APIM or a proxy |

Azure OpenAI is the awkward case: the likeliest endpoint in a Power BI shop and the one that cannot work from a static site. OpenRouter is the default recommendation.

Key handling: `sessionStorage` by default, `localStorage` behind an explicit "remember on this device" toggle, always with a visible "clear key" action. Show the zero-server statement, recommend a spend-capped key, and warn against shared machines. The key is the user's own, so the risk is local exposure, not server-side leakage.

## File System Access API operational detail

- `FileSystemDirectoryHandle` is structured-cloneable → persist in IndexedDB, skip the picker on return visits ([Chrome guide](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)).
- `requestPermission({ mode: 'readwrite' })` needs transient user activation — wire it to a "Resume editing <folder>" button, never to page load ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission)).
- Chrome 122+ supports [persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api), so the re-grant prompt is not necessarily per-session.
- `createWritable()` writes to a swap file and atomically replaces on `close()` — no torn writes.
- External changes (Power BI Desktop, `git checkout`) are visible on the next `getFile()`. Deleted or renamed targets throw `NotFoundError`; handle it as "folder moved, re-pick."
- Blocked directories: `C:\`, `C:\Windows`, `Program Files`, `AppData`, `.ssh`, `.aws`, browser profile dirs. Normal project folders are fine.
- Verified live in Chromium 150: `showDirectoryPicker` present, `mode: "readwrite"` accepted, `createWritable` and `removeEntry` both on their prototypes, secure context required.

## Reuse basis: PBIP Documenter

[PBIP Documenter](https://github.com/JonathanJihwanKim/pbip-documenter) by Jihwan Kim (Microsoft MVP) is MIT-licensed, 50 stars, plain JavaScript, no build step. It is the read half of this product, already working and already field-tested against a 61-table enterprise BigQuery model.

What it provides:

| Module | Purpose |
|---|---|
| `tmdl-parser.js` | Line-by-line state-machine parser (~900 lines). Handles `database.tmdl`, `model.tmdl`, `tables/*.tmdl`, `relationships.tmdl`, `roles/*.tmdl`, `expressions.tmdl`. Tags calculation-group tables and auto-date tables. |
| `visual-parser.js` | PBIR visual JSON parsing |
| `m-parser.js` | Power Query M step decomposition, 10 step kinds |
| `lineage-engine.js` | Dependency graph across measures, columns, visuals |
| `app.js` | File System Access folder discovery, `.SemanticModel` / `.Report` auto-detection, persona routing |
| `samples/` | Contoso fixture plus a generated large-model fixture |
| `tests/` | Browser test runner with lineage tests |

What it does not provide, and therefore what this project must build:

1. **Any write path.** The parser produces a plain-object model, not a lossless CST. It discards formatting, so it cannot round-trip. Either extend it with a source-span-preserving layer or write a separate serialiser that patches the original text by line range.
2. **`cultures/*.tmdl` parsing.** Not in the handled-file list. The LSDL blob is unread, so all Prep-data-for-AI functionality is new.
3. **`VerifiedAnswers/` discovery.** Not in the folder structure it expects.
4. **An editable grid.** The UI is a documentation viewer with export buttons.
5. **BYOK LLM integration.** Absent entirely.

MIT terms require preserving the copyright notice and licence text in any substantial reuse. Attribution in the README and a retained `LICENSE` header on borrowed files satisfies this. Contributing the write path upstream is worth considering over forking — the author actively maintains the repo and takes issues and PRs.

## Stack

Decided by reuse, not chosen from scratch. Taking Lineage Tracer's canvas means taking its stack.

| Layer | Choice | Why |
|---|---|---|
| Framework | React 18 | `LineageGraph.jsx`, `SidePanel.jsx`, `GraphNode.jsx` are React components; rewriting them in anything else is the whole schedule |
| Build | Vite 6 | Already configured in `bridge/ui/vite.config.js`, including the `base: './'` setting needed for a GitHub Pages subpath |
| Canvas | `@xyflow/react` 12 | The graph renderer the viewer is written against |
| Layout | `elkjs` 0.9 | Star-schema node placement |
| State | `zustand` 5 | `store.js` is 37 KB of selection, path-highlight, and filter logic |
| Styling | Tailwind 4 via `@tailwindcss/vite` | `styles.css` is Tailwind output |
| Icons | `lucide-react` | Used throughout the existing components |
| Grid | To be chosen | Not in Lineage Tracer. Needs virtualised rows for 2,000 objects with inline editing. |
| Deploy | GitHub Actions → Pages | `.github/workflows/pages.yml` is directly adaptable: `npm ci`, `vite build`, `upload-pages-artifact`, `deploy-pages`, all pinned to major tags |

This is a build step, not a hand-authored `index.html`. GitHub Pages serves the built `dist/` output, so "static site" and "zero server" both still hold — the build runs in CI, not at request time, and the deployed artifact is plain files.

What is deliberately not in the stack: no server, no API routes, no database, no bundled Python or WASM (Lineage Tracer's `sqlglot` wheel exists only for dbt SQL parsing), no telemetry, no analytics.

The one genuinely new dependency is the data grid. Candidates worth evaluating against 2,000 rows with inline edit and keyboard navigation: TanStack Table with TanStack Virtual (headless, styles to Tailwind, no opinion on rendering), AG Grid Community (batteries included, heavier, MIT for the community build), or a hand-rolled virtualised table. TanStack is the closest fit to a Tailwind codebase. [ASSUMPTION — not yet evaluated.]

## Reuse basis: Lineage Tracer

[Lineage Tracer](https://github.com/methunt/lineage-tracer) is the author's own project, MIT-licensed, and already solves the diagram problem. It bridges dbt lineage to Power BI lineage, and the Power BI half is directly reusable.

| Module | Purpose |
|---|---|
| `bridge/src/pbip/` | Vendored copy of PBIP Documenter's `tmdl-parser.js`, `visual-parser.js`, `m-parser.js`, `lineage-engine.js`, with its `LICENSE` retained — the attribution precedent is already set |
| `bridge/src/pbip-extract.js` | Runs those parsers headless over a PBIP folder |
| `bridge/src/pbi-graph.js` | Reshapes the parsed model into a `{nodes, edges, stats}` graph. Emits `pbiTable`, `measure`, `page`, `visual` node kinds. Columns nest inside their table rather than becoming standalone nodes; pages aggregate their visuals. Indexes relationship key columns so star-schema keys are not reported as unused, and carries the inactive-relationship flag for `USERELATIONSHIP`-only joins. |
| `bridge/src/graph-builder.js`, `report-data.js` | Graph assembly and report payload |
| `bridge/docs/ui-spec.md`, `design-system.md` | The node/edge contract and visual language, already written down |
| `bridge/test/` | Fixtures and tests for TMDL tables, field parameters, renames, M expressions |

What transfers directly: the graph schema, the nesting and aggregation decisions, the relationship-key indexing, and the field-parameter handling. The dbt half (`dbt_extract.py`, `mapping.js`, the manifest/catalog slots, the bundled `sqlglot` wheel, `dbt-colibri/`) is irrelevant here and should not be carried over — this product has one input, a PBIP folder, and adding a required mapping CSV would break the "open a folder, get a grid" promise.

### The viewer is React, and it does not use the File System Access API

`bridge/ui/` is a Vite + React 18 app, roughly 400 KB of source across 38 files:

| Module | Size | Purpose |
|---|---|---|
| `SidePanel.jsx` | 64 KB | Per-node detail: a measure's DAX, its referenced columns, the visuals and pages that render it |
| `LineageGraph.jsx` | 37 KB | The canvas — pan, zoom, dim-off-path, expand/collapse |
| `store.js` | 37 KB | Zustand state: selection, path highlighting, filters |
| `PageLayout.jsx` | 27 KB | Report page layout reconstruction from PBIR visual geometry |
| `SearchPalette.jsx` | 27 KB | Cross-graph search |
| `Sidebar.jsx` | 25 KB | Navigation tree |
| `GraphNode.jsx` | 21 KB | Node rendering, including nested column rows |
| `Diagnostics.jsx` | 20 KB | Fourteen checks, each row linking back into the graph |
| `tree.js`, `layout.js`, `reveal.js`, `theme.js` | 30 KB | Tree building, ELK layout, focus animation, theming |
| `styles.css` | 58 KB | Tailwind 4 output |

Dependencies: `@xyflow/react` (canvas), `elkjs` (layout), `zustand` (state), `react` + `react-dom`, `lucide-react` (icons), Tailwind 4, Vite 6, `vite-plugin-singlefile`.

Two consequences for this product:

1. **The stack is decided by reuse.** Taking the canvas means taking React, Vite, xyflow, elkjs, zustand, and Tailwind. That is a build step, not a hand-written static page — fine for GitHub Pages, which serves the built output, but it rules out the "single index.html, no tooling" shape. The alternative is rebuilding the canvas from scratch, which does not fit the schedule.
2. **The file layer must be replaced, not reused.** `bridge/ui/src/web/files.js` deliberately avoids the File System Access API: it uses `<input webkitdirectory>` and DataTransfer entry walking, filters to `/\.(tmdl|json)$/i`, and reads everything into an in-memory `{ path: text }` map. Its own comment states the reason — Chromium-only, and read-only access is all that tool wants. This product needs the opposite: `showDirectoryPicker({ mode: 'readwrite' })`, retained `FileSystemFileHandle` objects per file, and `createWritable()` on save. The extractor's `{ path: text }` input contract stays; what produces and persists that map is new code.

Also reusable and worth noting: `Diagnostics.jsx`'s fourteen-check pattern is the natural home for readiness findings if scoring is ever added, and `PageLayout.jsx` proves the PBIR visual geometry is already being parsed — which is what makes "this measure appears on these pages" answerable.

Two design notes worth preserving: nested columns and page-level aggregation are what keep a 61-table model readable, and declared versus derived links are drawn differently so the viewer can tell a parsed inference from a stated fact. The second matters less here, since without dbt inputs every link in this tool is derived.

## Competitive detail

| Tool | Install | Bulk descriptions | Touches LSDL | Cost |
|---|---|---|---|---|
| [Tabular Editor 2](https://github.com/TabularEditor/TabularEditor) | Windows | Yes | No | Free, GPLv3 |
| [Tabular Editor 3](https://tabulareditor.com) | Windows | Yes | No | $100–960/user/yr |
| [Semantic Link Labs](https://github.com/microsoft/semantic-link-labs) | Python/Fabric | Yes, scripted | Partial, via API | Free, MIT |
| [TMDL View (Desktop)](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-tmdl-view) | Windows | Text find/replace only | Hand-edit JSON | Free |
| TMDL View (web) | None | Text only | Hand-edit | Free — **cloud models only** |
| Prep data for AI dialog | Desktop or Service | No, one at a time | Yes | Free |
| [PBIP Documenter](https://jonathanjihwankim.github.io/pbip-documenter/) | None | Read-only | No | Free |
| [PBIP Lineage Explorer](https://github.com/JonathanJihwanKim/pbip-lineage-explorer) | None | Read-only | No | Free |
| [Semanticus Studio](https://semanticus.com.au) | Web | Yes | Yes | Freemium, Pro-gated |
| [Bravo](https://github.com/sql-bi/Bravo) / [DAX Studio](https://daxstudio.org) / [PBI-Inspector](https://github.com/NatVanG/PBI-Inspector) | Varies | No | No | Free |

Semanticus Studio is the closest competitor and was not surfaced by the automated competitor scan — the user supplied it. Its AI Readiness screen shows a letter grade (B, 82/100), six weighted categories (Naming & Clarity, Descriptions & Grounding, Synonyms, Data Types & Formatting, Relationships, Scale & Limits), a findings list with per-rule waiving, "Apply N safe fixes" gated behind Pro, and a footer showing local-file editing with an XMLA publish destination. It also carries BPA, workflows, edit history, and an AI assistant.

## Parked ideas

- Readiness scoring. Ceded to Semanticus for v1. If it returns, the interesting angle is scoring against Microsoft's published checklist with citations, not a proprietary grade.
- Diff preview before write. High value, cheap once the CST exists. First candidate for v2.
- DAX-aware description drafting: read a measure's expression, propose a description of what it computes. Better than name-only prompting.
- Translation cultures — the same LSDL machinery generalises to non-`en-US` culture files.
- House-style description templates applied across many models.
- Field-parameter awareness in AI instructions; Microsoft's guidance explicitly calls for instructions covering field parameters and calculation groups when present.
