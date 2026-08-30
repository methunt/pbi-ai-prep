// Task 7.3 — domain/rename unit tests.
// Purity: bulkRenamePlan never mutates inputs; the rules order is binding (FR-32)
// and the FR-12 collision rule is applied at the batch (not per-row) level — a
// sibling renamed off a name in the same batch frees that name.
import { describe, expect, it } from 'vitest'
import {
  applyRenameRules,
  bulkRenamePlan,
  DEFAULT_RENAME_RULES,
  type RenameRules,
} from '../../src/domain/rename'
import type { ModelObject } from '../../src/domain/objects'

const FILE = 'definition/tables/Sales.tmdl'

function makeObj(
  id: string,
  name: string,
  table = 'Sales',
  type: ModelObject['type'] = 'column',
): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 10, end: 10 + name.length },
    hidden: false,
    isFieldParameter: false,
  }
}

describe('applyRenameRules', () => {
  it('performs find/replace across all occurrences', () => {
    expect(applyRenameRules('dim_Amount', { ...DEFAULT_RENAME_RULES, find: 'dim_', replace: '' })).toBe('Amount')
    expect(applyRenameRules('a_b_c', { ...DEFAULT_RENAME_RULES, find: '_b_', replace: '+' })).toBe('a+c')
  })

  it('strips a prefix only when the name starts with it', () => {
    const rules: RenameRules = { ...DEFAULT_RENAME_RULES, stripPrefix: 'fact_' }
    expect(applyRenameRules('fact_Sales', rules)).toBe('Sales')
    expect(applyRenameRules('dim_Sales', rules)).toBe('dim_Sales') // no match → unchanged
  })

  it('strips a suffix only when the name ends with it', () => {
    const rules: RenameRules = { ...DEFAULT_RENAME_RULES, stripSuffix: '_raw' }
    expect(applyRenameRules('Amount_raw', rules)).toBe('Amount')
    expect(applyRenameRules('Amount_derived', rules)).toBe('Amount_derived')
  })

  it('converts underscores to spaces and Title Cases, in that order', () => {
    const rules: RenameRules = { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true, titleCase: true }
    expect(applyRenameRules('total_amount', rules)).toBe('Total Amount')
  })

  it('applies the rules in the stated order (find/replace → strip → underscores → title)', () => {
    const rules: RenameRules = {
      find: 'amount',
      replace: 'revenue',
      stripPrefix: 'fact_',
      stripSuffix: '_raw',
      underscoresToSpaces: true,
      titleCase: true,
    }
    expect(applyRenameRules('fact_total_amount_raw', rules)).toBe('Total Revenue')
  })

  it('collapses whitespace runs and trims', () => {
    const rules: RenameRules = { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true }
    expect(applyRenameRules('  a__b  ', rules)).toBe('a b')
  })
})

describe('bulkRenamePlan', () => {
  it('returns unchanged proposals when no rule alters a name (never staged)', () => {
    const selected = [makeObj('c1', 'Amount'), makeObj('c2', 'Quantity')]
    const plan = bulkRenamePlan(selected, DEFAULT_RENAME_RULES, selected)
    expect(plan.changedCount).toBe(0)
    expect(plan.changedIds).toEqual([])
    expect(plan.unchangedIds).toEqual(['c1', 'c2'])
    expect(plan.collisionCount).toBe(0)
    expect(plan.proposals.every((p) => p.changed === false)).toBe(true)
  })

  it('proposes a new name and marks it changed', () => {
    const selected = [makeObj('c1', 'Total_Amount')]
    const plan = bulkRenamePlan(
      selected,
      { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true, titleCase: true },
      selected,
    )
    expect(plan.changedCount).toBe(1)
    expect(plan.proposals[0]).toMatchObject({
      currentName: 'Total_Amount',
      proposedName: 'Total Amount',
      changed: true,
      conflicts: [],
    })
  })

  it('blocks apply when a same-table non-selected sibling holds the proposal, naming the conflict', () => {
    const c1 = makeObj('c1', 'Net_Amount')
    const c2 = makeObj('c2', 'Net Amount') // non-selected sibling already holds it
    const plan = bulkRenamePlan(
      [c1],
      { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true },
      [c1, c2],
    )
    expect(plan.hasCollisions).toBe(true)
    expect(plan.collisionCount).toBe(1)
    expect(plan.proposals[0].conflicts).toEqual(['Net Amount'])
  })

  it('blocks when a co-selected sibling keeps the destination name', () => {
    const keep = makeObj('c1', 'Net Amount') // unchanged by the rule set
    const move = makeObj('c2', 'net_amount') // → 'Net Amount' after use+title
    const plan = bulkRenamePlan(
      [keep, move],
      { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true, titleCase: true },
      [keep, move],
    )
    const moveP = plan.proposals.find((p) => p.objectId === 'c2')!
    expect(moveP.changed).toBe(true)
    expect(plan.collisionCount).toBe(1)
    expect(moveP.conflicts).toEqual(['Net Amount'])
  })

  it('frees a name when its holder is renamed away in the same batch (batch-aware rule)', () => {
    const holder = makeObj('c1', 'Net Amount') // renamed away → 'Net Value'
    const mover = makeObj('c2', 'net_amount') // → 'Net Amount'
    const rules: RenameRules = {
      find: 'Amount',
      replace: 'Value',
      stripPrefix: '',
      stripSuffix: '',
      underscoresToSpaces: true,
      titleCase: true,
    }
    const plan = bulkRenamePlan([holder, mover], rules, [holder, mover])
    expect(plan.proposals.find((p) => p.objectId === 'c1')?.proposedName).toBe('Net Value')
    expect(plan.proposals.find((p) => p.objectId === 'c2')?.proposedName).toBe('Net Amount')
    // holder is off 'Net Amount', so the mover's proposal is free.
    expect(plan.collisionCount).toBe(0)
  })

  it('does not collide across different tables', () => {
    const a = makeObj('c1', 'Amount', 'Sales')
    const b = makeObj('c2', 'Amount', 'Inventory')
    const plan = bulkRenamePlan(
      [a, b],
      { ...DEFAULT_RENAME_RULES, find: 'Amount', replace: 'Net' },
      [a, b],
    )
    expect(plan.proposals.filter((p) => p.proposedName === 'Net')).toHaveLength(2)
    expect(plan.hasCollisions).toBe(false)
  })

  it('never mutates its inputs', () => {
    const a = makeObj('c1', 'Total_Amount')
    const b = makeObj('c2', 'Net')
    const snapA = JSON.stringify(a)
    const snapB = JSON.stringify(b)
    const plan = bulkRenamePlan(
      [a, b],
      { ...DEFAULT_RENAME_RULES, underscoresToSpaces: true, titleCase: true },
      [a, b],
    )
    expect(a.name).toBe('Total_Amount')
    expect(b.name).toBe('Net')
    expect(JSON.stringify(a)).toBe(snapA)
    expect(JSON.stringify(b)).toBe(snapB)
    expect(plan.proposals).toHaveLength(2)
  })
})
