### Task 2.2: Change journal and the pure fold

**Files:**
- Create: `src/domain/journal.ts`

**Interfaces:**
- Produces: `JournalRecord = { kind:'field', recordId, objectId, field, old, new, file, context } | { kind:'delete', objectId, file, context, recordId }`; `journalAdd(model, journal, rec)`, `journalDiscard(model, journal, recordId)`, `project(model, journal)` (single pure fold → folded model), `coalesce` on `{objectId, field}`.

- [ ] **Step 1: Implement records as a discriminated union with a stable `recordId`** (`crypto.randomUUID()`).

- [ ] **Step 2: Implement the fold** — `project(model, journal)` applies field records (last wins per `{objectId, field}`) and filter-outs deletes onto a fresh read-model; surfaces never fold it themselves (AD-4).

- [ ] **Step 3: Unit test** — `tests/unit/journal.test.ts`: re-edit coalesces (old stays pristine), discard removes a record, `project` reflects both, delete removes the object.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 22e1"`

