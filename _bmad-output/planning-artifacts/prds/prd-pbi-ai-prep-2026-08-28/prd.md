---
title: PBI AI Prep
created: 2026-08-28
updated: 2026-08-30
status: final
---

# PRD: PBI AI Prep

*Working title — confirm.*

## 0. Document Purpose

This PRD is for the author (solo build), for downstream `bmad-architecture` and `bmad-create-epics-and-stories` runs, and for any contributor arriving at the open-source repo. It builds on `_bmad-output/planning-artifacts/briefs/brief-pbi-ai-prep-2026-08-28/brief.md` and its addendum; the brief holds the positioning argument and the competitive picture, and this document does not repeat them. Mechanism and technical-how decisions live in `addendum.md` beside this file. Vocabulary is fixed in §3 Glossary and used verbatim throughout. Features are grouped in §4 with globally numbered FRs nested under them. Inferences carry inline `[ASSUMPTION]` tags and are indexed in §11. A 2026-08-30 revision folds the mockup-validated scope expansion into this document: FR-9 through FR-18 gain amended consequences, and new sections §4.8 and §4.9 add FR-30 through FR-38 for grid interactions at scale and application chrome. FR-30 onward is appended numbering, so every existing FR-1..29 reference stays stable. The mockup (`mockup/index.html`) is the visual contract these FRs encode.

## 1. Vision

A BI developer opens a browser tab, points it at a Power BI project folder on their own disk, and sees every table, column, measure, and calculation group in one editable grid. They type descriptions, fix cryptic names, write the AI instructions that tell Copilot how their business talks, and press save. The files on disk change in place. Nothing was uploaded, nothing was installed, and the result is a normal Git diff they can read before it goes anywhere near production.

The work of making a semantic model AI-ready is now well documented by Microsoft and badly served by tooling. The Prep data for AI dialog handles one field at a time and needs Power BI Desktop running. Tabular Editor does bulk metadata but needs a Windows install and never touches the linguistic schema. Neither writes both layers in one pass, and on a locked-down corporate laptop neither is available at all.

PBI AI Prep is the missing editor: a React app served as static files from GitHub Pages, reading and writing local TMDL through the File System Access API, with the entire model parsed in the browser. It borrows its read path from two MIT-licensed projects that already solved it, and spends its own effort on the part nobody has built — the write path.

## 2. Target User

### 2.1 Jobs To Be Done

- Fill in hundreds of missing descriptions without clicking through a properties pane hundreds of times.
- Write and revise AI instructions in a real editor, against a visible character budget, instead of a modal textarea.
- See which fields Copilot can currently reach, and change that set deliberately.
- Rename cryptic fields to business language without breaking the report visuals bound to them.
- Understand what a field joins to and where it is used, so the description written for it is accurate.
- Review every metadata change as a diff before it reaches a shared branch.
- Do all of the above on a machine where nothing can be installed.

### 2.2 Non-Users (v1)

- Anyone working against a published cloud semantic model rather than local files. There is no XMLA path.
- Firefox and Safari users. The directory picker does not exist in those engines.
- Anyone on a legacy `.pbix` or `model.bim` model. PBIP with TMDL is required.
- Report authors wanting to change visuals. This tool reads the report layer and never writes it.

### 2.3 Key User Journeys

- **UJ-1. Ravi inherits a 2,000-object model and has a week.**
  Ravi took over a media-platform model with 32 tables and no descriptions. He opens the tool in Edge, picks `Atrium Sigma.SemanticModel`, and grants readwrite once. The grid loads with an "empty description" filter already applied, showing 180 rows. He types down the column, tabbing between rows, watching the 200-character Copilot cutoff marker as he writes. After forty minutes he presses save, opens `git diff`, and sees only the `///` lines he intended, each above the right object. **Edge case:** he had Power BI Desktop open on the same model; the save fails on a locked file and the tool names the file and tells him to close Desktop.

- **UJ-2. Sofia writes the instructions that stop Copilot guessing.**
  Sofia's model stores data at month grain, and Copilot keeps answering daily questions with near-empty results. She opens the Prep for AI tab, sees the existing `CustomInstructions` text with a live character count against 10,000, and adds a grain rule and a metric-routing rule. In the same tab she adds "revenue" as a synonym for `[Total Spend]` and excludes six helper measures from the AI data schema. She saves, republishes from Desktop, refreshes in the service, and Copilot stops inventing days.

- **UJ-3. Dan checks what a field touches before he describes it.**
  Dan does not know what `Field Currency` is for. He opens the Relationships tab, clicks the column, and everything off its path dims: one relationship, two measures, four visuals across two pages. The side panel shows the DAX of each measure. He switches back to the grid and writes a description that says what the field actually does, because he can now see it.

- **UJ-4. Priya works on a laptop she cannot install software on.**
  Priya is a consultant on a client-issued machine with no admin rights. Tabular Editor is not an option and raising a ticket takes three days. She opens the tool from a bookmark, clones the client's PBIP repo, edits descriptions, commits, and opens a pull request — with nothing installed and nothing uploaded.

## 3. Glossary

Downstream workflows and readers use these terms exactly. Introducing a synonym anywhere else in this PRD is a discipline violation.

