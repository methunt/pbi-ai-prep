// Task 2.4 — domain/graph unit tests: the ONE dependency engine (AD-6).
// TDD: written before src/domain/graph.ts exists (RED), green after implementation.
//
// usage semantics pinned here (mirrors the Task 1.2 fixture contract):
//   direct     = distinct 1-hop in-edge consumers (immediate dependents)
//   transitive = distinct consumers reachable only via paths of length >= 2
//   leaf       = distinct DIRECT visual-kind in-edge consumers (FR-7)
//   total      = | direct UNION transitive UNION leaf | — union, never the sum
// Cycles terminate (visited set); a cycle counts each node once and the
// subject is never its own consumer.
import { describe, expect, it } from 'vitest'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import { buildGraph } from '../../src/domain/graph'
import type { Edge } from '../../src/domain/graph'

const FILE = 'definition/tables/Sales.tmdl'

function make(
  id: string,
  type: ObjectType,
  name: string,
  table: string,
  opts?: { hidden?: boolean; isFieldParameter?: boolean },
): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: table ? `definition/tables/${table}.tmdl` : FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: opts?.hidden ?? false,
    isFieldParameter: opts?.isFieldParameter ?? false,
  }
}

const ZEROS = { direct: 0, transitive: 0, leaf: 0, total: 0 }

describe('buildGraph — edge resolution', () => {
  it('accepts id-keyed edges from feeders', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const edges: Edge[] = [{ from: 'm-1', to: 'col-1', kind: 'measure' }]
    const graph = buildGraph([col, measure], edges)
    expect(graph.dependents('col-1')).toEqual(new Set(['m-1']))
    expect(graph.dependents('m-1')).toEqual(new Set())
  })

  it('resolves name-based edges through the ONE shared resolver (bare and table-qualified)', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const m1 = make('m-1', 'measure', 'Total', 'Sales')
    const m2 = make('m-2', 'measure', 'Grand Total', 'Sales')
    const edges: Edge[] = [
      { from: 'm-1', to: 'Amount', kind: 'measure' }, // bare name
      { from: 'm-2', to: 'Sales[Amount]', kind: 'measure' }, // table-qualified
    ]
    const graph = buildGraph([col, m1, m2], edges)
    expect(graph.dependents('col-1')).toEqual(new Set(['m-1', 'm-2']))
  })

  it('keeps a visual-kind source as a node even though visuals are not model objects', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const edges: Edge[] = [{ from: 'visual-1', to: 'm-1', kind: 'visual' }]
    const graph = buildGraph([col, measure], edges)
    expect(graph.dependents('m-1')).toEqual(new Set(['visual-1']))
    // Visuals are top consumers: nothing depends on them.
    expect(graph.usage('visual-1')).toEqual(ZEROS)
  })

  it('records an unresolved reference as broken, attributed to its source, never as an edge', () => {
    const param = make('p-1', 'fieldParameter', 'Field Slices', 'Field Slices', {
      isFieldParameter: true,
    })
    const edges: Edge[] = [{ from: 'p-1', to: 'Deleted Column', kind: 'fieldParam' }]
    const graph = buildGraph([param], edges)
    expect(graph.broken).toEqual([{ from: 'p-1', to: 'Deleted Column', kind: 'fieldParam' }])
    // The broken ref is not an edge: the param gains no usage from it.
    expect(graph.usage('p-1')).toEqual(ZEROS)
    expect(graph.dependents('p-1')).toEqual(new Set())
  })

  it('records an ambiguous bare name as broken (the resolver never guesses)', () => {
    const a = make('col-a', 'column', 'Amount', 'Sales')
    const b = make('col-b', 'column', 'Amount', 'Demo')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const edges: Edge[] = [{ from: 'm-1', to: 'Amount', kind: 'measure' }]
    const graph = buildGraph([a, b, measure], edges)
    expect(graph.broken).toEqual([{ from: 'm-1', to: 'Amount', kind: 'measure' }])
    expect(graph.dependents('col-a')).toEqual(new Set())
    expect(graph.dependents('col-b')).toEqual(new Set())
  })

  it('deduplicates identical edges', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const edge: Edge = { from: 'm-1', to: 'col-1', kind: 'measure' }
    const graph = buildGraph([col, measure], [edge, edge])
    expect(graph.dependents('col-1')).toEqual(new Set(['m-1']))
    expect(graph.usage('col-1').direct).toBe(1)
  })
})

