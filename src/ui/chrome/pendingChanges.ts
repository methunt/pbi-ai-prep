// Pending-changes modal (FR-12 / mockup mPending) — pure formatting helpers.
// Kept free of React so vitest can pin the row rendering contract in the node
// environment; PendingChangesDialog.tsx consumes these to render one row per
// journal record.
//
// Every journal record renders as: [field pill] [object label] [old → new] [X].
// AI-schema records (lsdlVisibility / synonyms / customInstructions) are
// first-class rows here — they stage through the same journal as grid edits.

import type { JournalRecord } from '../../domain/journal'
import type { ModelObject } from '../../domain/objects'
import { INSTRUCTIONS_OBJECT_ID } from '../prep/lsdlModel'

/** `Table[Name]` for fields, the bare name for tables, per the mockup row style. */
export function objectLabel(o: ModelObject): string {
  return o.table !== '' ? `${o.table}[${o.name}]` : o.name
}

/**
 * The row's object label: the pristine object's display label, the AI
 * instructions record (objectId `''`, the model-wide customInstructions
 * convention), or the raw id when the object no longer resolves.
 */
export function pendingObjectLabel(
  record: JournalRecord,
  pristineById: ReadonlyMap<string, ModelObject>,
): string {
  const obj = pristineById.get(record.objectId)
  if (obj !== undefined) return objectLabel(obj)
  if (record.objectId === INSTRUCTIONS_OBJECT_ID) return 'AI Instructions (en-US)'
  return record.objectId
}

/** Pill label per record kind + field (user-facing, per the mockup). */
export function pendingFieldLabel(record: JournalRecord): string {
  if (record.kind === 'delete') return 'delete'
  switch (record.field) {
    case 'name':
      return 'rename'
    case 'lsdlVisibility':
      return 'AI schema'
    case 'synonyms':
      return 'synonyms'
    case 'customInstructions':
      return 'AI instructions'
    case 'hidden':
      return 'visibility'
    default:
      return record.field
  }
}

/** One side of the old → new pair, humanised per value shape. */
export function pendingValueText(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'boolean') return value ? 'Included' : 'Excluded'
  if (typeof value === 'string') return value === '' ? '—' : value
  if (Array.isArray(value)) {
    const names = value
      .map((t) => (typeof t === 'object' && t !== null && 'name' in t ? String((t as { name: unknown }).name) : String(t)))
      .filter((n) => n !== '')
    return names.length > 0 ? names.join(', ') : '—'
  }
  return String(value)
}

/**
 * The old side of a pair with per-field humanising: booleans read as
 * Included/Excluded (AI schema) or Visible/Hidden (grid visibility) by field.
 */
export function pendingOldText(record: JournalRecord): string {
  if (record.kind === 'delete') return '—'
  if (record.field === 'hidden' && typeof record.old === 'boolean') {
    return record.old ? 'Hidden' : 'Visible'
  }
  return pendingValueText(record.old)
}

/** The new side of a pair; deletions read as `removed`. */
export function pendingNewText(record: JournalRecord): string {
  if (record.kind === 'delete') return 'removed'
  if (record.field === 'hidden' && typeof record.new === 'boolean') {
    return record.new ? 'Hidden' : 'Visible'
  }
  return pendingValueText(record.new)
}
