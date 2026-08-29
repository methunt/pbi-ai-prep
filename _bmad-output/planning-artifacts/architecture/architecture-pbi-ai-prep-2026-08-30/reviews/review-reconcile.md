# Review — Reconcile Inputs: what did not land?

- **Reviewer:** ReconcileInputs (lens: reconcile inputs)
- **Date:** 2026-08-30
- **Subject:** `ARCHITECTURE-SPINE.md` (altitude=initiative, purpose=build-substrate)
- **Driving inputs:** `prd.md` (prd-pbi-ai-prep-2026-08-28, final), `addendum.md` (same package — the PRD §0 delegates all mechanism/technical-how decisions to it), `EXPERIENCE.md` + `DESIGN.md` (ux-pbi-ai-prep-2026-08-30, final), `mockup/index.html` (non-normative sample).
- **Bar applied:** the spine is initiative-altitude and must NOT carry per-FR detail; the test is only whether every *load-bearing engineering constraint* the PRD/UX settled appears as an AD, a convention, a Deferred item, or an Open Question.

## Verdict

The spine lands the heavy engineering constraints — byte-faithful span patching (AD-3), journal-not-mutation (AD-4), atomic/permission/conflict-checked save (AD-5), one graph with the exact PRD edge kinds (AD-6), eager/lazy parse staging (AD-7), report-layer rename-only (AD-8), encoding/caps (AD-9), single store (AD-10), zero-server/no-telemetry, theme semantics, and the `{file, value, expected}` error shape. What did not land: the **keyboard-first / WCAG 2.1 AA invariant** (the grid is the product's engine room and this is a PRD §5 NFR), **two of the three performance floors** (16 ms scroll, 200 ms filter — only 5 s / 50 ms survived), the **addendum's reuse-locked stack provenance** (React 18 inherited viewer) which the spine silently bumps to React 19.2.8, the **sanctioned LSDL re-serialisation exception** to AD-3's "a re-serializing writer is a bug", and a tail of small settled constraints (20-synonym cap, PRD Open Question 2, MIT/attribution obligation, disabled-never-hidden / read-only-inspection mode). None are fatal; all are cheap to pin.

---

## (a) Load-bearing and missing from the spine

### A1. HIGH — Keyboard-first grid / WCAG 2.1 AA exists nowhere as an invariant-level constraint

- **Source:** PRD §5 NFR "Accessibility — the grid is fully keyboard-operable, since keyboard editing is the core workflow, to WCAG 2.1 AA; tab order follows column order, row by row; every interactive element shows a visible focus indicator." EXPERIENCE "Interaction Primitives" (keyboard-first block) and "Accessibility Floor" (WCAG 2.1 AA across the app). SM-3 (100 descriptions in 10 min, keyboard only) validates it.
- **Spine:** the word "keyboard" appears exactly once, incidentally, in the operational envelope ("with a keyboard and a local filesystem"). "WCAG" appears zero times. The only trace is the Deferred grid-library bullet requiring "full keyboard nav" — a library-selection criterion, not the cross-cutting constraint.
- **Why load-bearing:** this is one of the seven named NFRs in the spine's own `binds:` header, and it shapes the grid library choice, tooltip/focus architecture, and the pending-list — the same surfaces AD-7/AD-10 govern. A builder working from the spine alone has no instruction that the accessibility floor is binding rather than backlog (EXPERIENCE explicitly says the mockup's missing a11y affordances are "binding requirements, not backlog").
- **Fix:** one Convention row ("Accessibility: WCAG 2.1 AA across the app; the grid is fully keyboard-operable — keyboard editing is the core workflow; visible focus everywhere") or a binds line on AD-10. One line suffices at this altitude.

### A2. MEDIUM — Performance floors partially landed: 16 ms scroll and 200 ms filter dropped; virtualization demoted to a preference

