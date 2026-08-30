// Task 3.3 — LSDL reader + binding index unit tests (authored fresh; TDD:
// written before src/parse/lsdl-reader.ts exists — RED, then GREEN).
//
// The primary fixture mirrors the repo's real culture file shape
// (_test_pbip_w_ai/Atrium Sigma.SemanticModel/definition/cultures/
// en-US.tmdl): `linguisticMetadata =` followed by a directly indented JSON
// expression and a trailing `contentType: json` line. A fenced
// (triple-backtick) variant is covered separately.
//
// "Not disturbed" is asserted by slicing the ORIGINAL text with the returned
// byte spans: the slice must reproduce the original block bytes and the
// contentType line verbatim.

import { describe, expect, it } from 'vitest'
import { byteLen } from '../../src/domain/span'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import { buildBindingIndex, parseLSDL } from '../../src/parse/lsdl-reader'

const CULTURE_FILE = 'definition/cultures/en-US.tmdl'

function make(id: string, type: ObjectType, name: string, table: string): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: table ? `definition/tables/${table}.tmdl` : CULTURE_FILE.replace('cultures', 'tables'),
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
  }
}

/** Apply a byte span to text the way span consumers must (spans are UTF-8 byte offsets). */
function byteSlice(text: string, span: { start: number; end: number }): string {
  const bytes = new TextEncoder().encode(text)
  return new TextDecoder().decode(bytes.slice(span.start, span.end))
}

const salesTable = make('table-sales', 'table', 'Sales', '')
const salesAmount = make('col-amount', 'column', 'Amount', 'Sales')

// --- Primary fixture: the real (unfenced) shape ------------------------------

const PREFIX = 'cultureInfo en-US\n\n/// Café — linguistic schema\n\tlinguisticMetadata =\n'

const JSON_LINES = [
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
  '\t\t\t        },',
  '\t\t\t        {',
  '\t\t\t          "qty": {',
  '\t\t\t            "State": "Deleted",',
  '\t\t\t            "LastModified": "2026-06-17T12:41:17.653Z"',
  '\t\t\t          }',
  '\t\t\t        }',
  '\t\t\t      ]',
  '\t\t\t    },',
  '\t\t\t    "sales": {',
  '\t\t\t      "Definition": {',
  '\t\t\t        "Binding": {',
  '\t\t\t          "ConceptualEntity": "Sales"',
  '\t\t\t        }',
  '\t\t\t      },',
  '\t\t\t      "State": "Generated",',
  '\t\t\t      "Visibility": {',
  '\t\t\t        "Value": "Hidden"',
  '\t\t\t      }',
  '\t\t\t    },',
  '\t\t\t    "ghost.legacy": {',
  '\t\t\t      "Definition": {',
  '\t\t\t        "Binding": {',
  '\t\t\t          "ConceptualEntity": "Ghost",',
  '\t\t\t          "ConceptualProperty": "Legacy"',
  '\t\t\t        }',
  '\t\t\t      },',
  '\t\t\t      "State": "Generated"',
  '\t\t\t    }',
  '\t\t\t  },',
  '\t\t\t  "Relationships": {',
  '\t\t\t    "sales_has_items": {',
  '\t\t\t      "Binding": {',
  '\t\t\t        "ConceptualEntity": "Sales"',
  '\t\t\t      },',
  '\t\t\t      "State": "Generated"',
  '\t\t\t    }',
  '\t\t\t  },',
  '\t\t\t  "Agents": {',
  '\t\t\t    "Internal": {',
  '\t\t\t      "Version": "1.1.0"',
  '\t\t\t    }',
  '\t\t\t  },',
  '\t\t\t  "CustomInstructions": "# Ventes café\\n\\nMonthly grain."',
  '\t\t\t}',
]

