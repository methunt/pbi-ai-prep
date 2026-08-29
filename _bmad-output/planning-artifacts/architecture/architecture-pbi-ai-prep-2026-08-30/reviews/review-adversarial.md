# Review — Adversarial Hunt (Reviewer Gate)

**Spine:** ARCHITECTURE-SPINE.md (PBI AI Prep, altitude=initiative, purpose=build-substrate, 2026-08-30)
**Lens:** adversarial — two units one level down, each obeying every AD to the letter, that still build incompatibly.
**Units:** **Feature-A** = object grid maintainer (owns grid, selection, action bar, staging/pending modal, Used pill — FR-9..14, 30..33). **Feature-B** = lineage canvas maintainer (owns canvas, impact trace, KPIs, and by AD-7 the worker/report-edge/LSDL lazy parses — FR-19..21, 37).

## Verdict

**NEEDS TIGHTENING — do not start parallel builds on this spine as written.** The individual ADs are sound and the paradigm is right, but the adversarial walk finds **one internal prose contradiction** (AD-7 vs the dependency-direction rule) and **four unowned seams** (journal mutation door + record identity, patch byte contract, post-save state refresh, graph input/edge-join identity) where two obedient builders produce incompatible halves. Every hole closes with one tightened AD sentence or one new AD; none requires re-architecting. Priority: F1, F2, F4, F5 are build-blockers; F3, F8 are correctness hazards; F6, F7 are shape pinning.

---

## Findings

### F1 — CRITICAL · The worker is simultaneously ordered to reach into the store and forbidden from it

- **Units:** A obeys AD-7's prose ("the worker resolves through the store") and the diagram arrow `Wk --> S`: A imports `state/` inside `worker/` and calls store actions from worker code. B obeys the dependency rule ("nothing else may reach into `state/` except `ui/` and `ai/`"): B's worker posts messages and a main-thread broker commits results into the store.
- **ADs obeyed:** A: AD-7, AD-10 (store owns parseState). B: dependency-direction rule, AD-1, AD-10.
- **Collision:** The spine contradicts itself. AD-7 (line 79) says the worker "resolves through the store"; the diagram (line 110) draws `Wk --> S`; the rule at line 113 says only `ui/` and `ai/` may reach into `state/`. Worse, A's reading is not merely stylistic: a Zustand store imported into a worker thread is a **second, disconnected store instance** — every "commit" it performs vanishes at the thread boundary. A ships a worker whose parses silently never reach the UI; the grid's Used columns stay "unavailable" forever (FR-7) with no error anywhere. AD-1's domain-leaf rule does not catch this (worker/ isn't domain), and no lint rule is named for the gradient.
- **Closure (tighten AD-7 + fix diagram):** "The worker never imports `state/` (or Zustand). It parses and returns plain domain data over `postMessage`. A main-thread broker, part of `state/`, is the only code that commits worker results into the store; AD-7's 'resolves through the store' means 'through the broker into the store'. Redraw the diagram edge as `Wk --> S(broker)`." Add the worker to AD-1's dependency enumeration so lint can enforce it.

### F2 — CRITICAL · `journalAdd`/`journalDiscard` have no owner, and journal records have no identity

