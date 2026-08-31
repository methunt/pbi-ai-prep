// Task 3.4 — src/parse/pbir-reader unit tests.
// TDD: written before src/parse/pbir-reader.ts exists (RED), green after implementation.
//
// Under test (FR-7):
// - queryState / filterConfig / formatting field bindings resolve to model objects through the
//   ONE shared resolver, keyed on the underlying Entity/Property model path — never on the
//   visual-local displayName a report author may rename per visual
// - a ref resolving to nothing is a BROKEN reference attributed to its visual (never dropped,
//   never an edge)
// - a fieldParameters/parameterExpr binding attributes to the param TABLE, not the identity
//   column — the load-bearing rule that lets the visual reach the wrapped column transitively
// - no Report folder (null/empty map) -> null (unavailable), NOT an empty array
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseReport } from '../../src/parse/pbir-reader'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { buildGraph } from '../../src/domain/graph'
import type { Edge } from '../../src/domain/graph'
import expected from '../fixtures/mock-model/expected-usage.json'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

/** Walk the fixture tree once, splitting TMDL (model) from visual.json (report) files. */
function loadFixtureFiles(): { tmdl: Map<string, string>; visuals: Map<string, string> } {
  const tmdl = new Map<string, string>()
  const visuals = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else {
        const rel = relative(MODEL_DIR, full).split(sep).join('/')
        if (entry.endsWith('.tmdl')) tmdl.set(rel, readFileSync(full, 'utf8'))
        else if (entry.endsWith('visual.json')) visuals.set(rel, readFileSync(full, 'utf8'))
      }
    }
  }
  walk(MODEL_DIR)
  return { tmdl, visuals }
}

const { tmdl: fixtureTmdl, visuals: fixtureVisuals } = loadFixtureFiles()
const model = parseTmdlProject(fixtureTmdl)

const paramTable = model.objects.find((o) => o.type === 'fieldParameter')!
const identityColumn = model.objects.find(
  (o) => o.table === 'Field Slices' && o.name === 'Field Slices',
)!
const region = model.objects.find((o) => o.table === 'Sales' && o.name === 'Region')!
const amount = model.objects.find((o) => o.table === 'Sales' && o.name === 'Amount')!
const chainA = model.objects.find((o) => o.name === 'Chain A')!
const chainC = model.objects.find((o) => o.name === 'Chain C')!

/** PBIR field-expression builders — the underlying Entity/Property model path. */
const colExpr = (entity: string, property: string) => ({
  Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
})
const measureExpr = (entity: string, property: string) => ({
  Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
})

/** One visual.json carrying the given Values-well projections. */
const projectionVisual = (projections: object[]) =>
  JSON.stringify({
    name: 'v-1',
    visual: { visualType: 'tableEx', query: { queryState: { Values: { projections } } } },
  })

const parseOne = (text: string, path = 'definition/pages/page1/visuals/visual1/visual.json') =>
  parseReport(new Map([[path, text]]), model.objects)!

describe('parseReport — unavailable (FR-7)', () => {
  it('returns null for a null file map (no Report folder), NOT an empty array', () => {
    expect(parseReport(null, model.objects)).toBeNull()
  })

  it('returns null for an empty file map, NOT an empty array', () => {
    expect(parseReport(new Map(), model.objects)).toBeNull()
  })

  it('a non-empty map without visual.json is available with zero bindings', () => {
    const parsed = parseReport(new Map([['definition/database.json', '{}']]), model.objects)
    expect(parsed).not.toBeNull()
    expect(parsed!.visualEdges).toEqual([])
    expect(parsed!.broken).toEqual([])
  })
})

