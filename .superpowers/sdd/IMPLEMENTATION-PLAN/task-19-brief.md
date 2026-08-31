### Task 6.2: Worker parse dispatcher + broker

**Files:**
- Create: `src/state/broker.ts`, `src/worker/parse.worker.ts`

**Interfaces:**
- Produces: `requestLayer(layer) → Promise<data>` (idempotent — at most one in-flight parse per layer, later subscribers await the same promise, AD-7); `worker` imports `parse/` + `domain/` only, returns plain domain objects over `postMessage`; broker is the only commit path into `store.layers`.

- [ ] **Step 1: Implement the worker `onmessage` dispatch** for `lsdl` / `report` / `report-edge lineage` parses.

- [ ] **Step 2: Implement the broker** — memoize in-flight promise per layer; on resolve commit into `layers[<layer>] = { parseState:'ready', data }`.

- [ ] **Step 3: Verify** — main thread does not block >50ms during a 2000-object parse (perf smoke, see Task 8.3).

- [ ] **Step 4: Commit** — `git commit -m "feat: step 6b87"`

## Phase 7 — ui/

The mockup `mockup/index.html` is the visual contract. Diff styling/layout against it. Every described behavior above (columns, filters, badges, keyboard nav) is binding.

