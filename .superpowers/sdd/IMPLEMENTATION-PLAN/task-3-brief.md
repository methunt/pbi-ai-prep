### Task 0.3: AD-1 enforcement + test harness

**Files:**
- Create: `eslint.config.js` (flat), `vitest.config.ts`, `tests/unit/.setup.ts`

**Interfaces:**
- Produces: a test command `npm test` (vitest, node env for domain/parse/write) and lint that fails on `window`/`document`/FSA usage in `domain/`, and on `domain/` importing `parse/|write/|fs/|state/|ui/|worker/|ai/`.

- [ ] **Step 1: ESLint rules**

```js
export default [
  { rules: {
    'no-restricted-globals': ['error', { name: 'window', message: 'domain must stay pure' }],
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['../parse/*','../write/*','../fs/*','../state/*','../ui/*','../worker/*','../ai/*'], message: 'domain is a leaf' }]
    }],
  }},
]
```

- [ ] **Step 2: Vitest config**

`vitest.config.ts` → `test: { environment: 'node', include: ['tests/**/*.test.ts'] }`. Add `"test": "vitest run"` script.

- [ ] **Step 3: Verify** — `npm test` runs 0 tests green; `npm run lint` passes.

- [ ] **Step 4: Commit** — `git commit -m "chore: step 4d9e"`

## Phase 1 — Test fixtures and gates

