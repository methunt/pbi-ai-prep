// Task 2.3 — domain/identity unit tests: the ONE shared name→id resolver (AD-6).
// TDD: written before src/domain/identity.ts exists (RED), green after implementation.
import { describe, expect, it } from 'vitest'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import { buildNameIndex, resolveName } from '../../src/domain/identity'

const FILE = 'definition/tables/Sales.tmdl'

function make(id: string, type: ObjectType, name: string, table: string): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: table ? `definition/tables/${table}.tmdl` : FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
  }
}

const salesAmount = make('col-amount', 'column', 'Amount', 'Sales')
const salesQty = make('col-qty', 'column', 'Quantity', 'Sales')
// Same bare name in a second table → ambiguous without a hint.
const demoAmount = make('col-amount-demo', 'column', 'Amount', 'Demo')
const salesTotal = make('measure-total', 'measure', 'Total Sales', 'Sales')
const salesTable = make('table-sales', 'table', 'Sales', '')

describe('buildNameIndex', () => {
  it('indexes by bare name, table+name, and type|table|name; skips nameless objects', () => {
    const index = buildNameIndex([salesAmount, salesTable, make('x', 'column', '', 'Sales')])

    expect(index.byName.get('amount')).toEqual(['col-amount'])
    expect(index.byTable.get('sales\u0000amount')).toEqual(['col-amount'])
    expect(index.byTable.get('\u0000sales')).toEqual(['table-sales'])
    expect(index.byType.get('column\u0000sales\u0000amount')).toEqual(['col-amount'])
    expect(index.byName.has('')).toBe(false)
  })
})

describe('resolveName — bare names', () => {
  const index = buildNameIndex([salesAmount, salesQty, salesTotal, salesTable])

  it('resolves a unique name to its id', () => {
    expect(resolveName(index, 'Total Sales')).toBe('measure-total')
  })

  it('resolves case-insensitively', () => {
    expect(resolveName(index, 'total SALES')).toBe('measure-total')
  })

  it('returns undefined for an unknown name', () => {
    expect(resolveName(index, 'Nope')).toBeUndefined()
  })

  it('treats a bracket-only [Name] as a bare-name reference (e.g. DAX measure ref)', () => {
    expect(resolveName(index, '[Total Sales]')).toBe('measure-total')
  })
})

describe('resolveName — ambiguity and tableHint', () => {
  const index = buildNameIndex([salesAmount, demoAmount, salesTotal])

  it('returns undefined for an ambiguous name with NO hint', () => {
    expect(resolveName(index, 'Amount')).toBeUndefined()
  })

  it('resolves an ambiguous name WITH the correct tableHint', () => {
    expect(resolveName(index, 'Amount', 'Sales')).toBe('col-amount')
    expect(resolveName(index, 'Amount', 'Demo')).toBe('col-amount-demo')
  })

  it('scopes a hint strictly: a (table, name) miss is undefined even when the name is unique elsewhere', () => {
    expect(resolveName(index, 'Total Sales', 'Nope')).toBeUndefined()
  })

  it('is case-insensitive in the hint too', () => {
    expect(resolveName(index, 'AMOUNT', 'sales')).toBe('col-amount')
  })

  it('returns undefined when two objects share table+name (different types)', () => {
    const twin = buildNameIndex([salesAmount, make('m-amount', 'measure', 'Amount', 'Sales')])
    expect(resolveName(twin, 'Amount', 'Sales')).toBeUndefined()
  })
})

describe('resolveName — fully-qualified references', () => {
  const index = buildNameIndex([salesAmount, demoAmount, salesTotal, salesTable])

  it.each([
    ['[Sales].[Amount]', 'bracketed table and name'],
    ['Sales[Amount]', 'bare table, bracketed name'],
    ["'Sales.Amount'", 'single-quoted table.name'],
    ["'Sales'[Amount]", "quoted table, bracketed name"],
    ["'Sales'.[Amount]", "quoted table, dotted bracketed name"],
  ])('parses %s (%s) and resolves to the Sales column', (ref) => {
    expect(resolveName(index, ref)).toBe('col-amount')
  })

  it('prefers the embedded table over the tableHint parameter', () => {
    expect(resolveName(index, '[Sales].[Amount]', 'Demo')).toBe('col-amount')
  })

  it('returns undefined when the embedded table does not match any object', () => {
    expect(resolveName(index, '[Wrong].[Amount]', 'Sales')).toBeUndefined()
  })

  it('resolves a fully-qualified table name itself', () => {
    expect(resolveName(index, 'Sales')).toBe('table-sales')
  })
})
