// Delete-cascade pure logic (FR-33). No React, no DOM — unit-testable in the
// vitest node environment. The wave-cascade round machine in DeleteDialog.tsx
// is driven entirely by these functions, so the graph recomputation + orphan
// naming is pinned by tests instead of being buried in component state.
//
// Edge direction (AD-6): `dependents(id)` = the objects that reference/use
// `id`. Removing `id` names its dependents as "downstream that break" (facts,
// never a verdict). "Orphaned" = an object with no REMAINING dependents once
// the cumulative staged-delete set is removed.

import type { ModelObject } from '../../domain/objects'
import type { ObjectGraph } from '../../domain/graph'

/** Table-classified kinds; deleting one empties its whole table file. */
const isTableLike = (o: ModelObject): boolean =>
  o.type === 'table' || o.type === 'calculationGroup' || o.type === 'fieldParameter'

/** The parent-Table label a row groups under for the grouped-by-table list. */
const groupTable = (o: ModelObject): string => (isTableLike(o) ? o.name : o.table || '—')

export interface TableGroup {
  table: string
  count: number
  objects: ModelObject[]
}

/**
 * Group `objects` (PRISTINE) by their parent Table in stable insertion order.
 * Table-classified objects group under their own name.
 */
export function groupByTable(objects: ModelObject[]): TableGroup[] {
  const order: string[] = []
  const byTable = new Map<string, ModelObject[]>()
  for (const o of objects) {
    const key = groupTable(o)
    let bucket = byTable.get(key)
    if (bucket === undefined) {
      bucket = []
      byTable.set(key, bucket)
      order.push(key)
    }
    bucket.push(o)
  }
  return order.map((table) => {
    const bucket = byTable.get(table) as ModelObject[]
    return { table, count: bucket.length, objects: bucket }
  })
}

/**
 * The distinct object ids that STILL depend on `id` once `deleted` (the
 * cumulative staged-delete set) are removed. Facts, never a verdict: these are
 * the downstream objects that break when `id` is removed. An id whose every
 * dependent is itself slated for deletion is excluded here.
 */
export function remainingDependents(
  graph: ObjectGraph,
  id: string,
  deleted: ReadonlySet<string>,
): string[] {
  const out: string[] = []
  for (const d of graph.dependents(id)) if (!deleted.has(d)) out.push(d)
  return out
}

/**
 * The PRISTINE objects that BECOME orphaned (no remaining 1-hop dependents) as
 * a consequence of this round's deletions. "Newly" means they had at least one
 * remaining dependent before this round (`priorDeleted`) but none survive after
 * applying `deleted` (the cumulative set including this round). Already-orphaned
 * objects and the objects being deleted are excluded. Order follows `model`.
 */
export function newlyOrphaned(
  graph: ObjectGraph,
  model: ModelObject[],
  priorDeleted: ReadonlySet<string>,
  deleted: ReadonlySet<string>,
): ModelObject[] {
  const out: ModelObject[] = []
  for (const o of model) {
    if (deleted.has(o.id)) continue
    const before = remainingDependents(graph, o.id, priorDeleted).length
    if (before === 0) continue
    if (remainingDependents(graph, o.id, deleted).length === 0) out.push(o)
  }
  return out
}

/**
 * Confirmation title variant. Clean: none of the batch still has a downstream
 * dependent outside the deletion plan → 'These N objects have no downstream
 * references.' Partially-referenced: 'N of M selected objects are still
 * referenced.' (facts — never a safety verdict).
 */
export function deleteTitle(
  batch: ModelObject[],
  graph: ObjectGraph,
  deleted: ReadonlySet<string>,
): string {
  if (batch.length === 1) {
    const still = remainingDependents(graph, batch[0].id, deleted).length
    return still > 0 ? 'This object is still referenced.' : 'This object has no downstream references.'
  }
  const still = batch.filter((o) => remainingDependents(graph, o.id, deleted).length > 0).length
  return still === 0
    ? `These ${batch.length} objects have no downstream references.`
    : `${still} of ${batch.length} selected objects are still referenced.`
}

/** Confirm-button label, pluralised to the planned total. */
export function confirmLabel(total: number): string {
  return `Remove ${total} object${total === 1 ? '' : 's'}`
}
