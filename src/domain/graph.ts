// Task 2.4 — ObjectGraph: the ONE pure dependency engine (AD-6).
// Pure leaf (AD-1): imports types from domain/objects and the shared resolver
// from domain/identity — no parse/, no browser, FS, or FSA.
//
// Built over the PRISTINE model: journal records never alter edges, and
// wave-cascade deletion (FR-33) is a derived subgraph view downstream — this
// engine is never mutated after construction.
//
// Edge direction: `from` = dependent (the object that references/uses),
// `to` = depended-on. usage(id) walks REVERSE edges (to -> from) to count the
// distinct objects that (transitively) depend on `id`.
// Endpoint resolution (one shared resolver, AD-6): an endpoint that is already
// a known object id wins; otherwise it is resolved by name through
// buildNameIndex + resolveName (case-insensitive DAX semantics; ambiguous bare
// names stay undefined rather than guessing). A reference that resolves to
// nothing is a BROKEN reference attributed to its source — exposed in
// `graph.broken`, never dropped silently, never counted as an edge. The
// exceptions are the sources of `visual` and `relationship` edges: PBIR
// visuals and TMDL relationships are feeder-minted node ids that are not
// model objects (ObjectType has no kind for them), so an unresolved `from`
// there is a legitimate node, not a broken ref. A visual edge's TARGET is
// always a model object, so the excluded visual→visual pairing (AD-6) cannot
// become an edge — it lands in `broken`.

import type { ModelObject } from './objects'
import { buildNameIndex, resolveName } from './identity'

/** Fixed edge kinds (AD-6). */
export type EdgeKind =
  | 'visual'
  | 'measure'
  | 'calcObject'
  | 'calcItem'
  | 'fieldParam'
  | 'function'
  | 'relationship'

/** One dependency edge: `from` (dependent) references/uses `to` (depended-on). */
export interface Edge {
  from: string
  to: string
  kind: EdgeKind
}

/** A reference that resolved to no model object, attributed to its source. Never an edge. */
export interface BrokenEdge {
  from: string
  to: string
  kind: EdgeKind
}

/** Used-count breakdown for one object (FR-9). total is the consumer UNION, never the sum. */
export interface Usage {
  /** Distinct 1-hop in-edge consumers (immediate dependents). */
  direct: number
  /** Distinct consumers reachable only via paths of length >= 2 (1-hop excluded). */
  transitive: number
  /** Distinct DIRECT visual-kind in-edge consumers (FR-7 — visuals counted distinctly). */
  leaf: number
  /** | direct ∪ transitive ∪ leaf | — distinct consumer ids, no double count. */
  total: number
}

/** Canvas dimming partition (FR-20 / UJ-3): the selected object's trace vs everything else. */
export interface Isolation {
  /** The selected object plus its transitive dependents AND dependencies. */
  inPath: Set<string>
  /** Every known node not in `inPath`. Treat as read-only. */
  offPath: Set<string>
}

export interface ObjectGraph {
  /** Used-count breakdown (FR-9). Memoized; the graph is immutable. */
  usage(id: string): Usage
  /** Distinct 1-hop in-edge consumers (raw view: a self-loop lists the subject). Treat as read-only. */
  dependents(id: string): Set<string>
  /** On-path / off-path node partition for canvas dimming. Memoized. Treat as read-only. */
  isolateTo(id: string): Isolation
  /** References that resolved to no model object, attributed to their source. */
  readonly broken: readonly BrokenEdge[]
}

