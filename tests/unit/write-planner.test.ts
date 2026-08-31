// Task 4.2 — write planner unit tests (TDD: written before
// src/write/write-planner.ts exists — RED, then GREEN).
//
// The planner's bar is byte fidelity: an EMPTY journal over the fixture model
// plans NO patch for any file, and every patch below is asserted against the
// original text sliced with the reader's recorded spans — the applied result
// must equal original-prefix + replacement + original-suffix byte for byte.
//
// Fixture: tests/fixtures/mock-model (the fidelity gate's model). The LSDL
// culture file is synthetic (the fixture model has none); its shape mirrors
// the repo's real culture file (see tests/unit/lsdl-reader.test.ts).

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import { journalAdd, type NewJournalRecord } from '../../src/domain/journal'
import { byteLen } from '../../src/domain/span'
import { buildGraph, type ObjectGraph } from '../../src/domain/graph'
import { parseLSDL } from '../../src/parse/lsdl-reader'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { applyPatches } from '../../src/write/patch-engine'
import { planWrites } from '../../src/write/write-planner'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

/** Every .tmdl file of the fixture model, as project-relative POSIX paths. */
function loadFixture(): { texts: Map<string, string>; objects: ModelObject[]; graph: ObjectGraph } {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(relative(MODEL_DIR, full).split(sep).join('/'))
    }
  }
  walk(MODEL_DIR)
  const tmdlFiles = files.filter((p) => p.endsWith('.tmdl'))
  const texts = new Map(tmdlFiles.map((p) => [p, readFileSync(join(MODEL_DIR, p), 'utf8')]))
  const { objects, edges, errors } = parseTmdlProject(texts)
  if (errors.length > 0) throw new Error(`fixture failed to parse: ${JSON.stringify(errors)}`)
  return { texts, objects, graph: buildGraph(objects, edges) }
}

const rec = (model: ModelObject[], r: NewJournalRecord) => journalAdd(model, [], r)

/** Minimal hand-built object (LSDL tests need ids/names/binds, not real spans). */
function lsdlObject(id: string, type: ObjectType, name: string, table: string): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: 'definition/tables/Sales.tmdl',
    declarationSpan: { start: 0, end: 1 },
    nameSpan: { start: 0, end: 1 },
    hidden: false,
    isFieldParameter: false,
  }
}

// --- LSDL culture fixture (unfenced, the reference shape) --------------------

const CULTURE_FILE = 'definition/cultures/en-US.tmdl'
const CULTURE_PREFIX = 'cultureInfo en-US\n\n/// linguistic schema\n\tlinguisticMetadata =\n'
const CULTURE_JSON_LINES = [
  '\t\t\t{',
  '\t\t\t  "Version": "4.2.0",',
  '\t\t\t  "Language": "en-US",',
  '\t\t\t  "Entities": {',
  '\t\t\t    "sales.amount": {',
  '\t\t\t      "Definition": {',
  '\t\t\t        "Binding": {',
  '\t\t\t          "ConceptualEntity": "Sales",',
  '\t\t\t          "ConceptualProperty": "Amount"',
  '\t\t\t        }',
  '\t\t\t      },',
  '\t\t\t      "State": "Generated",',
  '\t\t\t      "Visibility": {',
  '\t\t\t        "Value": "Visible",',
  '\t\t\t        "State": "Authored"',
  '\t\t\t      },',
  '\t\t\t      "Terms": [',
  '\t\t\t        {',
  '\t\t\t          "amount": {',
  '\t\t\t            "State": "Generated"',
  '\t\t\t          }',
  '\t\t\t        }',
  '\t\t\t      ]',
  '\t\t\t    }',
  '\t\t\t  },',
  '\t\t\t  "Agents": {',
  '\t\t\t    "Internal": {',
  '\t\t\t      "Version": "1.1.0"',
  '\t\t\t    }',
  '\t\t\t  },',
  '\t\t\t  "CustomInstructions": "# Old rules"',
  '\t\t\t}',
]
const CULTURE_JSON = CULTURE_JSON_LINES.join('\n')
const CULTURE_TEXT = CULTURE_PREFIX + CULTURE_JSON + '\n\t\tcontentType: json\n'
const CULTURE_LSDL = parseLSDL(CULTURE_TEXT)

const amount = lsdlObject('col-amount', 'column', 'Amount', 'Sales')
const salesTable = lsdlObject('table-sales', 'table', 'Sales', '')

const emptyLayers = {}

// --- 1. Empty journal: edit-free save plans nothing --------------------------

describe('planWrites — empty journal (fidelity, FR-23/SM-1)', () => {
  const { texts, objects } = loadFixture()

  it('plans an empty patch map — no file appears with patches', () => {
    const plans = planWrites(objects, [], emptyLayers)
    expect(plans.size).toBe(0)
  })

  it('every fixture file round-trips byte-identical through applyPatches', () => {
    const plans = planWrites(objects, [], emptyLayers)
    for (const [path, text] of texts) {
      const patches = plans.get(path)?.patches ?? []
      expect(patches).toEqual([])
      expect(applyPatches(text, patches)).toBe(text)
    }
  })
})

// --- 2. Description write ----------------------------------------------------