const JSON_TEXT = JSON_LINES.join('\n')
// The unfenced block span starts at the opening '{' (the value's first char,
// the analogue of "start at the first backtick") and ends just past the '}':
// slicing the span yields the JSON itself, first line's indent excluded.
const BLOCK_TEXT = JSON_TEXT.slice(3)
const CULTURE = PREFIX + JSON_TEXT + '\n\t\tcontentType: json\n'

describe('parseLSDL — block location (real, unfenced shape)', () => {
  const lsdl = parseLSDL(CULTURE)

  it('locates the JSON block byte-exactly without disturbing it', () => {
    expect(lsdl.block).not.toBeNull()
    expect(lsdl.block!.start).toBe(byteLen(PREFIX) + 3) // first byte of the opening '{'
    expect(lsdl.block!.end).toBe(lsdl.block!.start + byteLen(BLOCK_TEXT)) // just past the closing '}'
    // Spans index the ORIGINAL text: slicing reproduces the block verbatim.
    expect(byteSlice(CULTURE, lsdl.block!)).toBe(BLOCK_TEXT)
  })

  it('locates the trailing contentType line without disturbing it', () => {
    expect(lsdl.contentTypeLine).not.toBeNull()
    expect(CULTURE.split('\n')[lsdl.contentTypeLine!]).toBe('\t\tcontentType: json')
  })

  it('derives the culture file label from the cultureInfo declaration', () => {
    expect(lsdl.file).toBe(CULTURE_FILE)
  })
})

describe('parseLSDL — section split', () => {
  const lsdl = parseLSDL(CULTURE)

  it('exposes CustomInstructions as the decoded JSON string', () => {
    expect(lsdl.customInstructions).toBe('# Ventes café\n\nMonthly grain.')
  })

  it('exposes Entities with binding, state, visibility, and terms', () => {
    expect(Object.keys(lsdl.entities).sort()).toEqual(['ghost.legacy', 'sales', 'sales.amount'])

    const amount = lsdl.entities['sales.amount']
    expect(amount.binding).toBe('[Sales].[Amount]')
    expect(amount.state).toBe('Generated')
    expect(amount.visibility).toEqual({ value: 'Visible', state: 'Authored' })
    expect(amount.terms).toEqual([
      { name: 'amount', state: 'Generated' },
      { name: 'qty', state: 'Deleted', lastModified: '2026-06-17T12:41:17.653Z' },
    ])

    const tableEntity = lsdl.entities['sales']
    expect(tableEntity.binding).toBe('[Sales]')
    expect(tableEntity.visibility).toEqual({ value: 'Hidden' })
  })

  it('exposes Relationships and Agents as the parsed JSON values', () => {
    expect(lsdl.relationships).toEqual({
      sales_has_items: {
        Binding: { ConceptualEntity: 'Sales' },
        State: 'Generated',
      },
    })
    expect(lsdl.agents).toEqual({ Internal: { Version: '1.1.0' } })
  })
})

describe('buildBindingIndex', () => {
  it('resolves bindings to object ids via the shared resolver', () => {
    const lsdl = parseLSDL(CULTURE)
    const index = buildBindingIndex(lsdl, [salesTable, salesAmount])

    expect(index.size).toBe(2)
    expect(index.get('col-amount')).toEqual({
      file: salesAmount.file,
      span: salesAmount.declarationSpan,
      state: 'Generated',
    })
    expect(index.get('table-sales')).toEqual({
      file: salesTable.file,
      span: salesTable.declarationSpan,
      state: 'Generated',
    })
  })

  it('retains and flags a dangling binding instead of dropping it', () => {
    const lsdl = parseLSDL(CULTURE)
    buildBindingIndex(lsdl, [salesTable, salesAmount])

    // Retained: the entity stays in the split.
    expect(lsdl.entities['ghost.legacy']).toBeDefined()
    // Flagged: recorded on the LSDL with the culture file and block span.
    expect(lsdl.dangling).toEqual([
      {
        binding: '[Ghost].[Legacy]',
        file: CULTURE_FILE,
        span: lsdl.block,
        state: 'Generated',
      },
    ])
  })

  it('is idempotent — re-running never duplicates dangling flags', () => {
    const lsdl = parseLSDL(CULTURE)
    buildBindingIndex(lsdl, [salesTable, salesAmount])
    buildBindingIndex(lsdl, [salesTable, salesAmount])
    expect(lsdl.dangling).toHaveLength(1)
  })
})

