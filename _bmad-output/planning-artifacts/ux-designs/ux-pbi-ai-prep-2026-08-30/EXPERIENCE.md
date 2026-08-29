---
name: PBI AI Prep
status: final
updated: 2026-08-30
sources:
  - _bmad-output/planning-artifacts/prds/prd-pbi-ai-prep-2026-08-28/prd.md
  - _bmad-output/planning-artifacts/prds/prd-pbi-ai-prep-2026-08-28/addendum.md
  - mockup/index.html
---

# PBI AI Prep — Experience Spine

> Paired with `DESIGN.md` — the visual identity contract. Conflict rule: the PRD is the sole behavioral authority (FR-1..38, states, a11y, perf); `mockup/index.html` is a non-normative visual sample contributing tokens, layout skeleton, and user-approved microcopy only — its functions are demo stubs, never decisions (user override). Spine wins on conflict. Token references like `{colors.primary}` resolve to `DESIGN.md` frontmatter.

## Foundation

**Form factor:** Chromium desktop web app — Chrome, Edge, and Opera v86+, secure context (HTTPS), desktop only. "No installation, no extension, no account." A React 18 static app on GitHub Pages; File System Access API reads and writes the local TMDL; the entire model parses in the browser — "Nothing leaves your machine — parsing runs locally."

**UI system:** none. A bespoke Tailwind 4 system; `DESIGN.md` is the visual identity reference and owns every token ({colors.primary} family, {typography.kpi-value} ramp, {rounded.md} radii band). This spine owns behavior.

**Dark mode** is a user-initiated toggle (landing + header), persisted in `localStorage 'theme'`. It never follows `prefers-color-scheme` (FR-36).

**What this is not** (binding PRD non-goals): "Not a readiness scorer", "Not a report editor", "Not a publisher", "Not a verified-answer author", "Not cross-browser", "Not a legacy-format tool", "Not a Git client". Git operations (clone, commit, PR) belong to the user's own tooling; verified answers are read-only here. In-tool AI drafting (FR-26..29) is deferred to v2; v1 ships the Copy-Prompt workflow only.

## Information Architecture

Landing → parse → app shell (header / tabs / footer). Visual reference: [mockups/index.html](mockups/index.html).

| Surface | Reached from | Purpose |
|---|---|---|
| Landing | App open / bookmark | 'Open PBIP folder' with write-permission rationale beneath; browser-capability badge; tag row 'TMDL 4.2 · PBIR 2.3 · LSDL 4.2.0'; recent projects; theme toggle |
| Recent projects | Landing | Resume a previous project without re-picking (FR-4); resuming requests permission from a user gesture and states which folder is being resumed |
| Parse screen | Landing open/recent | Four-stage progress stepper (FR-35) |
| Model picker | Discovery, when a folder holds several models | Selection step by folder name (FR-2) |
| App shell | Parse complete | 52px header (project chip, tab nav with counts, pending chip, Save, theme), 32px footer |
| Description & Update tab | Header tab (mono count '209') | KPI row, filters, the one grid (FR-9..14, 30..33, 37) |
| Prep for AI tab → 'AI instructions' sub-tab | Header tab | Full-height `CustomInstructions` editor, 10,000-char gauge, verified-answers rail (FR-15, FR-18, FR-38) |
| Prep for AI tab → 'AI schema & synonyms' sub-tab | Header sub-tab | Per-table reach + synonyms explorer (FR-16, FR-17, FR-38) |
| Lineage tab | Header tab, row lineage icon, 'View on canvas' | Relationship graph, impact trace, DAX side panel (FR-19..21). PRD §5 also names this the "Relationships tab"; shipped label 'Lineage' per mockup + FR-37 |
| Pending-changes modal | Header pending chip / Save | Review before write (FR-14) |
| Rename modal, Set-description modal | Action bar | Bulk transforms (FR-31, FR-32) |
| Delete blast-radius dialog | Action bar | Grouped, wave-confirmed deletion (FR-33) |
| External-change dialog | Save path, on pre-write mismatch | Reload-or-overwrite naming the file (FR-25) |
| Save-failure report | Save path, on failure | Files-written report + retry (FR-24) |
| Lineage side panel | Node click on canvas | Selection detail, DAX, 'Select & return to grid' (FR-20) |

