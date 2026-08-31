### Task 1.2: Fidelity + Used-count gate harness (headless Node)

**Files:**
- Create: `tests/gates/fidelity.gate.ts`, `tests/gates/usage.gate.ts`, `scripts/run-gates.mjs`

**Interfaces:**
- Produces: `npm run gates` that (a) opens the fixture, saves with no edits, asserts byte-identical (FR-23/SM-1, via the Phase-4 write path), and (b) runs the graph engine against the fixture and fails on any used-count mismatch (PRD §5).

- [ ] **Step 1: Write live placeholder assertions (fails until Phase 2-4 land)**

```ts
// usage.gate.ts
import { buildGraph } from '../../src/domain/graph'
import { parseTmdl } from '../../src/parse/tmdl-reader'
import expected from '../fixtures/mock-model/expected-usage.json'
const objects = parseTmdl(fixturePath())
const graph = buildGraph(objects)
for (const [id, exp] of Object.entries(expected)) {
  const got = graph.usage(id)
  if (got.total !== exp.total) throw new Error(`${id}: expected ${exp.total}, got ${got.total}`)
}
```

- [ ] **Step 2: Wire `npm run gates`** — runs both gates; exit non-zero on any failure.

- [ ] **Step 3: Verify** — `npm run gates` fails with "module not found" (expected: parse/graph not built yet).

- [ ] **Step 4: Commit** — `git commit -m "test: step 2b13"`

## Phase 2 — domain/ (pure core)

