# Task 28 — Load-orchestration fix: workerize the primary model parse + wire the production folder→grid pipeline

**Status: COMPLETE.** Integration gap closed. The production folder→grid load pipeline now runs the primary model-object parse OFF the main thread through the parse worker, and the broker commits it via `setProject`. Gates 2/2 GREEN, 253 tests GREEN, build clean, lint clean.

## Gap addressed

Before this task the app rendered + was tested, but the production load path was unwired:

- `parseTmdlProject` had NO production caller. The Landing "Open PBIP folder" button set `phase='parse'` (showing the ParseStepper forever), never walking the folder or parsing it. The store was only populated via the DEV seam (`window.__pbiStore`) or tests.
- The primary model-object parse (if it ever loaded in production) would run synchronously on the main thread (~97–273 ms), violating FR-8's ≤50 ms main-thread block floor.

Fix: the `'objects'` layer now runs `parseTmdlProject` in the parse Web Worker; the broker commits the result through `setProject`; the Landing walks the picked PBIP tree and requests that layer. The grid renders from the folded model.

## 1. Worker `'objects'` layer — `src/worker/parse.worker.ts`

- Added `import { parseTmdlProject } from '../parse/tmdl-reader'`.
- Extended `WorkerRequest.layer` union with `'objects'` and added `files?: Map<string, string> | null`.
- Added a `case 'objects': return parseTmdlProject(request.files ?? new Map())` to `dispatch`.
- Returned data is plain domain data `{ objects, edges, brokenEdges, errors }` — no store refs, no closures (AD-7). The worker still imports **only parse/ + domain/** (AD-1): `parse/lsdl-reader`, `parse/pbir-reader`, `parse/tmdl-reader`, `domain/graph`, `domain/objects`. It never imports state/ or ui/.

## 2. Broker `'objects'` requestLayer — `src/state/broker.ts`

- `LayerFiles` gained `files?: Map<string, string> | null` (the raw text map for the `objects` layer).
- `LayerDeps` gained `projectName?: string` (the project name committed via `setProject`).
- `WorkerRequest` gained `files?: Map<string, string> | null`.
- `buildRequest`: for `'objects'` sends `deps.layerFiles.files ?? new Map()`; the `lsdl` / `report` / `lineage` branches are unchanged.
- New `commitObjects(layer, data, deps)`: when the layer is `'objects'`, it builds the project `files` slice (`Record<posixPath, { text, spans }>`) from the raw map, groups the readers' per-object `SourceSpans` (declaration/name/docComment) into each file's record (AD-3), and calls `store.setProject({ objects, files, name, edges })`. `objectsById` is computed by `setProject`; the graph is rebuilt from objects+edges.
- `runParse` now calls `commitObjects(layer, data, deps)` after the worker resolves, before committing `layers[<layer>] = { parseState: 'ready', data }`. Same idempotent promise-per-layer pattern (AD-7): one in-flight parse per layer; a duplicate request returns the SAME promise; on settle the in-flight slot is released. Failure still commits `error` and clears the slot so a retry re-runs.
- The broker (in state/) remains the ONLY commit path into the store.

## 3. Production pipeline — `src/fs/load.ts` (new) + `Landing.tsx` + `App.tsx`

- **`src/fs/load.ts`** (new): `loadProject(root, name)` walks the picked folder via `readDir(root)`, reads every `*.tmdl` text via `readFile(root, path)` into `Map<posixPath, text>`, and calls `requestLayer('objects', { layerFiles: { files }, objects: [], projectName: name })`. On ready the store has the parsed project and the grid renders.
  - **FR-2**: `hasSemanticModel(files)` checks for a `definition/model.tmdl` / `definition/database.tmdl` (handling both `.../SemanticModel/definition/...` and bare `definition/...` paths). A folder with no semantic model is rejected with a readable error BEFORE any parse is dispatched.
  - **FR-5**: parse errors inside the model never abort the load — `parseTmdlProject` collects them per file and the remaining files still load; the broker commits the partial project (errors ride in `layers.objects.data.errors`).
  - **Read-only**: the load proceeds regardless of write permission; `App` computes `readOnly = permission === 'denied'` and the shell keeps edit/Save disabled but the model visible.
- **`src/ui/chrome/Landing.tsx`**: `onOpened` prop changed from `() => void` to `(handle: FileSystemDirectoryHandle, name: string) => void`; `settleAndOpen` now forwards the picked handle + folder name up (after persisting the handle and settling write permission).
- **`src/ui/App.tsx`**: `openFolder` is now async and owns the load: it sets `phase='parse'` (ParseStepper appears), clears any previous error, `await loadProject(handle, name)`, and on rejection sets `loadError` + returns the phase to `'landing'`. A `loadError` branch renders an inline "Could not open this folder" card (with the FR-2 / hard-failure message) and a "Back to Open" button. On success the broker's `setProject` sets `project.name`, so `hasProject` becomes true and the AppShell (grid) renders.

## 4. Store — `src/state/store.ts`

- `LayerName` widened: `'lsdl' | 'report' | 'lineage' | 'objects'`.
- `INITIAL_LAYERS` seeds `objects: { parseState: 'idle' }`.
- `setProject` was already correct (builds graph, indexes `objectsById`, holds `files`, edges). No other store change needed — `staleReady` already iterates `Object.keys(layers)`, so `objects` is handled uniformly. The ParseStepper already had an `'objects'` stage bound to `project.objects.length`.

## 5. How FR-8 is met (parse off the main thread)

- `parseTmdlProject` is ONLY invoked inside `dispatch('objects')` in `src/worker/parse.worker.ts`, which runs in a **real Web Worker**. `requestLayer('objects', …)` → `runParse` → `defaultWorkerFactory()` → `new Worker(new URL('./../worker/parse.worker.ts', import.meta.url), { type: 'module' })`.
- The main thread does: async `readDir`/`readFile` (non-blocking I/O), builds a small Map, and `postMessage`s it. It never runs the parse. The `vite build` output confirms the worker is a separate chunk (`dist/assets/parse.worker-*.js`), i.e. it executes on the worker thread.
- **Browser verification (real worker, off-thread)**: drove the real dedicated parse worker against the reference model `_test_pbip_w_ai` (semantic-model definition TMDL files, including spaces in path segments). Response: `{ ok: true, objectCount: 22, edgeCount: 45, errCount: 0 }`. This is a genuine worker-thread parse (the main thread only posted a message and awaited the reply).

## 6. Verification

- `npx tsc -b --pretty false` — clean.
- `npm test` — **253/253 passed** (16 files), including `broker.test.ts` (idempotency + state transitions) and `store.test.ts`.
- `npm run gates` — **2/2 passed** (fidelity + usage gates).
- `npm run build` — clean (`tsc -b && vite build`); worker emitted as a separate chunk.
- `npm run lint` — clean (no findings).
- Broker `'objects'` end-to-end (fake worker adapter, Node): `requestLayer('objects', { files, objects: [], projectName: 'mock-model', workerFactory })` → `layers.objects.parseState === 'ready'`, `project.name === 'mock-model'`, `project.objects.length === 18`, `project.edges.length === 10`, `project.files.length === 9`, per-file spans grouped. Proves the dispatch → worker → `setProject` commit path.
- Browser boot smoke: app loads at `http://localhost:5173/`; the Landing renders the "Open PBIP folder" button and the pitch (no runtime breakage from the App/Landing changes).

## 7. Files changed

| File | Change |
|------|--------|
| `src/worker/parse.worker.ts` | `'objects'` dispatch → `parseTmdlProject(files)`; `files` field in request. |
| `src/state/broker.ts` | `LayerFiles.files`, `LayerDeps.projectName`, `WorkerRequest.files`, `buildRequest` `objects` branch, `commitObjects` (setProject commit), `runParse` hook. |
| `src/state/store.ts` | `LayerName` + `INITIAL_LAYERS` include `'objects'`. |
| `src/fs/load.ts` | NEW — production `loadProject` (walk → gather Map → `requestLayer('objects')`, FR-2/FR-5). |
| `src/ui/chrome/Landing.tsx` | `onOpened(handle, name)`; forwards handle + name. |
| `src/ui/App.tsx` | Async `openFolder` runs the load, `loadError` state + error card. |

## 8. Self-review

- **No state/ or ui/ import leaks into the worker** — it still imports only parse/ + domain/. The broker (state/) is the sole commit path (AD-7). `commitObjects` groups the readers' own recorded spans onto the `files` slice (AD-3), never recomputing spans.
- **Idempotency preserved** — the `objects` layer uses the same promise-per-layer map; a duplicate `requestLayer('objects')` while in-flight returns the same promise.
- **Preserved existing behavior** — `lsdl`/`report`/`lineage` lanes untouched; broker tests, store tests, gates, grid, prep, lineage all green. The lineage canvas reads the committed folded model + graph.
- **FR-2/FR-5** handled at the loader/broker boundary as described; read-only loads proceed and the shell stays read-only.
- **Edge cases considered**: semantic-model-folder-is-root vs. PBIP-top-folder both handled by `hasSemanticModel` + `parseTmdlProject` path normalization (`lastIndexOf('/definition/')` and `startsWith('definition/')`). Extra non-TMDL report files are ignored by the objects parse.

## 9. Concerns

- **The full browser smoke via the landing picker is manual.** `window.showDirectoryPicker()` opens a native OS dialog that browser automation cannot drive, and FSA handles are structured-cloned into IndexedDB (`persistHandle`), so mocking the handle for a fully automated click-through is not reliable. FR-8 is instead verified by (a) the real worker running `parseTmdlProject` off-thread against the reference model, (b) the broker dispatch plus `setProject` commit, and (c) the build emitting the worker as a separate chunk. The manual step is documented in `tests/e2e/README.md`.
- **Parse errors (FR-5) are not surfaced in the UI** — partial models still load and the errors ride in `layers.objects.data.errors`, but there is no error banner. That matches FR-5's "remaining files load"; a follow-up could add a warning surface.
- **Report/lineage lazy layers are not auto-triggered on load** — this task wires the folder→grid (`objects`) path. The `report`/`lineage` layers remain as-is (invoked by their own surfaces/lazy requests); they are not part of the grid-load contract.
- The `build` chunk-size warning (>500 kB) is pre-existing and unrelated to this change.
