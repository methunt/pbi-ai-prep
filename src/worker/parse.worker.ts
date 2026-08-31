// Task 6.2 — parse worker (browser-only, AD-7).
//
// This is the OTHER side of the broker: it runs the lazy LSDL / report /
// report-edge lineage parses OFF the main thread. It imports ONLY parse/ and
// domain/ — NEVER state/ or ui/ (AD-1 dependency rule + AD-7 explicit
// boundary). It parses and returns PLAIN DOMAIN data over postMessage (no
// store refs, no functions, no closures) so the reply survives the thread
// boundary; the main-thread broker in state/ is the only commit path.
//
// Wire protocol (mirror of state/broker.ts's WorkerRequest/WorkerResponse):
//   in  { layer, cultureText?, reportFiles?, objects }
//   out { ok: true, data }            (success — data is plain domain data)
//   out { ok: false, error }          (failure)
//
// Note: this file is never imported from Node tests. It is exercised by the
// E2E / Task 8.x smoke against a real browser Worker. The broker's idempotency
// + state transitions are covered by tests/unit/broker.test.ts with a fake
// worker adapter.

import { parseLSDL } from '../parse/lsdl-reader'
import { parseReport } from '../parse/pbir-reader'
import { parseTmdlProject } from '../parse/tmdl-reader'
import type { Edge } from '../domain/graph'
import type { ModelObject } from '../domain/objects'

/** Incoming request — structurally mirrors the broker's WorkerRequest. */
interface WorkerRequest {
  layer: 'lsdl' | 'report' | 'lineage' | 'objects'
  cultureText?: string
  reportFiles?: Map<string, string> | null
  files?: Map<string, string> | null
  objects: ModelObject[]
}

type WorkerResponse = { ok: true; data: unknown } | { ok: false; error: string }

/** The report-edge lineage: the report's resolved visual→object edges, ready to
 * overlay on the graph, plus the broken refs and parse errors (AD-7/AD-6). */
interface ReportLineage {
  edges: Edge[]
  broken: { visual: string; field: string }[]
  errors: { file: string; message: string }[]
  visualMeta: ReadonlyMap<string, { title?: string; type?: string }>
}

/** Derive the report-edge lineage from the same report parse the `report` layer uses. */
function parseLineage(
  reportFiles: Map<string, string> | null,
  objects: ModelObject[],
): ReportLineage | null {
  const report = parseReport(reportFiles, objects)
  if (report === null) return null
  // Forward visualMeta too — the cascade dialog labels visual dependents via
  // `visualMeta` (FR-7 display); dropping it here forces the dialog to render
  // raw `visual:<hash>` ids. Regression-tested via broker.test.ts.
  return { edges: report.edges, broken: report.broken, errors: report.errors, visualMeta: report.visualMeta }
}

/** Pick the parse per layer and return the PLAIN domain data. */
function dispatch(request: WorkerRequest): unknown {
  switch (request.layer) {
    case 'lsdl':
      return parseLSDL(request.cultureText ?? '')
    case 'report':
      return parseReport(request.reportFiles ?? null, request.objects)
    case 'lineage':
      return parseLineage(request.reportFiles ?? null, request.objects)
    case 'objects':
      return parseTmdlProject(request.files ?? new Map())
    default: {
      // Exhaustive given the union; defensive for any future layer value.
      const never: never = request.layer
      throw new Error(`unknown layer: ${never}`)
    }
  }
}

// `self` in a DedicatedWorkerGlobalScope is not the DOM `Window`, so narrow it
// to the two members this worker uses. (tsconfig targets DOM, not WebWorker.)
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(data: WorkerResponse): void
}

workerScope.onmessage = (event) => {
  let reply: WorkerResponse
  try {
    reply = { ok: true, data: dispatch(event.data) }
  } catch (err) {
    reply = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  workerScope.postMessage(reply)
}
