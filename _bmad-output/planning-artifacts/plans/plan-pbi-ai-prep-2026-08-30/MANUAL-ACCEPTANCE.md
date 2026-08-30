# Manual Acceptance (SM-2 / SM-3) — needs Power BI Desktop

These are the two Success Metrics I cannot run autonomously (they need **Power BI Desktop**). Build the app + run everything else first; then do this.

## Prereqs
- `npm run build` (production dist) served over HTTPS (e.g. `npm run preview` or GH Pages) so the File System Access API has a secure context.
- Chromium desktop (Chrome/Edge).

## SM-2 — Edited model opens in Power BI Desktop, every change present
1. Open the app, pick `_test_pbip_w_ai\Atrium Sigma.SemanticModel` (or any PBIP folder), grant readwrite.
2. Make at least one of EACH: a description edit, a rename, a visibility toggle, an AI instruction edit, a synonym add + a remove (tombstone), an AI-schema include/exclude.
3. Press Save. Confirm the pending-changes list → save succeeds.
4. Open the same `.pbip`/`.SemanticModel` folder in Power BI Desktop. It must open with **no error**, and every change present:
   - new `///` description lines above the object,
   - the renamed object's new name (and the report/LSDL binding re-keyed — check the report visual still binds),
   - `isHidden` + `changedProperty = IsHidden`,
   - the LSDL `CustomInstructions` text, the synonym (`User` added; the removed generated one is `Deleted`), the `Visibility` (State `Authored`).
5. **Critical checks**:
   - An edit-free save is byte-identical (already gated; re-confirm in Desktop that nothing changed).
   - Renaming a column referenced in DAX elsewhere raises a warning (v1 warning only), and the model still opens.

## SM-3 — 100 descriptions in <10 min keyboard-only
1. Load a model with ≥100 missing descriptions. Apply the empty-description filter.
2. Type down the column using Tab/Enter (keyboard only). Start a timer.
3. After 100 descriptions, stop the timer and press Save.
4. **Must be under 10 minutes** and the descriptions must be the only diff (clean `git diff` if the folder is a git repo).

## Open questions to verify against Desktop (from DEFERRED.md §3)
These are facts the write path assumes — verify each by reproducing in Desktop + reading the resulting TMDL/LSDL:
1. Rename emits `changedProperty = Name`? 2. Culture file creatable from scratch? 3. `State: Deleted` honoured? 4. `PBIPreAI_RemoveUnusedCols` M-step survives Desktop step consolidation? 5. Worker suffices at 2000 objects? 6. LSDL `Agents` timestamps need updating?

## Report back
Record the pass/fail for SM-2 + SM-3 + the open questions in this file (or tell the agent), so the final review can close them.
