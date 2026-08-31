# Task 30 — Prep-for-AI + parse-stepper fixes (Bugs 7, 9, 10, 1)

## Status: COMPLETE — all four bugs verified

## Files changed (owned by this task only)
- `src/ui/prep/InstructionsEditor.tsx` — Bug 7
- `src/ui/chrome/ParseStepper.tsx` — Bug 1
- `src/ui/theme.css` — Bug 10 (scoped: `.switch`/`.switch.on`/`.syn`/`.syn-del`)
- `src/ui/prep/SynonymChips.tsx` — Bug 10

## Bug 7 — AI instructions editor showed empty customInstructions
Root cause (found at the source, not papered over): the LSDL layer loads LAZILY — `PrepForAi` requests it via `requestLayer('lsdl', {layerFiles:{cultureText}})` only when the AI tab is shown, and the worker's `parseLSDL(cultureText)` DOES extract `CustomInstructions` correctly (verified: reference `_test_pbip_w_ai/.../cultures/en-US.tmdl` carries a 6,497-char `CustomInstructions`). The editor's `useState(initial)` captured the mount-time `initial`, which was the EMPTY `LSDL` fallback (`customInstructions: ''`) because the layer hadn't landed yet. When the real LSDL arrived, the draft never re-synced.
Fix: `InstructionsEditor` now `useEffect`s on `[lsdl.customInstructions, journal]` — it re-syncs the draft to the real value as long as there is NO staged `customInstructions` record (a staged record = the user is mid-edit, never clobbered).

## Bug 9 — schema heading + KPI wording
Verified already aligned to the mockup (no code change needed): heading "AI data schema & synonyms" + "Expand a table to set reach and synonyms per field"; KPI labels/definitions match ("AI reach / Fields Copilot is allowed to see and query.", "Budget / Characters used of the 10,000 Copilot limit.", "Synonyms / Business terms you authored, per field, max 20.", "Excluded / Deliberately hidden so Copilot cannot guess with them.", "Verified / Frozen question-to-visual pairs authored in Power BI.").

## Bug 10 — schema table: switch toggle + small add pill + max-20 + no overlap
- Added `.switch`/`.switch.on`/`.syn`/`.syn-del` to `theme.css` (token-bound: `--color-secondary` off, `--color-primary` on, `::after` knob; mockup trace).
- `SynonymChips` reworked: small DASHED `+ add` pill (mockup line 1518) revealing an inline input; `+N more` expander kept; amber `max 20 reached` chip at cap; each field row's `.switch` include toggle preserved.
- Field rows render cleanly (switch 40×22 flex-none; no overlap).

## Bug 1 — parse stepper showed static then jumped
Root cause: the stage map drove "Definition tree" off the `lsdl` layer (idle during the primary `objects` load) and "Model objects" off `project.objects.length` (only ever `ready`/`idle`), so no real progress was visible during the fast primary parse.
Fix: `ParseStepper` binds stage 1 (Definition tree) AND stage 2 (Model objects) to the `objects` layer `parseState` (both derive from the primary parse); lineage/report keep their own layer states. The stepper shows while `phase==='parse'`, and the grid takes over when `setProject` lands (objects ready).

## Verification
- `npm run build` — clean (tsc -b + vite build, only the pre-existing chunk-size warning).
- `npm test` — 253/253 pass.
- `npm run lint` — clean.
- Browser smoke (dev seam `window.__pbiStore`, loaded the reference model via `requestLayer('lsdl')` + real culture text):
  - AI instructions editor value === real `CustomInstructions` (6,497 chars); Budget KPI = 6,497.
  - Schema view: heading + KPI wording correct; field row has `.switch.on` (40×22, primary blue), small dashed `+ add` pill, `+14 more`, amber `max 20 reached` at 20 live terms.
  - Stepper: exactly 2 stages ("Definition tree", "Model objects") spin together from the `objects` parse; lineage/report idle; progress bar shown.

## Concerns
- None blocking. The 20-term `max 20 reached` check and the `.switch`/`.syn` visual were both confirmed in-browser. Sibling-owned files (`src/ui/grid/*`, `src/ui/App.tsx`, `src/state/*`, `src/parse/*`) were not touched.
