# Task 6.2 Report — worker parse dispatcher + main-thread broker (AD-7)

**Status:** Complete. 4/4 broker unit tests green (scoped file run), scoped `tsc` clean under the project's strict flags. Worker is browser-only by design; the broker is node-tested against a fake worker adapter. Committed as `feat: step 6b87`.

## Deliverable

Created two files and one test:

- `src/worker/parse.worker.ts` (browser-only) — the lazy LSDL / report / report-edge lineage parse dispatcher. Imports **only** `../parse/*` and `../domain/*` (never `../state/*` or `../ui/*`, the AD-7 + AD-1 boundary). Parses and returns plain domain data over `postMessage`.
- `src/state/broker.ts` — the main-thread broker: the **only** commit path into `store.layers[<layer>]`. `requestLayer(layer, deps)` is idempotent (at most one in-flight parse per layer; later subscribers await the same promise). Exposes a `workerFactory` injection point so Node tests drive it with a fake worker.
- `tests/unit/broker.test.ts` (new) — 4 tests, TDD (RED then GREEN), using a controllable fake worker adapter (no real `Worker`).

## Worker dispatch (`src/worker/parse.worker.ts`)

`self.onmessage` dispatches by layer to the already-committed readers:

- `'lsdl'` → `parseLSDL(cultureText)` (from `../parse/lsdl-reader`)
- `'report'` → `parseReport(reportFiles, objects)` (from `../parse/pbir-reader`)
- `'lineage'` → a `parseLineage(reportFiles, objects)` helper that reuses the same `parseReport` and lifts the graph-ready portions: `{ edges, broken, errors }` — the report-edge lineage the lineage canvas overlays on the graph (AD-6/AD-7). It returns `null` when there is no Report folder (same "unavailable" rule as `parseReport`, FR-7).

Wire protocol, mirrored structurally on both sides (the worker declares its own local `WorkerRequest`/`WorkerResponse` so it never imports `state/`):

```ts
// in   { layer, cultureText?, reportFiles?, objects }
// out  { ok: true, data }              // success — data is plain DOMAIN data
// out  { ok: false, error }            // failure
```

`dispatch` wraps parse errors in a `try/catch` and always returns plain domain data (no store refs, no functions, no closures), so the reply survives `postMessage` structured clone. `self` is narrowed to the two members the worker uses (`onmessage`/`postMessage`) because the tsconfig targets DOM lib, not `WebWorker`.

## Broker idempotency + state transitions (`src/state/broker.ts`)

Module-level in-flight cache:

```ts
const inFlight = new Map<LayerName, Promise<unknown>>()
```

`requestLayer(layer, deps)`:

1. If `inFlight.get(layer)` is set, returns the **same** promise — no second worker, no second parse.
2. Otherwise runs `runParse(layer, deps)` and stores its promise in `inFlight[layer]`.
3. Attaches a settle handler that deletes `inFlight[layer]` on **both** success and error, so a later request for a ready (→stale) or errored layer re-runs a fresh parse.

`runParse`:

```ts
useStore.getState().setLayerState(layer, { parseState: 'parsing' })   // BEFORE dispatch
try {
  const worker = (deps.workerFactory ?? defaultWorkerFactory)()
  const data = await <onmessage promise, rejecting on { ok:false } / onerror>
  useStore.getState().setLayerState(layer, { parseState: 'ready', data })
  return data
} catch (err) {
  const message = ...;
  useStore.getState().setLayerState(layer, { parseState: 'error', data: { message } })
  throw err
}
```

- `'parsing'` is committed **before** the worker reply lands, so the UI sees the in-flight state immediately.
- `'ready'` with the plain domain `data` on success; `'error'` with `{ message }` on failure.
- The broker is the only writer of these layer entries; no surface commits worker output directly (AD-7).

`buildRequest` maps `deps.layerFiles` to the per-layer inputs: `cultureText` for `lsdl`, `reportFiles` for `report`/`lineage`; the pristine `objects` ride along for name resolution (AD-6).

## workerFactory injection point

```ts
export type WorkerFactory = () => WorkerAdapter
export interface WorkerAdapter {
  postMessage(message: WorkerRequest): void
  onmessage: ((event: { data: WorkerResponse }) => void) | null
  onerror?: ((event: { message?: string }) => void) | null
}
export function defaultWorkerFactory(): WorkerAdapter {
  return new Worker(new URL('./../worker/parse.worker.ts', import.meta.url), { type: 'module' })
    as unknown as WorkerAdapter
}
```

