// Task 3.2 — src/parse/tmdl-reader unit tests.
// TDD: written before src/parse/tmdl-reader.ts exists (RED), green after implementation.
//
// Under test (FR-5 consequences):
// - one model object per declaration across tables/*.tmdl and functions.tmdl
// - calculated-column vs column classification; calc-group table + calc items;
//   field-parameter table + marker column; daxFunction objects with verbatim
//   triple-backtick bodies
// - lineageTag ids (surrogate via spanDerive when absent), queryGroup,
//   perspective membership, changedProperty retained
// - every object carries declaration / doc-comment / name-token byte spans
// - relationship edges at column-level endpoints; unresolved endpoints marked broken
// - a file that fails to parse yields ParseError{file, line} while the rest load (FR-5)
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { spanDerive } from '../../src/domain/span'
import type { Span } from '../../src/domain/span'
import { buildGraph } from '../../src/domain/graph'
import type { ModelObject } from '../../src/domain/objects'
import { locateDeclaration } from '../../src/parse/spans'

const DEFINITION_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'tests',
  'fixtures',
  'mock-model',
  'definition',
)

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Slice `text` by BYTE offsets — proves spans are byte-based, not JS indices. */
const sliceBytes = (text: string, span: Span): string =>
  decoder.decode(encoder.encode(text).subarray(span.start, span.end))

/** Load the committed fixture as { project-relative POSIX path -> text }. */
function loadFixtureFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.tmdl')) {
        const rel = relative(DEFINITION_DIR, full).split(sep).join('/')
        files.set(`definition/${rel}`, readFileSync(full, 'utf8'))
      }
    }
  }
  walk(DEFINITION_DIR)
  return files
}

const fixtureFiles = loadFixtureFiles()
const parsed = parseTmdlProject(fixtureFiles)

const ofType = (type: string) => parsed.objects.filter((o) => o.type === type)
const find = (table: string, name: string) =>
  parsed.objects.find((o) => o.table === table && o.name === name)

describe('parseTmdlProject — object counts (FR-5)', () => {
  it('parses the fixture with no errors and no broken edges', () => {
    expect(parsed.errors).toEqual([])
    // The fixture's one broken reference: the field parameter's NAMEOF wrap
    // of the deleted column (case 2) — attributed to the param, not dropped.
    expect(parsed.brokenEdges).toEqual([
      { from: '0917c069-c173-407a-9732-21ec0b326313', to: 'Sales[Deleted Column]', kind: 'fieldParam' },
    ])
  })

  it('emits one object per declaration with the expected type counts', () => {
    expect(ofType('table').map((o) => o.name).sort()).toEqual(['Region', 'Sales'])
    expect(ofType('column')).toHaveLength(6)
    expect(ofType('calculatedColumn')).toHaveLength(2)
    expect(ofType('measure')).toHaveLength(3)
    expect(ofType('calculationGroup')).toHaveLength(1)
    expect(ofType('calculationItem')).toHaveLength(1)
    expect(ofType('fieldParameter')).toHaveLength(1)
    expect(ofType('daxFunction')).toHaveLength(2)
    expect(parsed.objects).toHaveLength(18)
  })

  it('keys ids on lineageTag', () => {
    const sales = find('', 'Sales')
    expect(sales?.id).toBe('4aa1fc9f-dac2-4236-9131-fff8085f4f0f')
    expect(sales?.file).toBe('definition/tables/Sales.tmdl')
    expect(find('Sales', 'Amount')?.id).toBe('6cd82fce-d18c-49c0-8df7-0abbbc7ae407')
  })
})