describe('parseReport — field refs resolve via the shared resolver', () => {
  it('resolves a queryState column binding to its model object id', () => {
    const parsed = parseOne(projectionVisual([{ field: colExpr('Sales', 'Region') }]))
    expect(parsed.visualEdges).toEqual([
      { visualId: 'visual:v-1', field: 'Sales[Region]', objectId: region.id, broken: false },
    ])
    expect(parsed.edges).toEqual([{ from: 'visual:v-1', to: region.id, kind: 'visual' }])
    expect(parsed.broken).toEqual([])
  })

  it('resolves a queryState measure binding (table names quote only when needed)', () => {
    const parsed = parseOne(projectionVisual([{ field: measureExpr('Sales', 'Chain C') }]))
    expect(parsed.visualEdges).toEqual([
      { visualId: 'visual:v-1', field: 'Sales[Chain C]', objectId: chainC.id, broken: false },
    ])
  })

  it('a report-author rename (displayName) never changes resolution: the edge lands on the real column', () => {
    // displayName is a visual-local caption (parent ruling): surface it, never resolve by it.
    const parsed = parseOne(
      projectionVisual([{ field: colExpr('Sales', 'Region'), displayName: 'Region Label' }]),
    )
    expect(parsed.visualEdges).toEqual([
      {
        visualId: 'visual:v-1',
        field: 'Sales[Region]',
        objectId: region.id,
        broken: false,
        displayName: 'Region Label',
      },
    ])
    expect(parsed.edges).toEqual([{ from: 'visual:v-1', to: region.id, kind: 'visual' }])
  })
})

describe('parseReport — broken refs attributed to their visual (FR-7)', () => {
  it('a ref resolving to nothing is broken, listed, and never an edge', () => {
    const parsed = parseOne(projectionVisual([{ field: colExpr('Sales', 'Ghost') }]))
    expect(parsed.visualEdges).toEqual([
      { visualId: 'visual:v-1', field: 'Sales[Ghost]', broken: true },
    ])
    expect(parsed.edges).toEqual([])
    expect(parsed.broken).toEqual([{ visual: 'visual:v-1', field: 'Sales[Ghost]' }])
  })

  it('mixed good and broken refs: only the resolved one becomes an edge', () => {
    const parsed = parseOne(
      projectionVisual([{}, { field: colExpr('Sales', 'Ghost') }, { field: colExpr('Sales', 'Region') }]),
    )
    expect(parsed.edges).toEqual([{ from: 'visual:v-1', to: region.id, kind: 'visual' }])
    expect(parsed.broken).toEqual([{ visual: 'visual:v-1', field: 'Sales[Ghost]' }])
    expect(parsed.visualEdges).toHaveLength(2)
  })

  it('the same field projected twice in one visual dedups to one binding', () => {
    const parsed = parseOne(
      projectionVisual([
        { field: colExpr('Sales', 'Region') },
        { field: colExpr('Sales', 'Region'), displayName: 'R2' },
      ]),
    )
    expect(parsed.visualEdges).toHaveLength(1)
    expect(parsed.edges).toHaveLength(1)
  })
})

describe('parseReport — param-table attribution (load-bearing)', () => {
  // The committed fixture visual: queryState Values carries projections[identity column]
  // AND fieldParameters[parameterExpr] — the binding names the param identity column
  // textually ('Field Slices'.'Field Slices').
  const parsed = parseReport(fixtureVisuals, model.objects)!

  it('attributes the fixture binding to the param TABLE, never the identity column', () => {
    expect(parsed.errors).toEqual([])
    expect(parsed.broken).toEqual([])
    expect(parsed.visualEdges).toEqual([
      {
        visualId: 'visual:951df667-144c-4044-9601-8293c05f7a16',
        field: "'Field Slices'[Field Slices]",
        objectId: paramTable.id,
        broken: false,
        viaParameter: true,
      },
    ])
    expect(parsed.visualEdges[0]!.objectId).not.toBe(identityColumn.id)
    expect(parsed.edges).toEqual([
      {
        from: 'visual:951df667-144c-4044-9601-8293c05f7a16',
        to: paramTable.id,
        kind: 'visual',
      },
    ])
  })

  it('the attribution makes the visual reach the wrapped column transitively (case 4)', () => {
    // Simulated Task 3.2 fieldParam feeder: the TMDL NAMEOF wrap lands a
    // paramTable→wrappedColumn edge (kind 'fieldParam') per wrapped item.
    const fieldParamEdge: Edge = { from: paramTable.id, to: region.id, kind: 'fieldParam' }
    const graph = buildGraph(model.objects, [...model.edges, ...parsed.edges, fieldParamEdge])
    const visualNode = 'visual:951df667-144c-4044-9601-8293c05f7a16'
    // The param edge lands on the param table: its dependents include the visual node.
    expect(graph.dependents(paramTable.id)).toContain(visualNode)
    // The wrapped column's dependents include the param (the NAMEOF wrap)…
    expect(graph.dependents(region.id)).toContain(paramTable.id)
    // …and the exact expected usage rows (expected-usage.json) — the gate's case-4 rows.
    expect(graph.usage(paramTable.id)).toEqual(
      expected['0917c069-c173-407a-9732-21ec0b326313'],
    )
    expect(graph.usage(region.id)).toEqual(expected['85397e8a-8ad4-48dc-aa7c-6c275ab3a11e'])
    // Attribution proof: the visual edge never landed on the identity column
    // the binding names textually — the visual reaches the column only THROUGH
    // the param (its direct in-edges stay the relationship node and the param).
    expect(graph.dependents(identityColumn.id)).not.toContain(visualNode)
  })
})

