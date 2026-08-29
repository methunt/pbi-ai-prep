# Addendum: PBI AI Prep PRD

Mechanism, transport, and technical-how decisions the PRD deliberately excludes. Downstream `bmad-architecture` consumes this. The brief's own addendum (`../../briefs/brief-pbi-ai-prep-2026-08-28/addendum.md`) holds the verified LSDL and TMDL findings and the competitive detail; this file does not repeat them and should be read alongside it.

## Stack, and why it was not chosen freely

The stack follows from reusing Lineage Tracer's canvas. Rejecting the stack means rewriting `LineageGraph.jsx`, `SidePanel.jsx`, `GraphNode.jsx`, `store.js`, and `PageLayout.jsx` — roughly 190 KB of working React — which does not fit the schedule.

| Layer | Choice | Consequence |
|---|---|---|
| Framework | React 18 | The reused components are React |
| Build | Vite 6 | `bridge/ui/vite.config.js` already handles the Pages subpath with `base: './'` |
| Canvas | `@xyflow/react` 12 | What the viewer is written against |
| Layout | `elkjs` 0.9 | Star-schema node placement |
| State | `zustand` 5 | `store.js` is selection, path-highlight, and filter logic |
| Styling | Tailwind 4 | `styles.css` is Tailwind output |
| Icons | `lucide-react` | Used throughout |
| Grid | Undecided — see below | Not present in either reused project |
| Deploy | GitHub Actions → Pages | Adapt `.github/workflows/pages.yml`: `npm ci`, `vite build`, `upload-pages-artifact`, `deploy-pages` |

"Static site" survives this. The build runs in CI; the deployed artifact is plain files; there is no server at request time. What does not survive is the "single hand-written index.html" shape.

Deliberately absent: no backend, no API routes, no database, no bundled Python or WASM, no telemetry. Lineage Tracer's `sqlglot` wheel (670 KB) exists only for dbt SQL parsing and must not be carried over.

### Grid library

Open question 5 in the PRD. Requirements: 2,000 rows virtualised, inline cell editing, full keyboard traversal, and styling that does not fight Tailwind.

- **TanStack Table + TanStack Virtual** — headless, no styling opinion, composes with Tailwind, editing is hand-wired. Closest fit; most work.
- **AG Grid Community** — editing and keyboard navigation built in, MIT for the community build, brings its own theme layer that will conflict with Tailwind, and is heavy.
- **Hand-rolled virtualised table** — full control, no dependency, and the keyboard model is the part that takes longest to get right.

TanStack is the provisional pick. Decide before starting §4.3.

## Read path: what is inherited

Two MIT projects. Attribution obligations: retain each `LICENSE`, credit both in the README. Lineage Tracer already vendors PBIP Documenter's parsers under `bridge/src/pbip/` with the licence retained — that precedent is the pattern to follow.

| From | Module | Provides |
|---|---|---|
| PBIP Documenter | `tmdl-parser.js` | Line-by-line state machine over the definition tree; calculation-group and auto-date tagging |
| PBIP Documenter | `visual-parser.js` | PBIR visual JSON |
| PBIP Documenter | `m-parser.js` | Power Query M step decomposition |
| PBIP Documenter | `lineage-engine.js` | Dependency graph |
| Lineage Tracer | `pbip-extract.js` | Runs those parsers headless over a `{ path: text }` map |
| Lineage Tracer | `pbi-graph.js` | `{nodes, edges, stats}` with `pbiTable`/`measure`/`page`/`visual` kinds, nested columns, page aggregation, relationship-key indexing, inactive-relationship flags |
| Lineage Tracer | `bridge/ui/src/*` | The whole viewer: canvas, side panel, search, diagnostics, page layout |
| Lineage Tracer | `bridge/docs/ui-spec.md` | The node/edge contract, already written down |
| Lineage Tracer | `bridge/test/fixtures/*` | TMDL table, field-parameter, rename, and M-expression fixtures |

Not inherited: `dbt_extract.py`, `mapping.js`, `dbt-colibri/`, the manifest and catalog input slots, the `sqlglot` wheel. Lineage Tracer requires four inputs including a hand-authored mapping CSV; this product requires one folder. Adding a required CSV would break the premise.

