// Task 7.6 — FR-33 delete-cascade pure logic: grouping, blast radius, and the
// wave-cascade orphan round machine. TDD against src/ui/grid/deleteCascade.ts.
//
// Edge direction (AD-6): dependents(id) = the objects that reference/use id —
// the downstream objects that break when id is removed. "Orphaned" = an object
// with no remaining dependents once the cumulative staged-delete set is removed.
// Cascade semantics pinned here:
//   • deleting consumers orphans a depended-on object that had ONLY those
//     consumers (its remaining dependents drop to zero);
//   • deleting a depended-on object does NOT re-offer a consumer that was
//     already a top-level leaf (zero dependents before AND after) — the blast
//     radius names it, but it is not "newly orphaned".
import { describe, expect, it } from 'vitest'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import type { Edge } from '../../src/domain/graph'
import { buildGraph } from '../../src/domain/graph'
import {
  groupByTable,
  remainingDependents,
  newlyOrphaned,
  deleteTitle,
  confirmLabel,
} from '../../src/ui/grid/deleteCascade'

function make(id: string, type: ObjectType, name: string, table: string): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: table ? `definition/tables/${table}.tmdl` : 'definition/model.tmdl',
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
  }
}

describe('groupByTable — grouped-by-table (FR-33)', () => {
  it('groups by parent Table in stable insertion order with counts', () => {
    const m1 = make('m-1', 'measure', 'Total A', 'Sales')
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const qty = make('col-2', 'column', 'Qty', 'Region')
    const groups = groupByTable([m1, col, qty])
    expect(groups).toEqual([
      { table: 'Sales', count: 2, objects: [m1, col] },
      { table: 'Region', count: 1, objects: [qty] },
    ])
  })

  it('groups a table-classified object under its own name', () => {
    const t = make('t-1', 'table', 'Sales', '')
    expect(groupByTable([t])).toEqual([{ table: 'Sales', count: 1, objects: [t] }])
  })
})

describe('remainingDependents — per-object blast radius (facts, never a verdict)', () => {
  const col = make('col-1', 'column', 'Amount', 'Sales')
  const m1 = make('m-1', 'measure', 'Total A', 'Sales')
  const m2 = make('m-2', 'measure', 'Total B', 'Sales')
  const graph = buildGraph([col, m1, m2], [
    { from: 'm-1', to: 'col-1', kind: 'measure' },
    { from: 'm-2', to: 'col-1', kind: 'measure' },
  ])

  it('names the downstream objects that break when an object is removed', () => {
    expect(remainingDependents(graph, 'col-1', new Set())).toEqual(['m-1', 'm-2'])
    expect(remainingDependents(graph, 'm-1', new Set())).toEqual([])
  })

  it('excludes dependents already committed to deletion', () => {
    expect(remainingDependents(graph, 'col-1', new Set(['m-1']))).toEqual(['m-2'])
    expect(remainingDependents(graph, 'col-1', new Set(['m-1', 'm-2']))).toEqual([])
  })
})

describe('newlyOrphaned — the wave-cascade round machine', () => {
  it('names a depended-on object as newly orphaned once ALL its consumers are deleted', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const m1 = make('m-1', 'measure', 'Total A', 'Sales')
    const m2 = make('m-2', 'measure', 'Total B', 'Sales')
    const graph = buildGraph([col, m1, m2], [
      { from: 'm-1', to: 'col-1', kind: 'measure' },
      { from: 'm-2', to: 'col-1', kind: 'measure' },
    ])
    // Round 1 confirms the two measures → the column loses every dependent.
    const orphans = newlyOrphaned(
      graph,
      [col, m1, m2],
      new Set(),
      new Set(['m-1', 'm-2']),
    )
    expect(orphans.map((o) => o.id)).toEqual(['col-1'])
  })

  it('does NOT re-offer a consumer that was already a top-level leaf (zero before AND after)', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const m1 = make('m-1', 'measure', 'Total A', 'Sales')
    const m2 = make('m-2', 'measure', 'Total B', 'Sales')
    const graph = buildGraph([col, m1, m2], [
      { from: 'm-1', to: 'col-1', kind: 'measure' },
      { from: 'm-2', to: 'col-1', kind: 'measure' },
    ])
    // Deleting the column breaks the measures (blast radius), but neither was
    // "newly orphaned" — they had zero dependents before AND after.
    expect(newlyOrphaned(graph, [col, m1, m2], new Set(), new Set(['col-1']))).toEqual([])
  })

  it('never offers an object that is itself being deleted', () => {
    const col = make('col-1', 'column', 'Amount', 'Sales')
    const m1 = make('m-1', 'measure', 'Total A', 'Sales')
    const graph = buildGraph([col, m1], [{ from: 'm-1', to: 'col-1', kind: 'measure' }])
    // col depends on nothing → deleting col does not orphan itself or m1.
    expect(newlyOrphaned(graph, [col, m1], new Set(), new Set(['col-1']))).toEqual([])
  })
})

describe('deleteTitle — confirmation title variants (FR-33)', () => {
  const col = make('col-1', 'column', 'Amount', 'Sales')
  const m1 = make('m-1', 'measure', 'Total A', 'Sales')
  const m2 = make('m-2', 'measure', 'Total B', 'Sales')
  const graph = buildGraph([col, m1, m2], [
    { from: 'm-1', to: 'col-1', kind: 'measure' },
    { from: 'm-2', to: 'col-1', kind: 'measure' },
  ])

  it('clean — no downstream references', () => {
    expect(deleteTitle([m1], graph, new Set())).toBe('This object has no downstream references.')
    expect(deleteTitle([m1, m2], graph, new Set())).toBe(
      'These 2 objects have no downstream references.',
    )
  })

  it('partially-referenced — N of M selected objects are still referenced', () => {
    expect(deleteTitle([col], graph, new Set())).toBe('This object is still referenced.')
    expect(deleteTitle([col, m1], graph, new Set())).toBe(
      '1 of 2 selected objects are still referenced.',
    )
  })
})

describe('confirmLabel', () => {
  it('pluralises to the planned total (grows with the wave checkbox)', () => {
    expect(confirmLabel(5)).toBe('Remove 5 objects')
    expect(confirmLabel(1)).toBe('Remove 1 object')
  })
})
