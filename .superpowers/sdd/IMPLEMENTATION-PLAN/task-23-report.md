# Task 7.4 — Prep for AI (sub-tabs, instructions, verified answers, schema & synonyms)

## Status
`npm run build` clean. `npm test` → **236 passed** (15 files; 234 prior + 2 new FR-18 verified-answer tests). Render smoke driven in a live dev browser against an injected fixture project — every item below verified against the DOM.

## What was built — `src/ui/prep/`
| File | Purpose |
|---|---|
| `PrepForAi.tsx` | Surface shell: AI KPI row (AI reach, Budget, Synonyms, Excluded, Verified) + `SubTabSelector` + the active view. LSDL edits go through the journal only. |
| `SubTabSelector.tsx` | FR-38 segmented pill selector below the KPI row; live `N/M` badge on the schema tab; ARIA tablist with arrow-key nav (AD-11). |
| `InstructionsEditor.tsx` | FR-15 full-height editor; live `N / 10,000` gauge + progress bar; 10k cap truncates input + red "over limit" badge; stages journal `customInstructions`. |
| `VerifiedRail.tsx` | FR-18 read-only rail (right of the editor); reads `VerifiedAnswers` from the report layer; empty state when none; "Authored in Power BI" footer. |
| `SchemaExplorer.tsx` | FR-17 table-level explorer: per-table collapsed rows (field count, included/total, synonym totals), expand → per-field include toggle + chips, dot rule, bulk include/exclude, exclude-dependent warning. |
| `SynonymChips.tsx` | FR-16 per-object synonyms: state labels, add→User, remove Generated/Suggested→Deleted tombstone, 20-live cap + `N/20`, max 6 inline + `+N more`. |
| `lsdlModel.ts` | Pure helpers: object↔entity resolution (ONE shared resolver, AD-8), effective visibility/terms over the journal, `addTerm`/`removeTerm`/`liveTerms`, caps. |

## LSDL wiring
All writes go through `store.journalAdd` with the write-planner's **sanctioned fields only** (`customInstructions` / `synonyms` / `lsdlVisibility`), never a custom field:
- `customInstructions` → `{ kind:'field', objectId:'' (model-wide), field:'customInstructions', new: <raw string>, file: <culture file>, context:'user' }`. The write-planner re-encodes it as a JSON string inside the `linguisticMetadata` block (value-preserving re-serialization is byte-identical). Coalesces per `{objectId, field}`; discards (via `journalDiscard`) when the draft returns to the LSDL pristine value.
- `synonyms` → `{ ..., objectId:<object id>, field:'synonyms', new: <full replacement LSdlTerm[]>, file: <culture file> }`. The planner replaces the entity's whole `Terms` list; it **auto-creates the bound entity** (dot-rule key) when an object has no binding yet (FR-16 first-add case).
- `lsdlVisibility` → `{ ..., objectId:<object id>, field:'lsdlVisibility', new: <boolean> }`, `true`=Hidden/Exclude, `false`=Visible/Include (State `Authored`). Same field the 7.3 ActionBar uses — no divergence.

Effective state is computed by folding the journal over the LSDL layer (`layers.lsdl.data`) so pending writes are reflected live; the folded read-model is never relied on for the LSDL fields.