## Write path: the part that does not exist yet

### Why the inherited parser cannot write

`tmdl-parser.js` produces plain objects and discards formatting. Serialising from those objects regenerates the file and loses `lineageTag` placement, annotation order, blank lines, and indentation choices — failing FR-23 immediately.

### Chosen mechanism: span-anchored patching

Not a full CST. Parse once, recording byte offsets for each object's declaration line and its existing doc-comment block. To write, apply a sorted list of byte-range replacements to the original text, descending by offset so earlier edits do not shift later ones.

This is the minimum that satisfies FR-23: untouched bytes are never re-emitted, so they cannot change. It costs one extension to the inherited parser — offset tracking — rather than a rewrite.

Edit primitives needed:

| Edit | Mechanism |
|---|---|
| Add description | Insert `///` lines before the declaration line at the declaration's indentation |
| Change description | Replace the existing doc-comment block's byte range |
| Remove description | Delete the doc-comment block's byte range including its trailing newline |
| Rename | Replace the name token within the declaration line, quoting per TMDL rules |
| Toggle visibility | Insert or delete the `isHidden` property line at child indentation |

Line endings: detect per file at read (`\r\n` vs `\n`) and emit the detected convention. The reference model is entirely CRLF; writing LF would produce a 24,000-line diff for a one-character change.

Encoding: read with BOM tolerance, write UTF-8 without BOM.

Multi-line descriptions: each line gets its own `///` prefix. A description containing a newline is therefore N doc-comment lines, and the span replaced on a later edit is the whole block.

### LSDL write path

Different shape, because the payload is JSON inside a text file.

1. Locate the `linguisticMetadata` property, its triple-backtick delimiters, and the trailing `contentType: json` line. Record the block's byte range and its indentation depth.
2. Parse the block's content as JSON.
3. Mutate the parsed object: `CustomInstructions` string, `Entities[key].Terms` array, `Entities[key].Visibility` object.
4. Re-serialise the JSON and re-indent every line to the recorded depth.
5. Replace the block's byte range, leaving the `cultureInfo` line, the delimiters, and `contentType: json` untouched.

The whole blob is re-serialised, so its internal formatting is normalised on any LSDL edit. That is acceptable — it is machine-written JSON, and Power BI regenerates it wholesale. It does mean an LSDL edit produces a large diff in that one file. Worth stating in the README.

Ordering: JSON key order is not semantically meaningful, but preserving insertion order avoids gratuitous diff churn. `JSON.parse` and `JSON.stringify` preserve key order for non-numeric keys, so a round-trip with no mutation is stable.

Escaping: `CustomInstructions` is a single string with `\n` escapes. Standard `JSON.stringify` handles it. The 10,000-character limit counts the decoded string, not the escaped form.

### External-change detection

FR-25. Cheapest sufficient mechanism: retain the exact text read per file, and before writing, re-read and compare. A hash would be smaller but the text is already held for span patching, so comparison is free.

Rejected: `File.lastModified` comparison. It is coarse, and a `git checkout` restoring identical content would trigger a false conflict.

### Atomicity

`createWritable()` writes to a swap file and atomically replaces on `close()`, so a single file cannot be left torn. Multi-file atomicity is not available — there is no transaction across files. FR-24 handles this by reporting which files were written before a failure, rather than pretending the save was atomic.

## File layer

Lineage Tracer's `bridge/ui/src/web/files.js` must be replaced, not adapted. It deliberately avoids the File System Access API — its own comment says Chromium-only and read-only is all that tool wants — and uses `<input webkitdirectory>` plus DataTransfer entry walking.

What the replacement must do:

1. `showDirectoryPicker({ mode: 'readwrite', id: 'pbip' })` from a user gesture. The `id` makes the picker reopen where it last was.
2. Recursive walk retaining a `FileSystemFileHandle` per file, not just its text. The inherited extractor's `{ path: text }` contract is preserved as a derived view.
3. Filter to `.tmdl` and `.json`, matching the existing `WANTED` pattern, so cached `.abf` files and report images are never read.
4. Persist the `FileSystemDirectoryHandle` in IndexedDB for the recent-projects list (FR-4).
5. `queryPermission` on resume; `requestPermission` only from a user gesture, since it throws otherwise.
6. Treat `NotFoundError` on a handle as "folder moved or deleted".

