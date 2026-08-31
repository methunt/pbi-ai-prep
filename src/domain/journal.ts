// Domain change journal and the pure projection fold (AD-4).
// Pure leaf (AD-1): imports only from domain/objects; no browser, FS, or FSA.
//
// The journal is the ONLY mutation door (AD-4): surfaces call journalAdd /
// journalDiscard and read the folded read-model from project(); nothing here
// mutates a ModelObject or a journal array in place.

import type { ModelObject } from './objects'

/** Where a change came from. String-literal union for now; grows as surfaces land. */
export type ChangeContext = 'user' | 'ai'

/** Fields shared by every journal record. */
interface JournalRecordBase {
  /** Stable id minted once when the record enters the journal. */
  recordId: string
  /** ModelObject.id the record applies to. */
  objectId: string
  /** Project-relative POSIX path of the file the object was read from. */
  file: string
  /** Origin of the change. */
  context: ChangeContext
}

/** A single-field edit on one object. */
export interface FieldJournalRecord extends JournalRecordBase {
  kind: 'field'
  /** ModelObject field name being edited (e.g. 'description', 'hidden'). */
  field: string
  /** Pristine value from the model the journal is open against; never a prior edit. */
  old: unknown
  /** Latest value to apply. */
  new: unknown
}

/** An object deletion. */
export interface DeleteJournalRecord extends JournalRecordBase {
  kind: 'delete'
}

export type JournalRecord = FieldJournalRecord | DeleteJournalRecord

/**
 * A record as passed to `journalAdd`, before it receives its `recordId`.
 * Per-member Omit: a plain `Omit<JournalRecord, 'recordId'>` would collapse
 * the union to its common keys and lose `kind`.
 */
export type NewJournalRecord =
  | Omit<FieldJournalRecord, 'recordId'>
  | Omit<DeleteJournalRecord, 'recordId'>

/**
 * Append `rec` to `journal` and return the NEW journal (inputs untouched).
 *
 * Coalescing: a field record replaces the prior record with the same
 * {objectId, field} — `old` always stays the pristine model value and the
 * prior recordId is kept so the entry's identity is stable across re-edits.
 * A delete record dedupes on objectId. Unknown objectIds are tolerated;
 * `old` is then undefined.
 */
export function journalAdd(
  model: ModelObject[],
  journal: JournalRecord[],
  rec: NewJournalRecord,
): JournalRecord[] {
  if (rec.kind === 'delete') {
    if (journal.some(r => r.kind === 'delete' && r.objectId === rec.objectId)) {
      return [...journal]
    }
    return [...journal, { ...rec, recordId: crypto.randomUUID() }]
  }

  const target = model.find(o => o.id === rec.objectId)
  // Pristine value, looked up fresh every time so `old` survives re-edits.
  // Global WebCrypto exists in Node 19+ and every evergreen browser, so the
  // domain stays runtime-agnostic (AD-1).
  const old: unknown =
    target === undefined ? undefined : (target as unknown as Record<string, unknown>)[rec.field]

  const prior = journal.findIndex(
    r => r.kind === 'field' && r.objectId === rec.objectId && r.field === rec.field,
  )
  const record: FieldJournalRecord = {
    ...rec,
    old,
    recordId: prior >= 0 ? journal[prior].recordId : crypto.randomUUID(),
  }
  if (prior >= 0) {
    const next = journal.slice()
    next[prior] = record
    return next
  }
  return [...journal, record]
}

/**
 * Remove the record with `recordId` and return the NEW journal. `model` is
 * reserved for interface symmetry with `journalAdd`; discarding is a pure
 * journal operation.
 */
export function journalDiscard(
  _model: ModelObject[],
  journal: JournalRecord[],
  recordId: string,
): JournalRecord[] {
  return journal.filter(r => r.recordId !== recordId)
}

/**
 * The ONE pure fold (AD-4): apply the whole journal to the pristine model and
 * return a fresh read-model. Later field records win per {objectId, field};
 * delete records remove their objects (deletes win over edits of the same
 * object). Never mutates `model` or `journal`; unedited objects keep their
 * references, edited ones are shallow copies.
 */
export function project(model: ModelObject[], journal: JournalRecord[]): ModelObject[] {
  // Both collections are built dynamically from the journal, so Set/Map (not
  // Record) is the right shape here.
  const deletes = deletedIdsWithChildren(model, journal)
  const edits = new Map<string, Map<string, unknown>>() // objectId -> field -> value
  for (const rec of journal) {
    if (rec.kind !== 'delete') {
      let byField = edits.get(rec.objectId)
      if (byField === undefined) {
        byField = new Map()
        edits.set(rec.objectId, byField)
      }
      byField.set(rec.field, rec.new) // later records win
    }
  }

  return model
    .filter(o => !deletes.has(o.id))
    .map(o => {
      const byField = edits.get(o.id)
      if (byField === undefined) return o
      const copy: ModelObject = { ...o }
      const target = copy as unknown as Record<string, unknown>
      for (const [field, value] of byField) target[field] = value
      return copy
    })
}

/**
 * The journal's delete set EXPANDED with the fold-cascade rule: a deleted
 * table-classified object takes its children with it (columns, calculated
 * columns, measures, hierarchies, calc items — matched by pristine parent
 * name). Shared by `project` (the read-model fold) and the write planner's
 * delete guard so both agree on WHO dies in a save — a table-only delete
 * must strand-guard its children's dependents exactly as if the user had
 * staged them.
 */
export function deletedIdsWithChildren(model: ModelObject[], journal: JournalRecord[]): Set<string> {
  const deletes = new Set<string>()
  for (const rec of journal) {
    if (rec.kind === 'delete') deletes.add(rec.objectId)
  }
  const deletedTableNames = new Set(
    model
      .filter((o) => deletes.has(o.id) && (o.type === 'table' || o.type === 'calculationGroup' || o.type === 'fieldParameter'))
      .map((o) => o.name),
  )
  if (deletedTableNames.size > 0) {
    for (const o of model) {
      if (o.table !== '' && deletedTableNames.has(o.table)) deletes.add(o.id)
    }
  }
  return deletes
}