describe('planWrites — description (doc-comment write)', () => {
  const { texts, objects } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string
  const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject

  it('replaces the doc-comment span with /// lines at declaration indentation', () => {
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'description',
      new: 'Chain top of the fixture.\nSecond line.',
      file: chainA.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const doc = chainA.docCommentSpan as { start: number; end: number }
    const applied = applyPatches(salesText, patches)
    const expected =
      salesText.slice(0, doc.start) + '\t/// Chain top of the fixture.\n\t/// Second line.\n' + salesText.slice(doc.end)
    expect(applied).toBe(expected)
    // The replacement lands exactly where the old doc comment was.
    expect(patches[0]).toMatchObject({ start: doc.start, end: doc.end })
  })

  it('inserts a /// block above a declaration that has none', () => {
    const text = 'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n\tcolumn C\n\t\tdataType: string\n'
    const { objects: objs } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const col = objs.find((o) => o.name === 'C') as ModelObject
    expect(col.docCommentSpan).toBeUndefined()
    const journal = rec(objs, {
      kind: 'field',
      objectId: col.id,
      field: 'description',
      new: 'Hello\nWorld',
      file: col.file,
      context: 'user',
    })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) })
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(text, patches)
    expect(applied).toBe(
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n\t/// Hello\n\t/// World\n\tcolumn C\n\t\tdataType: string\n',
    )
  })

  it('preserves CRLF line endings in the written doc-comment lines', () => {
    const text = 'table T\r\n\tlineageTag: 11111111-1111-4111-8111-111111111111\r\n\r\n\tcolumn C\r\n\t\tdataType: string\r\n'
    const { objects: objs } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const col = objs.find((o) => o.name === 'C') as ModelObject
    const journal = rec(objs, {
      kind: 'field',
      objectId: col.id,
      field: 'description',
      new: 'Line one\nLine two',
      file: col.file,
      context: 'user',
    })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) })
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    const applied = applyPatches(text, patches)
    expect(applied).toBe(
      'table T\r\n\tlineageTag: 11111111-1111-4111-8111-111111111111\r\n\r\n\t/// Line one\r\n\t/// Line two\r\n\tcolumn C\r\n\t\tdataType: string\r\n',
    )
  })

  it('an empty description deletes the doc-comment block', () => {
    const chainC = objects.find((o) => o.name === 'Chain C' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainC.id,
      field: 'description',
      new: '',
      file: chainC.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const doc = chainC.docCommentSpan as { start: number; end: number }
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(salesText.slice(0, doc.start) + salesText.slice(doc.end))
  })

  it('later description records win when the journal was not coalesced', () => {
    const journal = [
      ...rec(objects, {
        kind: 'field',
        objectId: chainA.id,
        field: 'description',
        new: 'First',
        file: chainA.file,
        context: 'user',
      }),
      ...rec(objects, {
        kind: 'field',
        objectId: chainA.id,
        field: 'description',
        new: 'Latest wins',
        file: chainA.file,
        context: 'user',
      }),
    ]
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain('\t/// Latest wins\n')
    expect(applied).not.toContain('First')
  })
})

// --- 3. Rename write ---------------------------------------------------------

describe('planWrites — rename (name-token write)', () => {
  const { texts, objects } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string

  it('patches ONLY the name-token span, preserving the original quoting', () => {
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'name',
      new: 'Chain Top',
      file: chainA.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const ns = chainA.nameSpan
    expect(patches[0]).toMatchObject({ start: ns.start, end: ns.end })
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(salesText.slice(0, ns.start) + "'Chain Top'" + salesText.slice(ns.end))
    expect(applied).toContain("measure 'Chain Top' = [Chain B]")
  })

  it('quotes a bare name token when the new name is not a bare identifier', () => {
    const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: region.id,
      field: 'name',
      new: 'Region Group',
      file: region.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(
      salesText.slice(0, region.nameSpan.start) + "'Region Group'" + salesText.slice(region.nameSpan.end),
    )
    expect(applied).toContain("column 'Region Group'")
  })

  it('doubles an embedded single quote inside a quoted token (FR-12)', () => {
    const doubled = objects.find((o) => o.name === 'Amount Doubled') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: doubled.id,
      field: 'name',
      new: "O'Brien Double",
      file: doubled.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain("column 'O''Brien Double'")
  })
})

describe('planWrites — rename cascade (other objects\' DAX references)', () => {
  const { texts, objects, graph } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string

  it('rewrites a bare [Name] reference in another measure\'s DAX', () => {
    // Chain A = [Chain B] — renaming Chain B must patch Chain A's DAX too.
    const chainB = objects.find((o) => o.name === 'Chain B' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainB.id,
      field: 'name',
      new: 'Middle Chain',
      file: chainB.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    // 1 for Chain B's own name token + 1 for Chain A's `[Chain B]` reference
    // + 1 for Chain B's own DAX self-reference to Chain A is NOT expected
    // (Chain A isn't renamed here) — so exactly 2.
    expect(patches.length).toBe(2)
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain("measure 'Middle Chain' = [Chain A] + [Chain C]")
    expect(applied).toContain("measure 'Chain A' = [Middle Chain]")
  })

  it('rewrites a qualified Table[Name] reference in a calculated column', () => {
    // 'Amount Doubled' = Sales[Amount] * 2 — renaming Amount must patch it.
    const amount = objects.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain("column 'Amount Doubled' = Sales[Revenue] * 2")
  })

  it('rewrites a qualified reference inside a triple-backtick fenced DAX body', () => {
    // 'Chain C' = ```\n\tSUM ( Sales[Amount] )\n\t``` — the fenced body is
    // still just declaration text; the cascade must reach inside it.
    const amount = objects.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain('SUM ( Sales[Revenue] )')
  })

  it('never touches a same-named reference inside a string literal or comment', () => {
    const text =
      "table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n" +
      "\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\n" +
      "\tmeasure M = \"[Amount] is not a reference\" & SUM(T[Amount]) // T[Amount] trailing comment, ignore\n" +
      '\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n'
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const amountCol = objs.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objs, {
      kind: 'field',
      objectId: amountCol.id,
      field: 'name',
      new: 'Revenue',
      file: amountCol.file,
      context: 'user',
    })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g)
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    const applied = applyPatches(text, patches)
    expect(applied).toContain('measure M = "[Amount] is not a reference" & SUM(T[Revenue]) // T[Amount] trailing comment, ignore')
  })

  it('a no-op rename (same name) cascades nothing', () => {
    const chainB = objects.find((o) => o.name === 'Chain B' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainB.id,
      field: 'name',
      new: 'Chain B',
      file: chainB.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    expect(plans.size).toBe(0)
  })

  it('without a graph argument, cascade is skipped (backward compatible)', () => {
    const chainB = objects.find((o) => o.name === 'Chain B' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainB.id,
      field: 'name',
      new: 'Middle Chain',
      file: chainB.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1) // only Chain B's own name token
  })
})

// --- 4. Visibility write -----------------------------------------------------

