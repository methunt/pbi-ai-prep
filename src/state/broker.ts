// Task 6.2 — main-thread worker broker (AD-7).
//
// The broker is the ONLY code that commits worker results into the store. A
// surface calls `requestLayer(layer, deps)`; the broker flips the layer to
// `parsing`, dispatches a message to the parse worker, and on the worker's
// reply commits `{ parseState: 'ready', data }` into `store.layers[<layer>]`
// (or `{ parseState: 'error', data: { message } }` on failure).
//
// Layer requests are IDEMPOTENT (AD-7): at most one in-flight parse per layer.
// A second request for a layer that is already in flight returns the SAME
// promise — it never spawns a second worker. On settle (success OR error) the
// in-flight slot is released, so a later request for a stale/errored layer
// re-parses.
//
// The worker itself is BROWSER-ONLY (a Web Worker); the default factory builds
// the real one. `workerFactory` is an injection point so Node tests drive the
// broker against a FAKE worker (a plain {postMessage, onmessage} object),
// which is how the broker's idempotency + state transitions are verified.

import { useStore, type LayerName, type FileRecord } from './store'
import type { ModelObject, SourceSpans } from '../domain/objects'
import type { TmdlParseResult } from '../parse/tmdl-reader'
import type { Edge } from '../domain/graph'

/** Per-layer inputs the broker forwards to the worker. */
export interface LayerFiles {
  /** LSDL culture file text (the `lsdl` layer). */
  cultureText?: string
  /** Report file map, project-relative path → text (the `report`/`lineage` layers). */
  reportFiles?: Map<string, string> | null
  /** Raw text map, project-relative path → text (the `objects` layer). */
  files?: Map<string, string> | null
}

export interface LayerDeps {
  layerFiles: LayerFiles
  /** Pristine model objects the worker's resolver indexes (AD-6). */
  objects: ModelObject[]
  /** Project name the `objects` layer commits into `setProject`. */
  projectName?: string
  /** Test injection point; default constructs the real Web Worker. */
  workerFactory?: WorkerFactory
}

/** A browser Worker subset the broker uses: postMessage in, onmessage out. */
export interface WorkerAdapter {
  postMessage(message: WorkerRequest): void
  onmessage: ((event: { data: WorkerResponse }) => void) | null
  onerror?: ((event: { message?: string }) => void) | null
}

export type WorkerFactory = () => WorkerAdapter

/** The request posted to the worker: which layer + the inputs that layer needs. */
export interface WorkerRequest {
  layer: LayerName
  cultureText?: string
  reportFiles?: Map<string, string> | null
  files?: Map<string, string> | null
  objects: ModelObject[]
}

/** The worker's reply envelope: success carries plain domain data, failure an error string. */
export type WorkerResponse = { ok: true; data: unknown } | { ok: false; error: string }

/** Module-level in-flight promise per layer (AD-7: at most one per layer). */
const inFlight = new Map<LayerName, Promise<unknown>>()

