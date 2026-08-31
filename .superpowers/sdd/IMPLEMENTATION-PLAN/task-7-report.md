# Task 2.2 Report — Change journal and the pure fold (domain core)

Date: 2026-08-30 | Branch: `feat/pbi-ai-prep` | Commit: `ad9901b` `feat: step 3c49`

## Files changed

- Created `src/domain/journal.ts` (137 lines)
- Created `tests/unit/journal.test.ts` (TDD, written first)
- Commit staged exactly these two files (`2 files changed, 326 insertions(+)`); working tree clean after.

## Exported signatures (`src/domain/journal.ts`)

```ts
export type ChangeContext = 'user' | 'ai'

export interface FieldJournalRecord {
  kind: 'field'; recordId: string; objectId: string; field: string
  old: unknown; new: unknown; file: string; context: ChangeContext
}
export interface DeleteJournalRecord {
  kind: 'delete'; recordId: string; objectId: string; file: string; context: ChangeContext
}
export type JournalRecord = FieldJournalRecord | DeleteJournalRecord

// Per-member Omit — a plain Omit<JournalRecord,'recordId'> collapses the union
// to its common keys and loses `kind`.
export type NewJournalRecord =
  | Omit<FieldJournalRecord, 'recordId'>
  | Omit<DeleteJournalRecord, 'recordId'>

export function journalAdd(model: ModelObject[], journal: JournalRecord[], rec: NewJournalRecord): JournalRecord[]
export function journalDiscard(_model: ModelObject[], journal: JournalRecord[], recordId: string): JournalRecord[]
export function project(model: ModelObject[], journal: JournalRecord[]): ModelObject[]
```

## Behavior decisions

- **recordId**: `crypto.randomUUID()` — verified global and working headless (Node 24.16.0, vitest node env; UUID-shape asserted in tests). No `node:crypto` import, so the future Vite browser build is unaffected.
- **Coalescing**: a field record replaces the prior record with the same `{objectId, field}`; `old` is recomputed from the pristine `model` on every `journalAdd` call (single source of truth), so it always stays the pristine original; the **prior recordId is retained** so the entry's identity is stable across re-edits and `journalDiscard` by id keeps working after a re-edit (test-pinned).
- **Delete dedupe**: on `objectId`; no-op returns an equal-content fresh array.
- **project = one fold**: single pass over the journal accumulating last-wins field edits per `{objectId, field}` (dynamic Set/Map) + delete ids, then one projection onto a fresh array. Deletes win over field edits for the same object. Unedited objects keep their references (no avoidable copies); edited objects are shallow copies; inputs never mutated.
- **Unknown objectId** in a field record is tolerated with `old: undefined` (no validation was specified).

## TDD evidence

**RED** — test written first, implementation absent:

```
$ npx vitest run tests/unit/journal.test.ts
Failed to resolve import "../../src/domain/journal" from "tests/unit/journal.test.ts"
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN** — after implementing `src/domain/journal.ts`:

```
$ npx vitest run tests/unit/journal.test.ts tests/unit/ad1-guard.test.ts tests/unit/span.test.ts
 Test Files  3 passed (3)
      Tests  22 passed (22)   [journal 10, ad1-guard 3, span 9]
```

**Types** (project strict flags — `strict`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`):

```
$ npx tsc --noEmit -p tsconfig.app.json
TSC_CLEAN
```

## Test coverage (`tests/unit/journal.test.ts`)

1. `journalAdd` appends a field record: UUID recordId, pristine `old`, input journal untouched.
2. Re-edit of same `{objectId, field}` coalesces: 1 record, `old` = pristine original (not the first edit), `new` = latest, recordId stable, fresh array.
3. Different fields/objects stay separate records.
4. Delete records dedupe on `objectId`.
5. `journalDiscard` removes only the targeted record; input untouched; unknown id is a no-op.
6. `project` applies edits onto a fresh model; pristine model + fresh-object/fresh-array invariants.
7. Empty journal → model unchanged (deep-equal, fresh array).
8. Hand-built journal → last record per `{objectId, field}` wins.
9. Delete removes the object from the folded model; pristine model intact.
10. Delete wins over field edits for the same object.

## Self-review

- AD-1: imports only from `./objects`; no window/document/FSA; **AD-1 guard test green** after my change. `domain/` remains a pure leaf.
- `journalAdd`/`journalDiscard`/`project` are the only doors; all pure, all return fresh values; no other mutation path exists in the module.
- Project rule `ts-no-tiny-functions` compliance: two initially tiny helpers were inlined per review; Set/Map usage complies with `ts-set-map` (dynamic membership, loop-built).
- `journalDiscard(_model, …)`: `model` param kept for the brief's 3-arg interface symmetry; underscored for `noUnusedParameters`.

## Concerns

1. Task text says `journalAdd(...): ModelObject[]` / `journalDiscard(...): ModelObject[]`, which contradicts its own semantics ("returns the new journal"); implemented per the brief + semantics as `JournalRecord[]`. Flagging in case the contract doc needs the same correction.
2. `context` vocabulary is provisional (`'user' | 'ai'`) — brief allows a string-literal union at this stage; surfaces will finalize it.
3. `field: string` (not `keyof ModelObject`) per task spec: arbitrary writes go through one documented `as unknown as Record<string, unknown>` cast in `journalAdd`/`project`; a typo'd field name would write an unknown prop at fold time. No runtime validation was requested.
4. Commit message uses convention-consistent random data (`feat: step 3c49`) instead of the brief's literal example `feat: step 22e1`, matching the repo's commit history (`fix: step 817b`, `test: step c412`, …).