describe('planWrites — visibility (isHidden + changedProperty)', () => {
  const { texts, objects } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string

  it('hiding inserts isHidden and changedProperty = IsHidden after the declaration line', () => {
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'hidden',
      new: true,
      file: chainA.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const declEnd = chainA.declarationSpan.end
    expect(patches[0]).toMatchObject({ start: declEnd, end: declEnd })
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(
      salesText.slice(0, declEnd) + '\t\tisHidden\n\t\tchangedProperty = IsHidden\n' + salesText.slice(declEnd),
    )
  })

  it('hiding does not duplicate a changedProperty marker the object already carries', () => {
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n\tcolumn C\n\t\tdataType: string\n\t\tchangedProperty = IsHidden\n'
    const { objects: objs } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const col = objs.find((o) => o.name === 'C') as ModelObject
    expect(col.changedProperty).toEqual(['IsHidden'])
    const journal = rec(objs, { kind: 'field', objectId: col.id, field: 'hidden', new: true, file: col.file, context: 'user' })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) })
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    const applied = applyPatches(text, patches)
    expect(applied).toBe(
      text.slice(0, col.declarationSpan.end) + '\t\tisHidden\n' + text.slice(col.declarationSpan.end),
    )
  })

  it('unhiding removes the isHidden and changedProperty lines from the block', () => {
    const chainB = objects.find((o) => o.name === 'Chain B' && o.type === 'measure') as ModelObject
    expect(chainB.hidden).toBe(true)
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainB.id,
      field: 'hidden',
      new: false,
      file: chainB.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    // One patch per removed property line: isHidden + changedProperty = IsHidden.
    expect(patches.length).toBe(2)
    const applied = applyPatches(salesText, patches)
    const expected = salesText
      .split('\n')
      .filter((l) => l !== '\t\tisHidden' && l !== '\t\tchangedProperty = IsHidden')
      .join('\n')
    expect(applied).toBe(expected)
  })
})

// --- 5. LSDL writes (the ONE sanctioned re-serialization) --------------------

describe('planWrites — LSDL writes (JSON block re-serialization)', () => {
  const texts = new Map([[CULTURE_FILE, CULTURE_TEXT]])
  const model = [amount, salesTable]
  const block = CULTURE_LSDL.block as { start: number; end: number }

  /** The re-serialized JSON of the applied culture text. */
  function appliedJson(applied: string, blockStart: number, blockEnd: number): unknown {
    return JSON.parse(applied.slice(blockStart, applied.length - (CULTURE_TEXT.length - blockEnd)))
  }

  it('re-serializes CustomInstructions within the block span; contentType line and surroundings untouched', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: '',
      field: 'customInstructions',
      new: '# New rules\nSecond line',
      file: CULTURE_FILE,
      context: 'user',
    })
    const plans = planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })
    const patches = plans.get(CULTURE_FILE)?.patches ?? []
    expect(patches.length).toBe(1)
    expect(patches[0]).toMatchObject({ start: block.start, end: block.end })
    const applied = applyPatches(CULTURE_TEXT, patches)
    const json = appliedJson(applied, block.start, block.end) as Record<string, unknown>
    expect(json.CustomInstructions).toBe('# New rules\nSecond line')
    // Everything outside the block span is byte-identical (prefix + suffix).
    expect(applied.startsWith(CULTURE_TEXT.slice(0, block.start))).toBe(true)
    expect(applied.endsWith(CULTURE_TEXT.slice(block.end))).toBe(true)
    // The contentType line survives verbatim.
    expect(applied.split('\n')).toContain('\t\tcontentType: json')
    // Agents timestamps preserved verbatim through the re-serialization.
    expect((json.Agents as Record<string, Record<string, string>>).Internal.Version).toBe('1.1.0')
    // Untouched sections survive.
    const entities = json.Entities as Record<string, Record<string, unknown>>
    expect(entities['sales.amount']).toBeDefined()
    expect(json.Version).toBe('4.2.0')
  })

  it('a value-preserving instructions write re-encodes byte-identically — no patch at all', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: '',
      field: 'customInstructions',
      new: '# Old rules',
      file: CULTURE_FILE,
      context: 'user',
    })
    // The re-serializer reproduces the original block layout exactly when no
    // value changed, so the plan spares the file entirely.
    const plans = planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })
    expect(plans.get(CULTURE_FILE)?.patches ?? []).toEqual([])
  })

  it('an empty instructions value removes the CustomInstructions key', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: '',
      field: 'customInstructions',
      new: '',
      file: CULTURE_FILE,
      context: 'user',
    })
    const plans = planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })
    const applied = applyPatches(CULTURE_TEXT, plans.get(CULTURE_FILE)?.patches ?? [])
    const json = JSON.parse(applied.slice(block.start, applied.length - (CULTURE_TEXT.length - block.end)))
    expect(json).not.toHaveProperty('CustomInstructions')
  })

  it('synonym terms replace the entity Terms array (add User / tombstone Deleted)', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: 'col-amount',
      field: 'synonyms',
      new: [
        { name: 'amount', state: 'Generated' },
        { name: 'quantity', state: 'User' },
        { name: 'qty', state: 'Deleted', lastModified: '2026-06-17T12:41:17.653Z' },
      ],
      file: CULTURE_FILE,
      context: 'user',
    })
    const plans = planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })
    const patches = plans.get(CULTURE_FILE)?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(CULTURE_TEXT, patches)
    const json = JSON.parse(applied.slice(block.start, applied.length - (CULTURE_TEXT.length - block.end)))
    const terms = (json.Entities as Record<string, { Terms: Record<string, unknown>[] }>)['sales.amount'].Terms
    expect(terms).toEqual([
      { amount: { State: 'Generated' } },
      { quantity: { State: 'User' } },
      { qty: { State: 'Deleted', LastModified: '2026-06-17T12:41:17.653Z' } },
    ])
    // The binding survives the re-serialization.
    const entity = (json.Entities as Record<string, { Definition: { Binding: Record<string, string> } }>)['sales.amount']
    expect(entity.Definition.Binding).toEqual({ ConceptualEntity: 'Sales', ConceptualProperty: 'Amount' })
  })

  it('entity visibility writes Value + State: Authored', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: 'col-amount',
      field: 'lsdlVisibility',
      new: true,
      file: CULTURE_FILE,
      context: 'user',
    })
    const plans = planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })
    const applied = applyPatches(CULTURE_TEXT, plans.get(CULTURE_FILE)?.patches ?? [])
    const json = JSON.parse(applied.slice(block.start, applied.length - (CULTURE_TEXT.length - block.end)))
    const entity = (
      json.Entities as Record<string, { Visibility: Record<string, string>; State: string }>
    )['sales.amount']
    expect(entity.Visibility).toEqual({ Value: 'Hidden', State: 'Authored' })
    expect(entity.State).toBe('Generated')
  })

  it('auto-creates a bound entity for synonyms on an object no entity binds (dot-rule key)', () => {
    const region = lsdlObject('col-region', 'column', 'Region', 'Sales')
    const journal = rec([amount, region], {
      kind: 'field',
      objectId: 'col-region',
      field: 'synonyms',
      new: [{ name: 'zone', state: 'User' }],
      file: CULTURE_FILE,
      context: 'user',
    })
    const plans = planWrites([amount, region], journal, { texts, lsdl: [CULTURE_LSDL] })
    const patches = plans.get(CULTURE_FILE)?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(CULTURE_TEXT, patches)
    const json = JSON.parse(applied.slice(block.start, applied.length - (CULTURE_TEXT.length - block.end)))
    const entity = (
      json.Entities as Record<string, { Definition: { Binding: Record<string, string> }; Terms: Record<string, unknown>[] }>
    )['sales.region']
    expect(entity.Definition.Binding).toEqual({ ConceptualEntity: 'Sales', ConceptualProperty: 'Region' })
    expect(entity.Terms).toEqual([{ zone: { State: 'User' } }])
  })

  it('throws when a culture record names a file with no LSDL layer', () => {
    const journal = rec(model, {
      kind: 'field',
      objectId: '',
      field: 'customInstructions',
      new: 'x',
      file: 'definition/cultures/fr-FR.tmdl',
      context: 'user',
    })
    expect(() => planWrites(model, journal, { texts, lsdl: [CULTURE_LSDL] })).toThrow(/fr-FR/)
  })

  it('a rename refreshes the bound entity\'s Definition.Binding, even with no other LSDL edit', () => {
    // 'amount' has fake spans ({start:0,end:1}) unusable for planRename's own
    // TMDL patch — this fixture only proves the LSDL-side binding refresh, so
    // isolate it: a rename record whose own TMDL write would fail is exactly
    // why planWrites must not require an LSDL-touching rec to run this path.
    // Route the rename to a real, minimal TMDL file so planRename succeeds too.
    const tmdlText = 'table Sales\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n'
    const { objects: realObjs } = parseTmdlProject(new Map([['definition/tables/Sales.tmdl', tmdlText]]))
    const realAmount = realObjs.find((o) => o.name === 'Amount') as ModelObject
    const journal = rec(realObjs, {
      kind: 'field',
      objectId: realAmount.id,
      field: 'name',
      new: 'Revenue',
      file: realAmount.file,
      context: 'user',
    })
    const mergedTexts = new Map([...texts, ['definition/tables/Sales.tmdl', tmdlText]])
    // resolveEntityKeys must resolve 'sales.amount' binding by PRISTINE name
    // against realAmount (same table/name as the fixture's hand-built `amount`).
    const plans = planWrites(realObjs, journal, { texts: mergedTexts, lsdl: [CULTURE_LSDL] })
    const cultureePatches = plans.get(CULTURE_FILE)?.patches ?? []
    expect(cultureePatches.length).toBe(1)
    const applied = applyPatches(CULTURE_TEXT, cultureePatches)
    const json = JSON.parse(applied.slice(block.start, applied.length - (CULTURE_TEXT.length - block.end)))
    const entity = (
      json.Entities as Record<string, { Definition: { Binding: Record<string, string> } }>
    )['sales.amount']
    expect(entity.Definition.Binding).toEqual({ ConceptualEntity: 'Sales', ConceptualProperty: 'Revenue' })
  })
})