Modal stacks one level deep. Every dialog closes on Escape and scrim click.

**Closure check.** Every PRD need has a surface: FR-1/34 → landing; FR-2/4 → model picker + recent projects; FR-3 → refusal states on landing/discovery and the `qnaEnabled` banner on Prep for AI; FR-5..8 → parse screen; FR-9..14, 30..33 → Description & Update; FR-15..18, 38 → Prep for AI (FR-26..29 deferred to v2 — see the annex); FR-19..21 → Lineage; FR-22..25 → save path surfaces; FR-36 → theme toggle; FR-37 → KPI rows on all three tabs (the mockup's empty Lineage KPI row is a demo shortcut — FR-37 requires the five cards: Tables, Edges, Isolated nodes, Visual bindings, Broken references). **Surface-only gaps** (PRD-required, no journey touches them): the delete dialog (FR-33) — no UJ-1..4 step deletes; the model picker is only conditionally reached (UJ-1, when a folder holds several models). **Spine-only surfaces** (PRD-required, mockup-absent — visuals follow the Modal/panel patterns): external-change dialog, save-failure report, and the real model picker.

## Voice and Tone

The product **surfaces facts, never a safety verdict**. It never says "safe", "risky", or "dangerous" about a model; it names files, values, and consequences, and lets the developer decide.

**Every refusal and every failure names the file, the value found, and what was expected.** Discovery refusals "state what was looked for" (FR-2/3); parse failures carry file name + line number.

No marketing language. No celebration, no reassurance, no exclamation marks. Microcopy is short, complete, and literal.

| Do (verbatim from sources) | Don't |
|---|---|
| "Removal writes an M-query step and cannot be undone here — only via Git." | "This action is dangerous!" |
| "Overwrites existing text on every selected object." | "This will update your descriptions." |
| "Review before writing to disk. Every change is reversible until you save." | "Are you sure you want to save?" |
| "Writes to 6 files · UTF-8 · CRLF preserved" | "Saving…" |
| "Nothing leaves your machine — parsing runs locally." | "Your data is 100% secure with us." |
| "No downstream references of any kind" | "This object appears unused (probably safe to delete)" |
| "Renames also update report JSON bindings and LSDL entity keys" | "Rename completed successfully ✓" |
| "— a sibling in the same table already uses that name. Adjust the rules to continue." | "Collision error 409" |
| "Copilot reads the first 200 characters. 500 character limit per description." | "Keep descriptions concise for best results" |
| "reported as moved or deleted and offered for removal" | Silent failure |
| "disabled, never hidden" — controls disabled with an explanation | Hiding controls the current permission doesn't allow |
| "cannot display a full filesystem path — only the folder name the browser reports" | Inventing a full path |

KPI one-line definitions are product copy, carried verbatim in Component Patterns (KPI card row).

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md` Components; names are identical there.

| Component | Use | Behavioral rules |
|---|---|---|
| Button | All chrome | Primary = the one committed action per context (Save, 'Apply to selected'). Danger = delete only. Ghost = dismiss/clear/toggle. Disabled states explain themselves (see State Patterns). |
| Chip | Filters, micro-actions, bulk include/exclude | `.on` = active filter. 'All 209' / 'Empty 180' / 'Unused 24' set filter mode; 'All types' / 'All tables' are real type/table filters (FR-10 — the mockup's no-handler state is a demo shortcut, not a decision). |
| Field | Search, rename-to, dialog inputs | Grid search matches lowercase substring across name + table + description + DAX; resets page 1. |
| Switch | AI-schema include toggles | `role="switch"`, `aria-checked`, label 'AI include'. Toggling stages a pending change; never writes. |
| Tab | Header nav + 2 AI sub-tabs | Switching tabs never loses state; pending changes survive tab navigation (FR-14). Sub-tab pill shows '54/209' reach. Sub-tab hint swaps with the active sub-tab: 'Grounding rules Copilot reads before every answer.' (AI instructions) ↔ 'Choose what Copilot can reach, field by field, and teach it your terms.' (AI schema & synonyms). |
| Pill | State labels everywhere | Tones carry fixed meanings (t-cyan all-included, t-amber partial, t-slate neutral, t-rose broken). |
| Used-count pill | Grid Used column, side panel | u0 blue attention / u1 grey / u6 grey strong ({components.used-pill.u0}). Zero renders 'Unused'. |
| KPI card | One row per tab | Uppercase label + live figure ({typography.kpi-value}) + one-line definition. Label sets verbatim (FR-37) — Description: **Objects, Backlog, Unused, Pending edits, Coverage**; Prep for AI: **AI reach, Instruction budget, Synonyms authored, Excluded, Verified answers (informational)**; Lineage: **Tables, Edges, Isolated nodes, Visual bindings, Broken references**. (The mockup compresses 'Pending edits'→'Pending' and 'Instruction budget'→'Budget'; PRD labels win.) Definitions verbatim: 'Every table, column, measure and calc item in the model.' · 'No description yet. Copilot reads descriptions first.' · 'Zero downstream references anywhere in the lineage graph.' · 'Edits staged this session, not yet written to disk.' · 'Share of objects that already carry a description.' · 'Fields Copilot is allowed to see and query.' · 'Characters used of the 10,000 Copilot limit.' · 'Business terms you authored, per field, max 20.' · 'Deliberately hidden so Copilot cannot guess with them.' · 'Frozen question-to-visual pairs authored in Power BI.' |
| Data grid | Description & Update | Columns in FR-9 order: lineage icon, type (dot + plain label), parent table, name, rename-to input, Used, description, DAX. Tables are first-class rows. Sortable headers toggle asc/desc, new key sorts asc, page resets to 1, ties keep model order, '▲'/'▼' markers, `aria-sort`. 50 rows/page. Virtualised — 2,000 rows minimum. Row checkbox selects by `lineageTag`. |
| Editable cell | Description + rename-to columns | See Grid editing below. |
| Tooltip | DAX cells, Used pills, help triggers | Open on hover **and keyboard focus** (fixes the mockup gap). Used-pill content: 'No downstream references of any kind' / 'N dependents · direct D · transitive T · leaf L'. |
| Action bar | Description & Update, selection active | See Bulk action bar below. |
| Modal | All dialogs | One level deep; Escape + scrim click close; focus traps and restores. |
| Schema expander | AI schema & synonyms | Collapsed row shows field count, included/total, synonym totals. Dot grey = all excluded, blue = any included. Expand/Collapse all; search auto-expands matches. |
| Synonym chip | Per-field synonyms | See Synonym chips below. |
| Lineage node | Lineage canvas | Click selects and dims off-path ({colors.muted-foreground} for dimmed labels); double-purpose as trace entry. Nodes collapsed at load; pan/zoom/zoom-to-fit; 'Reset view' = zoom-to-fit (FR-19). |
| Parse card | Parse screen | Four stages tick discretely with live counts; no animation (keyframes banned by DESIGN.md). |

### Selection model (FR-30)

- Checkbox identity is the object's `lineageTag` — stable across renames, sort, filter, search, and paging; selection persists everywhere.
- **Shift+click range-fills within the current page only** — spine decision (the PRD is silent on range scope); selection itself persists across pages per FR-30.
- **Space** toggles the focused row (when focus is on a row, not inside an input).
- **'Select all N matching'** checks all matches across pages; indeterminate when partial.
- The action bar surfaces the overflow: '**N outside current filter**' plus one-click **Clear**.

### Bulk action bar (FR-31)

Appears only when a selection exists. Seven controls in order: 'Apply renaming…', 'Set description…', 'Include in AI', 'Exclude from AI', 'Hide in model', 'Delete selected', 'Clear'. Destructive styling ({colors.destructive}) is on **delete only**. 'Include/Exclude in AI' act immediately on the selection and stage pending changes; 'Hide in model' stages `isHidden` and the rows gain the hidden marker at once.

### Grid editing (FR-11)

- **Tab / Shift+Tab** move between cells; **Enter commits and moves down**; **Escape reverts**.
- The **500-character decoded cap refuses input** — it does not truncate silently. The **200-character Copilot cutoff marker** shows where Copilot stops reading.
- Multi-line descriptions are stored as consecutive `///` lines.
- Edited cells are **visually marked as changed until saved** — the changed-cell treatment (non-empty border, {colors.primary} at 60%) applies to description cells and the rename input alike.

### Rename pipeline (FR-12, FR-32)

Order is fixed: find/replace → strip prefix → strip suffix → underscores→spaces → Title Case → whitespace collapse. The preview shows current → new live; nothing stages until 'Stage renames'. Collisions **block apply**: rose 'name taken' pill per row, banner 'N name collisions — a sibling in the same table already uses that name. Adjust the rules to continue.', 'Stage renames' disabled. The rename warning lists every referencing DAX expression (no rewrite); `lineageTag` never changes; the same write propagates to report visual bindings + LSDL entity key.

### Delete blast radius (FR-33)

Dialog groups by table with counts; each row names the object, its used pill, and its method — 'M-query step' (import columns, via a fresh final M step `PBIPreAI_RemoveUnusedCols`) or 'TMDL span patch' (measures, calc columns/items/groups, calculated tables). 'Breaks: [dep], [dep] +N more' names dependents per object. Cascade rounds are confirmed in memory: 'Round 2 — removing these orphans 2 more objects' + checkbox 'Include the 2 newly orphaned objects (5 total)'; each round names the newly orphaned objects. One warning, verbatim: 'Removal writes an M-query step and cannot be undone here — only via Git.'

The title states the verdict — 'These N object(s) have no downstream references.' when the selection is clean; 'N of M selected object(s) are still referenced.' when any selected object has references. The confirm button reads 'Remove N objects' and grows with the wave checkbox (N = selection + newly orphaned).

### Pending-changes review (FR-14)

Rows list object, field pill (description / rename / isHidden / CustomInstructions), and strikethrough old → new ('Ctr Raw' → 'CTR'; 'false' → 'true'; '5,180 chars' → '6,420 chars'). Each change has its own **Discard**. The list survives tab navigation; closing the browser tab triggers the unsaved-changes confirmation. Footer states 'Writes to N files · UTF-8 · CRLF preserved' (N computed from staged changes — the mockup's hardcoded 6 is a demo shortcut).

### Synonym chips (FR-16; FR-29 v2)

State-labelled: User / Generated / Suggested / Deleted (4-letter uppercase tags). 20-live cap with 'N/20' counter; beyond it the '+ add' chip goes amber 'max 20 reached'. ≤6 inline + '**+N more**' expander — the mockup's expander is inert (a demo shortcut); the spine specifies real behavior: it expands the full list inline. Removal tombstones as 'Deleted' (strikethrough), never a hard vanish mid-session. AI suggestion intake is v2 (FR-29 — see the annex); accepted suggestions promote to authored User chips. A model object with no LSDL entity gains one when its first synonym is added (FR-16).

### AI schema toggles (FR-13, FR-17)

**Model visibility and AI data schema visibility are separate controls with separate vocabulary — never conflated.** `isHidden` (Show/Hide in model) and AI-include are different switches writing different properties. Per-table explorer: include toggles per field; bulk include/exclude over the filter selection; dependency warnings name **both** objects before excluding a referenced field. Table status dot: grey = all excluded, blue = any included.

### Lineage trace (FR-19..21)

Click a node → everything off-path dims to 0.32 opacity; dependent measures/visuals/pages show counts (UJ-3: one relationship, two measures, four visuals across two pages). The side panel shows the measure DAX and 'Select & return to grid'. Its dependency list groups under 'Downstream · N' / 'Upstream · N'; rows pair a type-colored dot with the object name and a direct / transitive / leaf (or rel key) tag; long groups truncate behind '+ N more' and expand inline (same real-expansion rule as synonym chips); a Description block carries the selected object's description. Visual→model trace works in reverse. Canvas→grid jumps filter and scroll the grid to the selection; the grid's 'View on canvas' centres it. Distinct marks for field-parameter and calculation-group tables; inactive relationships distinguished.

### Pagination (FR-10)

50 rows/page. Pager shows ≤7 pages in full, else '1 … window(page±1, edges) … last'; '‹'/'›' disabled at the ends. Footer 'Showing X–Y of Z', announced via aria-live. Filters and search resolve ≤200ms.

### Instructions editor + Copy prompt (FR-15)

The editor loads existing `CustomInstructions` content with its line breaks intact (FR-15). 'Copy prompt' performs a real clipboard write (the mockup's missing call is a demo shortcut) and swaps its label to 'Copied — N included objects' for ~2100ms. The 10,000-char budget counts the **decoded** string, not the escaped form; the counter and gauge sync with the Budget KPI; input beyond the limit is refused, and the bar turns {colors.destructive} past 10,000.

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Parse progress | Parse screen | Four-stage stepper 'Definition tree, Model objects, Lineage graph, Report layer' with live counts + bar; ≤5s to grid at 2,000 objects; stages tick discretely, no animation. LSDL + report parsing deferred to first need — the deferred-load indicator reuses the parse card's stage pattern when Prep for AI first opens. |
| Parse failure | Parse screen | Names file + line number; remaining files still load (FR-5). LSDL bound to a nonexistent object is retained and flagged, not dropped (FR-6). |
| Discovery refusal | Landing / model picker | Message states what was looked for; legacy TMSL and pbism <4.0 refuse with file + value + expectation; non-PBIR report → features disabled, not broken; missing `qnaEnabled: true` → banner naming the setting on Prep for AI (Copilot won't use instructions until enabled + republished) (FR-3). |
| Permission denied / revoked | Any write surface | Controls **visible but disabled with an explanation — disabled, never hidden** (FR-34). On save with revoked permission: report every file already written; retry re-requests permission on click; pending changes retained (FR-24). |
| Recent target vanished | Landing recent card | 'Reported as moved or deleted and offered for removal'; the list cannot display a full filesystem path — only the folder name the browser reports (FR-4). |
| Locked file | Save | Names the file and says to close the application holding it (UJ-1: Desktop open on the same model). |
| Save failure | Save | Files-written report naming every file already written; no partial state; retry is user-initiated; pending changes retained (FR-24). |
| External change detected | Save | Pre-write comparison blocks the write; offers reload or overwrite, naming the file; reload discards only that file's pending changes — **and says so** (FR-25). |
| Save success | App shell | **Inline confirmation naming the files written** (spine decision — PRD specifies failure paths only; the mockup silently closes). |
| Empty description cell | Grid | Italic amber 'No description yet' ({colors.amber-500}). |
| No culture file | Prep for AI | Tab available and empty — an empty LSDL, not an error (FR-6). |
| No instructions | AI instructions | Empty editor that can save new instructions (FR-15). |
| Zero grid matches | Description & Update | Empty tbody + 'Showing 0–0 of 0' + 'No objects match the current filters.' with a Clear affordance (spine decision — PRD requires honest counts). |
| No VerifiedAnswers | Verified-answers rail | An empty state, not an error (FR-18). |
| No Report folder | Grid usage columns | Usage renders as **unavailable**, not zero (FR-7). |
| Hidden object | Grid | FR-9 requires hidden objects visually distinguished; the mockup's `.hidden` flag is never rendered (demo shortcut) → rows carry a visible 'Hidden' t-slate pill beside the type label. |
| Edited-until-saved | Grid | Changed cells visually marked until save (FR-11). |
| Unsupported browser | Landing | Capability badge; message names 'Chrome, Edge, and Opera'; no picker (FR-1). |
| Supported browser | Landing | Emerald capability badge, names browser + version, states File System Access writes save directly to disk (FR-34). |
| Dark mode | Global | User toggle only; persisted; never OS-sniffed (FR-36). |
| Unsaved changes on tab close | Global | Browser close-confirmation (FR-14). In-app tab switches never prompt — pending survives. |

## Interaction Primitives

**Keyboard-first — the grid is fully keyboard-operable because keyboard editing is the core workflow (WCAG 2.1 AA).** Tab order follows column order left to right, row by row; every interactive element shows a visible focus indicator (`:focus-visible` 2px solid {colors.primary}, 2px offset).

- **Enter** commits and moves down; **Tab/Shift+Tab** traverse cells; **Escape** reverts an edit, closes the topmost scrim/dialog, exits tooltips.
- **Space** toggles the focused row's selection; **Shift+click** range-fills the page.
- Skip link 'Skip to content' lands on main.
- Scrim click-outside closes; focus returns to the trigger.
- Tooltips open on hover **and when their trigger receives keyboard focus** — triggers are focusable elements in tab order (DAX cell, used pill, help icons) [fixes the mockup gap].
- '‹'/'›' pager buttons; header sort via Enter/Space on header cells.

**Performance floor:** folder→grid ≤5s at 2,000 objects; 60fps scroll (no frame over 16ms) on the grid and the pending-changes list; filter ≤200ms; main-thread blocks ≤50ms; grid virtualisation is not optional.

## Accessibility Floor

WCAG 2.1 AA across the app. The mockup's missing affordances are **binding requirements**, not backlog:

- Tabs: `role="tab"` + `aria-selected` + `aria-controls`, roving tabindex, arrow-key navigation; panels `role="tabpanel"`.
- Modals: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, focus restore to trigger.
- Sortable headers: `aria-sort`.
- `aria-live` regions: selection count, 'Showing X–Y of Z' pager, instructions character counter, pending-changes count.
- Switches: `role="switch"` + `aria-checked` + label.
- Row checkboxes labeled per object ('Select {object}').
- Tooltip triggers focusable by keyboard.
- `prefers-reduced-motion` honored — trivially, since keyframe animation is banned (DESIGN.md); the sanctioned hover transitions are non-essential.
- Real heading semantics (h1–h3), not styled divs.

Kept from the mockup: skip link; global `:focus-visible` ring; Escape/scrim dismissal; existing aria-labels ('Toggle theme', 'Close', 'Remove', 'AI include').

## Write-Path Safety UX

The write path is the product's reason to exist; its safety model is a first-class experience.

1. **Staging before disk.** Every mutation — description, rename, isHidden, CustomInstructions, synonyms, schema includes, deletes — lands as a pending change. Nothing touches a file until Save. The pending chip counts live (aria-live); review is per-change discardable and survives navigation.
2. **Byte-fidelity promise, surfaced.** An edit-free save is byte-identical (SM-1), and the UI says what it preserves wherever writes are discussed: 'Writes to N files · UTF-8 · CRLF preserved', footer 'UTF-8 · CRLF'. Writes go only to changed files, `///` at declaration indentation, original line endings, UTF-8 no BOM, atomic replace (FR-22, FR-23). The tool never writes to a file it did not parse, and never creates files outside the selected folder (PRD §6.1). Success names the files written.
3. **External-change detection.** Pre-write comparison blocks the write and offers reload-or-overwrite naming the file; reload discards only that file's pending changes and says so (FR-25).
4. **Cascade confirmations.** Deletion confirms wave rounds in memory, naming newly orphaned objects each round, grouping by table, before anything is staged (FR-33).
5. **Template description warning.** Bulk 'Set description…' always warns 'Overwrites existing text on every selected object.'; the template checkbox replaces {Table} and {Name} per object; the hint fixes expectations: 'Copilot reads the first 200 characters. 500 character limit per description.'
6. **LSDL re-serialisation disclosure.** Editing synonyms re-serialises the whole `linguisticMetadata` blob — a large diff in that one file. The pending-changes modal appends a note naming this when an LSDL-bearing file is affected.

## Deferred to v2 (FR-26..29)

Per user decision, all in-tool AI provider features move to v2; v1 ships the Copy-Prompt workflow only. Specified now so the annex is buildable later:

- **FR-26 BYOK config** — entry point on the Prep for AI tab. Free-text base URL + model name (not a fixed list); OpenRouter suggested default; Azure OpenAI hard-blocked and named as unsupported in the UI. The surface states that requests go browser → provider directly and recommends a spend-capped key. Requests carry only the metadata needed for the prompt — names, types, expressions, descriptions — and never data values, since the tool never reads them (PRD §6.2). Nothing configured by default; keys session-only by default, `localStorage` behind explicit opt-in, one action clears every tier.
- **FR-27 Bulk draft descriptions** — runs over the current filter selection with the count stated before the run; lands as unsaved edits visually marked as AI-drafted (changed-cell treatment plus a small sky 'AI' marker); provider errors report the provider's message and leave every row unchanged; cancellable, keeping returned batches and discarding in-flight ones. Trigger: grid toolbar.
- **FR-28 Draft AI instructions** — unsaved draft that never overwrites existing instructions without confirmation; limit-checked before insertion. Trigger: beside the instructions editor.
- **FR-29 Suggest synonyms** — pending 'Sugg' chips accepted or rejected individually; acceptance promotes the term to an authored User chip; never duplicates an existing term.
- **Routing**: any draft action without a configured provider routes to the BYOK config screen.

## Key Flows

### UJ-1 — Ravi inherits a 2,000-object model and has a week (Edge)

1. Ravi opens the app in Edge and picks his model folder with readwrite access — granted once (FR-1).
2. Parse completes inside the 5-second budget; the grid loads with the 'Empty description' filter active — 180 rows in the backlog (FR-8, FR-10).
3. He types descriptions down the column, Tab between rows, Enter to move down; the 200-char cutoff marker keeps every description Copilot-ready (FR-11).
4. He uses 'Select all 180 matching', sets a templated description in bulk, and discards two results individually in the pending review.
5. He presses **Save**; the pending modal states 'Writes to N files · UTF-8 · CRLF preserved'.
6. **Climax:** `git diff` shows only the intended `///` lines — byte-level fidelity holds (SM-1), and his reviewer sees exactly what he wrote.

Failure: Desktop is open on the same model → the save reports the locked file by name and says to close Desktop; pending changes remain staged.

### UJ-2 — Sofia writes the instructions that stop Copilot guessing (month-grain model)

1. Sofia opens the **Prep for AI** tab → 'AI instructions' sub-tab.
2. She types grain and metric-routing rules into `CustomInstructions`; the counter tracks live against 10,000 (FR-15).
3. On 'AI schema & synonyms' she adds the 'revenue' synonym for `[Total Spend]` (FR-16).
4. She excludes six helper measures so Copilot cannot guess with them; each table dot turns grey (FR-17).
5. She saves; the AI reach KPI and the sub-tab pill '54/209' update together.
6. **Climax:** she republishes from Desktop and refreshes the service — Copilot now answers month-grain revenue questions from her terms, not its guesses.

Failure: she pastes a 10,400-char draft → the editor refuses input at the decoded cap and the gauge turns {colors.destructive}; nothing is staged until it fits.

### UJ-3 — Dan checks what a field touches before he describes it

1. Dan opens the **Lineage** tab; nodes start collapsed (FR-19).
2. He clicks the column `Channel Routing[SOR]`; everything off-path dims, with counts: one relationship, two measures, four visuals across two pages (FR-20).
3. The side panel shows the dependent measure's DAX — he reads exactly how the field is used.
4. He presses 'Select & return to grid' (FR-21); the grid filters and scrolls to his column.
5. **Climax:** with the impact picture still in his head, he writes the description in the grid — the trace and the writing are one motion.

Failure: a broken visual reference appears in the trace — it is attributed to the visual and reported, never silently dropped (FR-7).

### UJ-4 — Priya works on a laptop she cannot install software on

1. Priya, a consultant with no admin rights, opens her bookmark of the GitHub Pages app; the capability badge confirms her Chromium browser (FR-34).
2. She clones the client's PBIP repo with her own Git tooling — the app is not a Git client and never will be.
3. 'Open PBIP folder' → she grants readwrite to the folder — one gesture, no install, no account (FR-1).
4. She edits descriptions across the grid the keyboard-first way; every edit stages as pending.
5. She saves and commits from her own tools, then opens a pull request.
6. **Climax:** a reviewed PR from a bookmark — nothing installed and nothing uploaded.

Failure: she returns the next day and resumes from Recent projects — the browser reports only the folder name it can, and a vanished folder is reported as moved or deleted and offered for removal (FR-4).