- **Units:** A implements `journalAdd` as a **store action** that internally coalesces repeated edits to the same `{objectId, field}` (re-edit replaces the record, preserving the original `old`). B implements the journal fold in **domain/** per the Structural Seed ("`domain/` — EditSession/journal") as a pure `(EditSession, record) => EditSession` and calls it from the component via `useStore.setState({ journal: next })`.
- **ADs obeyed:** A: AD-4 (mutation goes through journalAdd), AD-10 (journal lives in the store). B: AD-4 (mutation goes through journalAdd — a domain function named journalAdd satisfies the letter), AD-10 (journal state is in the store; B only sets it), AD-1 (domain stays pure).
- **Collision:** Three divergences from one unpinned seam. (1) **Two doors.** B's direct `setState` bypasses whatever side effects A's store action performs (KPI count derivation, dirty marking) — AD-10 makes the store own KPI counts but not *who updates them*, so A's branch derives counts via selector and B's branch pushes `pendingCount` fields; after merge the two paths drift the first time a journalDiscard skips the counter. (2) **Record identity.** AD-4's record shape `{objectId, field, old, new, file, context}` has no record id; "discard removes a record" is keyed by nothing. A discards by array index, B by `{objectId, field}` — the pending modal (FR-14) removes the wrong record on re-edited objects. (3) **Append vs coalesce.** A coalesces re-edits; B appends. The pending list shows 1 vs 2 records for the same edit; AD-5's planner then receives a two-record chain for one `{objectId, field}` (see F4). Also unpinned: the `file` field's form (F4/F5 depend on it — A uses project-relative path, B uses `handle.name`) and `context`'s type. And the `model ⊞ journal` projection itself is unowned: A folds it in a grid selector, B folds it in the canvas node builder — B's fold only handles the fields B knows, so a pending rename renders in the pending modal but not on the canvas, in direct violation of the *intent* of AD-4 ("every surface reads model ⊞ journal") while obeying its letter.
- **Closure (tighten AD-4):** "Journal mutation goes through the store actions `journalAdd`/`journalDiscard` — the only doors; `domain/` owns the pure fold they call. No component calls `setState` on journal or KPI fields directly. Records carry a stable `recordId`. A second edit to the same `{objectId, field}` **coalesces** (record replaced; `old` stays the pristine value). `file` is the project-relative POSIX path; `context` is a typed discriminated union. The ⊞ projection is one pure domain function `project(model, journal)`; surfaces never fold it themselves."

### F3 — HIGH · ObjectGraph: input model unpinned, name resolution duplicated, surrogate minting not single-sourced

- **Units:** A builds the graph over the **pristine parsed model** (AD-4: "the parsed model stays pristine") and implements Used as in-degree over one shared adjacency map in `domain/Graph`. B builds the same graph over **model ⊞ journal** (AD-4: "every surface reads model ⊞ journal") so the canvas reflects pending deletes, and resolves DAX/PBIR name references to object ids with its own resolver inside the worker.
- **ADs obeyed:** A: AD-6 (one graph, one engine, all three consumers read it), AD-4 (model pristine), AD-2 (nodes key on lineageTag). B: AD-6, AD-4 (⊞ projection), AD-2.
- **Collision:** Three sub-collisions, all producing the exact disagreement AD-6's "Prevents" names — grid Used pill ≠ canvas side panel — while every rule is obeyed:
  1. **Graph input.** Delete-wave staging (A) and impact trace (B) disagree whenever pending deletes exist: A's wave includes downstream consumers of an already-pending-deleted measure; B's excludes them. Nothing says whether the graph folds the journal.
  2. **Name → id resolution.** Edges are parsed from text that references objects *by name* (DAX `[Foo]`, PBIR binding strings, `NAMEOF`), while nodes key on lineageTag. The resolution step (case sensitivity; `Table.Column` vs `Table[Column]`; quoted identifiers) has no named owner. A's exact-match resolver and B's Power BI-style case-insensitive resolver produce different edge sets from the same sources → Used counts differ.
  3. **Surrogate minting.** AD-2's surrogate is `file#byte-span` but the derivation is unpinned: does the span include annotations? is `file` the relative path or the handle name? A single reader mints each TMDL object's id, so in-session joins are safe — but B's pbir-reader must also mint ids for **visual endpoint nodes**, which have no lineageTag and are not covered by any rule; and after a post-save re-parse (F5) every surrogate remints with shifted spans while B's canvas holds the old ones. Double-keyed visual nodes and orphaned ids follow.
- **Closure (tighten AD-6 + AD-2):** AD-6: "The ObjectGraph is built from the **pristine parsed model only**; journal records never alter edges. Pending deletes are filtered at the wave/action layer, not in the graph. All edge feeders resolve object names through one shared resolver in `domain/`; no feeder keeps its own name-to-id mapping." AD-2: "Ids are minted exactly once, by the reader that produced the object, via one shared span-derivation helper (span = half-open range of the full declaration block including annotations, excluding the doc comment; `file` = project-relative POSIX path). Report-layer visual endpoints are domain nodes with ids minted by the pbir-reader under the same rule."

### F4 — CRITICAL · The patch contract is under-specified exactly where two builders must interoperate byte-for-byte

- **Units:** A's planner emits patches as `{start, end}` with **inclusive** end (end = last byte index) and implements rename as a name-token patch (its reader recorded a `nameSpan`). B's planner emits **half-open** `{start, end}` and, finding no name-token span guaranteed anywhere in AD-3, implements rename/delete as whole-declaration-block replacement from the recorded declaration span.
- **ADs obeyed:** Both: AD-3 ("span patches to a pristine copy… descending byte order… no re-serialization" — both styles are span patches over original text; B's block replacement swaps one token inside copied original text, which reads as compliant), AD-5 (planner groups by file, engine applies descending).
- **Collision:** The two patch streams must interleave in **one** descending sort inside the one `patch-engine.ts`, and they disagree by one byte on every delete/replace: B's `{start:100, end:200}` deletes one byte more than A's inclusive reading. That is silent byte drift — the exact SM-1 breach class AD-3 exists to prevent — with no error. Second: "descending byte order" leaves **same-offset ties undefined**. A coalescing journal (F2) avoids most ties, but B's appending journal yields two rename records for one object (rename `A→B`, then `B→C`) targeting the same span; applied in journal order both succeed, in reverse order the second patch's old-text doesn't match — silently skipped or fatal, depending on an engine choice neither builder was given. Third: rename needs a **name-token span**, but AD-3 guarantees only "the byte range of its declaration and its doc comment" — nothing requires a name span, so B's whole-block replacement is the letter-compliant fallback, and block replacement is a re-serialization by another name (indentation, annotations, trailing whitespace re-emitted from a template).
- **Closure (tighten AD-3):** "A patch is half-open `{start, end}` over UTF-8 byte offsets into `originalText`; zero length = pure insertion. The write planner **coalesces journal records per `{objectId, field}` to the final value**, so at most one patch targets any span and same-offset ties cannot arise. Readers record name-token spans in addition to declaration and doc-comment spans. Whole-block replacement is forbidden; patches are token- and line-anchored slices of original text."

### F5 — CRITICAL · Post-save state refresh has no owner: the second save and the second rename are both broken by the spine's own rules

- **Units:** A assumes the write path **refreshes** the store snapshot after a successful save (write/ returns written bytes; state/ commits them), so the next conflict check passes. B assumes the app **re-parses** after save (parse/ owns fresh state; ids remint; lazy layers refresh). Neither obligation is written down.
- **ADs obeyed:** Both: AD-5 (conflict check "confirm the on-disk content still equals the parse snapshot"), AD-3 (spans anchored to pristine `originalText`), AD-7 (lazy layers parse on first need — silent on re-parse), AD-2 (ids stable for the session).
- **Collision:** Concrete failure modes, not hypotheticals:
  1. **Second save false-conflicts.** After save 1, on-disk = patched bytes, store `originalText` = pristine. Save 2's conflict check compares on-disk against the pristine snapshot → mismatch → file blocked, reload-or-overwrite offered **for our own file** (FR-25 UX, wrongly). A's snapshot refresh avoids it; without B's re-parse, A's refreshed `originalText` makes every stored span stale — and the journal cleared on success, but objects' spans did not.
  2. **Second rename corrupts.** Rename 1 lengthens a name; all later byte offsets in that file shift. Rename 2 in the same session (no re-parse, per A) computes its name-token patch from the **stale span** → patches the wrong bytes → TMDL corruption that SM-2 would catch only at the end.
  3. **Stale lazy layers.** A rename-propagation save rewrote the report layer and LSDL (AD-8). A's parse-once model keeps visual bindings resolved by the **old** names; B's canvas drops bindings after the save. B's re-parse avoids it but remints surrogate ids (AD-2), orphaning selection for non-lineageTag objects — which is only acceptable if someone decided it.
- **Closure (extend AD-5):** "A successful save has exactly one post-save owner: the save orchestrator commits, per written file, `originalText ← written bytes`, shifts that file's stored spans by the applied patch deltas, and marks touched lazy layers' `parseState` as `stale` (re-parse on next request). Alternatively: mandate a full re-parse of written files after save and state its consequence — surrogate-id objects lose selection by design. Either is fine; silence is the bug."

### F6 — HIGH · `parseState` shape and request deduplication unpinned: two surfaces can spawn the 2,000-object parse twice

- **Units:** A models lazy layers as `parseState: { report: 'idle'|'parsing'|'ready'|'error' }` plus a separate `reportEdges` slice. B models them as `parseState: { report: { status, data } }`.
- **ADs obeyed:** Both: AD-7 ("the store exposes a per-layer parseState; a surface requests the layer it needs"), AD-10 (store owns per-layer parseState).
- **Collision:** Two homes for the same data after merge (drift, double memory, third surfaces reading either one); and nothing says a layer request is **idempotent** — grid mount (Used columns) and canvas mount (trace) each call "request the report layer". Without dedup, two worker parses of the 2,000-object report layer race; the 5 s budget (FR-8) is spent twice and last-write-wins on `parseState` can drop the first parse's edges while a consumer holds them.
- **Closure (tighten AD-7):** "Layer output lives at `state.layers[<layer>] = { parseState, data }`; `parseState` is status-only (`idle|parsing|ready|error|stale`). Layer requests are idempotent: at most one in-flight parse per layer; later subscribers await the same promise."

### F7 — MEDIUM · Selection shape unpinned between a multi-select grid and a single-select canvas

- **Units:** A (grid) stores `selectedIds: string[]` — multi-select built across pages (FR-30). B (canvas node click) stores `selectedId: string | null`. Both key values on lineageTag and both persist it in the one store.
- **ADs obeyed:** Both: AD-10 ("selection keyed by lineageTag… in the store… survives filter/page/tab nav").
- **Collision:** The action bar (FR-31, built against A's shape) and the "selected count" KPI break on B's branch; B's canvas breaks on A's. Classic shared-data shape clash one level down.
- **Closure (pin in AD-10):** "Selection is `selectedIds: string[]` (ordered, unique). Canvas selection is a one-element instance of the same shape."

### F8 — HIGH · Rename's LSDL binding lookup has no owner: parse-based index vs save-time text scan

- **Units:** A's rename planner locates the LSDL binding via an index the lsdl-reader builds at parse time (`objectId → {file, span, state}`, stored beside parseState); if LSDL is unparsed at save, the planner awaits the worker parse first. B's rename planner, seeing LSDL is lazy (AD-7) and unwilling to make save depend on the worker, **string-scans** the LSDL text at save time for the old binding name.
- **ADs obeyed:** A: AD-8 (rename write re-keys the LSDL binding together with the TMDL name), AD-7 (lazy LSDL — save is a legitimate "first need"), AD-3 (patches pristine bytes). B: AD-8, AD-7 (never parses LSDL into objects — maximally lazy), AD-3.
- **Collision:** B's scan matches the old name **anywhere** in the culture file — inside a synonym term, in `CustomInstructions` prose, or as another entity's binding — and re-keys the wrong entry (data damage invisible until Desktop opens, SM-2 class); or misses multi-form binding paths. A's index is precise but goes stale relative to pending LSDL journal records (synonym edits staged this session) unless the planner patches against pristine bytes per record — which only holds if the index is rebuilt on every LSDL parse and the rename plan reads the *current* one. Also: the binding is keyed by name (FR-6: "associate each LSDL entity with the model object its binding names") while AD-2 forbids re-keying the object id — the rename-back chain (`A→B→C`, coalesced by F2's rule) must fold to the final name **before** the binding lookup, or the index lookup by old name finds nothing.
- **Closure (tighten AD-8):** "The lsdl-reader owns a binding index (`objectId → {file, span, state}`), stored with the LSDL layer and rebuilt on every LSDL parse. Rename planning reads the index only — never text search. If the LSDL layer is unparsed at save, the planner awaits its parse. Rename planning folds the journal to the final name first (F4's coalescing), then re-keys via the index."

---

## Checked and not collisions

- **AD-9 (encoding/caps):** the patch engine is the only writer and is singular; A and B cannot diverge on line endings or `///` because neither emits bytes directly. Enforce via the engine, not a new AD.
- **AD-1 domain purity:** mechanically enforceable; the only leak route found is the worker, covered by F1.
- **Diagram edges `A2 --> S`, `ui --> WR`:** v2 stub and single-owner write path; no two-builder divergence surface in v1.
- **AD-5 permission revocation mid-save:** the rule is already self-contained (stop, report written files, retain journal, gesture-gated retry); both builders implement the same state machine from its text.

## Summary table

| # | Seams | ADs obeyed by both | Collision class | Tier | Closure |
| --- | --- | --- | --- | --- | --- |
| F1 | worker ↔ store | AD-7 vs dependency rule | Internal contradiction; shadow store in worker | Critical | Worker never imports state/; broker in state/ |
| F2 | journal door + record identity | AD-4 + AD-10 | Two mutation doors; no record id; append vs coalesce | Critical | Store actions as only doors; recordId; coalesce; shared ⊞ fold |
| F3 | graph input, name resolution, surrogate minting | AD-6 + AD-4 + AD-2 | Used pill ≠ canvas; double-keyed ids | High→Critical | Graph over pristine model; one resolver; single minting site |
| F4 | patch byte contract | AD-3 + AD-5 | Inclusive vs half-open spans; same-span tie order; missing name spans | Critical | Half-open patches; planner coalesces; token patches only |
| F5 | post-save refresh | AD-5 + AD-3 + AD-7 | Second save false-conflicts; second rename corrupts; stale layers | Critical | One post-save owner: snapshot + span shift + layer staleness |
| F6 | parseState shape/dedup | AD-7 + AD-10 | Two homes for layer data; double worker parse | High | Status-only parseState; idempotent layer requests |
| F7 | selection shape | AD-10 | `selectedId` vs `selectedIds` | Medium | Pin one shape |
| F8 | LSDL binding lookup | AD-8 + AD-7 + AD-2 | Text scan re-keys wrong entries; stale index | High | Reader-owned binding index; index-only lookup; fold-first |

## Recommended spine edits (minimal diff)

1. AD-7: worker/broker split (F1) + idempotent layer requests + `layers[<layer>]` shape (F6).
2. AD-4: mutation doors, recordId, coalescing, `file`/`context` typing, shared `project(model, journal)` (F2).
3. AD-3: half-open patch contract, planner coalescing, name-token spans, no block replacement (F4).
4. AD-5: post-save snapshot/span/layer-staleness owner (F5).
5. AD-6 + AD-2: graph over pristine model, shared name resolver, single id-minting rule incl. visual endpoints (F3).
6. AD-10: `selectedIds` shape (F7). AD-8: binding index (F8).