- **PBIP project** — A Power BI Project folder containing one or more Semantic Model folders and optionally Report folders. Identified by a `.pbip` manifest at the root.
- **Semantic Model folder** — A `<name>.SemanticModel/` directory holding `definition.pbism`, a `definition/` tree of TMDL files, and optionally a `VerifiedAnswers/` tree.
- **Report folder** — A `<name>.Report/` directory in PBIR format, holding `definition/pages/*/visuals/*/visual.json`.
- **TMDL** — Tabular Model Definition Language. The indentation-based text format of the files under `definition/`.
- **Model object** — Any table, column, calculated column, measure, hierarchy, calculation group, calculation item, or field parameter declared in TMDL. The unit of one grid row.
- **Doc comment** — A `///`-prefixed TMDL line immediately above a declaration, carrying that object's description. The only description mechanism this product writes.
- **Culture file** — `definition/cultures/<locale>.tmdl`, containing the `linguisticMetadata` property.
- **LSDL** — Linguistic Schema Definition Language. The JSON document embedded in the culture file's `linguisticMetadata` property as a triple-backtick block.
- **LSDL entity** — One keyed entry under the LSDL `Entities` object, bound to a model object through its `Definition.Binding`.
- **AI instructions** — The freeform guidance Copilot reads, stored as the LSDL `CustomInstructions` string. Capped at 10,000 characters.
- **Synonym** — One alternative term for an LSDL entity, stored in that entity's `Terms` array.
- **AI data schema** — The set of model objects Copilot can reach, expressed per LSDL entity through its `Visibility` object.
- **Verified answer** — A stored question-to-visual binding under `VerifiedAnswers/definitions/<guid>/`. Read-only in this product.
- **LSDL state** — The lifecycle value carried by an LSDL entity, term, or visibility entry: `User` (authored by a person), `Generated` (produced by Power BI), `Suggested` (proposed, unconfirmed), `Deleted` (tombstoned, excluded), or `Authored` (a deliberate visibility choice). Written verbatim; never called "authored"/"generated"/"suggested" as loose adjectives elsewhere in this PRD.
- **Round-trip fidelity** — The property that opening a PBIP project and saving it with no edits leaves every byte unchanged.
- **BYOK** — Bring your own key. A user-supplied API credential for an OpenAI-compatible endpoint, held only in that user's browser.
- **Object grid** — The editable table in the Description & Update tab, one row per model object.
- **Lineage graph** — The full transitive dependency graph over model objects and report visuals: visual→measure/column, measure→measure/column, calculated object→source, calculation item→DAX references, field parameter→NAMEOF columns, DAX function→body references, and table→table relationships. Every edge kind counts; the only excluded pairing is visual→visual.
- **Wave cascade** — The deletion flow in which each round of removals is applied in memory, the dependency graph recomputes, newly orphaned objects are named and confirmed before the next round, and nothing writes to disk until the user stops adding rounds.

## 4. Features

### 4.1 Project Open and Discovery

**Description:** The user picks a folder; the tool works out what is inside it and refuses clearly when it cannot proceed. It accepts a PBIP project root, a bare Semantic Model folder, or a folder containing several of either. Discovery is by content and structure, never by folder name alone. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-1: Pick a project folder with readwrite access

The user can select a local folder and grant readwrite access in a single gesture. Realizes UJ-1, UJ-4.

**Consequences (testable):**
- The picker is invoked from a user gesture and requests readwrite mode, not read.
- On a non-Chromium engine the tool renders an unsupported-browser message naming Chrome, Edge, and Opera, and does not present the picker.
- Selecting a folder the browser deems sensitive surfaces the browser's refusal as a readable message, not a silent failure.

#### FR-2: Discover semantic models and reports within the selection

The tool can enumerate every Semantic Model folder and Report folder under the selection and let the user choose which to work on. Realizes UJ-1.

**Consequences (testable):**
- A selection containing one Semantic Model folder proceeds directly to the grid with no intermediate choice.
- A selection containing more than one Semantic Model folder presents a selection step listing each by folder name.
- A selection pointing directly at a `<name>.SemanticModel` folder is accepted as that model.
- A folder with no Semantic Model folder is rejected with a message that states what was looked for.

#### FR-3: Reject unsupported project formats

The tool can identify and refuse models and reports it cannot safely write. Realizes UJ-1.

**Consequences (testable):**
- A Semantic Model folder containing `model.bim` and no `definition/` directory is refused as a legacy TMSL model.
- A `definition.pbism` with a version below 4.0 is refused.
- A Report folder whose `definition/version.json` is absent or below 2.0.0 is reported as non-PBIR; the semantic model still opens, and features depending on report data are disabled rather than broken.
- Every refusal names the file inspected and the value found.
- A model whose `definition.pbism` lacks `qnaEnabled: true` still opens, but the Prep for AI tab shows a banner naming the setting and stating that Copilot will not use these instructions until it is enabled and the model is republished. `[NOTE FOR PM]` Resolves the qnaEnabled gap noted in review: the tool warns rather than silently doing nothing.

#### FR-4: Restore a previous project without re-picking

The user can return to a previously opened project from a list, without navigating the folder picker again. Realizes UJ-4.