describe('usage — chains and hops', () => {
  it('counts a single measure→column edge as direct 1, total 1', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const graph = buildGraph([col, measure], [{ from: 'm-1', to: 'col-1', kind: 'measure' }])
    expect(graph.usage('col-1')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('m-1')).toEqual(ZEROS)
  })

  it('counts a two-hop measure chain: column direct 1, transitive 1', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const inner = make('m-1', 'measure', 'Total', 'Sales')
    const outer = make('m-2', 'measure', 'Grand Total', 'Sales')
    const graph = buildGraph(
      [col, inner, outer],
      [
        { from: 'm-1', to: 'col-1', kind: 'measure' },
        { from: 'm-2', to: 'm-1', kind: 'measure' },
      ],
    )
    expect(graph.usage('col-1')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
    expect(graph.usage('m-1')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('m-2')).toEqual(ZEROS)
    expect(graph.dependents('col-1')).toEqual(new Set(['m-1']))
    expect(graph.dependents('m-1')).toEqual(new Set(['m-2']))
  })

  it('counts through a hidden measure the same as a visible one', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const hidden = make('m-1', 'measure', 'Hidden Total', 'Sales', { hidden: true })
    const outer = make('m-2', 'measure', 'Grand Total', 'Sales')
    const graph = buildGraph(
      [col, hidden, outer],
      [
        { from: 'm-1', to: 'col-1', kind: 'measure' },
        { from: 'm-2', to: 'm-1', kind: 'measure' },
      ],
    )
    // Hidden feeds isHidden into nothing here: transitivity is structural.
    expect(graph.usage('col-1')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
    expect(graph.usage('m-1')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
  })
})

describe('usage — field parameter wrap', () => {
  it('NAMEOF wrap: column direct 1 (param) and transitive 1 (visual through the param)', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const param = make('p-1', 'fieldParameter', 'Field Slices', 'Field Slices', {
      isFieldParameter: true,
    })
    const graph = buildGraph(
      [col, param],
      [
        { from: 'visual-1', to: 'p-1', kind: 'visual' },
        // NAMEOF reference arrives as a name → resolved via the shared resolver.
        { from: 'p-1', to: 'Amount', kind: 'fieldParam' },
      ],
    )
    expect(graph.usage('col-1')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
    // Union, not sum: param direct 1 + leaf 1 are the SAME consumer (visual-1)
    // — total 1, not 2.
    expect(graph.usage('p-1')).toEqual({ direct: 1, transitive: 0, leaf: 1, total: 1 })
    expect(graph.usage('visual-1')).toEqual(ZEROS)
  })
})

describe('usage — union vs sum', () => {
  it('total is the union size: a visual bound to a column AND its measure counts once', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const graph = buildGraph(
      [col, measure],
      [
        { from: 'visual-1', to: 'col-1', kind: 'visual' },
        { from: 'm-1', to: 'col-1', kind: 'measure' },
        { from: 'visual-1', to: 'm-1', kind: 'visual' },
      ],
    )
    // col-1 consumers: visual-1 (1-hop, visual) + m-1 (1-hop); visual-1 is
    // also reachable at 2 hops through m-1. Union {visual-1, m-1} = 2 —
    // direct(2) + transitive(0) + leaf(1) would wrongly say 3.
    expect(graph.usage('col-1')).toEqual({ direct: 2, transitive: 0, leaf: 1, total: 2 })
    // m-1: same consumer direct and leaf → total 1, not 2.
    expect(graph.usage('m-1')).toEqual({ direct: 1, transitive: 0, leaf: 1, total: 1 })
  })
})