describe('planWrites — rename cascade (report JSON field bindings)', () => {
  const { objects, graph } = loadFixture()
  const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
  const amount = objects.find((o) => o.name === 'Amount' && o.type === 'column' && o.table === 'Sales') as ModelObject
  const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject

  const colExpr = (entity: string, property: string) => ({
    Column: { Expression: { SourceRef: { Entity: entity } }, Property: property },
  })
  const measureExpr = (entity: string, property: string) => ({
    Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property },
  })

  const fixtureTexts = (): Map<string, string> => {
    const { texts } = loadFixture()
    return texts
  }

  it('rewrites a column reference in a visual projection, including its queryRef', () => {
    const visualJson = JSON.stringify({
      name: 'v-1',
      visual: {
        visualType: 'tableEx',
        query: {
          queryState: {
            Values: {
              projections: [{ field: colExpr('Sales', 'Amount'), queryRef: 'Sales.Amount' }],
            },
          },
        },
      },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual1/visual.json', visualJson],
    ])
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('Report.Report/definition/pages/page1/visuals/visual1/visual.json')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = JSON.parse(applyPatches(visualJson, patches))
    const field = applied.visual.query.queryState.Values.projections[0]
    expect(field.field.Column.Property).toBe('Revenue')
    expect(field.field.Column.Expression.SourceRef.Entity).toBe('Sales')
    expect(field.queryRef).toBe('Sales.Revenue')
  })

  it('rewrites a measure reference in a sort definition', () => {
    const visualJson = JSON.stringify({
      name: 'v-2',
      visual: {
        visualType: 'tableEx',
        query: {
          queryState: { Values: { projections: [{ field: measureExpr('Sales', 'Chain A') }] } },
          sortDefinition: { sort: [{ direction: 'Descending', field: measureExpr('Sales', 'Chain A') }] },
        },
      },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual2/visual.json', visualJson],
    ])
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'name',
      new: 'Chain Top',
      file: chainA.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('Report.Report/definition/pages/page1/visuals/visual2/visual.json')?.patches ?? []
    const applied = JSON.parse(applyPatches(visualJson, patches))
    expect(applied.visual.query.sortDefinition.sort[0].field.Measure.Property).toBe('Chain Top')
    expect(applied.visual.query.queryState.Values.projections[0].field.Measure.Property).toBe('Chain Top')
  })

  it('rewrites selector.metadata alongside the field object', () => {
    const visualJson = JSON.stringify({
      name: 'v-3',
      visual: {
        visualType: 'tableEx',
        query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } },
        objects: {
          general: [{ properties: {}, selector: { metadata: 'Sales.Region' } }],
        },
      },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual3/visual.json', visualJson],
    ])
    const journal = rec(objects, {
      kind: 'field',
      objectId: region.id,
      field: 'name',
      new: 'Region Group',
      file: region.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('Report.Report/definition/pages/page1/visuals/visual3/visual.json')?.patches ?? []
    const applied = JSON.parse(applyPatches(visualJson, patches))
    expect(applied.visual.objects.general[0].selector.metadata).toBe('Sales.Region Group')
  })

  it('never touches an unrelated same-named field in a different table', () => {
    const visualJson = JSON.stringify({
      name: 'v-4',
      visual: {
        visualType: 'tableEx',
        query: {
          queryState: {
            Values: { projections: [{ field: colExpr('OtherTable', 'Amount') }, { field: colExpr('Sales', 'Amount') }] },
          },
        },
      },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual4/visual.json', visualJson],
    ])
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('Report.Report/definition/pages/page1/visuals/visual4/visual.json')?.patches ?? []
    const applied = JSON.parse(applyPatches(visualJson, patches))
    const projections = applied.visual.query.queryState.Values.projections
    expect(projections[0].field.Column.Property).toBe('Amount') // OtherTable.Amount untouched
    expect(projections[0].field.Column.Expression.SourceRef.Entity).toBe('OtherTable')
    expect(projections[1].field.Column.Property).toBe('Revenue') // Sales.Amount renamed
  })

  it('a rename with no matching report reference plans no report file at all', () => {
    const visualJson = JSON.stringify({
      name: 'v-5',
      visual: { visualType: 'tableEx', query: { queryState: { Values: { projections: [{ field: colExpr('Sales', 'Region') }] } } } },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual5/visual.json', visualJson],
    ])
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    expect(plans.has('Report.Report/definition/pages/page1/visuals/visual5/visual.json')).toBe(false)
  })

  it('TWO renames hitting the SAME report file emit ONE whole-file patch (no overlap)', () => {
    // The reported bug: per-rename whole-file cascades on one visual.json
    // produced two identical [0, len) patches — the overlap guard threw
    // "overlapping patches … share at least one byte" and the save failed.
    const visualJson = JSON.stringify({
      name: 'v-6',
      visual: {
        visualType: 'tableEx',
        query: {
          queryState: {
            Values: {
              projections: [
                { field: measureExpr('Sales', 'Chain A'), queryRef: 'Sales.Chain A' },
                { field: colExpr('Sales', 'Amount'), queryRef: 'Sales.Amount' },
              ],
            },
          },
        },
      },
    })
    const texts = new Map([
      ...fixtureTexts(),
      ['Report.Report/definition/pages/page1/visuals/visual1/visual.json', visualJson],
    ])
    const journal = [
      ...rec(objects, {
        kind: 'field',
        objectId: chainA.id,
        field: 'name',
        new: 'Chain Top',
        file: chainA.file,
        context: 'user',
      }),
      ...rec(objects, {
        kind: 'field',
        objectId: amount.id,
        field: 'name',
        new: 'Revenue',
        file: amount.file,
        context: 'user',
      }),
    ]
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('Report.Report/definition/pages/page1/visuals/visual1/visual.json')?.patches ?? []
    expect(patches.length).toBe(1) // ONE whole-file re-serialization, both remaps inside
    const applied = JSON.parse(applyPatches(visualJson, patches))
    const projections = applied.visual.query.queryState.Values.projections
    expect(projections[0].field.Measure.Property).toBe('Chain Top')
    expect(projections[1].field.Column.Property).toBe('Revenue')
  })
})

