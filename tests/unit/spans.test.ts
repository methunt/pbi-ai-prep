// Task 3.1 — src/parse/spans unit tests.
// TDD: written before src/parse/spans.ts exists (RED), green after implementation.
// PINNED CONVENTIONS under test:
// - Lines are 0-based, matching `text.split('\n')` indexing.
// - Line spans are half-open over UTF-8 BYTE offsets and INCLUDE the line
//   terminator when present; a final line without one ends at the byte length.
// - Name-token spans cover the token exactly as written (quotes/brackets in).
import { describe, expect, it } from 'vitest'
import { byteLen } from '../../src/domain/span'
import type { Span } from '../../src/domain/span'
import {
  byteOffsetAt,
  locateDeclaration,
  locateDocComment,
  locateNameToken,
} from '../../src/parse/spans'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Slice `text` by BYTE offsets — the round-trip check that spans are byte-based. */
const sliceBytes = (text: string, span: Span): string =>
  decoder.decode(encoder.encode(text).subarray(span.start, span.end))

// Realistic TMDL: tab-indented, /// doc comments, quoted and bare names.
// Lines: 0 table, 1-2 doc comments, 3 measure, 4 formatString, 5 column,
// 6 dataType, 7 phantom empty segment after the trailing newline.
const TABLE = [
  'table Sales',
  '\t/// Total sales amount.',
  '\t/// Sum across all channels.',
  '\tmeasure "Total Sales" = SUM(Sales[Amount])',
  "\t\tformatString: '#,0'",
  '\tcolumn Quantity',
  '\t\tdataType: int64',
  '',
].join('\n')

describe('locateDeclaration', () => {
  it('is 0-based and includes the line terminator', () => {
    const span = locateDeclaration(TABLE, 0)
    expect(span).toEqual({ start: 0, end: byteLen('table Sales\n') })
    expect(sliceBytes(TABLE, span)).toBe('table Sales\n')
  })

  it('covers the declared line including indentation and terminator', () => {
    const span = locateDeclaration(TABLE, 5)
    expect(sliceBytes(TABLE, span)).toBe('\tcolumn Quantity\n')
  })

  it('ends at the text byte length when the last line has no terminator', () => {
    expect(locateDeclaration('table Sales', 0)).toEqual({ start: 0, end: byteLen('table Sales') })
  })

  it('addresses the phantom segment after a trailing newline as zero-length', () => {
    const span = locateDeclaration(TABLE, 7)
    expect(span.start).toBe(span.end)
    expect(span.start).toBe(byteLen(TABLE))
  })

  it('throws for an out-of-range line', () => {
    expect(() => locateDeclaration(TABLE, 8)).toThrow(RangeError)
    expect(() => locateDeclaration(TABLE, -1)).toThrow(RangeError)
  })
})

describe('locateDocComment', () => {
  it('covers the contiguous /// lines immediately above the declaration', () => {
    const declStart = locateDeclaration(TABLE, 3).start
    const doc = locateDocComment(TABLE, declStart)
    expect(doc).toBeDefined()
    expect(sliceBytes(TABLE, doc!)).toBe('\t/// Total sales amount.\n\t/// Sum across all channels.\n')
  })

  it('ends exactly at the declaration start', () => {
    const declStart = locateDeclaration(TABLE, 3).start
    expect(locateDocComment(TABLE, declStart)!.end).toBe(declStart)
  })

  it('returns undefined when the line above is not a doc comment', () => {
    const declStart = locateDeclaration(TABLE, 5).start
    expect(locateDocComment(TABLE, declStart)).toBeUndefined()
  })

  it('returns undefined for the first line', () => {
    expect(locateDocComment(TABLE, 0)).toBeUndefined()
  })

  it('excludes a non-/// line that interrupts the run', () => {
    const text = ['table T', '\t// regular comment', '\t/// doc line', '\tcolumn C'].join('\n')
    const declStart = locateDeclaration(text, 3).start
    const doc = locateDocComment(text, declStart)
    expect(sliceBytes(text, doc!)).toBe('\t/// doc line\n')
  })

  it('never captures a /// line deeper-indented inside a DAX body', () => {
    // Measure "Total"'s body ends with a deeper-indented /// comment; that is
    // expression text, not the doc comment of the next declaration.
    const text = [
      'table Sales',
      '\t/// Total sales amount.',
      '\tmeasure "Total" =',
      '\t\tSUMX(Sales, Sales[Amount] * Sales[Quantity])',
      '\t\t/// A excludes returns',
      '\tmeasure "Refunds" = CALCULATE(Sales[Amount])',
      '',
    ].join('\n')
    expect(locateDocComment(text, locateDeclaration(text, 5).start)).toBeUndefined()
    expect(sliceBytes(text, locateDocComment(text, locateDeclaration(text, 2).start)!)).toBe(
      '\t/// Total sales amount.\n',
    )
  })

  it('never captures a /// line less indented than the declaration', () => {
    const text = ['/// table-level note', '\ttable Sales'].join('\n')
    expect(locateDocComment(text, locateDeclaration(text, 1).start)).toBeUndefined()
  })
})

