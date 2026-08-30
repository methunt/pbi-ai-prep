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
    expect(parsed.brokenEdges).toEqual([])
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
    expect(parsed.edges).toEqual([
      { from: relNode, to: '85397e8a-8ad4-48dc-aa7c-6c275ab3a11e', kind: 'relationship' },
      { from: relNode, to: 'e53c09ce-73bf-4e06-bae9-310a967f11a2', kind: 'relationship' },
    ])
    // Both endpoints are ids of parsed objects.
    const ids = new Set(parsed.objects.map((o) => o.id))
    for (const edge of parsed.edges) expect(ids.has(edge.to)).toBe(true)
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

/** find() over an explicit object list (the module-level helper reads the fixture parse). */
function find2(objects: ModelObject[], table: string, name: string) {
  return objects.find((o) => o.table === table && o.name === name)
}