describe('planWrites — rename cascade (relationships.tmdl dot-syntax)', () => {
  const { texts: fixtureTexts, objects, graph } = loadFixture()
  const amount = objects.find((o) => o.name === 'Amount' && o.type === 'column' && o.table === 'Sales') as ModelObject
  const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject

  it('rewrites a column endpoint (fromColumn) leaving the table side untouched', () => {
    const relText = 'relationship 40dd0332-cd67-44fb-8a63-739aa271a68a\n\tfromColumn: Sales.Amount\n\ttoColumn: Region.Region\n'
    const texts = new Map([...fixtureTexts, ['definition/relationships.tmdl', relText]])
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/relationships.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(relText, patches)
    expect(applied).toContain('fromColumn: Sales.Revenue')
    expect(applied).toContain('toColumn: Region.Region')
  })

  it('rewrites a quoted table endpoint on a table rename', () => {
    const relText = "relationship 84ad5c4e-771d-f5bd-2826-745fd03bc88f\n\tfromColumn: 'Site Performance'.CreativeKey\n\ttoColumn: Sales.Amount\n"
    const texts = new Map([...fixtureTexts, ['definition/relationships.tmdl', relText]])
    const salesTable = objects.find((o) => o.name === 'Sales' && o.type === 'table') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: salesTable.id,
      field: 'name',
      new: 'Sales Fact',
      file: salesTable.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/relationships.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(relText, patches)
    expect(applied).toContain("toColumn: 'Sales Fact'.Amount")
    expect(applied).toContain("fromColumn: 'Site Performance'.CreativeKey")
  })

  it('never touches a same-named column on an unrelated table', () => {
    const relText = 'relationship r1\n\tfromColumn: OtherTable.Region\n\ttoColumn: Sales.Region\n'
    const texts = new Map([...fixtureTexts, ['definition/relationships.tmdl', relText]])
    const journal = rec(objects, {
      kind: 'field',
      objectId: region.id,
      field: 'name',
      new: 'Region Group',
      file: region.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/relationships.tmdl')?.patches ?? []
    const applied = applyPatches(relText, patches)
    expect(applied).toContain('fromColumn: OtherTable.Region') // untouched
    expect(applied).toContain("toColumn: Sales.'Region Group'") // renamed (quoted: contains a space)
  })
})

describe('planWrites — rename cascade (roles/*.tmdl RLS DAX)', () => {
  const { texts: fixtureTexts, objects, graph } = loadFixture()
  const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject

  it('rewrites a tablePermission bracket reference', () => {
    const rolesText = 'role RLS\n\tmodelPermission: read\n\n\ttablePermission Sales = Sales[Region] = USERPRINCIPALNAME()\n'
    const texts = new Map([...fixtureTexts, ['definition/roles/RLS.tmdl', rolesText]])
    const journal = rec(objects, {
      kind: 'field',
      objectId: region.id,
      field: 'name',
      new: 'Region Group',
      file: region.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/roles/RLS.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(rolesText, patches)
    expect(applied).toContain('tablePermission Sales = Sales[Region Group] = USERPRINCIPALNAME()')
  })
})

describe('planWrites — rename cascade (perspectives/*.tmdl membership tokens)', () => {
  const { texts: fixtureTexts, objects, graph } = loadFixture()
  const amount = objects.find((o) => o.name === 'Amount' && o.type === 'column' && o.table === 'Sales') as ModelObject
  const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject

  it('rewrites a perspectiveColumn token scoped to the correct perspectiveTable', () => {
    const perspText =
      'perspective Fixture\n\n\tperspectiveTable Sales\n\n\t\tperspectiveColumn Amount\n\n' +
      "\t\tperspectiveMeasure 'Chain A'\n\n\tperspectiveTable Region\n\n\t\tperspectiveColumn Amount\n"
    const texts = new Map([...fixtureTexts, ['definition/perspectives/Fixture.tmdl', perspText]])
    const journal = rec(objects, {
      kind: 'field',
      objectId: amount.id,
      field: 'name',
      new: 'Revenue',
      file: amount.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/perspectives/Fixture.tmdl')?.patches ?? []
    expect(patches.length).toBe(1) // only Sales.Amount — Region.Amount is a DIFFERENT table's column
    const applied = applyPatches(perspText, patches)
    const lines = applied.split('\n')
    expect(lines.filter((l) => l.includes('perspectiveColumn'))).toEqual([
      '\t\tperspectiveColumn Revenue',
      '\t\tperspectiveColumn Amount',
    ])
  })

  it('rewrites a quoted perspectiveMeasure token', () => {
    const perspText = "perspective Fixture\n\n\tperspectiveTable Sales\n\n\t\tperspectiveMeasure 'Chain A'\n"
    const texts = new Map([...fixtureTexts, ['definition/perspectives/Fixture.tmdl', perspText]])
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'name',
      new: 'Chain Top',
      file: chainA.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/perspectives/Fixture.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(perspText, patches)
    expect(applied).toContain("perspectiveMeasure 'Chain Top'")
  })

  it('rewrites the perspectiveTable token itself on a table rename', () => {
    const perspText = 'perspective Fixture\n\n\tperspectiveTable Sales\n\n\t\tperspectiveColumn Amount\n'
    const texts = new Map([...fixtureTexts, ['definition/perspectives/Fixture.tmdl', perspText]])
    const salesTable = objects.find((o) => o.name === 'Sales' && o.type === 'table') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: salesTable.id,
      field: 'name',
      new: 'Sales Fact',
      file: salesTable.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts }, graph)
    const patches = plans.get('definition/perspectives/Fixture.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const applied = applyPatches(perspText, patches)
    expect(applied).toContain("perspectiveTable 'Sales Fact'")
  })
})
// --- 6. Delete writes --------------------------------------------------------

describe('planWrites — delete writes', () => {
  const { texts, objects } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string

  it('deleting a measure span-deletes its doc comment + block + trailing blank line', () => {
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: chainA.id, file: chainA.file, context: 'user' })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const doc = chainA.docCommentSpan as { start: number; end: number }
    // The block ends where the next sibling content starts (Chain B's doc line).
    const nextStart = salesText.indexOf('\t/// Chain middle')
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(salesText.slice(0, doc.start) + salesText.slice(nextStart))
    // Chain B's DAX legitimately still references [Chain A] (v1: no rewrite);
    // the DECLARATION must be gone.
    expect(applied).not.toContain("measure 'Chain A'")
    expect(applied).toContain("measure 'Chain B'")
  })

  it('deleting a calculated column span-deletes its block', () => {
    const doubled = objects.find((o) => o.name === 'Amount Doubled') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: doubled.id, file: doubled.file, context: 'user' })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    const doc = doubled.docCommentSpan as { start: number; end: number }
    const nextStart = salesText.indexOf('\t/// Chain top')
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(salesText.slice(0, doc.start) + salesText.slice(nextStart))
    expect(applied).not.toContain('Amount Doubled')
  })

  it('deleting a source column appends the PBIPreAI_RemoveUnusedCols M step as a fresh final step', () => {
    const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' })
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(3) // TMDL block delete + step insert + in-result rewrite
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain(
      '\t\t\t\t    PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(Source, {"Region"})\n\t\t\t\tin\n',
    )
    expect(applied).toContain('\t\t\t\tin\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n')
    // User steps untouched: the Source assignment line is byte-identical.
    expect(applied).toContain('\t\t\t\t    Source = #table({"Amount", "Region"}, {})\n')
  })

  it('deleting several source columns of one table emits ONE step naming all of them', () => {
    const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject
    const amountCol = objects.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = [
      ...rec(objects, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' }),
      ...rec(objects, { kind: 'delete', objectId: amountCol.id, file: amountCol.file, context: 'user' }),
    ]
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(4) // 2 TMDL block deletes + step insert + in-result rewrite
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain('PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(Source, {"Region", "Amount"})')
    expect(applied.match(/PBIPreAI_RemoveUnusedCols =/g)?.length).toBe(1)
  })

  it('handles #"quoted" M step names — the default Power Query step form', () => {
    // The exact real-world shape that threw 'in result #"Changed Type" is
    // not a step reference': every Power BI-minted table names its steps in
    // the #"quoted" identifier form.
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      "\t\t\t\tlet\n\t\t\t\t    #\"Changed Type\" = Table.TransformColumnTypes(Source, {{\"Amount\", type number}})\n\t\t\t\tin\n\t\t\t\t    #\"Changed Type\"\n"
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const region = objs.find((o) => o.name === 'Region' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g)
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    expect(patches.length).toBe(3) // block delete + step insert + in-result rewrite
    const applied = applyPatches(text, patches)
    expect(applied).toContain(
      'PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(#"Changed Type", {"Region"})',
    )
    expect(applied).toContain('in\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n')
    // The quoted step's own assignment line is byte-identical.
    expect(applied).toContain('#"Changed Type" = Table.TransformColumnTypes(Source, {{"Amount", type number}})')
  })

  it('the in-result may reference an earlier step; the new step re-keys to the LAST step', () => {
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      "\t\t\t\tlet\n\t\t\t\t    #\"Changed Type\" = Table.TransformColumnTypes(Source, {{\"Amount\", type number}}),\n\t\t\t\t    #\"Removed Columns\" = Table.RemoveColumns(#\"Changed Type\", {{\"Temp\"}})\n\t\t\t\tin\n\t\t\t\t    #\"Changed Type\"\n"
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const region = objs.find((o) => o.name === 'Region' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g)
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    expect(patches.length).toBe(3) // block delete + step insert + in-result rewrite
    const applied = applyPatches(text, patches)
    // References the LAST step (#"Removed Columns"), not the in-result step.
    expect(applied).toContain(
      'PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(#"Removed Columns", {"Region"})',
    )
    expect(applied).toContain('in\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n')
  })
  it('delete wins over edits of the same object (project semantics)', () => {
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const journal = [
      ...rec(objects, {
        kind: 'field',
        objectId: chainA.id,
        field: 'description',
        new: 'Edited',
        file: chainA.file,
        context: 'user',
      }),
      ...rec(objects, { kind: 'delete', objectId: chainA.id, file: chainA.file, context: 'user' }),
    ]
    const plans = planWrites(objects, journal, { texts })
    const patches = plans.get('definition/tables/Sales.tmdl')?.patches ?? []
    expect(patches.length).toBe(1) // the block delete only
    const doc = chainA.docCommentSpan as { start: number; end: number }
    const applied = applyPatches(salesText, patches)
    expect(applied).toBe(salesText.slice(0, doc.start) + salesText.slice(salesText.indexOf('\t/// Chain middle')))
  })

  it('deleting a CALCULATED table together with its columns skips the M surgery (wave-cascade combo)', () => {
    // The exact real-model combo that threw 'no M partition (partition … = m)
    // found': the cascade stages the calculated table AND its source-typed
    // columns in one save. The whole file is span-deleted; no M step applies.
    const text =
      "table 'Currency View'\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n" +
      "\tcolumn 'Field Currency'\n\t\tisHidden\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: [Value1]\n\n" +
      "\tcolumn 'Currency Mode'\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: [Value4]\n\n" +
      "\tpartition 'Currency View' = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\t{\n\t\t\t\t    (\"Currency\", 1)\n\t\t\t\t}\n"
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/Currency View.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const table = objs.find((o) => o.type === 'table') as ModelObject
    const cols = objs.filter((o) => o.type === 'column') as ModelObject[]
    expect(cols.length).toBe(2)
    const journal = [
      ...rec(objs, { kind: 'delete', objectId: table.id, file: table.file, context: 'user' }),
      ...cols.flatMap((c) => rec(objs, { kind: 'delete', objectId: c.id, file: c.file, context: 'user' })),
    ]
    // Must NOT throw on the `= calculated` partition.
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/Currency View.tmdl', text]]) }, g)
    const patches = plans.get('definition/tables/Currency View.tmdl')?.patches ?? []
    expect(patches.length).toBe(1) // the whole-file delete only — no M surgery
    expect(patches[0]).toMatchObject({ start: 0, end: byteLen(text) })
  })

  it('deleting a source column of a SURVIVING calculated table still refuses (dangling sourceColumn)', () => {
    const text =
      "table 'Currency View'\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n" +
      "\tcolumn 'Field Currency'\n\t\tisHidden\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: [Value1]\n\n" +
      "\tpartition 'Currency View' = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\t{\n\t\t\t\t    (\"Currency\", 1)\n\t\t\t\t}\n"
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/Currency View.tmdl', text]]))
    const col = objs.find((o) => o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: col.id, file: col.file, context: 'user' })
    // The table survives: removing the TMDL column alone would leave a
    // sourceColumn the DAX still produces — Power BI would break. Refusing is
    // the honest guard; silently skipping would corrupt the model.
    expect(() =>
      planWrites(objs, journal, { texts: new Map([['definition/tables/Currency View.tmdl', text]]) }),
    ).toThrow(/no M partition/)
  })


  it('a SECOND delete-save on the same table extends the existing step (no duplicate let binding)', () => {
    // Round 1 wrote PBIPreAI_RemoveUnusedCols; round 2 must extend its list —
    // two let-bindings of one name is invalid M and Power BI refuses the file.
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      '\t\t\t\tlet\n\t\t\t\t    Source = #table({"Amount", "Region"}, {})\n' +
      '\t\t\t\t    PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(Source, {"Region"})\n\t\t\t\tin\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n'
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const amount = objs.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: amount.id, file: amount.file, context: 'user' })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g)
    const applied = applyPatches(text, plans.get('definition/tables/T.tmdl')?.patches ?? [])
    expect(applied.match(/PBIPreAI_RemoveUnusedCols =/g)?.length).toBe(1)
    expect(applied).toContain('Table.RemoveColumns(Source, {"Region", "Amount"})')
  })

  it('a step line that cannot be parsed falls back to a unique suffixed step', () => {
    // The existing PBIPreAI step is not the exact Table.RemoveColumns shape
    // we write (e.g. Power BI wrapped it or added logic) — extending in place
    // is unsafe, so a fresh uniquely-named step chains off it instead.
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      '\t\t\t\tlet\n\t\t\t\t    Source = #table({"Amount", "Region"}, {})\n' +
      '\t\t\t\t    PBIPreAI_RemoveUnusedCols = Source\n\t\t\t\tin\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n'
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const amount = objs.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: amount.id, file: amount.file, context: 'user' })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g)
    const applied = applyPatches(text, plans.get('definition/tables/T.tmdl')?.patches ?? [])
    expect(applied).toContain('PBIPreAI_RemoveUnusedCols = Source')
    expect(applied).toContain('PBIPreAI_RemoveUnusedCols 2 = Table.RemoveColumns(PBIPreAI_RemoveUnusedCols, {"Amount"})')
  })

  it('second-wave extension preserves a #"quoted" source argument verbatim', () => {
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      '\t\t\t\tlet\n\t\t\t\t    #"Changed Type" = Table.TransformColumnTypes(Source, {{}})\n' +
      '\t\t\t\t    PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(#"Changed Type", {"Region"})\n\t\t\t\tin\n\t\t\t\t    PBIPreAI_RemoveUnusedCols\n'
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const amount = objs.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: amount.id, file: amount.file, context: 'user' })
    const applied = applyPatches(text, planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g).get('definition/tables/T.tmdl')?.patches ?? [])
    expect(applied).toContain('Table.RemoveColumns(#"Changed Type", {"Region", "Amount"})')
  })
})