describe('usage — relationships', () => {
  it('a relationship endpoint column is USED: direct 1 for the relationship', () => {
    const fromCol = make('col-a', 'column', 'Amount', 'Sales')
    const toCol = make('col-b', 'column', 'RegionKey', 'Region')
    const graph = buildGraph(
      [fromCol, toCol],
      [
        { from: 'rel-1', to: 'col-a', kind: 'relationship' },
        { from: 'rel-1', to: 'col-b', kind: 'relationship' },
      ],
    )
    expect(graph.usage('col-a')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('col-b')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('rel-1')).toEqual(ZEROS)
  })
})

describe('usage — circular references', () => {
  it('A→B→A terminates and counts each node once: both total 1', () => {
    const a = make('a', 'measure', 'A', 'Sales')
    const b = make('b', 'measure', 'B', 'Sales')
    const graph = buildGraph(
      [a, b],
      [
        { from: 'a', to: 'b', kind: 'measure' },
        { from: 'b', to: 'a', kind: 'measure' },
      ],
    )
    // Reaching the test's end is the termination proof; the counts pin
    // "the cycle counts each node once, the subject is never its own consumer".
    expect(graph.usage('a')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('b')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
    expect(graph.dependents('a')).toEqual(new Set(['b']))
    expect(graph.dependents('b')).toEqual(new Set(['a']))
  })

  it('a three-object cycle counts each node once', () => {
    const a = make('a', 'measure', 'A', 'Sales')
    const b = make('b', 'measure', 'B', 'Sales')
    const c = make('c', 'measure', 'C', 'Sales')
    const graph = buildGraph(
      [a, b, c],
      [
        { from: 'a', to: 'b', kind: 'measure' },
        { from: 'b', to: 'c', kind: 'measure' },
        { from: 'c', to: 'a', kind: 'measure' },
      ],
    )
    // usage(a): direct = c (c→a); transitive = b (a→c→b path back); a itself
    // excluded. Union {c, b} = 2.
    expect(graph.usage('a')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
    expect(graph.usage('b')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
    expect(graph.usage('c')).toEqual({ direct: 1, transitive: 1, leaf: 0, total: 2 })
  })
})

describe('usage — unknown ids', () => {
  it('reports zero usage and no dependents for an unknown id', () => {
    const graph = buildGraph([], [])
    expect(graph.usage('ghost')).toEqual(ZEROS)
    expect(graph.dependents('ghost')).toEqual(new Set())
    expect(graph.broken).toEqual([])
  })
})

describe('isolateTo — canvas dimming partition (FR-20, UJ-3)', () => {
  // c-1 (column) ← m-1 (measure) ← visual-1; t-1 is an edgeless table.
  function tracedModel() {
    const col = make('c-1', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const table = make('t-1', 'table', 'Region', '')
    const graph = buildGraph(
      [col, measure, table],
      [
        { from: 'm-1', to: 'c-1', kind: 'measure' },
        { from: 'visual-1', to: 'm-1', kind: 'visual' },
      ],
    )
    return graph
  }

  it('selecting a column keeps its dependents on-path (UJ-3: measures and visuals stay lit)', () => {
    const graph = tracedModel()
    const { inPath, offPath } = graph.isolateTo('c-1')
    expect(inPath).toEqual(new Set(['c-1', 'm-1', 'visual-1']))
    expect(offPath).toEqual(new Set(['t-1']))
  })

  it('selecting a measure keeps its cone on-path', () => {
    const graph = tracedModel()
    const { inPath, offPath } = graph.isolateTo('m-1')
    expect(inPath).toEqual(new Set(['m-1', 'visual-1', 'c-1']))
    expect(offPath).toEqual(new Set(['t-1']))
  })

  it('selecting a visual traces back to the model objects feeding it (FR-20)', () => {
    const graph = tracedModel()
    const { inPath, offPath } = graph.isolateTo('visual-1')
    expect(inPath).toEqual(new Set(['visual-1', 'm-1', 'c-1']))
    expect(offPath).toEqual(new Set(['t-1']))
  })

  it('an edgeless object is on its own path; everything else is off-path', () => {
    const graph = tracedModel()
    const { inPath, offPath } = graph.isolateTo('t-1')
    expect(inPath).toEqual(new Set(['t-1']))
    expect(offPath).toEqual(new Set(['c-1', 'm-1', 'visual-1']))
  })

  it('selecting a column keeps a relationship dependent on-path (UJ-3)', () => {
    const col = make('col-a', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'Total', 'Sales')
    const graph = buildGraph(
      [col, measure],
      [
        { from: 'rel-1', to: 'col-a', kind: 'relationship' },
        { from: 'visual-1', to: 'm-1', kind: 'visual' },
        { from: 'm-1', to: 'col-a', kind: 'measure' },
      ],
    )
    const { inPath, offPath } = graph.isolateTo('col-a')
    expect(inPath).toEqual(new Set(['col-a', 'rel-1', 'm-1', 'visual-1']))
    expect(offPath).toEqual(new Set())
    // Relationship + measure are 1-hop consumers; the visual is 2-hop.
    expect(graph.usage('col-a')).toEqual({ direct: 2, transitive: 1, leaf: 0, total: 3 })
  })

  it('the partition is disjoint and covers every node; unknown ids still partition', () => {
    const graph = tracedModel()
    const { inPath, offPath } = graph.isolateTo('c-1')
    for (const id of inPath) expect(offPath.has(id)).toBe(false)
    for (const id of offPath) expect(inPath.has(id)).toBe(false)
    const ghost = graph.isolateTo('ghost')
    expect(ghost.inPath).toEqual(new Set(['ghost']))
    expect(ghost.offPath).toEqual(new Set(['c-1', 'm-1', 'visual-1', 't-1']))
  })
})

describe('usage — table containment (a parent is used if a child is used)', () => {
  it('a table with zero direct edges but a used column shows total:1, not 0', () => {
    const table = make('t-sales', 'table', 'Sales', 'Sales')
    const col = make('col-amount', 'column', 'Amount', 'Sales')
    const measure = make('m-total', 'measure', 'Total', 'Sales')
    const graph = buildGraph([table, col, measure], [{ from: 'm-total', to: 'col-amount', kind: 'measure' }])
    expect(graph.usage('t-sales')).toEqual({ direct: 0, transitive: 0, leaf: 0, total: 1 })
    expect(graph.usage('col-amount').total).toBe(1)
  })

  it('a table stays unused when NO column/measure/etc. is used', () => {
    const table = make('t-sales', 'table', 'Sales', 'Sales')
    const col = make('col-amount', 'column', 'Amount', 'Sales')
    const graph = buildGraph([table, col], [])
    expect(graph.usage('t-sales')).toEqual({ direct: 0, transitive: 0, leaf: 0, total: 0 })
  })

  it('is a boolean roll-up, not a sum: total stays 1 with many used children', () => {
    const table = make('t-sales', 'table', 'Sales', 'Sales')
    const colA = make('col-a', 'column', 'A', 'Sales')
    const colB = make('col-b', 'column', 'B', 'Sales')
    const measure = make('m-1', 'measure', 'M', 'Sales')
    const graph = buildGraph(
      [table, colA, colB, measure],
      [
        { from: 'm-1', to: 'col-a', kind: 'measure' },
        { from: 'm-1', to: 'col-b', kind: 'measure' },
      ],
    )
    expect(graph.usage('t-sales').total).toBe(1) // never 2, never the sum of children's counts
  })

  it('a table with a DIRECT consumer of the table object itself reports its real breakdown, not the roll-up', () => {
    const table = make('t-sales', 'table', 'Sales', 'Sales')
    const col = make('col-amount', 'column', 'Amount', 'Sales')
    // A relationship or calculated-table source can reference the TABLE
    // object directly — that real edge must win over the boolean roll-up.
    const graph = buildGraph([table, col], [{ from: 'rel-1', to: 't-sales', kind: 'relationship' }])
    expect(graph.usage('t-sales')).toEqual({ direct: 1, transitive: 0, leaf: 0, total: 1 })
  })

  it('a used table does not falsely mark an UNRELATED empty table as used', () => {
    const salesTable = make('t-sales', 'table', 'Sales', 'Sales')
    const col = make('col-amount', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'M', 'Sales')
    const regionTable = make('t-region', 'table', 'Region', 'Region')
    const regionCol = make('col-region', 'column', 'Name', 'Region')
    const graph = buildGraph(
      [salesTable, col, measure, regionTable, regionCol],
      [{ from: 'm-1', to: 'col-amount', kind: 'measure' }],
    )
    expect(graph.usage('t-sales').total).toBe(1)
    expect(graph.usage('t-region').total).toBe(0)
    expect(graph.usage('col-region').total).toBe(0)
  })

  it('a table-name collision across scopes does not leak containment (case-insensitive table match, scoped by exact name)', () => {
    const table = make('t-sales', 'table', 'Sales', 'Sales')
    const otherTypeNamedSales = make('m-sales', 'measure', 'Sales', 'Other') // a MEASURE named "Sales", different table
    const col = make('col-amount', 'column', 'Amount', 'Sales')
    const measure = make('m-1', 'measure', 'M', 'Sales')
    const graph = buildGraph(
      [table, otherTypeNamedSales, col, measure],
      [{ from: 'm-1', to: 'col-amount', kind: 'measure' }],
    )
    // The measure named "Sales" must never be treated as the Sales TABLE.
    expect(graph.usage('t-sales').total).toBe(1)
    expect(graph.usage('m-sales').total).toBe(0)
  })

  it('a FIELD PARAMETER table rolls up its wrapped children: used fields make the param table used', () => {
    // The reported bug: param tables are typed 'fieldParameter', not 'table'
    // — the containment index missed them, so a fully-used parameter showed
    // "Unused" at table level while its fields showed "Used N".
    const paramTable = make('p-1', 'fieldParameter', 'Field Slices', '')
    const paramCol = make('pc-1', 'column', 'Field Currency', 'Field Slices')
    // A visual consumes the parameter's column (leaf edge).
    const graph = buildGraph([paramTable, paramCol], [{ from: 'visual-1', to: 'pc-1', kind: 'visual' }])
    expect(graph.usage('pc-1').total).toBe(1)
    expect(graph.usage('p-1')).toEqual({ direct: 0, transitive: 0, leaf: 0, total: 1 })
  })

  it('a CALCULATION GROUP rolls up its calc items the same way', () => {
    const group = make('cg-1', 'calculationGroup', 'Time Intelligence', '')
    const item = make('ci-1', 'calculationItem', 'YTD', 'Time Intelligence')
    const measure = make('m-1', 'measure', 'YTD Sales', 'Sales')
    const graph = buildGraph([group, item, measure], [{ from: 'm-1', to: 'ci-1', kind: 'calcItem' }])
    expect(graph.usage('ci-1').total).toBe(1)
    expect(graph.usage('cg-1').total).toBe(1)
  })

  it('an unused FIELD PARAMETER stays unused (roll-up is not a blanket used-flag)', () => {
    const paramTable = make('p-1', 'fieldParameter', 'Field Slices', '')
    const paramCol = make('pc-1', 'column', 'Field Currency', 'Field Slices')
    const graph = buildGraph([paramTable, paramCol], [])
    expect(graph.usage('p-1').total).toBe(0)
    expect(graph.usage('pc-1').total).toBe(0)
  })

  it('a CALCULATED table (typed plain table, partition = calculated) rolls up its source-typed columns', () => {
    // The reader types calculated tables 'table' (isCalcGroup/isFieldParameter
    // take the other branches), so they were always in the containment index —
    // pinned here so that stays true: Currency-View-style tables (Value1..4
    // columns, DAX partition) roll their children up exactly like fact tables.
    const calcTable = make('cv-1', 'table', 'Currency View', '')
    const hiddenCol = make('cvc-1', 'column', 'Value1', 'Currency View', { hidden: true })
    const visibleCol = make('cvc-2', 'column', 'Currency Mode', 'Currency View')
    const graph = buildGraph(
      [calcTable, hiddenCol, visibleCol],
      [{ from: 'visual-1', to: 'cvc-2', kind: 'visual' }],
    )
    expect(graph.usage('cvc-2').total).toBe(1)
    expect(graph.usage('cv-1').total).toBe(1)
  })
})
