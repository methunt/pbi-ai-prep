# Brainstorm Intent: Scope Expansion for PBI AI Prep

## 1. Executive Summary & Scope Goal
- **Topic:** Scope expansion for the Description & Update page and graph engine in `pbi-ai-prep`.
- **Core Goal:** Elevate `pbi-ai-prep` from a flat metadata text editor to a dependency-aware semantic preparation workbench. Equip every model object with reachability and usage telemetry (`Used (count)`), full-graph transitive dependency tracking, safe cascading deletions via M-Query Table steps, and seamless cross-tab navigation between Description cleanup and AI data schema readiness.
- **Delivery Target:** All 7 core pillars locked into V1 (zero scope reductions).

---

## 2. The 7 Locked V1 Functional Additions

### Pillar 1: Is Used Reach & Count Cell Format
- **UI Presentation:** Displays `Used (N)` where $N$ is the integer sum of all direct, transitive, and leaf downstream dependents.
- **Unused State:** Renders as `Used (0)` or distinct high-visibility tag for fast filtering.
- **Detailed Tooltip:** Hovering on the cell renders an instant breakdown:
  - Direct dependents (immediate consumers)
  - Transitive dependents (downstream in multi-hop chains)
  - Leaf consumers (end-user visuals & report pages)

### Pillar 2: Per-Row Lineage Icon Navigation
- **Navigation Affordance:** A dedicated lineage icon next to each object name in the Description grid.
- **Explicit Gesture:** Clicking the icon navigates the user directly to the **Lineage Tab** with that object pre-selected and its entire upstream/downstream subgraph highlighted.
- **Constraint:** Zero auto-jump on row clicks or cell edits (prevents jarring view switches while editing descriptions).

### Pillar 3: Full-Graph Transitive Dependency Tracking
- **Complete Edge Traversal:** Graph engine tracks all applicable dependency pairings:
  1. `measure` $\to$ `measure` (DAX measure references)
  2. `measure` $\to$ `column` (DAX column references)
  3. `calculated column` / `calculated table` $\to$ source columns/tables
  4. `calculation item` $\to$ DAX referenced objects
  5. `field parameter` $\to$ underlying columns inside `NAMEOF()` declarations
  6. `DAX function` (`functions.tmdl`) $\to$ body referenced entities
  7. `table` $\to$ `table` (active/inactive model relationships)
  8. `visual` / `page` $\to$ `column` / `measure` / `field parameter`
- **Exclusion:** Visual-to-visual connections (not applicable in Power BI architecture).

### Pillar 4: Unused Filtering & Irreversible M-Query Bulk Delete
- **Filter Preset:** One-click filter for `Used = 0` across tables, columns, and measures.
- **Top Action Bar:** Displays **"Remove Selected Columns from Model"** action button.
- **TMDL Implementation:** Columns are removed by appending/modifying an M-Query Table step (`Table.RemoveColumns`) in the last step of the respective table's M expression.
- **Irreversibility Notice:** Action explicitly warns that disk modifications cannot be undone in-browser without Git revert.

### Pillar 5: Wave-Based Cascade Recomputation & Orphan Confirmation Prompts
- **In-Memory Wave Engine:** Deleting an object applies in-memory, immediately recomputes the full graph, and detects newly-orphaned downstream items (Round 2, Round 3, etc.).
- **Specific Orphan Prompt:** The confirmation dialog explicitly lists: *"Deleting your selection will orphan X additional fields: [List]. Include them in this removal?"*
- **Atomic Disk Write:** Nothing writes to TMDL files on disk until all user-approved cascade rounds finish.

### Pillar 6: Tab Split Architecture (Description vs Prep for AI)
- **Description & Update Tab:** Operates strictly through the **Delete/Cleanup Lens** using the `Used (count)` metric and TMDL doc-comment editing.
- **Prep for AI Tab:** Operates through the **AI Reachability Lens** using LSDL `linguisticMetadata` (`Entities[key].Visibility: {Value: Hidden, State: Authored}`).
- **Decoupled Workflows:** A field marked `Used (0)` remains available for AI exploration if a standalone measure is intended solely for natural-language Copilot queries.

### Pillar 7: Browser Permission Handling & Disabled-Not-Hidden Action Controls
- **Startup Permissions:** Proactive compatibility check on browser startup with explicit rationale before invoking File System Access API.
- **Declined Permission Path:** If readwrite access is refused, the app enters read-only inspection mode.
- **Disabled-Not-Hidden Pattern:** Destructive actions (e.g., "Remove Unused") remain visible but disabled with an explanatory tooltip detailing missing write permissions.

---

## 3. Edge Case Matrix & Handling

| Edge Case | Failure Risk | V1 Mitigation & Implementation |
| :--- | :--- | :--- |
| **Field Parameter Indirection** | Visual binds to parameter table; source columns appear falsely "unused". | Graph parser inspects `NAMEOF()` rows in parameter tables; parameter consumers propagate transitively to source columns. |
| **Calculation Group Blast Radius** | Calculation item DAX references source objects without direct visual bindings. | Calculation items are first-class nodes; references are parsed and attributed as direct usage. |
| **Cascading Measure Removal** | Removing a measure orphans 5 upstream helper columns. | Wave-based cascade recomputation calculates next-generation orphans before disk commit. |
| **AI vs Model Visibility Conflation** | Hiding a column in the model accidentally hides it from Copilot or vice versa. | Strict tab split: TMDL `isHidden` property is separated from LSDL `Visibility.State` JSON schema. |

---

## 4. Downstream Handoff & Next Steps
- **Target PRD Document:** Update `_bmad-output/planning-artifacts/prds/prd-pbi-ai-prep-2026-08-28/prd.md` to incorporate FR specifications for Pillars 1–7.
- **Architecture Spine:** Input into `bmad-architecture` to plan the AST/TMDL span-patching and graph traversal algorithms.
- **Epics & Stories:** Hand off to `bmad-create-epics-and-stories` for vertical slice slicing.
