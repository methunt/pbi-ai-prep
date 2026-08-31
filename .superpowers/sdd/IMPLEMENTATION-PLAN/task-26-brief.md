### Task 8.5: Attribution + open-source polish

- [ ] **Step 1: MIT + retained notices** of both reused projects in the UI footer and README (AD-11 convention, §5 NFR).
- [ ] **Step 2: Vite `base: './'`** confirmed for GitHub Pages; document deployment in README.
- [ ] **Step 3: Action** `npm run build && npm run gates && npm run lint` — all green.

## Self-Review

**Spec coverage** (38 FRs):
- FR-1..4 → Task 5.1, 7.1 · FR-5..8 → 3.1-3.4, 6.1-6.2, 8.3 · FR-9..14 → 2.4, 6.1, 7.2, 7.3 · FR-15..18 → 3.3, 7.4 · FR-19..21 → 7.5 · FR-22..25 → 4.1-4.3, 5.1 · FR-30..33 → 6.1, 7.3, 7.6 · FR-34..38 → 7.1, 7.2, 7.4.
- FR-26..29 (AI) → deliberately OUT of the build tasks (v2). Not a gap; a descope per §9.1.
- Verification gates (PRD §5) → Tasks 1.2, 8.1, 8.2. Round-trip fidelity → 4.3, 8.1.
- **Read-path provenance:** Task 3.2 adapts + optimizes `lineage-tracer`'s `tmdl-parser.js` (MIT, Jihwan Kim → pbip-documenter) and MUST add `lineageTag`/`queryGroup`/`perspective`/`changedProperty`/`functions.tmdl`/source spans. Task 3.3 (LSDL) is authored fresh — `lineage-tracer` has no LSDL reader.

**Placeholder scan:** No TBD/TODO. Every core correctness task has real test code or a code contract. UI tasks specify exact files + behaviors, diffing against the mockup for styling (the mockup is the visual contract, not a placeholder).

**Type consistency:** `ModelObject.id` (lineageTag/surrogate), `Span {start,end}` half-open, `JournalRecord` discriminated union `{kind:'field'|'delete'}`, `ObjectType` union, `usage() → {direct, transitive, leaf, total}`, `layers[<layer>] = {parseState, data}` — used identically across tasks.