/** The real dedicated parse worker. Browser-only — never invoked under Node tests. */
export function defaultWorkerFactory(): WorkerAdapter {
  return new Worker(new URL('./../worker/parse.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as WorkerAdapter
}

/**
 * Idempotently request a lazy layer parse (AD-7).
 *
 * Returns the SAME promise for any later call made while that layer's parse is
 * in flight. On success the layer is committed `ready` with the plain domain
 * data; on failure it is committed `error` and the in-flight slot is cleared so
 * a retry re-runs.
 */
export function requestLayer(layer: LayerName, deps: LayerDeps): Promise<unknown> {
  const existing = inFlight.get(layer)
  if (existing !== undefined) return existing

  const promise = runParse(layer, deps)
  inFlight.set(layer, promise)
  // Release the slot once the parse settles (success OR error), so a later
  // request for a ready (→stale) or errored layer re-runs a fresh parse.
  void promise.then(
    () => {
      if (inFlight.get(layer) === promise) inFlight.delete(layer)
    },
    () => {
      if (inFlight.get(layer) === promise) inFlight.delete(layer)
    },
  )
  return promise
}
function buildRequest(layer: LayerName, deps: LayerDeps): WorkerRequest {
  const request: WorkerRequest = { layer, objects: deps.objects }
  if (layer === 'lsdl') request.cultureText = deps.layerFiles.cultureText ?? ''
  else if (layer === 'report' || layer === 'lineage') request.reportFiles = deps.layerFiles.reportFiles ?? null
  else if (layer === 'objects') request.files = deps.layerFiles.files ?? new Map()
  return request
}

/** The `objects` layer's worker result is a plain parse of the semantic model
 * TMDL files. Commit it via `setProject` so the grid/lineage/prep read the
 * folded model — this is the ONLY production commit path (AD-7: the broker,
 * in state/, is the sole committer). The project slice holds the objects,
 * the original file texts, and the per-file spans the readers recorded. */
function commitObjects(layer: LayerName, data: unknown, deps: LayerDeps): void {
  if (layer !== 'objects') return
  const result = data as TmdlParseResult
  const store = useStore.getState()

  const files: Record<string, FileRecord> = {}
  for (const [path, text] of deps.layerFiles.files ?? new Map<string, string>()) {
    files[path] = { text, spans: {} }
  }
  // Group the readers' per-object source spans into each file's record so the
  // original-texts + spans slice is faithful (AD-3). ModelObject spans are
  // recorded by the parser; nothing recomputes them here.
  const spansByFile: Record<string, Record<string, SourceSpans>> = {}
  for (const o of result.objects) {
    const rec: SourceSpans = { declaration: o.declarationSpan, name: o.nameSpan }
    if (o.docCommentSpan !== undefined) rec.docComment = o.docCommentSpan
    const bucket = spansByFile[o.file] ?? (spansByFile[o.file] = {})
    bucket[o.id] = rec
  }
  for (const file of Object.keys(files)) {
    const spans = spansByFile[file]
    if (spans !== undefined) files[file] = { text: files[file].text, spans }
  }

  store.setProject({
    objects: result.objects,
    files,
    name: deps.projectName ?? '',
    edges: result.edges,
  })
  if (result.relMeta !== undefined) {
    store.setRelMeta(result.relMeta as ReadonlyMap<string, { name: string; endpoint: string }>)
  }
}

/** The `lineage` layer's worker result is the report-edge lineage. Merge its
 * report-derived visual edges into the graph so FR-7/FR-9 usage reflects report
 * reach (the graph is otherwise built from the TMDL edges alone), and commit
 * the per-visual label map (visualMeta) so the cascade dialog can name visual
 * dependents instead of showing their minted ids. */
 function commitLineage(layer: LayerName, data: unknown): void {
   if (layer !== 'lineage') return
   const result = data as { edges?: readonly Edge[]; visualMeta?: ReadonlyMap<string, unknown> } | null
   if (result === null || result === undefined) return
   if (!Array.isArray(result.edges)) return
   useStore.getState().mergeReportEdges(result.edges)
   if (result.visualMeta !== undefined) {
     // Cast through unknown — the broker accepts the worker's ReportParse shape;
     // the store re-validates the entry shape on read.
     useStore.getState().setVisualMeta(result.visualMeta as ReadonlyMap<string, { title?: string; type?: string }>)
   }
 }

async function runParse(layer: LayerName, deps: LayerDeps): Promise<unknown> {
  useStore.getState().setLayerState(layer, { parseState: 'parsing' })

  try {
    const factory = deps.workerFactory ?? defaultWorkerFactory
    const worker = factory()
    const data = await new Promise<unknown>((resolve, reject) => {
      worker.onmessage = (event) => {
        const reply = event.data
        if (reply !== null && typeof reply === 'object' && 'ok' in reply) {
          if (reply.ok) resolve(reply.data)
          else reject(new Error(reply.error))
        } else {
          // Defensive: a reply without the envelope is treated as the raw data.
          resolve(reply)
        }
      }
      worker.onerror = (event) => reject(new Error(event.message ?? 'worker parse failed'))
      worker.postMessage(buildRequest(layer, deps))
    })

    // The `objects` layer's ready result IS the loaded project — commit it via
    // setProject so the grid/lineage/prep read the folded model (AD-7).
    commitObjects(layer, data, deps)
    useStore.getState().setLayerState(layer, { parseState: 'ready', data })
    // The `lineage` layer's ready result carries the report-edge lineage; merge
    // its visual edges into the graph so FR-7/FR-9 usage reflects report reach.
    commitLineage(layer, data)
    return data
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().setLayerState(layer, { parseState: 'error', data: { message } })
    throw err
  }
}