describe('locateNameToken', () => {
  it('points at the quoted name only, not the keyword or expression', () => {
    const declStart = locateDeclaration(TABLE, 3).start
    const span = locateNameToken(TABLE, 3)
    expect(sliceBytes(TABLE, span)).toBe('"Total Sales"')
    expect(span.start).toBe(declStart + byteLen('\tmeasure '))
    expect(span.end - span.start).toBe(byteLen('"Total Sales"'))
  })

  it('covers a bare identifier name, not the keyword', () => {
    const declStart = locateDeclaration(TABLE, 5).start
    const span = locateNameToken(TABLE, 5)
    expect(sliceBytes(TABLE, span)).toBe('Quantity')
    expect(span.start).toBe(declStart + byteLen('\tcolumn '))
  })

  it('accepts a single-quoted name', () => {
    const span = locateNameToken("measure 'Total Sales' = 1", 0)
    expect(sliceBytes("measure 'Total Sales' = 1", span)).toBe("'Total Sales'")
  })

  it('accepts a bracket-quoted name', () => {
    const span = locateNameToken('column [Amount]', 0)
    expect(sliceBytes('column [Amount]', span)).toBe('[Amount]')
  })

  it('throws on a line without a declaration or name token', () => {
    expect(() => locateNameToken(TABLE, 7)).toThrow() // phantom empty line
    expect(() => locateNameToken('table', 0)).toThrow() // keyword, no name
  })
})

describe('multi-byte names are byte-corrected', () => {
  // "Café ☕" is 11 UTF-8 bytes but 8 JS string units.
  const MB = 'table "Café ☕"\n\tmeasure "Total" = 1'

  it('name span length equals the UTF-8 byte length, not the JS string length', () => {
    const span = locateNameToken(MB, 0)
    expect('"Café ☕"'.length).toBe(8) // sanity: JS length undercounts
    expect(span.end - span.start).toBe(byteLen('"Café ☕"'))
    expect(span.end - span.start).toBe(11)
    expect(sliceBytes(MB, span)).toBe('"Café ☕"')
  })

  it('earlier multi-byte lines shift later byte offsets', () => {
    expect(locateDeclaration(MB, 1).start).toBe(byteLen('table "Café ☕"\n'))
    const span = locateNameToken(MB, 1)
    expect(span.start).toBe(byteOffsetAt(MB, MB.indexOf('"Total"')))
    expect(span.end - span.start).toBe(byteLen('"Total"'))
  })

  it('byteOffsetAt converts a JS index across multi-byte chars', () => {
    // '🙂' is a surrogate pair: JS indices 2-3, so 3 is not a code-point boundary.
    expect(byteOffsetAt('aé🙂b', 0)).toBe(0)
    expect(byteOffsetAt('aé🙂b', 1)).toBe(1)
    expect(byteOffsetAt('aé🙂b', 2)).toBe(3)
    expect(byteOffsetAt('aé🙂b', 4)).toBe(7)
    expect(byteOffsetAt('aé🙂b', 5)).toBe(8)
  })
})
