# Task 29 — Final whole-branch review fixes: report

Branch `feat/pbi-ai-prep`. Fixes the 3 findings from the FINAL whole-branch review.

## Findings fixed

1. **Save button inert (CRITICAL)** — wired a save orchestrator in `src/state/save.ts`
   (`saveWrites`, `reloadConflicts`, `bindRootHandle`) and connected it to the Save
   button's `onClick` in `src/ui/App.tsx`. Flow: group journal by file →
   `changedOnDisk` (FR-25) → `planWrites` → `applyPatches` → `writeFileAtomic`
   (FR-22, UTF-8 no BOM; only files with changes written) → `applyRefresh` →
   `markLayersStale` → clear the written files' journal records. FR-24 revoked
   permission retains the whole journal and offers a click-ready user-gesture retry;
   FR-25 drift surfaces a reload-or-overwrite modal naming the file. Button is
   disabled (visible) when journal empty or permission !== 'granted'.
   Added store doors `applySaveCommit` (AD-5 committed state) and `mergeReportEdges`.

2. **requestLayer('lsdl'|'report'|'lineage') never called (CRITICAL)** — PrepForAi
   (`src/ui/prep/PrepForAi.tsx`) now requests `lsdl` + `report` on tab-visible when
   idle/stale; LineageCanvas (`src/ui/lineage/LineageCanvas.tsx`) requests `lineage`.
   `src/fs/load.ts` now captures every text file (TMDL + report JSON + culture) into
   `project.files`; `src/state/layerDeps.ts` derives the culture text + report file
   map from it. The broker merges the lineage layer's report-derived visual edges
   into the graph on ready (FR-7/FR-9 leaf usage).

3. **patch-engine non-fatal decode (MUST-FIX)** — `src/write/patch-engine.ts:105`
   now `new TextDecoder('utf-8', { fatal: true })`, so a split multi-byte char
   corrupting a byte throws instead of silently degrading to U+FFFD.

## Verification

- `npm run gates` → 2/2 GREEN (fidelity + usage).
- `npm test` → 16 files / 253 tests green.
- `npm run build` → clean (tsc -b + vite build).
- `npm run lint` → clean.
- Node smoke (mock FSA handle, temp fixture copy, deleted after): a description edit
  plans → patches → atomically writes the on-disk file → refreshes spans → clears the
  journal; an external on-disk change reports FR-25 `conflict` and retains the journal.
- Browser smoke (vite dev): app boots; injecting a project + opening the Prep-for-AI
  tab populates the `lsdl`/`report` layers to `ready`; the Save button renders
  disabled at 0 pending and enables with a staged edit; clicking Save drives
  `saveWrites` (error modal shown here because no FSA handle is bound in the injected
  env — the write path itself is verified by the Node smoke above). The FSA folder
  picker is not automatable, so the on-disk save against the real reference model was
  exercised via the Node smoke rather than the browser UI.

## Concerns

- Post-save beam consistency: `applyRefresh`'s null (invalidated) span keeps the last
  known span as a best-effort anchor rather than re-deriving via a full re-parse; a
  rename-then-rename second save may target a stale name span. Re-derivation would
  require re-parsing written files (out of scope for this wiring wave).
- FR-24 permission revocation mid-save retains the whole journal and reports
  already-written files; because those snapshots are not force-refreshed, a retry may
  surface the already-written files as FR-25 conflicts for the user to resolve.