describe('parseReport — extraction surfaces (real PBIR shapes)', () => {
  it('reads filterConfig (top-level, real schema 2.x shape) alongside queryState', () => {
    // Trimmed from _test_pbip_w_ai "Atrium Sigma.Report", tableEx tooltip
    // visual (schema 2.9.0); entities mapped onto the fixture model.
    const text = JSON.stringify({
      name: '02283422018d14c3d488',
      visual: {
        visualType: 'tableEx',
        query: {
          queryState: {
            Values: {
              projections: [
                { field: colExpr('Sales', 'Region'), queryRef: 'Region.Region', displayName: ' Region' },
              ],
            },
          },
        },
      },
      filterConfig: {
        filters: [{ name: 'f1', field: colExpr('Sales', 'Amount'), type: 'Categorical' }],
      },
    })
    const parsed = parseOne(text, 'definition/pages/p/visuals/tableEx_x/visual.json')
    expect(parsed.errors).toEqual([])
    expect(parsed.broken).toEqual([])
    expect(parsed.visualEdges.map((b) => [b.visualId, b.field, b.objectId])).toEqual([
      ['visual:02283422018d14c3d488', 'Sales[Region]', region.id],
      ['visual:02283422018d14c3d488', 'Sales[Amount]', amount.id],
    ])
  })

  it('deep-searches visual objects with From-alias resolution (conditional formatting)', () => {
    // A SourceRef can alias its Entity via a `From` list — resolution follows the alias.
    const text = JSON.stringify({
      name: 'v-alias',
      visual: {
        visualType: 'textbox',
        objects: {
          background: [
            {
              properties: {
                expr: {
                  Version: 2,
                  From: [{ Name: 'm', Entity: 'Sales' }],
                  Where: [
                    {
                      Condition: {
                        Measure: { Expression: { SourceRef: { Source: 'm' } }, Property: 'Chain A' },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.broken).toEqual([])
    expect(parsed.visualEdges).toEqual([
      { visualId: 'visual:v-alias', field: 'Sales[Chain A]', objectId: chainA.id, broken: false },
    ])
  })

  it('mints a path-derived visual node id when visual.json carries no name', () => {
    const parsed = parseOne(
      JSON.stringify({
        visual: {
          visualType: 'tableEx',
          query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
        },
      }),
      'definition/pages/p1/visuals/visual9/visual.json',
    )
    expect(parsed.visualEdges[0]!.visualId).toBe('visual:definition/pages/p1/visuals/visual9')
  })

  it('a malformed visual.json lands in errors; the visual is skipped, never thrown', () => {
    const parsed = parseOne('{ not json', 'definition/pages/p1/visuals/bad/visual.json')
    expect(parsed.visualEdges).toEqual([])
    expect(parsed.errors).toHaveLength(1)
    expect(parsed.errors[0]!.file).toBe('definition/pages/p1/visuals/bad/visual.json')
  })
})
describe('parseReport — verified answers (FR-18)', () => {
  it('extracts frozen question-to-visual pairs from VerifiedAnswers/definitions/<guid>/definition.json', () => {
    // The cache key is base64 of a percent-encoded visualType JSON, exactly as
    // Power BI writes it.
    const cacheKey = btoa(encodeURIComponent(JSON.stringify({ visualType: 'barChart' })))
    const definition = JSON.stringify({
      triggerPrompts: [{ prompt: 'Which SORs have the highest platform cost?' }, { prompt: 'How is it split?' }],
      sourceMetadata: { visualMetadata: { cache: { key: cacheKey } } },
    })
    const reportFiles = new Map([
      ['Report/VerifiedAnswers/definitions/da98c774-9580-4738-8424-edd37ff7b7e2/definition.json', definition],
    ])
    const parsed = parseReport(reportFiles, model.objects)
    expect(parsed).not.toBeNull()
    expect(parsed!.verifiedAnswers).toEqual([
      {
        guid: 'da98c774-9580-4738-8424-edd37ff7b7e2',
        prompt: 'Which SORs have the highest platform cost?',
        visualType: 'barChart',
        otherPrompts: 1,
      },
    ])
    // Verified-answer files never contribute visual edges.
    expect(parsed!.visualEdges).toEqual([])
  })

  it('leaves verifiedAnswers empty when a definition has no usable prompt or none is present', () => {
    const noPrompt = parseReport(
      new Map([['Report/VerifiedAnswers/definitions/g1/definition.json', JSON.stringify({ triggerPrompts: [] })]]),
      model.objects,
    )
    expect(noPrompt!.verifiedAnswers).toEqual([])
  })
})

describe('parseReport — visualMeta (per-visual labels for the cascade dialog)', () => {
  it('captures both visualType and a modern object-shaped title', () => {
    const text = JSON.stringify({
      name: 'v-1',
      visual: {
        visualType: 'barChart',
        title: { show: true, text: 'Sales by Region' },
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.visualMeta.get('visual:v-1')).toEqual({ title: 'Sales by Region', type: 'barChart' })
  })

  it('skips a hidden title (show: false) but keeps the visualType', () => {
    const text = JSON.stringify({
      name: 'v-2',
      visual: {
        visualType: 'columnChart',
        title: { show: false, text: 'Hidden caption' },
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.visualMeta.get('visual:v-2')).toEqual({ title: undefined, type: 'columnChart' })
  })

  it('captures a legacy string-shaped title', () => {
    const text = JSON.stringify({
      name: 'v-3',
      visual: {
        visualType: 'slicer',
        title: 'Filter by Region',
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.visualMeta.get('visual:v-3')).toEqual({ title: 'Filter by Region', type: 'slicer' })
  })

  it('omits empty-string title text', () => {
    const text = JSON.stringify({
      name: 'v-4',
      visual: {
        visualType: 'pieChart',
        title: { show: true, text: '   ' },
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.visualMeta.get('visual:v-4')).toEqual({ title: undefined, type: 'pieChart' })
  })

  it('still records an entry when only the visualType is present (no title field)', () => {
    const text = JSON.stringify({
      name: 'v-5',
      visual: {
        visualType: 'card',
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
      },
    })
    const parsed = parseOne(text)
    expect(parsed.visualMeta.get('visual:v-5')).toEqual({ title: undefined, type: 'card' })
  })

  it('populates visualMeta even when the visual has zero bindings (the dialog still names it)', () => {
    const text = JSON.stringify({
      name: 'v-6',
      visual: { visualType: 'textbox', title: { show: true, text: 'Caption only' } },
    })
    const parsed = parseOne(text)
    expect(parsed.visualEdges).toEqual([])
    expect(parsed.visualMeta.get('visual:v-6')).toEqual({ title: 'Caption only', type: 'textbox' })
  })

  it('returns an empty map for a map without visual.json (no metadata either)', () => {
    const parsed = parseReport(new Map([['definition/database.json', '{}']]), model.objects)
    expect(parsed).not.toBeNull()
    expect(parsed!.visualMeta.size).toBe(0)
  })
})
