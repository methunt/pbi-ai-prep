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

import { useStore, type LayerName } from './store'
import type { ModelObject } from '../domain/objects'

/** Per-layer inputs the broker forwards to the worker. */
export interface LayerFiles {
  /** LSDL culture file text (the `lsdl` layer). */
  cultureText?: string
  /** Report file map, project-relative path → text (the `report`/`lineage` layers). */
  reportFiles?: Map<string, string> | null
}

export interface LayerDeps {
  layerFiles: LayerFiles
  /** Pristine model objects the worker's resolver indexes (AD-6). */
  objects: ModelObject[]
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
  else request.reportFiles = deps.layerFiles.reportFiles ?? null
  return request
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

    useStore.getState().setLayerState(layer, { parseState: 'ready', data })
    return data
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useStore.getState().setLayerState(layer, { parseState: 'error', data: { message } })
    throw err
  }
}