**Consequences (testable):**
- Directory handles persist across browser sessions.
- Resuming requests permission from a user gesture, and states which folder is being resumed.
- A handle whose target no longer exists is reported as moved or deleted and offered for removal from the list.

**Notes:** `[NOTE FOR PM]` The recent-projects list stores handles, not paths, and cannot display a full filesystem path — only the folder name the browser reports.

### 4.2 Model Parsing

**Description:** Every TMDL file under `definition/` is parsed into model objects, and every PBIR visual is parsed into field usage. Parsing preserves the exact source text of everything it does not change, because the write path depends on it. Realizes UJ-1, UJ-3.

**Functional Requirements:**

#### FR-5: Parse the TMDL definition tree into model objects

The tool can produce one model object per declaration across `database.tmdl`, `model.tmdl`, `tables/*.tmdl`, `relationships.tmdl`, `roles/*.tmdl`, `expressions.tmdl`, `functions.tmdl`, and `perspectives/*.tmdl`. Realizes UJ-1.

**Consequences (testable):**
- Tables, columns, measures, hierarchies, and hierarchy levels are each represented as distinct model objects.
- A column with `type: calculated` and an expression is classified as a calculated column, not a column.
- A table containing a `calculationGroup` block is classified as a calculation group, and its `calculationItem` entries are model objects.
- A column carrying `extendedProperty ParameterMetadata` is classified as a field parameter.
- A DAX user-defined function declared in `functions.tmdl` is a model object, and its triple-backtick expression body is preserved verbatim.
- `queryGroup` declarations, `displayFolder` values, and `perspective` membership are read and retained, so a write cannot lose them.
- Every model object records the byte range of its declaration and of its existing doc comment, if any.
- A file that fails to parse is reported with file name and line number, and the remaining files still load.

#### FR-6: Parse the LSDL from the culture file

The tool can extract the `linguisticMetadata` block, parse it as JSON, and associate each LSDL entity with the model object its binding names. Realizes UJ-2.

**Consequences (testable):**
- The triple-backtick block boundaries and the trailing `contentType: json` line are located without disturbing them.
- `CustomInstructions`, `Entities`, `Relationships`, and `Agents` are each available independently.
- An LSDL entity whose binding names a model object that does not exist is retained and flagged, not dropped.
- A culture file with no `linguisticMetadata` property yields an empty LSDL rather than an error.
- A model with no culture file opens with the Prep for AI tab available and empty. `[ASSUMPTION: a culture file can be created from scratch; not yet verified against Power BI Desktop.]`

#### FR-7: Parse the report layer for field usage

The tool can determine, for each model object, which visuals and pages reference it. Realizes UJ-3.

**Consequences (testable):**
- Each visual's field references resolve to model objects where they exist.
- A field reference that resolves to nothing is reported as a broken reference and attributed to its visual.
- Fields reached only through a field parameter are counted as used.
- Columns used only as relationship keys are counted as used, distinctly from visual usage.
- With no Report folder present, usage columns render as unavailable rather than zero.

#### FR-8: Load a 2,000-object model without blocking the interface

The tool can open a large model and present the grid promptly. Realizes UJ-1.

**Consequences (testable):**
- Folder selection to an interactive grid completes within 5 seconds for a 2,000-object model on a mid-range laptop.
- LSDL parsing is deferred until the Prep for AI tab is first opened. `[ASSUMPTION: a 2,000-object LSDL is large enough to warrant deferral; extrapolated from a 209-object model with a 24,360-line culture file.]`
- Report parsing is deferred until report-derived data is first needed.
- The main thread never blocks input for more than 50ms at a stretch during folder parsing, so the interface stays interactive while a 2,000-object model loads.

### 4.3 Object Grid and Metadata Editing

**Description:** One row per model object, columns for what the user changes and what they need to see while changing it. Editing is inline and keyboard-first, because the job is hundreds of small edits in sequence. Realizes UJ-1, UJ-3.

**Functional Requirements:**

#### FR-9: Present every model object in one grid

The user can see all model objects in a single scrollable grid. Realizes UJ-1.

**Consequences (testable):**
- Columns appear in the order: lineage icon, object type (colored dot plus plain label, no background), parent table, current name, rename-to input, Used count, description, DAX expression.
- The Used cell shows the total downstream dependent count, and hovering splits it into direct, transitive, and leaf counts. Zero renders as 'Unused' — the light-blue attention state on this tab; used counts render grey.
- Tables are first-class rows: they carry descriptions and renames like any other object.
- The DAX expression column is populated for measures, calculated columns, and calculation items, and empty elsewhere.
- Rows render at 2,000 objects with no scroll frame exceeding 16ms (60fps), via virtualisation.
- Hidden objects are visually distinguished from visible ones.

#### FR-10: Filter and sort the grid

The user can narrow the grid to the rows they intend to work on. Realizes UJ-1.

**Consequences (testable):**
- A filter for objects with no description is available and can be applied in one action.
- Filtering by object type, by parent table, and by free text over names and descriptions is available.
- Sorting: clicking a column header toggles ascending then descending with a visible arrow; Type, Table, Name, Used (numeric), Description, and DAX are sortable; sorting resets paging to page one.
- Pagination: 50 rows per page with a page-number pager (ellipsis windowing past seven pages), previous/next controls, and a 'Showing X–Y of Z' line; filtering, searching, and sorting reset to page one.
- A one-action filter for objects with zero downstream references is available alongside the empty-description filter.
- The count of matching rows and the count of rows edited since the last successful save are both visible.

