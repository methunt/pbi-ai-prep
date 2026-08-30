// Task 4.1 — src/write/patch-engine unit tests.
// TDD: written before src/write/patch-engine.ts exists (RED), green after.
// PINNED CONTRACT under test:
// - Patch {start, end, replacement} is a half-open range over UTF-8 BYTE
//   offsets into the ORIGINAL text; start === end is a pure insertion point.
// - applyPatches applies patches DESCENDING by start (ties descending end) in
//   one pass, so every offset refers to the original text regardless of the
//   order patches arrive in.
// - Overlapping patches (sharing >= 1 byte) throw — a planner bug, never a
//   fallback. An insertion point strictly inside a replaced span throws too
//   (the byte it targets is deleted, so the edit is ambiguous); insertion
//   points at a span's start/end boundary are legal and land adjacent to the
//   replacement.
// - Replacements are literal text — never re-serialized from an AST.
// - Empty patch list → identity (the original string, untouched).
import { describe, expect, it } from 'vitest'
import { byteLen } from '../../src/domain/span'
import { applyPatches } from '../../src/write/patch-engine'
import type { Patch } from '../../src/write/patch-engine'

const patch = (start: number, end: number, replacement: string): Patch => ({
  start,
  end,
  replacement,
})

describe('single-patch edits', () => {
  it('replaces a byte span with literal text', () => {
    expect(applyPatches('table Sales', [patch(6, 11, 'Revenue')])).toBe('table Revenue')
  })

  it('inserts at a zero-length span (start === end)', () => {
    expect(applyPatches('table Sales', [patch(0, 0, '// generated\n')])).toBe(
      '// generated\ntable Sales',
    )
  })

  it('deletes a span with an empty replacement', () => {
    expect(applyPatches('table Sales', [patch(5, 11, '')])).toBe('table')
  })

  it('replaces the entire text', () => {
    const text = 'table Sales'
    expect(applyPatches(text, [patch(0, byteLen(text), 'x')])).toBe('x')
  })

  it('appends via an insertion at the byte length', () => {
    const text = 'table Sales'
    expect(applyPatches(text, [patch(byteLen(text), byteLen(text), '!')])).toBe('table Sales!')
  })
})

describe('multiple disjoint patches', () => {
  // Bytes: alpha=[0,5) space=5 beta=[6,10) space=10 gamma=[11,16).
  const text = 'alpha beta gamma'

  it('applies in descending start order regardless of input order', () => {
    expect(applyPatches(text, [patch(11, 16, 'delta'), patch(0, 5, 'ALPHA')])).toBe(
      'ALPHA beta delta',
    )
    expect(applyPatches(text, [patch(0, 5, 'ALPHA'), patch(11, 16, 'delta')])).toBe(
      'ALPHA beta delta',
    )
  })

  it('measures every offset against the original text', () => {
    // A longer earlier-byte replacement must not shift the later patch: the
    // [4,7) span still addresses "bbb" of the ORIGINAL text.
    expect(applyPatches('aaa bbb', [patch(0, 3, 'XXXXXXX'), patch(4, 7, 'C')])).toBe('XXXXXXX C')
  })

  it('allows adjacent spans that share no byte', () => {
    expect(applyPatches('aaa bbb', [patch(0, 3, 'X'), patch(3, 7, 'Y')])).toBe('XY')
  })

  it('applies two insertions at the same point, later-listed landing first', () => {
    // Sequential descending application: each insertion at byte 6 lands before
    // the text already inserted at that point, so B ends up left of A.
    expect(applyPatches('table Sales', [patch(6, 6, 'A'), patch(6, 6, 'B')])).toBe(
      'table BASales',
    )
  })
})

describe('overlap rejection', () => {
  // Bytes: aaa=[0,3) space=3 bbb=[4,7) space=7 ccc=[8,11).
  const text = 'aaa bbb ccc'

  it('throws for two patches at the same (start, end)', () => {
    expect(() => applyPatches(text, [patch(4, 7, 'X'), patch(4, 7, 'Y')])).toThrow(/overlap/)
  })

  it('throws for partially overlapping spans', () => {
    expect(() => applyPatches(text, [patch(4, 8, 'X'), patch(6, 10, 'Y')])).toThrow(/overlap/)
  })

  it('throws when one span contains another', () => {
    expect(() => applyPatches(text, [patch(0, 10, 'X'), patch(2, 4, 'Y')])).toThrow(/overlap/)
  })

  it('throws when a sub-range shares a start', () => {
    expect(() => applyPatches(text, [patch(4, 7, 'X'), patch(4, 5, 'Y')])).toThrow(/overlap/)
  })

  it('throws when an insertion point falls strictly inside a replaced span', () => {
    // The insertion targets a byte the replacement deletes — ambiguous, a bug.
    expect(() =>
      applyPatches('0123456789abcdefghij', [patch(15, 15, 'I'), patch(10, 20, 'R')]),
    ).toThrow(/inside/)
  })

  it('allows an insertion at a replaced span boundary', () => {
    const t = '0123456789abcdefghij'
    // Start boundary: the insertion precedes the replacement text.
    expect(applyPatches(t, [patch(10, 10, 'I'), patch(10, 20, 'R')])).toBe('0123456789IR')
    // End boundary: the insertion follows the replacement text.
    expect(applyPatches(t, [patch(20, 20, 'I'), patch(10, 20, 'R')])).toBe('0123456789RI')
  })
})

describe('byte correctness', () => {
  it('uses byte offsets after a multi-byte char', () => {
    // 'table 😀\n' is 11 UTF-8 bytes (the emoji is 4) but 8 JS chars —
    // offsets are bytes, so the patch must address the measure line at 11.
    const text = 'table 😀\nmeasure "M" = 1'
    const measureStart = byteLen('table 😀\n')
    expect(measureStart).toBe(11)
    expect(
      applyPatches(text, [patch(measureStart, measureStart + byteLen('measure'), 'MEASURE')]),
    ).toBe('table 😀\nMEASURE "M" = 1')
  })

  it('replaces a multi-byte char by its exact byte span', () => {
    // 'aé😀b': a=[0,1) é=[1,3) 😀=[3,7) b=[7,8) — the emoji is bytes 3..7,
    // not JS indices 2..4; a char-index splice would corrupt the output.
    expect(applyPatches('aé😀b', [patch(3, 7, 'X')])).toBe('aéXb')
  })

  it('encodes multi-byte replacement text', () => {
    expect(applyPatches('abc', [patch(0, 1, 'é')])).toBe('ébc')
    expect(applyPatches('abc', [patch(1, 2, '😀')])).toBe('a😀c')
  })

  it('returns the original string untouched for an empty patch list', () => {
    const text = 'table 😀\nmeasure "M" = 1'
    expect(applyPatches(text, [])).toBe(text)
  })
})

describe('input validation', () => {
  const text = 'table Sales'

  it('rejects byte ranges outside the text', () => {
    expect(() => applyPatches(text, [patch(-1, 3, 'x')])).toThrow(RangeError)
    expect(() => applyPatches(text, [patch(0, byteLen(text) + 1, 'x')])).toThrow(RangeError)
  })

  it('rejects inverted and non-integer offsets', () => {
    expect(() => applyPatches(text, [patch(4, 2, 'x')])).toThrow(RangeError)
    expect(() => applyPatches(text, [patch(1.5, 3, 'x')])).toThrow(RangeError)
  })
})