describe('classification', () => {
  it('classifies a column with an expression as calculatedColumn', () => {
    const calc = find('Sales', 'Amount Doubled')
    expect(calc?.type).toBe('calculatedColumn')
    expect(calc?.dax).toBe('Sales[Amount] * 2')
    expect(find('Sales', 'Region')?.type).toBe('column')
    expect(find('Sales', 'Region')?.dax).toBeUndefined()
    expect(find('Field Slices', 'Name')?.type).toBe('calculatedColumn')
  })

  it('classifies a table containing a calculationGroup block as a calculation group', () => {
    const group = find('', 'Time Calc')
    expect(group?.type).toBe('calculationGroup')
    expect(group?.id).toBe('b4d7bf83-d6a1-4dad-8607-c23083e1faea')
    const item = find('Time Calc', 'No Calc')
    expect(item?.type).toBe('calculationItem')
    expect(item?.id).toBe('da86d8ed-40a4-4df9-8c87-ab170a74628b')
    expect(item?.dax).toBe('SELECTEDMEASURE()')
    expect(item?.ordinal).toBe(1)
  })

  it('classifies the field-parameter table and its ParameterMetadata marker column', () => {
    const param = find('', 'Field Slices')
    expect(param?.type).toBe('fieldParameter')
    expect(param?.isFieldParameter).toBe(true)
    expect(param?.hidden).toBe(true)
    expect(find('Field Slices', 'Field Slices Fields')?.isFieldParameter).toBe(true)
    expect(find('Field Slices', 'Field Slices Order')?.isFieldParameter).toBe(false)
    expect(find('', 'Sales')?.isFieldParameter).toBe(false)
  })
})

describe('functions.tmdl — daxFunction objects', () => {
  it('preserves the triple-backtick body verbatim (tabs and line breaks included)', () => {
    const double = find('', 'fx_double')
    expect(double?.type).toBe('daxFunction')
    expect(double?.table).toBe('')
    expect(double?.dax).toBe('\t\t(v:expr) => v * 2')
    const pick = find('', 'fx_pick')
    expect(pick?.type).toBe('daxFunction')
    expect(pick?.dax).toBe(
      '\t\t(a:expr, b:expr) =>\n\t\tIF.EAGER(\n\t\t    a,\n\t\t    b\n\t\t)',
    )
  })

  it('reads function lineageTags and descriptions', () => {
    expect(find('', 'fx_double')?.id).toBe('9dd8b955-918c-4663-94a9-be03232adb1a')
    expect(find('', 'fx_pick')?.description).toBe('Picks the first argument when positive.')
  })
})

describe('write-path gaps — lineageTag / queryGroup / perspective / changedProperty', () => {
  it('retains queryGroup surfaced from the table partition', () => {
    expect(find('', 'Sales')?.queryGroup).toBe('Fact')
    expect(find('', 'Region')?.queryGroup).toBeUndefined()
  })

  it('retains changedProperty entries at object and table level', () => {
    expect(find('Sales', 'Chain B')?.changedProperty).toEqual(['IsHidden'])
    expect(find('', 'Field Slices')?.changedProperty).toEqual(['Name'])
    expect(find('Sales', 'Chain A')?.changedProperty).toBeUndefined()
  })

  it('attaches perspective membership to the included objects', () => {
    expect(find('', 'Sales')?.perspectiveMembership).toEqual(['Fixture'])
    expect(find('Sales', 'Amount')?.perspectiveMembership).toEqual(['Fixture'])
    expect(find('Sales', 'Chain A')?.perspectiveMembership).toEqual(['Fixture'])
    expect(find('', 'Region')?.perspectiveMembership).toEqual(['Fixture'])
    // Not included, and a perspectiveTable naming an unknown table is ignored.
    expect(find('Sales', 'Region')?.perspectiveMembership).toBeUndefined()
    expect(find('Sales', 'Chain B')?.perspectiveMembership).toBeUndefined()
  })

  it('carries hidden, description, displayFolder and measure dax', () => {
    const chainB = find('Sales', 'Chain B')
    expect(chainB?.hidden).toBe(true)
    expect(find('Sales', 'Chain A')?.hidden).toBe(false)
    expect(find('Sales', 'Chain A')?.description).toBe(
      'Chain top; references Chain B (cycle leg, case 5) and starts the hidden chain (case 3)',
    )
    expect(find('Sales', 'Chain A')?.displayFolder).toBe('Fixture\\Chain')
    expect(find('Sales', 'Chain A')?.dax).toBe('[Chain B]')
  })

  it('reads a triple-backtick measure body with the fences excluded', () => {
    expect(find('Sales', 'Chain C')?.dax).toBe('\n\t\t\tSUM ( Sales[Amount] )\n')
  })
})

