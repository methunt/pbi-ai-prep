# Reconciliation — Brief vs PRD

Both automated reconcile subagents failed on upstream 401s before producing output (Reconcile2 died before writing anything). This pass was done directly against brief.md, brief addendum.md, brief .memlog.md (11 entries), prd.md, and prd addendum.md.

## 1. Dropped intent

- **Not dropped, but unacknowledged as tension**: memlog records "Scope-risk paragraph replaced with a Delivery basis paragraph" and the brief explicitly said the honest cut candidate is the Prep-for-AI tab, not fidelity — yet §9.1 claims all 29 FRs (FR-1..FR-29) as in-scope for a 2-4 day build with no explicit descope path if the schedule slips. The brief's own honesty about the schedule risk did not carry into the PRD's scope section. Matches rubric's critical finding on §9.1.
- **MIT attribution obligation**: present. §5 "Open source. MIT licensed, with the notices of both reused projects retained and attributed." — correctly carried from memlog's PBIP Documenter + Lineage Tracer reuse basis.
- **Semanticus overlap honesty**: present. §1 Vision and §8 "Not a readiness scorer... Semanticus Studio does that; this tool edits" — carried faithfully.
- **Relationships tab rationale**: present. Brief: "a description is easier to write when you can see what a field joins to and where it is used." PRD UJ-3 and §4.5 preamble carry the same justification. Not dropped.
- **Zero-upload / zero-server promise**: present in §5 as "Zero server... Every byte of model data stays in the browser tab." Carried correctly.

No dropped intent found beyond the scope-honesty gap already flagged by the rubric pass.

## 2. Distorted intent — none found

Checked each memlog override against the PRD text:

- **500-char cap vs 200-char Copilot marker**: memlog override says "Description cap is 500 chars in the editor, not 200 — the 200-char limit is Copilot's read window only, so the editor marks the cutoff instead of enforcing it." PRD FR-11: "Editing accepts up to 500 characters and refuses further input at that limit" + "The 200-character position is marked so the author can see what Copilot will read." Correctly distinguishes cap from marker. Matches.
- **AI features stay in v1**: memlog override explicit. PRD §4.7 (FR-26–FR-29) present, not cut. Matches — though the rubric pass correctly notes the PRD never explains *why* it survives against its own SM-C1/SM-C3 counter-metrics. That is a presentation gap, not a distortion.
- **2-4 day target stands**: memlog explicit. PRD does not restate the day count anywhere in the body (reasonable — schedule isn't a PRD-body concern) but §9.1's all-29-FRs-in-scope claim is in tension with it, per rubric.
- **Three tabs**: memlog "Scope expanded to three tabs: Description & Update, Prep for AI, Relationships." PRD §4 groups FRs into exactly these three tabs plus Open/Discovery, Parsing, Saving, and Optional AI Assistance as non-tab feature groups. Matches.
- **React/Vite stack**: memlog "Stack changed to match reuse... React 18 + Vite 6 + @xyflow/react 12 + elkjs + zustand 5 + Tailwind 4 + lucide-react." PRD §1 says "a React app served as static files from GitHub Pages" — consistent, and the addendum carries the full stack list. No distortion.
- **dbt half excluded**: memlog "Explicitly NOT carrying over the dbt half... a required mapping CSV would break the open-a-folder promise." Not mentioned anywhere in the PRD, which is correct — this is a reuse-scope decision belonging to the addendum, not user-facing PRD content. Confirmed present in `addendum.md` under reuse basis. No distortion.

## 3. Unearned additions — none found

Every FR traces to either a UJ, an §5 NFR, or a named brief/memlog decision. No PRD content found that lacks a source. The `functions.tmdl`/`queryGroup`/`perspectives` additions I made to FR-5 in this session are themselves grounded in the fixture, not invented scope.

## 4. Ground-truth drift — verified, no drift found

Checked against memlog's verified-ground-truth entry:

| Ground truth (memlog) | PRD claim | Match |
|---|---|---|
| AI instructions key is `CustomInstructions` | UJ-2: "the existing `CustomInstructions` text with a live character count against 10,000" | Match |
| AI schema exclusion = `Visibility {Value: Hidden, State: Authored}` | FR-17 references "writes the entity's `Visibility` object with an authored state" | Match (rubric correctly flags "authored state" as undefined term, not as drift) |
| Verified Answers on disk under `VerifiedAnswers/definitions/<guid>/` | §4.4 FR-18 (view-only) references Verified Answers viewing; not contradicted | Match |
| Descriptions as `///` doc comments only, zero `description:` properties | FR-11 "written as consecutive doc comment lines" | Match |
| CRLF, UTF-8 no BOM | Not restated verbatim in PRD body but is an NFR-level fidelity constraint owned by §5 "Round-trip fidelity is the correctness bar" and detailed in addendum. Acceptable — this is addendum-level mechanism, correctly not duplicated in PRD. | No drift |
| LSDL Version 4.2.0 | Not stated as a version number anywhere in PRD; addendum owns this level of detail. | No drift, correct layering |
| 10,000-character instruction cap | UJ-2 "live character count against 10,000" | Match |
| `definition.pbism` version 4.2, `qnaEnabled: true` | FR-3 validates `.pbism` version but never checks `qnaEnabled`; Open Question 7 raises it but no FR owns the answer | **Gap, already flagged by rubric as medium finding** — not drift (nothing false is stated), but an uncovered ground-truth fact |

## 5. Fixture coverage — gaps found and already patched this session

Actual contents of `_test_pbip_w_ai/Atrium Sigma.SemanticModel/definition/`:
`database.tmdl`, `model.tmdl`, `relationships.tmdl`, `functions.tmdl`, `tables/*.tmdl` (32 tables), `cultures/en-US.tmdl`, `perspectives/SemanticModel.tmdl`. No `roles/` folder, no `expressions.tmdl` present in this particular fixture (FR-5 lists both — harmless to list a construct the format supports even if this fixture lacks it, since TMDL format generally allows roles and expressions; not a PRD defect).

Findings, now fixed in `prd.md`:
- **`functions.tmdl`** (2 DAX user-defined functions, triple-backtick expression bodies, `lineageTag` each) was absent from FR-5's file list. **Fixed**: added to FR-5's file list and given its own consequence ("A DAX user-defined function declared in `functions.tmdl` is a model object, and its triple-backtick expression body is preserved verbatim").
- **`queryGroup` declarations** in `model.tmdl` (6 groups: Measure, Source, Dim, Parameter, Fact, Mapping, each with `PBI_QueryGroupOrder` annotation) had no FR-5 consequence requiring retention. **Fixed**: added "`queryGroup` declarations, `displayFolder` values, and `perspective` membership are read and retained, so a write cannot lose them."
- **`displayFolder`** (55 occurrences in `Metrics.tmdl` alone) — same fix as above.
- **`perspectives/SemanticModel.tmdl`** (`perspectiveTable`/`perspectiveColumn` membership) — was already named in FR-5's file list before this session, but had no consequence guaranteeing it survives a write. Covered by the same fix.
- **`changedProperty = IsHidden`** — present across 10+ table files in the fixture on hidden columns. FR-13 (visibility toggle) had no consequence requiring the tool to emit this. **Fixed**: added "A visibility change emits `changedProperty = IsHidden` alongside it, matching the convention Power BI itself writes and the reference model already contains." Also narrowed Open Question 1 to note the mechanism is now confirmed for `IsHidden` and only the `Name` variant (for renames) remains unconfirmed.

No `DAXQueries/` or `.pbi/` folders exist in this fixture (those are report-level `.Report` project artifacts, out of scope for a `.SemanticModel`-only tool per §8 "Not a report editor" and §9.2 boundary) — correctly out of scope, not a gap.

## Summary

No dropped, distorted, or unearned PRD content relative to the brief and its decision log. Ground truth matches on every checked fact. The one real gap — `qnaEnabled` — and the parsing-completeness gaps against the fixture are the same findings the rubric pass surfaced independently; the fixture gaps are now fixed in `prd.md`. The `qnaEnabled` gap and the §9.1 scope-honesty gap remain open for the finalize triage step.