#### FR-11: Edit descriptions inline

The user can type a description directly into a grid row. Realizes UJ-1.

**Consequences (testable):**
- Editing accepts up to 500 characters of decoded description text, including newline characters and excluding the `///` prefix, and refuses further input at that limit.
- The 200-character position is marked, counted the same way, so the author can see what Copilot will read.
- Multi-line descriptions are supported and are written as consecutive doc comment lines.
- Tab and Shift+Tab move between editable cells; Enter commits and moves down; Escape reverts the cell.
- An edited cell is visually marked as changed until saved.
- Description editing applies to table declarations as well as fields; tables count toward the backlog and coverage figures.

#### FR-12: Rename objects

The user can enter a new name for a model object. Realizes UJ-1.

**Consequences (testable):**
- A rename that would collide with an existing sibling name is rejected with the conflicting object named.
- A name requiring TMDL quoting is quoted on write, and an embedded single quote is doubled.
- Renaming an object does not alter its `lineageTag`.
- Renaming a measure or column referenced in DAX elsewhere in the model raises a warning listing every referencing expression, and the tool does not rewrite those expressions. `[ASSUMPTION: DAX reference rewriting is out of scope for v1; a warning is the correct behaviour.]`
- A rename propagates in the same write to the report layer's visual bindings and to the LSDL entity key, so synonyms and AI visibility stay attached (see the amended report-layer stance in §6.1 and §8).
- Renames land either individually from the grid's rename column or in bulk through the transform in FR-32; both stage as pending changes.

#### FR-13: Toggle object visibility

The user can change whether a model object is hidden in the model. Realizes UJ-2.

**Consequences (testable):**
- Toggling visibility writes or removes the `isHidden` property on the object.
- A visibility change emits `changedProperty = IsHidden` alongside it, matching the convention Power BI itself writes and the reference model already contains.
- Model visibility and AI data schema visibility are presented as separate controls and never conflated.

#### FR-14: Review pending changes before saving

The user can see everything they have changed, as a list, before committing it to disk. Realizes UJ-1.

**Consequences (testable):**
- A pending-changes view lists each change as object, field, old value, and new value.
- Any individual change can be discarded from that view.
- Navigating between tabs does not discard pending changes.
- The pending-changes list scrolls without perceptible lag at 2,000 entries, using the same virtualisation bound as the object grid (no scroll frame over 16ms).
- Attempting to close the tab with unsaved changes triggers the browser's confirmation prompt.

### 4.4 Prep for AI

**Description:** The LSDL surface, presented as three distinct jobs rather than one JSON blob: the instructions text, the synonyms per object, and the set of objects Copilot can see. Verified answers are shown because knowing they exist changes what the user writes. Realizes UJ-2.

**Functional Requirements:**

#### FR-15: Edit AI instructions

The user can read and rewrite the model's AI instructions. Realizes UJ-2.

**Consequences (testable):**
- Existing `CustomInstructions` content loads into the editor with its line breaks intact.
- A live character count is shown against the 10,000-character limit, and input is refused beyond it.
- Saving writes the text back as a correctly escaped JSON string within the LSDL.
- A model with no existing instructions presents an empty editor and can save new instructions.

#### FR-16: Manage synonyms per object

The user can add, edit, and remove synonyms for a model object. Realizes UJ-2.

**Consequences (testable):**
- Existing synonyms are listed per object with their LSDL state, so generated and suggested terms are distinguishable from authored ones.
- A synonym the user adds is written with LSDL state `User`.
- A generated or suggested synonym the user removes is written with LSDL state `Deleted` rather than removed outright, so Power BI does not regenerate it.
- A model object with no LSDL entity gains one when its first synonym is added.
- A field holds at most 20 live synonyms; a live 'N/20' counter sits beside the add control and additions are refused at the cap.
- Chips render at most 6 inline with a '+N more' expander; generated and suggested states are labelled, and the tombstone rule above applies on removal.

#### FR-17: Set the AI data schema

The user can choose which model objects Copilot can reach. Realizes UJ-2.

**Consequences (testable):**
- Each object's current AI visibility is shown, distinct from its model visibility.
- Changing AI visibility writes the entity's `Visibility` object with LSDL state `Authored`, marking the choice as deliberate.
- Bulk include and bulk exclude are available over the current filter selection.
- Excluding an object that a currently included measure depends on raises a warning naming both.
- The schema is presented per table: a collapsed row shows field count, included/total, and synonym totals; expanding lists every field with its own include toggle and synonym chips.
- A table's indicator dot turns grey when every field in it is excluded, and blue when any field is included.

#### FR-18: View verified answers

The user can see the verified answers stored on the model. Realizes UJ-2.

**Consequences (testable):**
- Each verified answer is listed with its trigger prompts.
- The interface states that verified answers are read-only here and are authored in Power BI.
- A model with no `VerifiedAnswers` folder shows an empty state, not an error.
- Verified answers render in a read-only rail beside the AI instructions editor (FR-38) so instructions can be written without contradicting them.