// --- 6b. Delete guard (Group B): no save may strand surviving references -----

describe('planWrites — delete guard blocks stranded references (Group B)', () => {
  const { texts, objects, graph } = loadFixture()
  const salesText = texts.get('definition/tables/Sales.tmdl') as string

  it('blocks when a surviving measure DAX references the deleted object, naming both', () => {
    // Chain B = [Chain A] + [Chain C] — deleting Chain A strands Chain B.
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: chainA.id, file: chainA.file, context: 'user' })
    expect(() => planWrites(objects, journal, { texts }, graph)).toThrow(
      /save blocked to protect the model[\s\S]*measure 'Chain B'[\s\S]*deleted measure 'Chain A'/,
    )
  })

  it('does NOT block when the referencing object dies in the same batch', () => {
    // Chain A and Chain B die together — no surviving DAX references Chain A.
    const chainA = objects.find((o) => o.name === 'Chain A' && o.type === 'measure') as ModelObject
    const chainB = objects.find((o) => o.name === 'Chain B' && o.type === 'measure') as ModelObject
    const journal = [
      ...rec(objects, { kind: 'delete', objectId: chainA.id, file: chainA.file, context: 'user' }),
      ...rec(objects, { kind: 'delete', objectId: chainB.id, file: chainB.file, context: 'user' }),
    ]
    expect(() => planWrites(objects, journal, { texts }, graph)).not.toThrow()
  })

  it('a TABLE-ONLY delete guards its CHILDREN\'s dependents (fold-cascade parity)', () => {
    // The regression: Chain A lives in Sales. Delete the Sales table alone
    // (the fold cascade takes Chain A with it) — a guard that only checked
    // journal-deleted ids would let Chain B's [Chain A] dangle.
    const sales = objects.find((o) => o.name === 'Sales' && o.type === 'table') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: sales.id, file: sales.file, context: 'user' })
    expect(() => planWrites(objects, journal, { texts }, graph)).toThrow(
      /save blocked to protect the model/,
    )
  })

  it('blocks a relationship endpoint column AND the field parameter wrapping it', () => {
    // The fixture's 'Field Slices' parameter wraps Sales[Region], and a
    // relationship ends on it — deleting Region must name BOTH blockers.
    const region = objects.find((o) => o.name === 'Region' && o.type === 'column' && o.table === 'Sales') as ModelObject
    const journal = rec(objects, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' })
    expect(() => planWrites(objects, journal, { texts }, graph)).toThrow(
      /table relationship/,
    )
    expect(() => planWrites(objects, journal, { texts }, graph)).toThrow(
      /field parameter 'Field Slices' still wraps deleted column 'Region'/,
    )
  })

  it('blocks a CALCULATED table whose partition DAX references the deleted column', () => {
    const salesText = texts.get('definition/tables/Sales.tmdl') as string
    const calcText =
      "table 'Calc T'\n\tlineageTag: 44444444-4444-4444-8444-444444444444\n\n" +
      "\tpartition 'Calc T' = calculated\n\t\tmode: import\n\t\tsource =\n\t\t\t\tROW(\"x\", Sales[Amount])\n"
    const allTexts = new Map(texts)
    allTexts.set('definition/tables/Calc T.tmdl', calcText)
    const { objects: all, edges: allEdges } = parseTmdlProject(allTexts)
    const g = buildGraph(all, allEdges)
    const amount = all.find((o) => o.name === 'Amount' && o.type === 'column' && o.table === 'Sales') as ModelObject
    const journal = rec(all, { kind: 'delete', objectId: amount.id, file: amount.file, context: 'user' })
    expect(() => planWrites(all, journal, { texts: allTexts }, g)).toThrow(
      /calculated table 'Calc T' still references deleted column 'Amount' in its partition DAX/,
    )
    // Sanity: the base Sales text must be untouched by this fixture build.
    expect(salesText.length).toBeGreaterThan(0)
  })

  it('blocks a sortByColumn pointing at a deleted column from a surviving block', () => {
    const text =
      'table T\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
      '\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\t\tsourceColumn: Amount\n\t\tsortByColumn: Region\n\n' +
      '\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n\t\tsourceColumn: Region\n\n' +
      '\tpartition T = m\n\t\tmode: import\n\t\tsource =\n' +
      '\t\t\t\tlet\n\t\t\t\t    Source = #table({"Amount", "Region"}, {})\n\t\t\t\tin\n\t\t\t\t    Source\n'
    const { objects: objs, edges } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const g = buildGraph(objs, edges)
    const region = objs.find((o) => o.name === 'Region' && o.type === 'column') as ModelObject
    const journal = rec(objs, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' })
    expect(() =>
      planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g),
    ).toThrow(/'Region' is deleted but a surviving column still uses it as its sort-by column/)
    // Deleting BOTH columns kills the sortByColumn line with its owner — no block.
    const amount = objs.find((o) => o.name === 'Amount' && o.type === 'column') as ModelObject
    const both = [
      ...rec(objs, { kind: 'delete', objectId: region.id, file: region.file, context: 'user' }),
      ...rec(objs, { kind: 'delete', objectId: amount.id, file: amount.file, context: 'user' }),
    ]
    expect(() =>
      planWrites(objs, both, { texts: new Map([['definition/tables/T.tmdl', text]]) }, g),
    ).not.toThrow(/sort-by/)
  })
})

