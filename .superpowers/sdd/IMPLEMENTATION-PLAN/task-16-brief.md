### Task 4.3: Post-save refresh (one owner)

**Files:**
- Create: `src/write/refresh.ts`

**Interfaces:**
- Produces: `applyRefresh(file, writtenText, priorSpans, priorText) → { text, spans }` — commits `originalText ← written`, shifts that file's spans by patch deltas, and marks touched lazy layers `parseState = 'stale'` (AD-5). Critical bar: a second in-session save does not false-conflict and a second rename targets current spans.

- [ ] **Step 1: Implement span shifting** by accumulating the delta of applied patches for that file.

- [ ] **Step 2: Unit test** — `tests/unit/refresh.test.ts`: after two sequential renames, the second rename targets the shifted (correct) span.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 4b91"`

## Phase 5 — fs/ (File System Access adapter)