- **Source:** PRD §5 NFR "Performance": 5 s to grid, **grid scroll holds 60 fps (no frame over 16 ms)**, **filter ≤ 200 ms** at 2,000 objects, 50 ms parse block. FR-9 and FR-14 apply the 16 ms bound to the grid *and* the pending-changes list. EXPERIENCE "Performance floor": "grid virtualisation is not optional." DESIGN: "The grid virtualises at any size — 2,000 rows is the baseline, not the stretch goal." Addendum: "Grid virtualisation is not optional at 2,000 rows regardless of parse speed."
- **Spine:** AD-7 carries 5 s and 50 ms only. Virtualization appears solely inside the Deferred grid-library bullet as "Pick one that virtualizes ≥ 2,000 rows…" — phrased as a shopping criterion, not a non-optional floor. The 16 ms and 200 ms bounds appear nowhere.
- **Why load-bearing:** the pending-changes list (FR-14) must meet the same 16 ms bound *regardless of which grid library is chosen* — that constraint cannot live inside a library-selection bullet. The spine already has the right home (AD-7 binds the perf NFR).
- **Fix:** extend AD-7's rule line with the remaining budgets ("…grid and pending-list scroll hold 60 fps — no frame over 16 ms — via virtualization; filter resolves ≤ 200 ms; virtualization is not optional") or add a Convention row.

### A3. MEDIUM — Stack provenance dropped: the reuse-lock rationale and React 18 inheritance are contradicted, not recorded

- **Source:** addendum "Stack, and why it was not chosen freely" — the stack exists to reuse Lineage Tracer's viewer (~190 KB of working React: `LineageGraph.jsx`, `SidePanel.jsx`, `GraphNode.jsx`, `store.js`); rejecting it means rewriting them. Framework row: **React 18**, Vite 6, elkjs 0.9, plus lucide-react. EXPERIENCE Foundation likewise says "A React 18 static app."
- **Spine:** `sources` omits `addendum.md` entirely (despite PRD §0 naming it the mechanism authority and "downstream `bmad-architecture` consumes this"). The SEED table presents React 19.2.8 / Vite 8.2.2 / elkjs 0.12.0 as "verified current at authoring" with no trace of the reuse constraint, and drops lucide-react. No AD, Deferred item, or Open Question acknowledges that the reused viewer components were written against React 18.
- **Why load-bearing:** the spine's own paradigm ("This is where borrowed MIT parsers land") inherits the read path but the spine is silent on the equally schedule-load-bearing *UI* inheritance. The version bump may be right — but it is a silent contradiction of both driving inputs, and if the reused viewer breaks on React 19 the substrate premise fails.
- **Fix:** either add `addendum.md` to `sources` and one Open Question ("do the inherited Lineage Tracer viewer components run clean on React 19 / Vite 8 — verified before §4.5 starts"), or pin the versions the reuse lock demands. Also restore `lucide-react` or record the icon choice.

## (c) Contradicting the spine

### C1. MEDIUM — AD-3's absolutism ("a re-serializing writer is a bug") vs the addendum's sanctioned LSDL re-serialisation

- **Source:** addendum "LSDL write path" — the settled mechanism is: parse the triple-backtick block as JSON, mutate, **re-serialise the whole blob**, re-indent, replace the block's byte range. Explicitly judged acceptable ("machine-written JSON; Power BI regenerates it wholesale"), with key-order stability via `JSON.parse`/`JSON.stringify` and a README note. EXPERIENCE Write-Path Safety #6 even requires the pending-changes modal to disclose the resulting large diff.
- **Spine:** AD-3 states "No writer re-serializes from an AST; the patch engine is the only thing that writes. **A re-serializing writer is a bug.**" The conventions row covers the block's location but not the write shape. Nothing in the spine carves out the LSDL exception.
- **Why it matters:** a builder reading AD-3 literally will try to span-patch the JSON text (e.g. string-splice `CustomInstructions` inside the escaped blob) rather than re-serialise — the harder and more fragile path — or will flag the correct implementation as an AD violation in review. EXPERIENCE's disclosure requirement then lands on an "unexpected" diff.
- **Fix:** one sentence in AD-3 or the conventions table: "Sole exception: the LSDL JSON block is re-serialised wholesale on any LSDL write (addendum, LSDL write path) — the file is still written only as a block byte-range replacement."

