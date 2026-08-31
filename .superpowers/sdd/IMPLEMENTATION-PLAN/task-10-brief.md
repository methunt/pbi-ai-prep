### Task 3.1: Source-span emitter

**Files:**
- Create: `src/parse/spans.ts`

**Interfaces:**
- Produces: `locateDeclaration(text, line) → Span`, `locateDocComment(text, declStart) → Span | undefined`, `locateNameToken(text, declLine) → Span`. Text = the file's original bytes.

- [ ] **Step 1: Implement** — find the declaration line start/end, the preceding `///` block, and the name token's byte range within the declaration line. Spans are half-open over UTF-8 byte offsets (decode via `TextEncoder`).

- [ ] **Step 2: Unit test** — `tests/unit/spans.test.ts`: comment+decl+name spans resolve on a real TMDL snippet; multi-byte names offset correctly.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 3907"`