Chrome 122+ supports persistent File System Access permissions, so the re-grant prompt is not necessarily per session — but the code must handle the prompt case regardless.

## Parsing performance

FR-8's 5-second budget, and open question 6.

Measured on the reference model (`_test_pbip_w_ai`): 32 tables, 209 objects, 24,360-line culture file. At 2,000 objects — roughly 10× — the culture file is the risk, not the table files. Synonym `Terms` and relationship `Phrasings` dominate its size and scale with object count, so a ~250,000-line LSDL is plausible.

Staging:

1. **Eager:** the definition tree minus cultures. Produces the grid. This is the 5-second budget.
2. **Deferred:** the LSDL, on first Prep for AI tab open, with a visible loading state.
3. **Deferred:** the report layer, on first need — usage columns or the canvas.

If measurement shows LSDL parsing blocks noticeably, move it to a worker. Do not build the worker speculatively; the deferral may be sufficient.

Grid virtualisation is not optional at 2,000 rows regardless of parse speed.

## BYOK transport

| Provider | Works from a static origin | Requirement |
|---|---|---|
| OpenRouter | Yes | `Authorization: Bearer`; built for client-side use |
| Groq | Yes | `Authorization: Bearer`; OpenAI-compatible |
| Anthropic | Conditional | `anthropic-dangerous-direct-browser-access: true` plus `x-api-key` |
| Gemini | Conditional | `x-goog-api-key` |
| OpenAI | Fragile | Works; not officially supported for browser origins |
| Ollama | Conditional | User sets `OLLAMA_ORIGINS` |
| LM Studio | Conditional | User enables the CORS toggle |
| Azure OpenAI | No | Hard-blocked without a proxy |

Azure OpenAI is the awkward case: the likeliest endpoint in a Power BI shop, and the one that cannot work. The configuration UI should name it as unsupported rather than letting the user discover it through a CORS error.

Design consequence: the provider field is a free-text base URL plus model name, not a fixed list. That covers every OpenAI-compatible endpoint including local ones, and avoids maintaining a provider registry. Ship OpenRouter as the suggested default.

Key storage per FR-26: session-only by default, `localStorage` behind an explicit opt-in, one action to clear everything. The key is the user's own, so the risk is local exposure on a shared machine, not server-side leakage.

## Prompt construction

Not in the PRD, but decided: the quality of FR-27 depends entirely on context, and a name-only prompt produces exactly the generic restatement Microsoft's guidance warns against.

Per-object prompt payload:

- Object name, type, parent table, data type, format string, visibility.
- DAX expression for measures, calculated columns, and calculation items.
- Referenced columns and measures, from the inherited lineage engine.
- Relationship role — is this column a relationship key, and to what.
- Usage — which measures and visuals reference it, with counts.
- Sibling context — the other objects in the same table and their descriptions, so terminology stays consistent.
- Instruction: front-load disambiguation, units, and grain in the first 200 characters; stay under 500; do not restate the name.

Batching: one request per object gives better results and costs more calls; batching a table's objects into one request keeps terminology consistent within the table. Prefer per-table batching with the table's existing descriptions included as style examples.

## Reference fixture

`_test_pbip_w_ai/Atrium Sigma` is the correctness fixture for FR-23. It is a real model with real Prep-for-AI content: LSDL 4.2.0, populated `CustomInstructions`, 118 hidden entities, 54 authored states, four verified answers, four field-parameter tables, CRLF throughout, UTF-8 without BOM, `qnaEnabled: true`.

It contains client data in its names. Before the repository goes public, either sanitise it or keep it out of the repo and point the fidelity check at a generated fixture plus the Contoso sample both reused projects already ship.

## Deferred mechanisms

- **In-tool diff preview.** The span-patch machinery makes this nearly free: apply patches in memory, run a diff against the original text, render it. First v2 candidate.
- **Worker-based parsing.** Only if measurement demands it.
- **Undo stack.** The pending-changes list is a flat set of edits; a proper undo history means an ordered command log. Not v1.
- **`changedProperty` emission on rename.** Open question 1. If Power BI requires it, it becomes an edit primitive.