- Default factory builds the real browser Web Worker from `./../worker/parse.worker.ts` (Vite's `new Worker(new URL(...))` bundling pattern keeps `state/`/`ui/` out of the worker chunk).
- Tests pass `workerFactory` returning a fake `{ postMessage, onmessage, onerror? }` object. Because the default factory body is only invoked when no factory is injected, Node never constructs a real `Worker`. This is how the broker's idempotency + state transitions are verified without a browser.

## AD-7 import boundary

The worker's imports (verified):

```ts
import { parseLSDL } from '../parse/lsdl-reader'
import { parseReport } from '../parse/pbir-reader'
import type { Edge } from '../domain/graph'
import type { ModelObject } from '../domain/objects'
```

Only `../parse/*` and `../domain/*` — no `../state/*`, no `../ui/*`, no Zustand. It returns plain, structured-cloneable domain objects; the broker (in `state/`) is the only commit path into `store.layers`. The worker is browser-only and not node-testable directly; its behavior is exercised by the E2E / Task 8.x smoke later.

## TDD evidence

**RED** — before `src/state/broker.ts` existed, `tests/unit/broker.test.ts` failed at import:

```
Error: Cannot find module '../../src/state/broker' imported from D:/AI/pbi-ai-prep/tests/unit/broker.test.ts
```

**GREEN** — after implementing the broker (fake worker adapter, no real Worker):

```
 RUN  v4.1.11 D:/AI/pbi-ai-prep
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Scoped typecheck of `src/state/broker.ts` and `src/worker/parse.worker.ts` under the project's strict flags (`--strict --verbatimModuleSyntax --noUnusedLocals --noUnusedParameters --erasableSyntaxOnly --noFallthroughCasesInSwitch --lib ES2023,ES2024,DOM --types vite/client`): `tsc exit: 0`.

## Files changed

- `src/worker/parse.worker.ts` (new) — browser-only parse dispatcher.
- `src/state/broker.ts` (new) — idempotent main-thread broker + workerFactory injection.
- `tests/unit/broker.test.ts` (new) — 4 tests with a controllable fake worker.

No existing files were modified.

## Test results

4/4 pass:

1. `requestLayer` commits `parsing → ready` with the layer data, forwards a correctly-wired request (asserts `posted[0]` is `{ layer: 'lsdl', cultureText: 'x' }`), and stores the data at `layers.lsdl.data`.
2. `requestLayer` commits report and lineage data too (both `ready` with their data).
3. Idempotency: a second request while the layer is in-flight returns the **same** promise object (`expect(p2).toBe(p1)`) and spins up only **one** worker.
4. Error + retry: on worker failure the layer commits `error` with `{ message }`, the in-flight entry is cleared, and a retry spawns a fresh promise/worker and succeeds to `ready`.

## Self-review

- **Correctness:** `runParse` wraps the worker await in `try/catch` so a worker rejection (not just a thrown `setLayerState`) reaches the `error` commit; the in-flight slot is cleared on *both* settle paths (`then`/onRejected) via the same identity-guarded delete.
- **AD-7:** worker imports only `parse/` + `domain/`; broker is the sole commit path; layer requests idempotent at one-in-flight-per-layer; `parseState` is status-only at `store.layers[<layer>] = { parseState, data }`.
- **AD-6:** the pristine `objects` are forwarded to the worker's shared resolver; report/lineage edges resolve through `parseReport`'s one resolver, never a per-feeder mapping.
- **Types:** no `any`; type-only imports use `import type`; `erasableSyntaxOnly` (no enums); no unused locals/params (confirmed by scoped tsc).
- **Testability:** the fake worker delivers replies only when the test triggers them, so the in-flight window is deterministic and the same-promise assertion is meaningful.

## Concerns

1. **Worker not node-tested here.** This file references `self` at module scope and is browser-only by spec. Its correctness will be exercised by the E2E / Task 8.x smoke (real Worker over the 2000-object fixture, 50ms main-thread budget). The broker's logic is fully node-tested.
2. **`report` and `lineage` re-parse the same report independently.** With the per-layer in-flight cache they are at most one parse each, but requesting both layers runs `parseReport` twice (two workers). `requestLayer` could memoize the `ReportParse` across the two layers; deferred as unnecessary for the 50ms budget gate.
3. **Re-request after `ready` re-runs.** The in-flight slot is released on success, so a component re-requesting an already-`ready` layer triggers a fresh parse. Callers should read `layers[layer].data` when `parseState === 'ready'` and only `requestLayer` when `idle`/`error`/`stale`. Acceptable per the AD-7 wording (dedup is in-flight only).
4. **`new Map()` uses.** `inFlight` and `reportFiles` are dynamic maps (runtime insert/delete, path→text), correctly `Map` rather than a static string-keyed `Record`; no static lookup-table misuse.
5. **`setProject` leaves prior `layers` intact** (noted in Task 6.1's concerns). Worth a follow-up: a fresh project should probably reset `layers` to `idle` (and clear in-flight broker parses) so a stale/ready layer from the prior project isn't misread.