describe('source spans (AD-3)', () => {
  // The calc-group and field-parameter kinds are carried by the TABLE
  // declaration, so their source keyword is still `table`.
  const keywordFor = (type: string): string =>
    type === 'calculatedColumn' || type === 'column'
      ? 'column'
      : type === 'fieldParameter' || type === 'calculationGroup'
        ? 'table'
        : type === 'daxFunction'
          ? 'function'
          : type

  it('every object carries declaration, doc-comment and name-token byte spans', () => {
    expect(parsed.objects.length).toBeGreaterThan(0)
    for (const obj of parsed.objects) {
      const text = fixtureFiles.get(obj.file) as string
      const total = encoder.encode(text).length
      const decl = obj.declarationSpan
      expect(decl.start, `${obj.file} ${obj.name} decl start`).toBeGreaterThanOrEqual(0)
      expect(decl.end, `${obj.file} ${obj.name} decl end`).toBeLessThanOrEqual(total)
      expect(decl.start).toBeLessThan(decl.end)
      expect(sliceBytes(text, decl).trimStart().startsWith(keywordFor(obj.type))).toBe(true)
      expect(obj.nameSpan.start).toBeGreaterThanOrEqual(decl.start)
      expect(obj.nameSpan.end).toBeLessThanOrEqual(decl.end)
      const token = sliceBytes(text, obj.nameSpan)
      expect(token === obj.name || token === `'${obj.name}'`).toBe(true)
      expect(obj.docCommentSpan, `${obj.file} ${obj.name} doc span`).toBeDefined()
      expect(obj.docCommentSpan?.end).toBe(decl.start)
      expect(sliceBytes(text, obj.docCommentSpan as Span)).toContain('///')
    }
  })

  it('spans are byte-exact for a quoted-name calculated column', () => {
    const calc = find('Sales', 'Amount Doubled') as NonNullable<ReturnType<typeof find>>
    const text = fixtureFiles.get(calc.file) as string
    expect(sliceBytes(text, calc.declarationSpan)).toBe(
      "\tcolumn 'Amount Doubled' = Sales[Amount] * 2\n",
    )
    expect(sliceBytes(text, calc.nameSpan)).toBe("'Amount Doubled'")
    expect(sliceBytes(text, calc.docCommentSpan as Span)).toBe(
      "\t/// Calculated column; references Amount directly and is referenced by nothing\n",
    )
  })

  it('spans are byte-exact for the table declaration and its top-level doc comment', () => {
    const sales = find('', 'Sales') as NonNullable<ReturnType<typeof find>>
    const text = fixtureFiles.get(sales.file) as string
    expect(sliceBytes(text, sales.declarationSpan)).toBe('table Sales\n')
    expect(sliceBytes(text, sales.nameSpan)).toBe('Sales')
    expect(sliceBytes(text, sales.docCommentSpan as Span)).toBe(
      '/// Synthetic fact table. Carries the hidden-measure chain (case 3) and the circular measure pair (case 5).\n',
    )
  })
})

