# PRD Digest — extracted 2026-08-30 (source: prd-pbi-ai-prep-2026-08-28/prd.md + addendum.md, both read in full)

## 1. Users, personas, stakes
- Audience: BI developer editing local PBIP/TMDL projects in a browser; solo author, downstream bmad runs, open-source contributors [§0]. No hobby/internal/consumer/regulated labels in sources; stakes as written: production semantic models, shared branches reviewed via `git diff`, locked-down corporate/client machines where nothing can be installed [§1, §2.1, §2.3 UJ-4; addendum: fixture "contains client data in its names"].
- UJ-1 "Ravi inherits a 2,000-object model and has a week." — 32 tables, no descriptions; Edge; grants readwrite once; grid loads with "empty description" filter (180 rows); 200-character Copilot cutoff marker; save → `git diff` shows only intended `///` lines [§2.3].
- UJ-2 "Sofia writes the instructions that stop Copilot guessing." — month-grain model; edits `CustomInstructions` with live count vs 10,000; adds "revenue" synonym for `[Total Spend]`; excludes six helper measures; republish from Desktop, refresh in service [§2.3].
- UJ-3 "Dan checks what a field touches before he describes it." — Relationships tab click dims everything off path (one relationship, two measures, four visuals across two pages); side panel shows measure DAX [§2.3].
- UJ-4 "Priya works on a laptop she cannot install software on." — consultant, no admin rights; bookmark → clone client's PBIP repo → edit → commit → PR, "nothing installed and nothing uploaded" [§2.3].
- Non-users v1: cloud-model users (no XMLA); Firefox/Safari users; legacy `.pbix`/`model.bim`; report authors changing visuals [§2.2].

## 2. Goals + explicit non-goals
- Goal: "the missing editor" — React static app on GitHub Pages, File System Access API read/write of local TMDL, entire model parsed in browser; write path is the part "nobody has built" [§1].
- Success bars: SM-1 byte-identical edit-free save; SM-2 edited model opens in Desktop no-error; SM-3 "100 descriptions written in under 10 minutes using keyboard navigation only"; SM-4 load <5s at 2,000 objects; SM-5 external-use signal; counter-metrics SM-C1/C2/C3 "do not optimize" [§10].
- Non-goals verbatim [§8]: "Not a readiness scorer", "Not a report editor", "Not a publisher", "Not a verified-answer author", "Not cross-browser", "Not a legacy-format tool", "Not a Git client".
- Out of MVP scope [§9.2]: translation cultures beyond primary; in-tool diff preview (first v2 candidate); offline review round-trip HTML; description templates/house-style; DAX reference rewriting; undo history beyond discarding pending changes; readiness scoring ("Non-goal, not deferred").