export function buildGraph(objects: ModelObject[], edges: readonly Edge[] = []): ObjectGraph {
  const index = buildNameIndex(objects)
  const objectIds = new Set(objects.map((o) => o.id))

  // Reverse adjacency (to -> from): who consumes a node. Forward adjacency
  // (from -> to): what a node consumes (isolateTo's dependency walk).
  const consumers = new Map<string, Set<string>>()
  const dependencies = new Map<string, Set<string>>()
  // Sources of visual-kind in-edges per target — the FR-7 leaf set.
  const visualFroms = new Map<string, Set<string>>()
  // Every node the graph knows: model objects plus resolved edge endpoints
  // (visual nodes arrive as endpoints only — they are not model objects).
  const nodes = new Set(objectIds)
  const broken: BrokenEdge[] = []

  // Table containment (parent-of-children usage rule): a table is never
  // "unused" just because nothing references the TABLE OBJECT directly — if
  // ANY of its own columns/measures/calc items/hierarchies is used
  // downstream, the table itself is used. There is no edge for this (a
  // table's declaration doesn't reference its columns); it's derived purely
  // from each child's own `.table` field.
  // Table-CLASSIFIED kinds, not just 'table': field-parameter tables are
  // typed 'fieldParameter' and calc groups 'calculationGroup' — the reader
  // classifies them separately — and excluding them here made a fully-used
  // field parameter show "Unused" at table level while its wrapped fields
  // showed "Used N" (the exact misleading split the FR-9 rule exists to
  // prevent). Same classification the fold cascade + delete dialog use.
  const TABLE_CLASSIFIED: ReadonlySet<string> = new Set(['table', 'fieldParameter', 'calculationGroup'])
  const tableIdByName = new Map<string, string>()
  for (const o of objects) if (TABLE_CLASSIFIED.has(o.type)) tableIdByName.set(o.name.toLowerCase(), o.id)
  const childrenOfTable = new Map<string, Set<string>>()
  for (const o of objects) {
    if (TABLE_CLASSIFIED.has(o.type) || o.table === '') continue
    const tableId = tableIdByName.get(o.table.toLowerCase())
    if (tableId === undefined) continue
    let bucket = childrenOfTable.get(tableId)
    if (bucket === undefined) childrenOfTable.set(tableId, (bucket = new Set()))
    bucket.add(o.id)
  }

  const link = (map: Map<string, Set<string>>, a: string, b: string): void => {
    let bucket = map.get(b)
    if (bucket === undefined) map.set(b, (bucket = new Set()))
    bucket.add(a)
  }

  const resolveEndpoint = (raw: string): string | undefined => {
    if (objectIds.has(raw)) return raw
    return resolveName(index, raw)
  }

  for (const edge of edges) {
    const fromId = resolveEndpoint(edge.from)
    const toId = resolveEndpoint(edge.to)
    // The sources of `visual` and `relationship` edges are feeder-minted node
    // ids (PBIR visuals, TMDL relationships) that are NOT model objects —
    // ObjectType has no kind for them — so an unresolved `from` on those edges
    // is a legitimate node, never broken. Everything else unresolved is
    // broken.
    const mintedSource =
      (edge.kind === 'visual' || edge.kind === 'relationship') && edge.from !== ''
    if (toId === undefined || (fromId === undefined && !mintedSource)) {
      broken.push({ from: fromId ?? edge.from, to: toId ?? edge.to, kind: edge.kind })
      continue
    }
    const from = fromId ?? edge.from // feeder-minted node id
    link(consumers, from, toId)
    link(dependencies, toId, from)
    if (edge.kind === 'visual') link(visualFroms, from, toId)
    nodes.add(from)
    nodes.add(toId)
  }

  // BFS over an adjacency map. The start is seeded into the visited set, so
  // cycles terminate and the subject is never re-added (a cycle counts each
  // node once; the subject is never its own consumer/dependency).
  const cone = (start: string, adj: Map<string, Set<string>>): Set<string> => {
    const visited = new Set<string>([start])
    let frontier: string[] = []
    for (const dep of adj.get(start) ?? []) {
      if (!visited.has(dep)) {
        visited.add(dep)
        frontier.push(dep)
      }
    }
    while (frontier.length > 0) {
      const next: string[] = []
      for (const node of frontier) {
        for (const dep of adj.get(node) ?? []) {
          if (!visited.has(dep)) {
            visited.add(dep)
            next.push(dep)
          }
        }
      }
      frontier = next
    }
    visited.delete(start)
    return visited
  }

  const usageCache = new Map<string, Usage>()
  const isolationCache = new Map<string, Isolation>()

  // A standalone function (not an object-literal method) so the table
  // containment roll-up below can call it recursively on a child id.
  function usage(id: string): Usage {
    const cached = usageCache.get(id)
    if (cached !== undefined) return cached
    // 1-hop consumers minus the subject (self-loops never make a node its
    // own dependent — matching the cycle rule).
    const directSet = new Set(consumers.get(id) ?? [])
    directSet.delete(id)
    // Transitive: every reachable consumer minus the 1-hop set (a node that
    // is both 1-hop and >=2-hop counts as direct only).
    const transitiveSet = cone(id, consumers)
    for (const d of directSet) transitiveSet.delete(d)
    const leafSet = new Set(visualFroms.get(id) ?? [])
    leafSet.delete(id)
    let total = new Set([...directSet, ...transitiveSet, ...leafSet]).size
    // Table containment: a table with zero direct/transitive/leaf consumers
    // of the TABLE OBJECT itself is still "used" when any of its own
    // columns/measures/calc items/hierarchies is used downstream — a parent
    // is used if a child is used. Boolean roll-up (1, not a sum of
    // children's counts): total goes from 0 to 1; direct/transitive/leaf
    // stay at the table's own real breakdown (0) since a rolled-up child
    // count doesn't mean "N things consume the table itself").
    if (total === 0) {
      for (const childId of childrenOfTable.get(id) ?? []) {
        if (usage(childId).total > 0) {
          total = 1
          break
        }
      }
    }
    const result: Usage = { direct: directSet.size, transitive: transitiveSet.size, leaf: leafSet.size, total }
    usageCache.set(id, result)
    return result
  }

  return {
    broken,
    dependents(id: string): Set<string> {
      return consumers.get(id) ?? new Set()
    },
    usage,
    isolateTo(id: string): Isolation {
      const cached = isolationCache.get(id)
      if (cached !== undefined) return cached
      // On-path = the selection plus its consumer cone (UJ-3: clicking a
      // column keeps its measures/visuals/relationships lit) and its
      // dependency cone (FR-20: selecting a visual traces back to feeders).
      const inPath = new Set<string>([id])
      for (const dep of cone(id, consumers)) inPath.add(dep)
      for (const dep of cone(id, dependencies)) inPath.add(dep)
      const offPath = new Set<string>()
      for (const node of nodes) if (!inPath.has(node)) offPath.add(node)
      const result = { inPath, offPath }
      isolationCache.set(id, result)
      return result
    },
  }
}