### C2. LOW — React 18 (addendum §Stack; EXPERIENCE Foundation) vs React 19.2.8 (spine SEED)

Same fact pattern as A3; listed separately because as a pure documentation conflict it needs only a one-line reconciliation (spine wins on stack authority, but the contradiction should be visible, not silent). No PRD-level conflict — the PRD never pins a version.

## (b) Covered only implicitly

### B1. 'Disabled, never hidden' and the read-only-inspection mode

PRD FR-34: a declined write permission leaves the tool in read-only inspection with save/destructive actions "visible but disabled with an explanation — disabled, never hidden." FR-3: non-PBIR report → "features depending on report data are disabled rather than broken." FR-7: usage columns render "as unavailable rather than zero." EXPERIENCE State Patterns makes this a named rule. **Spine:** AD-7/AD-10's per-layer `parseState` is the correct substrate for the report-layer availability cases, but the presentation rule is unrecorded, and AD-10's store inventory omits **permission state** (granted/declined/revoked) — the signal every disabled-with-explanation control reads. Fix: add permission state to AD-10's inventory; one Convention row for "disabled, never hidden."

### B2. Parse-stepper stage order (FR-35)

Four stages — Definition tree, Model objects, Lineage graph, Report layer — with live counts. The spine binds FR-35 in AD-7 and its eager/lazy split is fully consistent with the order, but the stage list itself is nowhere. Acceptable at initiative altitude (the stepper is UI presentation); AD-7 is the governing constraint. Optional: name the four stages in AD-7's rule to keep the stepper and the pipeline from drifting.

### B3. FR-33's two delete mechanisms

Import columns → append a fresh final M step `PBIPreAI_RemoveUnusedCols` ("never mutating user-authored steps"); measures/calc objects → TMDL span patch, no M query. The spine reaches this only sideways: OQ-4 carries the M-step consolidation risk and AD-3/AD-6 carry blast radius. The method split and the "never mutate user-authored steps" fidelity rule are per-FR detail — borderline for this altitude — but they define a distinct write-planner capability (append patch vs in-place patch), so a half-line in AD-3 or the conventions ("deletion: M-step append for import columns, span patch otherwise") would remove ambiguity.

### B4. Copy-Prompt-instead-of-BYYOK v1 boundary — boundary handled; substitute unrecorded

The boundary itself landed: `ai/` is "BYOK boundary, v2 only (stub)" and Deferred records "BYOK / AI drafting (FR-26..29). Deferred to v2 by user decision." EXPERIENCE adds that v1 ships the Copy-Prompt workflow only. The substitute feature (clipboard prompt builder over the instructions editor) is UI-level with no architectural consequence — correctly below this altitude. No action needed; noting for completeness since the lens names it.

### B5. Open-source NFR unoperationalized

PRD §5: "MIT licensed, with the notices of both reused projects retained and attributed"; addendum: retain each `LICENSE`, credit both projects in the README; and the reference fixture "contains client data… sanitise or keep it out of the repo." The spine's `binds:` names "open source" and mentions "borrowed MIT parsers" twice, but license/attribution/fixture-privacy obligations appear nowhere. Release-level, not build-substrate-critical — one Deferred or conventions line closes it.

### B6. §6.1's "never creates files outside the selected folder"

AD-5 binds §6.1 only for the unparsed-file rule. The outside-folder ban (relevant because the tool legitimately *creates* a culture file in-folder per FR-6/OQ-2) is unrecorded. One clause on AD-5 closes it.