describe('relationship edges (column-level endpoints)', () => {
  it('emits one edge per endpoint column from the feeder-minted relationship node', () => {
    const relText = fixtureFiles.get('definition/relationships.tmdl') as string
    const relNode = spanDerive('definition/relationships.tmdl', locateDeclaration(relText, 0))
    expect(parsed.edges.slice(0, 2)).toEqual([
      { from: relNode, to: '85397e8a-8ad4-48dc-aa7c-6c275ab3a11e', kind: 'relationship' },
      { from: relNode, to: 'e53c09ce-73bf-4e06-bae9-310a967f11a2', kind: 'relationship' },
    ])
    // Both endpoints are ids of parsed objects (relationship-kind edges carry
    // resolved column ids; the broken param wrap intentionally does not).
    const ids = new Set(parsed.objects.map((o) => o.id))
    for (const edge of parsed.edges.filter((e) => e.kind === 'relationship')) {
      expect(ids.has(edge.to)).toBe(true)
    }
  })

  it('marks an endpoint that resolves to nothing as broken, not dropped', () => {
    const files = new Map<string, string>([
      [
        'definition/tables/Sales.tmdl',
        'table Sales\n\tlineageTag: 33333333-3333-3333-3333-333333333333\n\n\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 44444444-4444-4444-4444-444444444444\n',
      ],
      [
        'definition/relationships.tmdl',
        'relationship r1\n\tfromColumn: Sales.Missing\n\ttoColumn: Sales.Amount\n',
      ],
    ])
    const result = parseTmdlProject(files)
    expect(result.errors).toEqual([])
    const relNode = spanDerive(
      'definition/relationships.tmdl',
      locateDeclaration(files.get('definition/relationships.tmdl') as string, 0),
    )
    expect(result.edges).toEqual([
      { from: relNode, to: 'Sales[Missing]', kind: 'relationship' },
      { from: relNode, to: '44444444-4444-4444-4444-444444444444', kind: 'relationship' },
    ])
    expect(result.brokenEdges).toEqual([
      { from: relNode, to: 'Sales[Missing]', kind: 'relationship' },
    ])
  })
  it('populates relMeta with the relationship name + endpoint columns for the cascade dialog', () => {
    const files = new Map<string, string>([
      [
        'definition/tables/Sales.tmdl',
        'table Sales\n\tlineageTag: 33333333-3333-3333-3333-333333333333\n\n\tcolumn Region\n\t\tdataType: string\n\t\tlineageTag: 55555555-5555-5555-5555-555555555555\n',
      ],
      [
        'definition/tables/Calendar.tmdl',
        'table Calendar\n\tlineageTag: 66666666-6666-6666-6666-666666666666\n\n\tcolumn Date\n\t\tdataType: dateTime\n\t\tlineageTag: 77777777-7777-7777-7777-777777777777\n',
      ],
      [
        'definition/relationships.tmdl',
        'relationship 8b59cb3b-68ba-bc4a-76db\n\tfromColumn: Sales.Region\n\ttoColumn: Calendar.Date\n',
      ],
    ])
    const result = parseTmdlProject(files)
    const relNode = spanDerive(
      'definition/relationships.tmdl',
      locateDeclaration(files.get('definition/relationships.tmdl') as string, 0),
    )
    expect(result.relMeta.get(relNode)).toEqual({
      name: '8b59cb3b-68ba-bc4a-76db',
      endpoint: 'Sales[Region] → Calendar[Date]',
    })
  })

  it('leaves relMeta empty when no relationships exist', () => {
    const files = new Map<string, string>([
      ['definition/model.tmdl', 'model Model\n\tculture: en-US\n'],
      ['definition/database.tmdl', 'database Database\n\tcompatibilityLevel: 1500\n'],
    ])
    const result = parseTmdlProject(files)
    expect(result.relMeta.size).toBe(0)
  })

  it('records an "unresolved endpoints" relMeta entry when from/to columns are missing', () => {
    const files = new Map<string, string>([
      [
        'definition/relationships.tmdl',
        'relationship orphan-r\n\tisActive: false\n',
      ],
    ])
    const result = parseTmdlProject(files)
    const relNode = spanDerive(
      'definition/relationships.tmdl',
      locateDeclaration(files.get('definition/relationships.tmdl') as string, 0),
    )
    expect(result.relMeta.get(relNode)).toEqual({
      name: 'orphan-r',
      endpoint: 'unresolved endpoints',
    })
  })
})

describe('error path (FR-5)', () => {
  it('reports a malformed file with file name and line while the rest still load', () => {
    const files = new Map<string, string>([
      ['definition/tables/Broken.tmdl', "table 'Broken\n\tlineageTag: x\n"],
      [
        'definition/tables/Good.tmdl',
        'table Good\n\tlineageTag: 11111111-1111-1111-1111-111111111111\n',
      ],
    ])
    const result = parseTmdlProject(files)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].file).toBe('definition/tables/Broken.tmdl')
    expect(result.errors[0].line).toBe(0)
    expect(result.errors[0].message).toContain('unterminated quoted name')
    expect(find2(result.objects, '', 'Good')?.id).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('tolerates CRLF line endings and keeps spans byte-exact', () => {
    const files = new Map<string, string>([
      [
        'definition/tables/Crlf.tmdl',
        'table Crlf\r\n\tlineageTag: 22222222-2222-2222-2222-222222222222\r\n',
      ],
    ])
    const result = parseTmdlProject(files)
    expect(result.errors).toEqual([])
    const table = find2(result.objects, '', 'Crlf')
    const text = files.get('definition/tables/Crlf.tmdl') as string
    expect(sliceBytes(text, table?.declarationSpan as Span)).toBe('table Crlf\r\n')
  })
})

describe('surrogate ids (AD-2)', () => {
  it('mints the id via spanDerive over the declaration span when lineageTag is absent', () => {
    const files = new Map<string, string>([
      ['definition/tables/Bare.tmdl', 'table Bare\n\n\tcolumn NoTag\n\t\tdataType: int64\n'],
    ])
    const result = parseTmdlProject(files)
    const col = find2(result.objects, 'Bare', 'NoTag')
    const decl = locateDeclaration(files.get('definition/tables/Bare.tmdl') as string, 2)
    expect(col?.id).toBe(spanDerive('definition/tables/Bare.tmdl', decl))
  })
})