### 4.5 Relationships Canvas

**Description:** The model as a graph, so the user can see what a field joins to and where it is used before writing about it. Read-only. Realizes UJ-3.

**Functional Requirements:**

#### FR-19: Render the model as a relationship graph

The user can see tables and their relationships laid out as a diagram. Realizes UJ-3.

**Consequences (testable):**
- Tables render as nodes and relationships as edges, with pan, zoom, and zoom-to-fit.
- Field parameter tables and calculation group tables are marked distinctly from ordinary tables.
- Inactive relationships are visually distinguished from active ones.
- A table node can be expanded to show its columns; nodes are collapsed by default at load.

#### FR-20: Trace impact from a selected object

The user can select a model object and see what depends on it. Realizes UJ-3.

**Consequences (testable):**
- Selecting a column dims everything off its dependency path.
- The selection's dependent measures, visuals, and pages are listed with counts.
- Selecting a visual traces back to the model objects feeding it.
- A side panel shows the DAX of any selected measure alongside the columns it references.

#### FR-21: Jump between canvas and grid

The user can move from an object on the canvas to that object's grid row and back. Realizes UJ-3.

**Consequences (testable):**
- Selecting an object on the canvas and choosing to edit it opens the grid filtered or scrolled to that object.
- A grid row offers a "View on canvas" action that switches to the Relationships tab with that object selected and the canvas centred on it.

### 4.6 Saving to Disk

**Description:** The part that must not go wrong. Changes are written back into the original files, touching only the bytes that correspond to edits, and a failed save leaves the folder as it was. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-22: Write metadata changes into the original TMDL files

The user can commit pending changes to the files on disk. Realizes UJ-1.

**Consequences (testable):**
- Only files containing changed objects are written.
- Descriptions are written as `///` doc comment lines immediately above the declaration, at the declaration's indentation.
- Each written file preserves its original line-ending convention and is written as UTF-8 without a byte order mark.
- `lineageTag` values, `annotation` lines, `extendedProperty` blocks, `ordinal` values, and untouched properties are byte-identical after the write.
- Writing uses an atomic replace, so an interrupted save does not leave a partial file.

#### FR-23: Preserve byte-level fidelity on an unmodified save

The tool can open a project and save it with no edits, leaving the folder unchanged. Realizes UJ-1.

**Consequences (testable):**
- Every file in the definition tree is byte-identical before and after an edit-free save.
- This holds for the culture file, including its embedded LSDL block indentation.
- An automated check verifies this against the reference model in the repository.

#### FR-24: Report save failures without partial state

The user is told exactly what failed when a save cannot complete. Realizes UJ-1.

**Consequences (testable):**
- A revoked or expired permission stops the save immediately, reports every file already written before the failure, and presents a user-initiated retry button that re-requests permission on click, since `requestPermission` requires a user gesture and cannot be triggered mid-save.
- After a failed save, the pending-changes list still holds every unsaved change.
- Files written before the failure are reported, so the user knows the folder's actual state.

#### FR-25: Detect external changes to open files

The tool can notice that a file changed on disk after it was read. Realizes UJ-1.

**Consequences (testable):**
- Before writing, the tool compares each target file against the content it parsed.
- A file changed externally blocks that file's write and offers reload or overwrite, naming the file.
- Reloading discards pending changes for that file only, and says so.

### 4.7 Optional AI Assistance

**Description:** Off unless the user turns it on with their own key. It drafts text; it never writes files. Every suggestion lands in an editable field the user must accept. Realizes UJ-1, UJ-2. `[NOTE FOR PM]` This feature group sits in tension with SM-C1 and SM-C3, which name feature creep and unread AI text as risks. It stays in v1 anyway because it is the portfolio-visible differentiator the brief calls for — the counter-metrics exist precisely to keep it from becoming the product's centre of gravity.

**Functional Requirements:**

#### FR-26: Configure a BYOK provider

The user can supply their own OpenAI-compatible endpoint and key. Realizes UJ-1.

**Consequences (testable):**
- No provider is configured and no key is present by default.
- Endpoint URL, model name, and key are all user-supplied, so any OpenAI-compatible service can be used.
- The key is held for the session only unless the user explicitly opts into persistence.
- A clear-key action removes the key from every storage tier in one action.
- The configuration screen states that requests go directly from the browser to the chosen provider, and that a spend-capped key is recommended.

#### FR-27: Draft descriptions in bulk

The user can ask for suggested descriptions for a set of objects. Realizes UJ-1.

**Consequences (testable):**
- The request covers the current filter selection, and the object count is stated before it runs.
- Each suggestion is written into its row's description field as an unsaved edit, never directly to disk.
- Suggestions are visually marked as AI-drafted until the user edits or accepts them.
- The prompt for each object includes its name, type, parent table, DAX expression where present, and relationship and usage context.
- A failed or refused request reports the provider's error and leaves every row unchanged.
- The operation can be cancelled mid-run; suggestions from batches that already returned are kept, and the in-flight batch is discarded rather than partially applied.

#### FR-28: Draft AI instructions from the model

The user can ask for a first draft of AI instructions based on the model's shape. Realizes UJ-2.

