// Task 6.2 — worker parse broker unit tests.
// The broker is the ONLY commit path into store.layers (AD-7). The worker
// itself is browser-only, so these tests drive the broker against a FAKE
// worker adapter (an object with postMessage/onmessage) — no real Worker.
//
// Under test (AD-7):
// - requestLayer resolves with the layer's plain domain data and commits
//   parseState parsing -> ready with data
// - layer requests are IDEMPOTENT: a second request while in-flight returns
//   the SAME promise (at most one in-flight parse per layer)
// - an error commits parseState 'error' and clears the in-flight entry so a
//   retry re-runs (a fresh promise + fresh worker)
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../src/state/store'
import {
  requestLayer,
  type WorkerAdapter,
  type WorkerRequest,
  type WorkerResponse,
} from '../../src/state/broker'

/** Controllable fake worker adapter whose delivery the test triggers by hand
 * (so the in-flight window is deterministic). A real browser worker delivers
 * on its own thread; here we control exactly when the reply lands. */
class FakeWorker {
  onmessage: ((event: { data: WorkerResponse }) => void) | null = null
  onerror: ((event: { message?: string }) => void) | null = null
  posted: WorkerRequest[] = []
  postMessage(request: WorkerRequest): void {
    this.posted.push(request)
  }
  deliver(data: unknown): void {
    this.onmessage?.({ data: { ok: true, data } })
  }
  fail(error: string): void {
    this.onmessage?.({ data: { ok: false, error } })
  }
}

/** A factory that records every worker it creates, so the test can drive each. */
function makeFactory(): { factory: () => WorkerAdapter; workers: FakeWorker[] } {
  const workers: FakeWorker[] = []
  const factory = () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker as unknown as WorkerAdapter
  }
  return { factory, workers }
}

const NO_OBJECTS = [] // the fake never parses; objects are only forwarded

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('requestLayer — resolves the layer data (AD-7)', () => {
  it('commits parsing → ready with the layer data and forwards the right request', async () => {
    const { factory, workers } = makeFactory()
    const data = { file: 'en-US/culture.txt', customInstructions: 'be helpful' }

    const p = requestLayer('lsdl', {
      layerFiles: { cultureText: 'x' },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })

    // The broker flips the layer to parsing BEFORE the worker reply lands.
    expect(useStore.getState().layers.lsdl.parseState).toBe('parsing')
    // Only one worker was spun up, and it received the lsdl request wired up.
    expect(workers).toHaveLength(1)
    expect(workers[0].posted[0]).toMatchObject({ layer: 'lsdl', cultureText: 'x' })

    workers[0].deliver(data)
    await expect(p).resolves.toEqual(data)
    expect(useStore.getState().layers.lsdl.parseState).toBe('ready')
    expect(useStore.getState().layers.lsdl.data).toEqual(data)
  })

  it('commits report and lineage layer data too', async () => {
    const { factory, workers } = makeFactory()
    const report = { visualEdges: [], edges: [], broken: [], errors: [] }
    const lineage = { edges: [], broken: [], errors: [] }

    const pReport = requestLayer('report', {
      layerFiles: { reportFiles: new Map() },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })
    const pLineage = requestLayer('lineage', {
      layerFiles: { reportFiles: new Map() },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })

    workers[0].deliver(report)
    workers[1].deliver(lineage)
    await expect(pReport).resolves.toEqual(report)
    await expect(pLineage).resolves.toEqual(lineage)
    expect(useStore.getState().layers.report.parseState).toBe('ready')
    expect(useStore.getState().layers.report.data).toEqual(report)
    expect(useStore.getState().layers.lineage.parseState).toBe('ready')
    expect(useStore.getState().layers.lineage.data).toEqual(lineage)
  })
})

describe('requestLayer — idempotent in-flight dedup (AD-7)', () => {
  it('returns the SAME promise for a second request while the layer is in-flight', async () => {
    const { factory, workers } = makeFactory()
    const data = { edges: [], broken: [], errors: [] }

    const p1 = requestLayer('lineage', {
      layerFiles: { reportFiles: new Map() },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })
    const p2 = requestLayer('lineage', {
      layerFiles: { reportFiles: new Map() },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })

    // Same promise object, and no second worker was spun up.
    expect(p2).toBe(p1)
    expect(workers).toHaveLength(1)

    workers[0].deliver(data)
    await expect(p1).resolves.toEqual(data)
    expect(useStore.getState().layers.lineage.parseState).toBe('ready')
  })
})

describe('requestLayer — failure and retry (AD-7)', () => {
  it('commits error and clears the in-flight entry so a retry re-runs', async () => {
    const { factory, workers } = makeFactory()

    const p = requestLayer('lsdl', {
      layerFiles: { cultureText: 'x' },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })
    expect(useStore.getState().layers.lsdl.parseState).toBe('parsing')

    workers[0].fail('boom')
    await expect(p).rejects.toThrow('boom')
    expect(useStore.getState().layers.lsdl.parseState).toBe('error')
    expect(useStore.getState().layers.lsdl.data).toEqual({ message: 'boom' })

    // A retry is a fresh request: new promise, new worker, and it succeeds.
    const p2 = requestLayer('lsdl', {
      layerFiles: { cultureText: 'x' },
      objects: NO_OBJECTS,
      workerFactory: factory,
    })
    expect(p2).not.toBe(p)
    expect(workers).toHaveLength(2)
    expect(useStore.getState().layers.lsdl.parseState).toBe('parsing')

    workers[1].deliver({ file: 'retry.txt' })
    await expect(p2).resolves.toEqual({ file: 'retry.txt' })
    expect(useStore.getState().layers.lsdl.parseState).toBe('ready')
    expect(useStore.getState().layers.lsdl.data).toEqual({ file: 'retry.txt' })
  })
})
