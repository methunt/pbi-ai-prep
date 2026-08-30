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
import { parseLSDL } from '../../src/parse/lsdl-reader'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { applyPatches } from '../../src/write/patch-engine'
import { planWrites } from '../../src/write/write-planner'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

/** Every .tmdl file of the fixture model, as project-relative POSIX paths. */
function loadFixture(): { texts: Map<string, string>; objects: ModelObject[] } {
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
  const { objects, errors } = parseTmdlProject(texts)
  if (errors.length > 0) throw new Error(`fixture failed to parse: ${JSON.stringify(errors)}`)
  return { texts, objects }
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
    expect(patches.length).toBe(2) // step insert + in-result rewrite
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
    expect(patches.length).toBe(2)
    const applied = applyPatches(salesText, patches)
    expect(applied).toContain('PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(Source, {"Region", "Amount"})')
    expect(applied.match(/PBIPreAI_RemoveUnusedCols =/g)?.length).toBe(1)
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