describe('scale (FR-8)', () => {
  it('parses a synthetic 2000-object model well inside the load budget', () => {
    const files = new Map<string, string>()
    for (let t = 0; t < 250; t++) {
      const lines: string[] = [`table T${t}`, `\tlineageTag: ${t.toString(16).padStart(8, '0')}-aaaa-bbbb-cccc-dddddddddddd`, '']
      for (let c = 0; c < 4; c++) {
        lines.push(`\t/// Column ${c} of table ${t}`, `\tcolumn C${c}`, `\t\tdataType: int64`, `\t\tlineageTag: ${t.toString(16).padStart(8, '0')}-${c}-bbbb-cccc-dddddddddddd`, '')
      }
      for (let m = 0; m < 2; m++) {
        lines.push(`\tmeasure M${m} = [C${m}] + T${t}[C0]`, `\t\tlineageTag: ${t.toString(16).padStart(8, '0')}-m${m}-cccc-dddddddddddd`, '')
      }
      lines.push('\tcalculationGroup', '\t\tprecedence: 10', '', "\t\tcalculationItem 'No Calc'", '\t\t\texpression = SELECTEDMEASURE()', '\t\t\tordinal: 1', '')
      files.set(`definition/tables/T${t}.tmdl`, lines.join('\n'))
    }
    const started = performance.now()
    const result = parseTmdlProject(files)
    const elapsed = performance.now() - started
    expect(result.errors).toEqual([])
    expect(result.objects).toHaveLength(2000) // 250 tables x (table + 4 cols + 2 measures + 1 calc item)
    expect(elapsed).toBeLessThan(2000)
  })
})