## 3. Features (verbatim names + one-line behavior; §4)
- FR-1 "Pick a project folder with readwrite access" — single-gesture picker, readwrite mode [4.1].
- FR-2 "Discover semantic models and reports within the selection" — one model → straight to grid; several → selection step by folder name [4.1].
- FR-3 "Reject unsupported project formats" — refuses legacy TMSL and pbism <4.0; non-PBIR report → features "disabled rather than broken"; missing `qnaEnabled: true` → banner naming setting + Copilot won't use instructions until enabled+republished [4.1].
- FR-4 "Restore a previous project without re-picking" — persisted handles; recent list on landing [4.1].
- FR-5 "Parse the TMDL definition tree into model objects" — one object per declaration, recorded byte ranges; distinct classes: calculated column, calculation group/item, field parameter, DAX UDF [4.2].
- FR-6 "Parse the LSDL from the culture file" — extract `linguisticMetadata` JSON, bind to model objects; absent → empty LSDL [4.2].
- FR-7 "Parse the report layer for field usage" — per-object visual/page usage; broken refs attributed to visual; field-parameter-reached fields count as used [4.2].
- FR-8 "Load a 2,000-object model without blocking the interface" — 5s to grid; deferred LSDL + report parsing; main-thread blocks ≤50ms [4.2].
- FR-9 "Present every model object in one grid" — columns in order: lineage icon, object type (colored dot + plain label, no background), parent table, current name, rename-to input, Used count, description, DAX expression; tables are first-class rows; hidden objects visually distinguished [4.3].
- FR-10 "Filter and sort the grid" — one-action no-description and zero-reference filters; type/table/free-text filter; sortable headers with arrow; 50 rows/page, ellipsis past seven pages, "Showing X–Y of Z" [4.3].
- FR-11 "Edit descriptions inline" — 500-char decoded cap refuses input; 200-char Copilot cutoff marker; multi-line as consecutive `///`; Tab/Shift+Tab between cells, Enter commits+moves down, Escape reverts [4.3].
- FR-12 "Rename objects" — sibling collision rejected naming conflict; TMDL quoting rules; `lineageTag` unchanged; warning lists every referencing DAX expression with no rewrite; propagates in same write to report visual bindings + LSDL entity key [4.3].
- FR-13 "Toggle object visibility" — writes/removes `isHidden` with `changedProperty = IsHidden`; model visibility and AI data schema visibility separate, "never conflated" [4.3].
- FR-14 "Review pending changes before saving" — object/field/old/new list; per-change discard; survives tab navigation; close-tab browser confirmation [4.3].
- FR-15 "Edit AI instructions" — `CustomInstructions` editor, live count vs 10,000, refused beyond [4.4].
- FR-16 "Manage synonyms per object" — state-labelled chips (generated + suggested labelled), 20-live cap with 'N/20', ≤6 inline + '+N more' expander; removal tombstones as `Deleted` [4.4].
- FR-17 "Set the AI data schema" — per-table explorer (collapsed: field count, included/total, synonym totals); include toggles; bulk include/exclude over filter selection; dependency warning names both objects; table dot grey = all excluded, blue = any included [4.4].
- FR-18 "View verified answers" — read-only list with trigger prompts; states authored in Power BI; rail beside instructions editor [4.4].
- FR-19 "Render the model as a relationship graph" — pan/zoom/zoom-to-fit; distinct marks for field-parameter + calculation-group tables; inactive relationships distinguished; nodes collapsed at load [4.5].
- FR-20 "Trace impact from a selected object" — off-path dims; dependent measures/visuals/pages with counts; visual→model trace; DAX side panel [4.5].
- FR-21 "Jump between canvas and grid" — canvas→grid filtered/scrolled; grid "View on canvas" centres selection [4.5].
- FR-22 "Write metadata changes into the original TMDL files" — only changed files; `///` at declaration indentation; original line endings; UTF-8 no BOM; atomic replace [4.6].
- FR-23 "Preserve byte-level fidelity on an unmodified save" — byte-identical incl. culture-file LSDL indentation; automated check [4.6].
- FR-24 "Report save failures without partial state" — revoked permission → report every file already written; retry re-requests permission on click; pending changes retained [4.6].
- FR-25 "Detect external changes to open files" — pre-write comparison; blocks write, offers reload or overwrite naming file; reload discards only that file's pending changes "and says so" [4.6].
- FR-26 "Configure a BYOK provider" — user endpoint/model/key; session-only default; one-action clear; screen states requests go browser→provider, recommends spend-capped key [4.7].
- FR-27 "Draft descriptions in bulk" — over current filter selection, count stated before run; lands as unsaved edits "visually marked as AI-drafted"; provider errors leave every row unchanged; cancellable keeping returned batches, discarding in-flight [4.7].
- FR-28 "Draft AI instructions from the model" — unsaved draft "never overwrites existing instructions without confirmation"; limit-checked before insertion [4.7].
- FR-29 "Suggest synonyms" — pending authored suggestions accepted/rejected individually; never duplicates [4.7].
- FR-30 "Select objects across the whole grid" — checkbox by `lineageTag` surviving sort/filter/search/page; Shift-click range, Space toggles focused row; "Select all N matching"; bar shows out-of-filter count + one-click clear [4.8].
- FR-31 "Act on a selection through a contextual bar" — only when selection exists: "Apply renaming", "Set description", "Include/Exclude from the AI data schema", "Show/Hide in model", "Delete selected", "Clear"; destructive styling only on delete [4.8].
- FR-32 "Apply a bulk rename transform" — find/replace, strip prefix, strip suffix, underscores-to-spaces, Title Case in stated order; live current→new preview; collisions block apply naming conflicts [4.8].
- FR-33 "Delete objects with a visible blast radius" — import columns via fresh final M step `PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(previous, {...})`; others span-patched; wave cascade rounds confirmed in memory; dialog groups by table with counts; one warning: "cannot be undone here — only via Git" [4.8].
- FR-34 "Land the user before any folder is picked" — landing states product, browser-capability badge, open-folder with write-permission rationale beneath; recent projects; declined permission → read-only with controls "visible but disabled with an explanation — disabled, never hidden" [4.9].
- FR-35 "Show parse progress without blocking" — four-stage stepper "definition tree, model objects, lineage graph, report layer" with live counts + progress bar [4.9].
- FR-36 "Ship one theme, light by default" — light default; dark toggle user-initiated, persisted in localStorage; does not follow prefers-color-scheme [4.9].
- FR-37 "Summarise each tab in KPI cards" — uppercase label + live figure + one-line plain-English definition; card sets verbatim below.
- FR-38 "Split Prep for AI into two sub-tabs" — segmented 'AI instructions' / 'AI schema & synonyms'; full-height editor, 10,000-char gauge + verified-answers rail [4.9].