**Consequences (testable):**
- The draft lands in the instructions editor as unsaved text and never overwrites existing instructions without confirmation.
- The prompt includes table and measure inventory, relationships, and any existing descriptions.
- The result is checked against the 10,000-character limit before insertion.

#### FR-29: Suggest synonyms

The user can ask for synonym candidates for a set of objects. Realizes UJ-2.

**Consequences (testable):**
- Suggestions are added as pending authored synonyms the user can accept or reject individually.
- An existing synonym is never duplicated by a suggestion.

### 4.8 Grid Interactions at Scale

**Description:** The grid is the product's engine room at 2,000 objects. Selection, bulk actions, and destructive cleanup are first-class flows with their own safety rails. Realizes UJ-1, UJ-3. `[NOTE FOR PM]` FR-30 through FR-38 use appended numbering from the 2026-08-30 mockup-validated revision so every existing FR-1..29 reference stays stable.

**Functional Requirements:**

#### FR-30: Select objects across the whole grid

The user can build a selection that outlives view changes. Realizes UJ-1.

**Consequences (testable):**
- Every row carries a checkbox; selection is keyed by object identity (`lineageTag`), so it survives sorting, filtering, searching, and page changes.
- Shift-click selects a contiguous range within the visible page; Space toggles the focused row.
- "Select all N matching" selects every row matching the current filter and search across all pages, and the label states the count.
- A selection bar shows the total selected from any page, how many sit outside the current filter, and offers a one-click clear.

#### FR-31: Act on a selection through a contextual bar

The user can apply bulk actions without hunting through menus. Realizes UJ-1.

**Consequences (testable):**
- The action bar appears only when a selection exists and offers: Apply renaming (FR-32), Set description, Include/Exclude from the AI data schema, Show/Hide in model, Delete selected (FR-33), and Clear.
- The bar is neutral; destructive styling appears only on the delete control.
- Bulk AI include/exclude and visibility writes land as pending changes (FR-14) and never touch disk directly.

#### FR-32: Apply a bulk rename transform

The user can rename many objects with rules instead of retyping. Realizes UJ-1.

**Consequences (testable):**
- The transform offers find/replace, strip prefix, strip suffix, underscores-to-spaces, and Title Case, applied in a stated order.
- A live preview lists current name → new name for every selected object before anything is staged.
- A proposed name that collides with an existing sibling blocks apply and names the conflicts — FR-12's collision rule at scale.
- Individually typed renames in the grid commit on save as usual; the transform is an addition, not a replacement.

#### FR-33: Delete objects with a visible blast radius

The user can remove objects irreversibly, seeing everything that breaks first. Realizes UJ-1, UJ-3.

**Consequences (testable):**
- Deleting an import column appends a dedicated M step `PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(previous, {...})` as a fresh final step, never mutating user-authored steps.
- Measures, calculated columns, calculated tables, and calculation items are deleted directly from their TMDL blocks by span patching — no M query involved.
- Removal is wave-based (see §3 Glossary): each round is applied in memory, the graph recomputes, newly orphaned objects are named and confirmed as the next round, and nothing writes to disk until the user stops adding rounds.
- Deleting an object that still has dependents names, per object, which downstream objects break — the tool surfaces facts, never a safety verdict.
- The confirmation dialog groups deletions by table with counts and expandable lists, and carries one warning: removal writes an M-query step and cannot be undone here — only via Git.

### 4.9 First-Run and Application Chrome

**Description:** The surfaces a user meets before and around the grid: arrival, parsing, theme, and per-tab summaries. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-34: Land the user before any folder is picked

The arrival screen states the product and earns the permission grant. Realizes UJ-4.

**Consequences (testable):**
- The landing screen states what the tool does and the problem it solves, shows a browser-capability badge (supported engine and version, or unsupported naming Chrome, Edge, and Opera), and presents the open-folder action with the write-permission rationale directly beneath it.
- Recent projects (FR-4) are listed on the landing screen when stored handles exist.
- A declined write permission leaves the tool in read-only inspection; save and destructive actions stay visible but disabled with an explanation — disabled, never hidden.

#### FR-35: Show parse progress without blocking

The user watches a real parse instead of a spinner over a frozen page. Realizes UJ-1.

**Consequences (testable):**
- Parsing runs through a four-stage stepper — definition tree, model objects, lineage graph, report layer — with live per-stage counts and a progress bar.
- Stage counts derive from the real parse (FR-5 to FR-8); the FR-8 main-thread block budget still holds.

#### FR-36: Ship one theme, light by default

The user gets a calm default and explicit control. Realizes UJ-1.

**Consequences (testable):**
- Light theme is the default on first visit; the dark toggle is user-initiated and persisted in `localStorage`.
- The tool does not follow `prefers-color-scheme`.

#### FR-37: Summarise each tab in KPI cards

The user can read a tab's state without touching the grid. Realizes UJ-1, UJ-2.

**Consequences (testable):**
- Each tab opens with KPI cards carrying an uppercase label, the live figure, and a one-line plain-English definition of what the figure means.
- Description tab: Objects, Backlog, Unused, Pending edits, Coverage. Prep for AI: AI reach, Instruction budget, Synonyms authored, Excluded, Verified answers (informational). Lineage: Tables, Edges, Isolated nodes, Visual bindings, Broken references.
- Counts are computed from the loaded model and move as the user edits or deletes.