## FR compliance map
- **FR-38** — `SubTabSelector` renders below the KPI row, live `N/M` = included/total objects. ✓ (verified `AI schema & synonyms6/6`).
- **FR-15** — full-height editor, live gauge `21 / 10,000`, cap refused: pasting a 10,005-char value truncates to 10,000 and shows the red "over limit" badge; save writes journal `customInstructions`. ✓
- **FR-18** — read-only rail lists frozen pairs from `VerifiedAnswers/definitions/<guid>/definition.json` (via the report layer's `verifiedAnswers`); empty state when none; footer "Authored in Power BI". ✓
- **FR-16** — per-object chips with `USER/GENERATED/SUGGESTED/DELETED` labels; add → `User`; remove Generated/Suggested → `Deleted` tombstone (entry kept, struck-through); remove User → hard delete; 20-live cap with `N/20` counter, add refused at cap; max 6 chips inline + `+N more` expander; Deleted excluded from live count. ✓ (verified tombstone `amount → Deleted`, live `2/20`, cap `20/20` + refused `+16 more`).
- **FR-17** — per-table collapsed rows (field count, included/total, synonym totals); expand → per-field include toggle + chips; **dot grey when every field excluded, blue when any included**; bulk include/exclude over the expansion + global; excluding a depended-on object raises a warning naming both (via `graph.dependents`). ✓
- **Read-only (permission !== 'granted')** — editor textarea, include switches, and synonym add all `disabled`, never hidden (verified `denied`: switches/add/textarea disabled, panels still visible). AD-11 focus rings via the existing `:focus-visible` rule; real buttons/aria throughout.

## Synonym cap / tombstone logic (`lsdlModel`)
- `liveTerms` = terms where `state !== 'Deleted'`; only these count toward 20.
- `addTerm(terms, name)` returns `{ added:false }` when blank / duplicate-live / `live >= 20` (refuse); else appends `{ name, state:'User' }`.
- `removeTerm(terms, name)`: Generated/Suggested → sliced copy with that entry's `state` flipped to `Deleted` (tombstone, kept); User → hard-removed; already-Deleted → no-op.
- Wire: the caller journals the returned array as the `synonyms` replacement.

## Schema explorer dot rule + exclude warning
- Group rows keyed by `obj.table` (tables use their own name); `included = #(hidden === false)`. Dot class: `bg-foreground/30` (grey) when `included === 0`, `bg-primary` (blue) otherwise.
- Exclude-dependent warning: when a field is excluded and `graph.dependents(field.id)` contains a *currently-included* object, render "⚠ Excluding `<field>` also affects `<dependent(s)>` which depend on it." naming both (verified "⚠ Excluding SSP also affects Platform Spend which depend on it.").

## Files changed
- **New:** `src/ui/prep/{lsdlModel,SubTabSelector,InstructionsEditor,VerifiedRail,SchemaExplorer,SynonymChips,PrepForAi}.tsx` (lsdlModel is `.ts`).
- **Modified:** `src/ui/App.tsx` (wire `<PrepForAi/>`; **hoisted the nested `AppShell` to module scope** — see concerns), `src/ui/theme.css` (add `--color-amber` warn token so the amber "Excluded" KPI + warning render), `src/parse/pbir-reader.ts` (add `VerifiedAnswer` + `verifiedAnswers` to `ReportParse`, scan `VerifiedAnswers/definitions/*/definition.json`), `tests/unit/pbir-reader.test.ts` (2 new FR-18 tests).

## Self-review
- Per-field include toggle now stages **only that field** (caught mid-smoke: an earlier version staged the whole table).
- Journal writes no longer reset the prep sub-tab or schema expansion (root cause fixed — see concerns).
- No violet/purple; all UI uses theme tokens/classes (`bg-primary`, `t-blue/t-sky/t-cyan/t-emerald/t-slate`, `text-destructive` for over-limit). Pure helpers in `lsdlModel.ts` keep the mutation logic testable and reuse the ONE shared resolver (AD-8).

## Concerns
1. **`App.tsx` nested `AppShell`** — `AppShell` was defined *inside* `App`, so every store write (a journal edit) minted a new component type and unmounted/remounted the whole shell, resetting the prep sub-tab and schema expansion on every synonym/edit. I hoisted it to module scope (canonical fix). This is a behavior change to task 7.1's file that also stabilizes the grid; worth flagging to the main agent.
2. **Report layer / VerifiedAnswers** — the report layer is not yet requested by any producer in the app (`requestLayer` has no caller today), so `VerifiedRail` shows the empty state until a caller wires `reportFiles` to include `VerifiedAnswers`. The extraction itself is tested and verified; it's purely a wiring dependency.
3. **`--color-amber` token** — added to `theme.css` (locked palette includes amber/warn). This makes previously non-generating `*-amber` utilities (amber KPI, warnings) actually render. Palette-consistent (blue family + amber warn), no violet/purple.

## Fix round 1 (Important)
**FR-17 exclude-dependent warning used the wrong signal.** `SchemaExplorer.tsx` `dependentNames` filtered dependents with `dep.hidden` — the PBI-model **IsHidden** flag (`domain/objects.ts`) — instead of the **effective AI-exclude** state. A PBI-model-hidden but AI-included dependent was silently skipped (false negative); an AI-excluded but model-visible dependent was wrongly named (false positive).

Fix: build `aiRowsById = Map<objectId, AiObjectRow>` from the `buildAiRows` result and skip a dependent when its effective AI-exclude is true (`aiRowsById.get(id)?.hidden === true`), never `dep.hidden`.

Re-verified (live browser smoke): (a) excluding SSP names "Platform Spend" even though that measure is PBI-model `hidden:true` but AI-included → **named** (no false negative); (b) after AI-excluding Platform Spend, the SSP warning disappears → AI-excluded dependent **skipped** (no false positive). Build clean; `npm test` → 236 passed.