describe('parseLSDL — fenced (triple-backtick) variant', () => {
  const FENCED = [
    'cultureInfo en-US',
    '',
    '\tlinguisticMetadata = ```',
    '\t\t\t{',
    '\t\t\t  "Version": "4.2.0",',
    '\t\t\t  "Entities": {',
    '\t\t\t    "sales.amount": {',
    '\t\t\t      "Definition": { "Binding": { "ConceptualEntity": "Sales", "ConceptualProperty": "Amount" } },',
    '\t\t\t      "State": "Generated"',
    '\t\t\t    }',
    '\t\t\t  },',
    '\t\t\t  "CustomInstructions": "# Sales"',
    '\t\t\t}',
    '\t\t\t```',
    '\t\tcontentType: json',
    '',
  ].join('\n')

  const lsdl = parseLSDL(FENCED)

  it('spans the block from the first backtick to after the closing one', () => {
    expect(lsdl.block).not.toBeNull()
    expect(byteSlice(FENCED, { start: lsdl.block!.start, end: lsdl.block!.start + 3 })).toBe('```')
    expect(byteSlice(FENCED, { start: lsdl.block!.end - 3, end: lsdl.block!.end })).toBe('```')
    // The fence encloses the JSON; the recorded span must not clip it.
    expect(byteSlice(FENCED, { start: lsdl.block!.start + 3, end: lsdl.block!.end - 3 }).trim().startsWith('{')).toBe(true)
  })

  it('parses the fenced JSON and locates the contentType line', () => {
    expect(lsdl.entities['sales.amount']?.binding).toBe('[Sales].[Amount]')
    expect(lsdl.customInstructions).toBe('# Sales')
    expect(FENCED.split('\n')[lsdl.contentTypeLine!]).toBe('\t\tcontentType: json')
  })
})

describe('parseLSDL — no linguisticMetadata', () => {
  it('yields an empty LSDL, not an error', () => {
    const lsdl = parseLSDL('cultureInfo en-US\n')

    expect(lsdl.file).toBe(CULTURE_FILE)
    expect(lsdl.block).toBeNull()
    expect(lsdl.contentTypeLine).toBeNull()
    expect(lsdl.customInstructions).toBe('')
    expect(lsdl.entities).toEqual({})
    expect(lsdl.relationships).toBeNull()
    expect(lsdl.agents).toBeNull()
    expect(lsdl.dangling).toEqual([])
  })

  it('builds an empty binding index from an empty LSDL', () => {
    const lsdl = parseLSDL('cultureInfo en-US\n')
    expect(buildBindingIndex(lsdl, [salesAmount]).size).toBe(0)
    expect(lsdl.dangling).toEqual([])
  })
})

describe('parseLSDL — malformed block JSON', () => {
  it('fails legibly: names the culture file and the JSON parse error', () => {
    const BAD =
      'cultureInfo en-US\n\tlinguisticMetadata =\n\t\t\t{\n\t\t\t  "Version": oops\n\t\t\t}\n\t\tcontentType: json\n'
    expect(() => parseLSDL(BAD)).toThrowError(/definition\/cultures\/en-US\.tmdl.*linguisticMetadata.*JSON/s)
  })

  it('fails legibly when the JSON object is never closed', () => {
    const UNTERMINATED = 'cultureInfo en-US\n\tlinguisticMetadata =\n\t\t\t{\n\t\t\t  "Version": "4.2.0"\n'
    expect(() => parseLSDL(UNTERMINATED)).toThrowError(/en-US\.tmdl/)
  })
})