#### FR-38: Split Prep for AI into two sub-tabs

The user gets full-height focus for each Prep-for-AI job. Realizes UJ-2.

**Consequences (testable):**
- A segmented selector below the KPI row switches between 'AI instructions' and 'AI schema & synonyms'.
- The instructions view gives the editor full page height with the live 10,000-character gauge (FR-15) and the verified-answers rail on the right (FR-18).
- The schema view is the full-height table-level explorer of FR-17.


## 5. Cross-Cutting NFRs

- **Round-trip fidelity is the correctness bar.** No feature ships if it can corrupt a model. An unmodified save must be byte-identical, verified automatically against the reference model.
- **Zero server.** No backend, no API routes, no database, no telemetry, no analytics. Every byte of model data stays in the browser tab. The only outbound requests are BYOK calls the user configured and triggered.
- **Performance.** Folder selection to an interactive grid within 5 seconds at 2,000 objects. Grid scroll holds 60fps (no frame over 16ms) and filter application completes within 200ms at that size. Parsing never blocks the main thread for more than 50ms at a stretch.
- **Chromium only, stated plainly.** The tool detects an unsupported engine and says so on arrival rather than failing at the picker.
- **Accessibility.** The grid is fully keyboard-operable, since keyboard editing is the core workflow, to WCAG 2.1 AA. Tab order follows column order left to right, row by row; every interactive element shows a visible focus indicator.
- **Failure legibility.** Every refusal and every failure names the file, the value found, and what was expected.
- **Open source.** MIT licensed, with the notices of both reused projects retained and attributed.
- **Correctness gate for the dependency engine.** A synthetic edge-case fixture — orphaned calculation group, field parameter wrapping a deleted column, hidden-measure transitive chain, visual bound only through a field parameter, circular DAX reference — carries expected Used counts, and an automated check fails the build on any mismatch. The real reference model remains the manual acceptance pass.

## 6. Constraints and Guardrails

### 6.1 Safety

- The tool never writes to a file it did not parse, and never creates files outside the selected folder.
- The report layer is written for exactly one mechanical purpose: rename propagation of field bindings (FR-12). No other report-layer write exists, so visual definitions cannot be damaged beyond that mechanical update.
- Verified answers are read-only, so their visual bindings cannot be broken.
- No destructive bulk action runs without the affected object count shown first, and deletion additionally names, per object, every downstream dependent that breaks (FR-33).

### 6.2 Privacy

- Model content is never transmitted anywhere except in BYOK requests the user has configured and initiated.
- BYOK requests carry only the metadata needed for the prompt — names, types, expressions, descriptions — and never data values, since the tool never reads them.

### 6.3 Cost

- No hosting cost: static files on GitHub Pages.
- No inference cost to the project: the user's key, the user's spend. Object counts are stated before any bulk AI operation so the user can estimate their own cost.

## 7. Platform

- Chromium-based browsers on desktop: Chrome, Edge, Opera, and other Chromium derivatives, version 86 or later.
- Secure context required; GitHub Pages over HTTPS satisfies it.
- Desktop only. The workflow assumes a keyboard and a local filesystem.
- No installation, no extension, no account.

## 8. Non-Goals (Explicit)

- **Not a readiness scorer.** No grades, no weighted categories, no rule engine. Semanticus Studio does that; this tool edits.
- **Not a report editor.** The report layer is read for usage; its only write is mechanical rename propagation (FR-12). Visual layout, pages, and visuals are never authored here.
- **Not a publisher.** No XMLA, no deployment, no refresh. Publishing and refreshing stay in Power BI, and are required for LSDL changes to reach Copilot.
- **Not a verified-answer author.** Authoring them means synthesising visual and theme metadata, which is report-layer work.
- **Not cross-browser.** Firefox and Safari are excluded by capability, not by choice.
- **Not a legacy-format tool.** No `.pbix`, no `model.bim`, no pre-PBIR reports.
- **Not a Git client.** Changes land on disk; the user's own Git tooling handles the rest.

## 9. MVP Scope

### 9.1 In Scope

All 38 FRs (FR-1 through FR-38) target the 2-4 day build. `[NOTE FOR PM]` Tighter than the original 29-FR plan; the added nine FRs are mockup-validated (the mockup is the visual contract) but the schedule assumes both reused parsers integrate with minimal rework. If the schedule slips, the descope order is: FR-26 through FR-29 (Optional AI Assistance) first, since §4.7 is explicitly the dilution risk SM-C3 warns against and the tool's thesis holds without it; then FR-34 through FR-38 (Application Chrome) — plain chrome keeps the tool usable; then FR-19 through FR-21 (Relationships Canvas). FR-1 through FR-18, FR-22 through FR-25, and FR-30 through FR-33 — discovery, parsing, the object grid with selection and bulk actions, Prep for AI, and the save path — are the floor beneath which there is no shippable tool, per §5's fidelity-first priority order.

