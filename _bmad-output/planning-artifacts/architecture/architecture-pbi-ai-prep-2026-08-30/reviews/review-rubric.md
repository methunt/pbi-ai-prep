# Review — Good-Spine Rubric Walk

- **Artifact:** `_bmad-output/planning-artifacts/architecture/architecture-pbi-ai-prep-2026-08-30/ARCHITECTURE-SPINE.md` (snapshot #B7CD)
- **Lens:** good-spine rubric walker (7 criteria: divergence points fixed & none missed · rules enforceable & preventive · Deferred divergence-free · tech verified-current · ratifies-not-contradicts sources · spec coverage · no silent dimension)
- **Sources cross-checked:** `prd.md` (#B8E2) + `addendum.md` (#E555), `EXPERIENCE.md` (#ABBE), `DESIGN.md` (#EB1A)
- **Date:** 2026-08-30

## Verdict

**fix-before-final.** One AD Rule as written forbids the product's core LSDL writes (AD-8), the dependency diagram contradicts its own rule text on the worker→store edge, one PRD open question (LSDL `Agents` timestamps) was dropped into silence, and the Stack's React 19 is doc-drifted against the React 18 named by both the PRD addendum and the UX contract (the version itself verifies current — the sources need reconciling, see H3). All four are one-line-to-one-paragraph fixes; nothing structural needs rework. The spine is otherwise strong: the load-bearing ADs (1, 2, 3, 5, 7, 9, 10) are genuinely enforceable and each prevents a real divergence.

## Rubric Walk

| # | Criterion | Result |
|---|---|---|
| 1 | Real divergence points fixed, none missed | **Mostly.** Identity (AD-2), write mechanism (AD-3), journal (AD-4), save orchestration (AD-5), graph (AD-6), parse staging (AD-7), store ownership (AD-10) are exactly the right divergence points and are fixed. Missed: deletes' representation in the journal (M1); the worker/store boundary is named but then contradicted (H1); the `Agents`-timestamp dimension is silent (H2). |
| 2 | Every AD's Rule enforceable and preventive | **8 of 10.** AD-1 (import linter + no-restricted-globals), AD-2 (single id accessor), AD-3 (no AST writer in `write/`), AD-4 (mutation only via `journalAdd`/`journalDiscard`), AD-5 (explicit save pipeline), AD-7 (per-layer `parseState`), AD-9 (encoder conventions), AD-10 (store-only cross-surface) are mechanically checkable and prevent what they name. AD-8 as written contradicts FR-15..17 (C1). AD-6's "build eagerly **or** on demand" is a non-decision (L1). |
| 3 | Deferred hides no divergence | **Clean except one cross-doc conflict.** Grid library (single owner, requirements stated), BYOK (boundary pre-drawn), DAX rewriting (decided: warning), translations (v2) — none lets two builders diverge. The "description templates" row sides with PRD §9.2 while the UX contract ships a v1 template checkbox (M5). |
| 4 | Named tech verified-current | **Pass (cross-referenced).** VersionCheck verified every quoted number current against the live registry (2026-08-30): React 19.2.8, Vite 8.2.2 (Rolldown claim true), Tailwind 4.3.3, Zustand 5.0.15, @xyflow/react 12.11.5, elkjs 0.12.0; GitHub Pages auto-HTTPS satisfies the FSA secure context. Only under-specified row: TypeScript "latest stable" (L5). Remaining issue is doc drift, not currency: React 19 vs the React 18 named in addendum + EXPERIENCE.md (H3). |
| 5 | Ratifies rather than invents against settled decisions | **One unresolved drift, two inventions.** React 18→19: spine is right on currency but leaves addendum/EXPERIENCE.md saying React 18 — unreconciled doc drift (H3); worker promoted from "measure first, do not build speculatively" (addendum) / PRD OQ-6 to a structural pillar without a supersession note (M2); template-token handling split across PRD §9.2 vs EXPERIENCE (M5). Conventions otherwise faithfully carry PRD vocabulary (LSDL states verbatim, error shape `{file, value, expected}`, theme in `localStorage 'theme'`, CRLF preservation) — good. |
| 6 | Covers the spec's capabilities (FR-1..38 groups) | **All eight FR groups mapped in the Capability table; FR-26..29 covered by Deferred with the `ai/` boundary drawn.** Gap: PRD §5's two automated verification gates (edit-free-save fidelity check vs the reference model, FR-23; synthetic edge-case fixture build gate on expected Used counts) appear nowhere in the spine (H4). |
| 7 | No silent dimension at this altitude | **Operational envelope is present** (static SPA, GitHub Pages, zero server, secure context, Chromium v86+, desktop-only) — better than most spines — but silent on: the Pages project-subpath/`base` requirement (M3), the handle-persistence store for FR-4 (M4), and the verification harness (H4). Dropped open question = silent dimension (H2). |

---

## Findings

### Critical

**C1 — AD-8's Rule forbids the LSDL writes that FR-15/16/17 require.**
Evidence: spine line 85 — "the report layer is written **only** for rename propagation of field bindings; the same rename write re-keys the LSDL entity binding. **No other report-layer or LSDL write exists** (verified answers read-only, FR-18)." But `CustomInstructions` edits (FR-15), synonym `Terms` writes with tombstoning (FR-16), and entity `Visibility` writes with `Authored` state (FR-17) are the Prep-for-AI feature group — the spine's own Capability map routes "Prep for AI (FR-15..18, FR-38)" through `write/`, and AD-9 caps the very strings those writes produce. The PRD (§6.1) restricts only the *report layer* to rename propagation; the spine over-generalised to "or LSDL". A literal implementer refuses to write the LSDL; a pragmatic one improvises their own whitelist — both are divergences the spine exists to prevent. (Also note FR-17 bound to AD-8 in the Rule's Binds line is part of the same confusion.)
Suggested edit (line 85, replace from "the same rename write…" to the end of the sentence):
> "…; the same rename write re-keys the LSDL entity binding. No other **report-layer** write exists (verified answers read-only, FR-18). LSDL writes are limited to exactly: `CustomInstructions` (FR-15), entity `Terms` incl. `Deleted` tombstoning (FR-16), entity `Visibility` with state `Authored` (FR-17), and the rename re-key of the entity binding (FR-12) — all through the same patch engine (AD-3)."

### High

**H1 — The dependency diagram contradicts its own rule text and the thread boundary.**
Evidence: spine line 110 has `Wk[worker/] --> S[state/ store]`, while line 113 says "nothing else may reach into `state/` except `ui/` and `ai/`". A worker cannot import a main-thread Zustand store at all — AD-7's own plumbing ("a surface requests the layer it needs and the worker resolves through the store") describes store→worker dispatch with results returned via `parseState`. Two further defects: `F[fs/] --> WR` (line 108) inverts AD-5's orchestration — the write planner applies patches and *drives* `createWritable`, so `WR → F`; with `F → WR` kept, the planner cannot reach the filesystem without a cycle. And the diagram has no path by which `parse/` ever receives file bytes (no `fs/ → parse/`), and omits the `fs/ → domain/` edge the rule text explicitly permits (line 113).
Suggested edit — replace the mermaid block (lines 101-111) with:
> ```mermaid
> flowchart LR
>   UI[ui/ views] --> S[state/ store]
>   UI --> F[fs/ picker + handles]
>   UI --> WR[write/ planner]
>   S --> Wk[worker/ parse dispatcher]
>   WR --> F
>   F --> P[parse/ readers]
>   Wk --> P
>   S --> C[domain/ pure core]
>   WR --> C
>   P --> C
>   F --> C
>   A2[ai/ BYOK v2] --> S
> ```
and append to the rule text (line 113): "the `worker/` imports `parse/` and `domain/` and never `state/` or `ui/` — the store owns the worker and receives its results through `parseState` (AD-7); `write/` calls `fs/`, never the reverse."

**H2 — PRD Open Question 2 (LSDL `Agents` timestamps) was dropped into silence.**
Evidence: PRD §11.2 — "Do LSDL `Agents` timestamps need updating when the tool writes the blob, and does stale metadata cause Power BI to regenerate synonyms?" The spine's Open Questions carry PRD OQ-1, 3, 4, 6→5, 7 but not 2; the preamble says "the spine does not guess them", yet by silence it *has* been guessed: one builder stamps `Agents` on every LSDL write, another preserves verbatim. This is exactly a "verified against Desktop before the write ships" fact.
Suggested edit — add OQ 6: "Do LSDL `Agents` timestamps need updating when the tool writes the blob, and does stale metadata cause Power BI to regenerate synonyms? (PRD §11.2). Until verified, LSDL writes preserve `Agents` timestamps verbatim."

**H3 — Stack's React 19.2.8 leaves the sources' React 18 unreconciled (doc drift, not a version error).**
Evidence: VersionCheck confirms 19.2.8 is the live latest and what `create-vite` scaffolds — the number itself is sound. But the addendum stack table pins "React 18 — the reused components are React" (rejecting it means rewriting ~190 KB of working Lineage Tracer React), and EXPERIENCE.md Foundation still reads "A React 18 static app on GitHub Pages." The spine names React 19.2.8 with no supersession note, so a builder reading EXPERIENCE.md (a listed source) re-pins to 18 while one reading the Stack table stays on 19. Downstream libs verify compatible either way (zustand peers react>=18, @xyflow/react peers react>=17), so the risk is purely divergence, not breakage.
Suggested edit — Stack table React row: "React | 19.2.8 — supersedes the addendum's React 18 pin and EXPERIENCE.md's React 18 line (which are doc drift); borrowed Lineage Tracer components verified peer-compatible (zustand react>=18, @xyflow/react react>=17)." Flag the two source docs for reconciliation rather than changing the spine's choice.

**H4 — PRD §5's automated verification gates are absent from the spine.**
Evidence: PRD §5 mandates (a) "An automated check verifies this against the reference model in the repository" (FR-23, SM-1) and (b) a synthetic edge-case fixture — orphaned calculation group, field parameter wrapping a deleted column, hidden-measure transitive chain, visual bound only through a field parameter, circular DAX reference — "carries expected Used counts, and an automated check fails the build on any mismatch". The spine binds SM-1 and FR-23 but never establishes either harness, even though AD-1's own "Prevents" clause ("fidelity testable only in a live browser") is precisely the concern these gates answer. Without it, the level below diverges on whether the fidelity check exists, where fixtures live, and what CI runs.
Suggested edit — add a row to Consistency Conventions:
> "Verification | Two automated gates ship with the core: (1) edit-free-save fidelity — open the reference model, save unmodified, assert byte-identical (FR-23, SM-1); (2) the synthetic edge-case fixture's expected Used counts fail the build on mismatch (PRD §5). Both run headless in Node — the hexagonal rule (AD-1) is what makes them browser-free."

### Medium

**M1 — AD-4's journal record shape cannot represent deletes.**
Evidence: EXPERIENCE Write-Path Safety: "Every mutation — …, deletes — lands as a pending change"; FR-33 stages wave-cascade removals before any write. AD-4's record `{ objectId, field, old, new, file, context }` models field edits only; two builders will shoehorn deletion differently (a `field: '__deleted__'` hack vs a parallel delete list).
Suggested edit — extend AD-4's rule: "Records are a discriminated union: field changes `{kind:'field', …}` and object deletions `{kind:'delete', objectId, file, context}`; wave-cascade deletions (FR-33) ride the same journal and are discarded by the same `journalDiscard`."

**M2 — The worker decision silently supersedes the addendum's "do not build speculatively".**
Evidence: addendum "If measurement shows LSDL parsing blocks noticeably, move it to a worker. Do not build the worker speculatively" and "Worker-based parsing. Only if measurement demands it."; PRD OQ-6 leaves worker-vs-deferral open. The spine makes `worker/` a structural pillar (paradigm, Structural Seed, AD-7). Deciding it is the architecture's prerogative — but the supersession should be visible, or a builder reading the addendum will strip the worker.
Suggested edit — one sentence in AD-7: "This decides PRD OQ-6 / the addendum's measure-first guidance in favour of building the worker now; OQ-5 retains only the sufficiency question."

**M3 — GitHub Pages project-subpath requirement is unrecorded.**
Evidence: addendum — the reused vite.config "already handles the Pages subpath with `base: './'`". The spine's operational envelope (line 153) says only "Build/deploy is `vite build` → GitHub Pages". A fresh Vite scaffold defaults to `base: '/'` and renders a blank page at `https://<user>.github.io/<repo>/`.
Suggested edit — operational envelope: "…the site serves from the project subpath (`/<repo>/`), so Vite `base` is relative (`base: './'`); deploy via GitHub Actions (`npm ci` → `vite build` → Pages), adapting the addendum's `pages.yml`."

**M4 — The persistence store for FR-4 handles is unnamed.**
Evidence: addendum File layer: "Persist the `FileSystemDirectoryHandle` in IndexedDB for the recent-projects list (FR-4)." The spine's `fs/` says "retained handles" without the medium; handles survive only structured-clone stores — `localStorage`/JSON cannot hold them, and a builder who tries hits a dead end.
Suggested edit — Structural Seed `fs/` line: "# File System Access adapter: picker, retained handles (persisted in IndexedDB — handles survive only structured-clone stores), permission, readwrite".

**M5 — "Description templates" Deferred row conflicts with the v1 template checkbox in the UX contract.**
Evidence: spine Deferred — "description templates — v2, per PRD §9.2". EXPERIENCE Write-Path Safety item 5 ships, in v1, a bulk "Set description…" whose "template checkbox replaces {Table} and {Name} per object" (FR-31's action bar includes Set description). PRD §9.2 defers "description templates and house-style enforcement". Unreconciled, the story level splits on whether tokens exist in v1.
Suggested edit — Deferred row: "Diff preview, offline review round-trip, template library & house-style enforcement — v2, per PRD §9.2. Note: bulk Set-description with inline `{Table}`/`{Name}` token substitution ships in v1 (FR-31; EXPERIENCE Write-Path Safety) — what is deferred is the template feature, not the tokens."

### Low

**L1 — AD-6's "build eagerly or on demand and are memoized" is a non-decision.** FR-35's stepper has "lineage graph" as a parse stage (eager), while AD-7's laziness pulls the other way. Pick one: "model edges build during the lineage stage of the parse stepper (FR-35) and are memoized; report edges overlay lazily (AD-7)."

**L2 — Capability-map governance quirks.** AD-9 on the "First-Run & Chrome (FR-34..38)" row is unexplained (nothing in AD-9 concerns chrome — drop it or justify, e.g. via FR-38's char gauge which is really FR-15). Model Parsing omits AD-6 despite the lineage-graph stepper stage; Saving to Disk omits AD-8 although rename propagation executes in the save path.

**L3 — "Calculated tables" vs the type enum.** FR-33 deletes "calculated tables" by span patch, but the enum (table, column, calculatedColumn, …) has no `calculatedTable`. One clarifying line prevents an invented type: "a calculated table is type `table` (calculated partition); no separate type exists."

**L4 — MIT attribution obligation unrecorded.** PRD §5: "the notices of both reused projects retained and attributed"; addendum: retain each LICENSE, credit both in the README. One line under Format boundaries: "Borrowed parsers keep their LICENSE files and README attribution."

**L5 — TypeScript "latest stable" is a non-version.** VersionCheck resolves it to 7.0.2 (2026-07-08), but `create-vite` still pins ~6.0.2 — the only ambiguous seed row. Pin the major like every other row (e.g. "TypeScript | 7.x — decide at kickoff vs the ~6.0.2 starter pin"), consistent with "the code owns these once it exists".

## What Holds (brief)

AD-1/2/3/5/7/9/10 are exactly the spine this product needs: each names a real two-builder divergence and gives a checkable rule (hexagonal leaf + no-DOM rule; `lineageTag` identity with a surrogate escape hatch; descending-order span patching with "a re-serializing writer is a bug"; the save pipeline matching FR-24/25 verbatim including the gesture constraint; the 5s/50ms split with per-layer `parseState`; encoding/caps matching the addendum's verified findings). The Consistency Conventions table carries PRD vocabulary verbatim, the Capability map covers every FR group, and the Deferred list is nearly divergence-free. The four fixes above are wording- and diagram-level; the spine's structure survives intact.

## Cross-references

- **VersionCheck** (review-versions.md) verified all Stack numbers current against the live registry on 2026-08-30 and confirmed the React 18 mentions in addendum/EXPERIENCE.md are doc drift; H3 above carries the reconciliation edit.
- ReconcileInputs (PRD/UX reconciliation) and AdversarialHunt (failure/adversarial lens) territories — file-format correctness details, UX-state coverage — are deliberately not walked here beyond what the rubric required.