describe('model edges (AD-6) — measure / calcObject / calcItem / fieldParam / function', () => {
  it('emits a measure edge from a measure DAX body to the referenced column and measures', () => {
    const chainA = find('Sales', 'Chain A')
    const chainB = find('Sales', 'Chain B')
    const amount = find('Sales', 'Amount')
    const chainC = find('Sales', 'Chain C')
    expect(parsed.edges).toContainEqual({ from: chainA?.id, to: chainB?.id, kind: 'measure' })
    expect(parsed.edges).toContainEqual({ from: chainB?.id, to: chainC?.id, kind: 'measure' })
    expect(parsed.edges).toContainEqual({ from: chainC?.id, to: amount?.id, kind: 'measure' })
  })

  it('emits a calcObject edge from a calculated column to its source column', () => {
    const doubled = find('Sales', 'Amount Doubled')
    const amount = find('Sales', 'Amount')
    expect(parsed.edges).toContainEqual({ from: doubled?.id, to: amount?.id, kind: 'calcObject' })
    // The calc column of the field-parameter table references its identity column.
    const name = find('Field Slices', 'Name')
    const identity = find('Field Slices', 'Field Slices')
    expect(parsed.edges).toContainEqual({ from: name?.id, to: identity?.id, kind: 'calcObject' })
  })

  it('emits a calcItem edge from a calculation item Expression to the referenced measure', () => {
    const item = find('Time Calc', 'No Calc')
    // SELECTEDMEASURE() references nothing: the orphaned calc item carries no DAX edge.
    expect(parsed.edges.filter((e) => e.kind === 'calcItem' && e.from === item?.id)).toEqual([])
  })

  it('emits a fieldParam edge per NAMEOF tuple, live and broken alike', () => {
    const param = find('', 'Field Slices')
    const region = find('Sales', 'Region')
    expect(parsed.edges).toContainEqual({ from: param?.id, to: region?.id, kind: 'fieldParam' })
    // The wrapped 'Deleted' column does not exist: resolved-by-name attempt, attributed broken.
    expect(parsed.edges).toContainEqual({ from: param?.id, to: 'Sales[Deleted Column]', kind: 'fieldParam' })
    expect(parsed.brokenEdges).toContainEqual({ from: param?.id, to: 'Sales[Deleted Column]', kind: 'fieldParam' })
  })

  it('emits a function edge from a daxFunction body reference', () => {
    const files = new Map<string, string>([
      [
        'definition/functions.tmdl',
        "/// Uses the amount.\nfunction fx_sum = ```\n\t\tSUM ( Sales[Amount] )\n\t\t```\n\tlineageTag: 55555555-5555-5555-5555-555555555555\n",
      ],
      [
        'definition/tables/Sales.tmdl',
        'table Sales\n\tlineageTag: 66666666-6666-6666-6666-666666666666\n\n\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 77777777-7777-7777-7777-777777777777\n',
      ],
    ])
    const result = parseTmdlProject(files)
    const fn = result.objects.find((o) => o.name === 'fx_sum')
    const amount = result.objects.find((o) => o.name === 'Amount')
    expect(result.edges).toEqual([{ from: fn?.id, to: amount?.id, kind: 'function' }])
    expect(result.brokenEdges).toEqual([])
  })

  it('attributes an unresolvable reference to its source object as broken, not dropped', () => {
    const files = new Map<string, string>([
      [
        'definition/tables/Sales.tmdl',
        'table Sales\n\tlineageTag: 66666666-6666-6666-6666-666666666666\n\n\tmeasure Ghostly = [Missing Measure] + 1\n\t\tlineageTag: 88888888-8888-8888-8888-888888888888\n',
      ],
    ])
    const result = parseTmdlProject(files)
    const measure = result.objects.find((o) => o.name === 'Ghostly')
    expect(result.edges).toEqual([{ from: measure?.id, to: '[Missing Measure]', kind: 'measure' }])
    expect(result.brokenEdges).toEqual([{ from: measure?.id, to: '[Missing Measure]', kind: 'measure' }])
    // buildGraph agrees: the reference is broken, attributed to the measure.
    const graph = buildGraph(result.objects, result.edges)
    expect(graph.broken).toEqual([{ from: measure?.id, to: '[Missing Measure]', kind: 'measure' }])
  })

  it('deduplicates identical references within one source expression', () => {
    const files = new Map<string, string>([
      [
        'definition/tables/Sales.tmdl',
        'table Sales\n\tlineageTag: 66666666-6666-6666-6666-666666666666\n\n\tcolumn Amount\n\t\tdataType: int64\n\t\tlineageTag: 77777777-7777-7777-7777-777777777777\n\n\tmeasure Twice = [Amount] + [Amount]\n\t\tlineageTag: 99999999-9999-9999-9999-999999999999\n',
      ],
    ])
    const result = parseTmdlProject(files)
    const measure = result.objects.find((o) => o.name === 'Twice')
    const amount = result.objects.find((o) => o.name === 'Amount')
    expect(result.edges).toEqual([{ from: measure?.id, to: amount?.id, kind: 'measure' }])
  })

  it('reproduces the non-visual usage rows of expected-usage.json (FR-9 wiring proof)', () => {
    const graph = buildGraph(parsed.objects, parsed.edges)
    const expected: Record<string, { direct: number; transitive: number; leaf: number; total: number }> = {
      '6cd82fce-d18c-49c0-8df7-0abbbc7ae407': { direct: 2, transitive: 2, leaf: 0, total: 4 }, // Sales[Amount]
      '323953cf-dc3b-487f-b86f-fcb7d88c5d00': { direct: 1, transitive: 0, leaf: 0, total: 1 }, // Chain A
      '4b186f1d-6de8-4cb1-9b08-40b2fc043611': { direct: 1, transitive: 0, leaf: 0, total: 1 }, // Chain B
      'c482f4ec-ff3e-4a79-9209-7fc40425721a': { direct: 1, transitive: 1, leaf: 0, total: 2 }, // Chain C
      'e53c09ce-73bf-4e06-bae9-310a967f11a2': { direct: 1, transitive: 0, leaf: 0, total: 1 }, // Region[Region]
      'bb4ee2c0-ff65-41d9-a715-03828b3a2b14': { direct: 1, transitive: 0, leaf: 0, total: 1 }, // FS[Field Slices]
      'da86d8ed-40a4-4df9-8c87-ab170a74628b': { direct: 0, transitive: 0, leaf: 0, total: 0 }, // calc item
    }
    for (const [id, exp] of Object.entries(expected)) {
      // Sales[Region]'s visual leg arrives via Task 3.4's PBIR reader; every
      // reader-emitted row must already match in full.
      const got = graph.usage(id)
      expect({ id, ...got }).toEqual({ id, ...exp })
    }
  })
})

/** find() over an explicit object list (the module-level helper reads the fixture parse). */
function find2(objects: ModelObject[], table: string, name: string) {
  return objects.find((o) => o.table === table && o.name === name)
}