- Folder open with readwrite access, model and report discovery, format validation, landing screen, parse stepper (FR-1 to FR-4, FR-34, FR-35).
- TMDL parsing with source spans, LSDL parsing, report field-usage parsing (FR-5 to FR-8).
- Object grid with filter, sort, pagination, inline description editing (tables included), rename, visibility toggle, pending-changes review (FR-9 to FR-14).
- Grid interactions at scale: selection, contextual action bar, bulk rename transform, destructive delete with wave cascade (FR-30 to FR-33).
- Prep for AI: instructions, synonyms, AI data schema, verified-answer viewing, sub-tab structure (FR-15 to FR-18, FR-38).
- Relationships canvas for impact tracing and grid round-trip (FR-19 to FR-21). Descope candidate.
- Save with byte-fidelity guarantee, failure reporting, external-change detection, and rename propagation to report bindings and LSDL keys (FR-22 to FR-25, FR-12).
- BYOK configuration and AI drafting for descriptions, instructions, and synonyms (FR-26 to FR-29). First descope candidate — cut before Relationships if both must go, since it is the dilution risk SM-C3 names.

### 9.2 Out of Scope for MVP

- Translation cultures beyond the model's primary culture. Deferred to v2; the LSDL machinery generalises but the UI does not.
- Diff preview inside the tool. Deferred to v2 — `git diff` covers it, and the pending-changes view (FR-14) is the interim answer. `[NOTE FOR PM]` This is the first v2 candidate and cheap once the write path exists.
- Offline review round-trip: a self-contained review HTML the business team edits (descriptions only) and the tool re-imports with a `lineageTag`-keyed diff. Deferred to v2 by user decision on 2026-08-30; it reuses the write path and the FR-30 selection groundwork, so it is cheapest after v1 ships.
- Description templates and house-style enforcement across models. Deferred to v2.
- DAX reference rewriting on rename. Warning only in v1 (FR-12).
- Undo history beyond discarding individual pending changes.
- Any readiness scoring. Non-goal, not deferred.

## 10. Success Metrics

**Primary**
- **SM-1**: Round-trip fidelity — an edit-free save leaves 100% of files byte-identical on the reference model and at least two other real models. Validates FR-22, FR-23.
- **SM-2**: Edited models open in Power BI Desktop with no error and every change present, across renames, descriptions, visibility, instructions, synonyms, and AI schema changes. Validates FR-22, FR-15, FR-16, FR-17.
- **SM-3**: Description throughput — 100 descriptions written in under 10 minutes using keyboard navigation only. Validates FR-11.

**Secondary**
- **SM-4**: Load time — folder selection to interactive grid under 5 seconds at 2,000 objects. Validates FR-8.
- **SM-5**: Adoption signal — the repository is used by someone other than the author, evidenced by an issue, a pull request, or a direct report of use. `[ASSUMPTION: no numeric target set; presence of signal is the bar.]`

**Counter-metrics (do not optimize)**
- **SM-C1**: Suggestion acceptance rate. A high rate is not a goal — accepting AI descriptions unread produces exactly the generic text Microsoft's guidance warns against. Counterbalances SM-3.
- **SM-C2**: Objects touched per session. Editing everything is not the goal; editing what matters is. A tool that encourages describing 2,000 objects indiscriminately makes the model worse. Counterbalances SM-3.
- **SM-C3**: Feature count. Every feature added past the write path dilutes the one thing this tool does that nothing else does. Counterbalances SM-5.

## 11. Open Questions

1. Does renaming an object require emitting `changedProperty = Name`? The reference model carries `changedProperty = IsHidden` on hidden columns, so the mechanism exists and is used — but no renamed object appears in the fixture to confirm the `Name` variant. Resolve by renaming in Desktop and diffing the TMDL.
2. Do LSDL `Agents` timestamps need updating when the tool writes the blob, and does stale metadata cause Power BI to regenerate synonyms?
3. Can a culture file be created from nothing if the model never had Q&A enabled, or does Power BI need to author it first?
4. Is `State: Deleted` the correct tombstone for a removed generated synonym, and does Power BI honour it?
5. Which data grid library meets 2,000 rows with inline edit and full keyboard navigation without fighting the existing Tailwind styling?
6. What does the LSDL blob actually weigh at 2,000 objects, and does deferred main-thread parsing suffice or is a worker needed?
7. Does the appended `PBIPreAI_RemoveUnusedCols` M step survive Power BI Desktop's own step consolidation when a user later edits the query in Desktop?

## 12. Assumptions Index

- §4.2 FR-6 — A culture file can be created from scratch for a model that lacks one.
- §4.2 FR-8 — A 2,000-object LSDL is large enough to justify deferred parsing, extrapolated from a 209-object model with a 24,360-line culture file.
- §4.3 FR-12 — DAX reference rewriting on rename is out of scope for v1; a warning is the correct behaviour.
- §4.4 FR-16 — Tombstoning a removed synonym via a deleted state is the correct removal semantic.
- §10 SM-5 — No numeric adoption target; presence of external signal is the bar.
- §9.2 — `git diff` is an acceptable substitute for an in-tool diff preview in v1.
- §4.3 FR-33 — Appending `PBIPreAI_RemoveUnusedCols` as a fresh final M step is the agreed removal mechanism; its round-trip behaviour through Desktop edits is verified against the fixture before ship.