## 4. Journeys (as written, compressed)
- UJ-1: open in Edge → pick model folder → grant readwrite once → grid with "empty description" filter → type down column, tabbing between rows → save → `git diff`. Edge: Desktop open on same model → save fails on locked file, tool names file, says close Desktop [§2.3].
- UJ-2: Prep for AI tab → `CustomInstructions` live count → grain + metric-routing rules → "revenue" synonym → exclude six helper measures → save → republish → refresh service [§2.3].
- UJ-3: Relationships tab → click column → off-path dims with counts → side panel DAX → back to grid → write description [§2.3].
- UJ-4: bookmark → clone client's PBIP repo → edit descriptions → commit → pull request [§2.3].

## 5. States, edge cases, errors, accessibility, platform
- Tab names verbatim: "Description & Update tab", "Prep for AI tab", "Relationships tab", landing screen; `mockup/index.html` is "the visual contract these FRs encode" (§0, §9.1).
- Unsupported engine: message names "Chrome, Edge, and Opera", no picker (FR-1); capability badge on landing (FR-34). Platform (§7): Chromium desktop v86+, secure context (HTTPS), desktop only, "No installation, no extension, no account."
- Discovery refusals: no Semantic Model folder → message "states what was looked for"; "Every refusal names the file inspected and the value found" (FR-2, FR-3).
- Resume (FR-4): user-gesture permission stating which folder; vanished target "reported as moved or deleted and offered for removal"; recent list "cannot display a full filesystem path — only the folder name the browser reports."
- Parse edges: failure "with file name and line number, remaining files still load" (FR-5); LSDL binding to nonexistent object "retained and flagged, not dropped" (FR-6); no culture file → Prep tab "available and empty" (FR-6); unresolved visual reference reported + attributed (FR-7); no Report folder → usage columns "render as unavailable rather than zero" (FR-7).
- Grid states: zero Used renders "'Unused' — the light-blue attention state on this tab; used counts render grey" (FR-9); edited cells "visually marked as changed until saved" (FR-11).
- Save edges: locked file named (UJ-1); revoked permission → files-written report + user-initiated retry (FR-24); external change → reload-or-overwrite (FR-25).
- Delete safety: each cascade round names newly orphaned objects; dependents named per object — "the tool surfaces facts, never a safety verdict" (FR-33).
- AI edges: nothing configured by default (FR-26); failed request "reports the provider's error and leaves every row unchanged" (FR-27).
- Empty states: no `VerifiedAnswers` folder → "an empty state, not an error" (FR-18); no instructions → empty editor that can save new (FR-15).
- Accessibility (§5): grid "fully keyboard-operable, since keyboard editing is the core workflow, to WCAG 2.1 AA. Tab order follows column order left to right, row by row; every interactive element shows a visible focus indicator."
- Failure legibility (§5): "Every refusal and every failure names the file, the value found, and what was expected."

## 6. Performance + UX-binding constraints
- Perf: folder→grid ≤5s at 2,000 objects; 60fps scroll "no scroll frame over 16ms" on grid + pending-changes list; filter ≤200ms; main-thread block ≤50ms; 50 rows/page pager.
- Staging (addendum): eager definition tree carries 5s budget; LSDL deferred to first Prep-for-AI open "with a visible loading state"; report layer deferred to first need; worker only "if measurement demands it".
- "Grid virtualisation is not optional at 2,000 rows regardless of parse speed" (addendum).
- Stack (addendum): React 18, Vite 6, @xyflow/react 12, elkjs 0.9, zustand 5, Tailwind 4, lucide-react; grid library undecided (open question 5), TanStack Table + TanStack Virtual provisional.
- BYOK UI (addendum): free-text base URL + model name, not fixed list; OpenRouter suggested default; Azure OpenAI hard-blocked — "The configuration UI should name it as unsupported rather than letting the user discover it through a CORS error."
- Key storage: session-only default, localStorage behind explicit opt-in, one action clears every tier.
- Write-path UX (addendum): line endings detected + preserved; LSDL edit re-serialises whole blob → "a large diff in that one file. Worth stating in the README."; 10,000-char limit "counts the decoded string, not the escaped form".
- Per-object prompt payload (addendum, feeds FR-27): name, type, parent table, data type, format string, visibility, DAX, referenced columns/measures, relationship role, usage counts, sibling descriptions; "front-load disambiguation, units, and grain in the first 200 characters; stay under 500"; per-table batching, existing descriptions as style examples.
- KPI card labels verbatim (FR-37): Description tab "Objects, Backlog, Unused, Pending edits, Coverage"; Prep for AI "AI reach, Instruction budget, Synonyms authored, Excluded, Verified answers (informational)"; Lineage "Tables, Edges, Isolated nodes, Visual bindings, Broken references".
- Descope order if schedule slips: FR-26–29, then FR-34–38, then FR-19–21; floor = discovery, parsing, grid with selection/bulk actions, Prep for AI, save path (§9.1).