## (d) Already handled — verified present and faithful

| Constraint (source) | Where it landed |
| --- | --- |
| Round-trip fidelity / edit-free save byte-identical (FR-22/23, SM-1, §5) | AD-3 (binds SM-1/SM-2), Design Paradigm |
| Journal-not-mutation; per-change discard; survives navigation (FR-14, FR-30/31) | AD-4, AD-10 |
| Atomic write; revoked-permission mid-save semantics; external-change detection reload-or-overwrite naming the file (FR-24/25, §6.1) | AD-5 |
| One ObjectGraph with the exact PRD edge kinds, visual→visual excluded; Used/trace/blast-radius/KPIs read one graph (FR-9/20/33/37, §3) | AD-6 — edge list matches the glossary verbatim |
| Eager model parse / lazy LSDL+report / 5 s / 50 ms (FR-5..8) | AD-7; worker-vs-deferral question honestly kept as OQ-5 (the addendum's "do not build the worker speculatively" is superseded by a recorded spine decision — legitimate, and the residual risk is kept visible) |
| Report layer + LSDL written for rename propagation only; verified answers read-only (§6.1, FR-12/18) | AD-8, verbatim stance |
| UTF-8 no BOM, CRLF preserved, tab indentation, `///` not `//`, LSDL states verbatim, 500/200/10,000-char caps (FR-11/15/16/22/23) | AD-9 (but see A-tail: 20-synonym cap omitted) |
| Zero server — no backend/telemetry/analytics; outbound only user-triggered BYOK (§5, §6.2) | Conventions + Operational envelope, verbatim |
| Failure legibility `{file, value, expected}` (§5) | Conventions, verbatim |
| Theme: user toggle, `localStorage 'theme'`, never `prefers-color-scheme` (FR-36) | Conventions, verbatim |
| Chromium-only desktop, v86+, secure context, GitHub Pages static (§7, §6.3) | Operational envelope + SEED hosting row |
| BYOK v2 deferral; DAX-rewrite warning-only in v1; diff-preview/translations/description-templates v2; grid library choice with the right criteria (§9.2, §11.5) | Deferred — matches PRD descope order; grid-library criteria match addendum requirements |
| PRD Open Questions 1, 3, 4, 7 → spine OQ 1–4; PRD OQ 5 (grid library) → Deferred; PRD OQ 6 (worker?) → resolved into AD-7 + spine OQ-5 | Open Questions — except PRD OQ 2, dropped (see below) |
| Selection keyed on `lineageTag`, rename never re-keys (FR-12/30) | AD-2 |
| Single store; pending + selection survive tab nav/filter/page (FR-14/30/31) | AD-10 |

### Dropped in transit (small, but the spine's own OQ/caps sections claim to carry them)

- **PRD Open Question 2** ("Do LSDL `Agents` timestamps need updating when the tool writes the blob, and does stale metadata cause Power BI to regenerate synonyms?") is absent from the spine's Open Questions — the one PRD question with no AD, Deferred, or OQ home. The addendum's LSDL write path doesn't answer it either, so it fell through entirely.
- **20-live-synonyms cap** (FR-16) missing from AD-9's cap list, even though AD-9 binds FR-16 and is titled "caps are not optional."

## Recommendation

Six edits, all one-to-three lines, no altitude violation: (1) a WCAG 2.1 AA / keyboard-first Convention row; (2) extend AD-7 with the 16 ms and 200 ms floors and "virtualization not optional"; (3) add `addendum.md` to `sources` and record the reuse-lock/React-19 question as an Open Question; (4) one AD-3 sentence carving out the sanctioned LSDL block re-serialisation; (5) add PRD OQ-2 to Open Questions and the 20-synonym cap to AD-9; (6) add permission state to AD-10's store inventory plus a "disabled, never hidden" Convention row. Everything else in scope is already handled or correctly below altitude.