// --- 7. Legibility ------------------------------------------------------------

describe('planWrites — legibility', () => {
  const { texts, objects } = loadFixture()

  it('throws on an unsupported journal field', () => {
    const chainA = objects.find((o) => o.name === 'Chain A') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'flavor',
      new: 'vanilla',
      file: chainA.file,
      context: 'user',
    })
    expect(() => planWrites(objects, journal, { texts })).toThrow(/flavor/)
  })

  it('throws when a needed original text is missing from the layers', () => {
    const chainA = objects.find((o) => o.name === 'Chain A') as ModelObject
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainA.id,
      field: 'description',
      new: 'x',
      file: chainA.file,
      context: 'user',
    })
    expect(() => planWrites(objects, journal, {})).toThrow(/original text/)
  })

  it('throws when a record references an object that is not in the model', () => {
    const journal = rec(objects, {
      kind: 'delete',
      objectId: 'ghost-object',
      file: 'definition/tables/Sales.tmdl',
      context: 'user',
    })
    expect(() => planWrites(objects, journal, { texts })).toThrow(/ghost-object/)
  })

  it('byte offsets stay correct with multi-byte characters before the edit', () => {
    const text = 'table Café ☕\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n\tcolumn C\n\t\tdataType: string\n'
    const { objects: objs } = parseTmdlProject(new Map([['definition/tables/T.tmdl', text]]))
    const col = objs.find((o) => o.name === 'C') as ModelObject
    const journal = rec(objs, {
      kind: 'field',
      objectId: col.id,
      field: 'description',
      new: 'Multi ✓',
      file: col.file,
      context: 'user',
    })
    const plans = planWrites(objs, journal, { texts: new Map([['definition/tables/T.tmdl', text]]) })
    const patches = plans.get('definition/tables/T.tmdl')?.patches ?? []
    expect(patches.length).toBe(1)
    // The column's declaration starts AFTER 16 bytes of multi-byte head
    // (`é` = 2 bytes, `☕` = 3) — a char-index computation would say 13.
    const prefix = 'table Café ☕\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n'
    expect(patches[0].start).toBe(byteLen(prefix))
    const applied = applyPatches(text, patches)
    expect(applied).toBe(prefix + '\t/// Multi ✓\n\tcolumn C\n\t\tdataType: string\n')
  })
})
