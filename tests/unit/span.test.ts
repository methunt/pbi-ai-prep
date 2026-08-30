// Task 2.1 — domain/span unit tests.
// TDD: written before src/domain/span.ts exists (RED), green after implementation.
import { describe, expect, it } from 'vitest'
import { byteLen, spanDerive } from '../../src/domain/span'

describe('spanDerive', () => {
  it('is stable for the same file+span', () => {
    const a = spanDerive('definition/tables/Sales.tmdl', { start: 120, end: 340 })
    const b = spanDerive('definition/tables/Sales.tmdl', { start: 120, end: 340 })
    expect(a).toBe(b)
  })

  it('follows the file#start-end template with the URI-escaped path', () => {
    expect(spanDerive('definition/tables/Sales.tmdl', { start: 120, end: 340 })).toBe(
      encodeURIComponent('definition/tables/Sales.tmdl') + '#120-340',
    )
  })

  it('differs for a different span in the same file', () => {
    const file = 'definition/tables/Sales.tmdl'
    expect(spanDerive(file, { start: 120, end: 340 })).not.toBe(
      spanDerive(file, { start: 121, end: 340 }),
    )
    expect(spanDerive(file, { start: 120, end: 340 })).not.toBe(
      spanDerive(file, { start: 120, end: 341 }),
    )
  })

  it('differs for a different file with the same span', () => {
    const span = { start: 0, end: 10 }
    expect(spanDerive('a.tmdl', span)).not.toBe(spanDerive('b.tmdl', span))
  })

  it('escapes a # in the file path so the id keeps exactly one # delimiter', () => {
    const id = spanDerive('tables/Weird#Name.tmdl', { start: 5, end: 9 })
    expect(id).toBe('tables%2FWeird%23Name.tmdl#5-9')
    expect(id.split('#')).toHaveLength(2)
  })
})

describe('byteLen', () => {
  it('counts ASCII as one byte per char', () => {
    expect(byteLen('abc')).toBe(3)
    expect(byteLen('')).toBe(0)
  })

  it('counts a two-byte char beyond its string length', () => {
    expect('é'.length).toBe(1) // sanity: JS length undercounts
    expect(byteLen('é')).toBe(2)
  })

  it('counts a four-byte emoji beyond its string length', () => {
    expect('🙂'.length).toBe(2) // sanity: surrogate pair
    expect(byteLen('🙂')).toBe(4)
  })

  it('sums across a mixed string', () => {
    expect(byteLen('aé🙂b')).toBe(1 + 2 + 4 + 1)
  })
})
