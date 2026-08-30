// Pure LSDL helpers for the Prep-for-AI surface (Task 7.4).
//
// Maps model objects to their LSDL entities through the ONE shared resolver
// (AD-8) and computes the EFFECTIVE per-object AI state — visibility (reach)
// and synonyms — over the journal, exactly as the write-planner will write it:
//   - effectiveHidden reads the staged `lsdlVisibility` record, else the
//     entity's Visibility.Value, else INCLUDED (false).
//   - effectiveTerms reads the staged `synonyms` record, else the entity Terms.
// All state is READ-ONLY here; mutations are plain term-array transforms that
// the caller stages via journalAdd (the sanctioned fields only).

import type { LSDL, LSdlEntity, LSdlTerm } from '../../parse/lsdl-reader'
import type { ModelObject } from '../../domain/objects'
import type { JournalRecord, FieldJournalRecord } from '../../domain/journal'
import { buildNameIndex, resolveName } from '../../domain/identity'

/** The LSDL shape before the layer parses (empty culture, no metadata). */
export const EMPTY_LSDL: LSDL = {
  file: '',
  customInstructions: '',
  entities: {},
  relationships: null,
  agents: null,
  block: null,
  contentTypeLine: null,
  dangling: [],
}

/** Model-wide customInstructions record objectId (write-planner convention). */
export const INSTRUCTIONS_OBJECT_ID = ''

/** Prep-for-AI sub-tab ids (FR-38). */
export type AiSubTab = 'instr' | 'schema'

/** Live synonym cap (FR-16): non-tombstoned terms per object. */
export const SYNONYM_CAP = 20

/** Max chips shown inline before the '+N more' expander (FR-16). */
export const SYNONYM_INLINE_MAX = 6

/** One reachable AI-schema object plus its effective LSDL state. */
export interface AiObjectRow {
  obj: ModelObject
  entity: LSdlEntity | null
  /** true = Hidden / excluded from AI reach. */
  hidden: boolean
  /** Effective term list (journal overlay wins). */
  terms: LSdlTerm[]
}

/** Lowercased state label shown on a synonym chip (FR-16). */
export const TERM_STATE_LABEL: Record<string, string> = {
  Generated: 'GENERATED',
  Suggested: 'SUGGESTED',
  User: 'USER',
  Deleted: 'DELETED',
}

/** Dot-rule group key: table name for fields, the object's own name for tables. */
export function groupKeyOf(o: ModelObject): string {
  return o.table !== '' ? o.table : o.name
}

/**
 * objectId → the LSDL entity that binds it, resolved against `referenceObjects`
 * (the PRISTINE model so pending renames never break binding resolution). First
 * entity wins for a duplicated binding, matching buildBindingIndex.
 */
export function objectEntityIndex(
  lsdl: LSDL,
  referenceObjects: ModelObject[],
): Map<string, LSdlEntity> {
  const byObject = new Map<string, LSdlEntity>()
  if (lsdl.block === null) return byObject
  const index = buildNameIndex(referenceObjects)
  for (const entity of Object.values(lsdl.entities)) {
    if (!entity.binding) continue
    const id = resolveName(index, entity.binding)
    if (id !== undefined && !byObject.has(id)) byObject.set(id, entity)
  }
  return byObject
}

function journalField(
  journal: JournalRecord[],
  objectId: string,
  field: string,
): FieldJournalRecord | undefined {
  return journal.find(
    (r): r is FieldJournalRecord =>
      r.kind === 'field' && r.objectId === objectId && r.field === field,
  )
}

/** The staged `lsdlVisibility` boolean for an object, or undefined when unstaged. */
export function stagedHidden(journal: JournalRecord[], objectId: string): boolean | undefined {
  const rec = journalField(journal, objectId, 'lsdlVisibility')
  return rec !== undefined && typeof rec.new === 'boolean' ? rec.new : undefined
}

/** The staged `synonyms` array for an object, or undefined when unstaged. */
export function stagedSynonyms(journal: JournalRecord[], objectId: string): LSdlTerm[] | undefined {
  const rec = journalField(journal, objectId, 'synonyms')
  return rec !== undefined && Array.isArray(rec.new) ? (rec.new as LSdlTerm[]) : undefined
}

/** Effective hidden state: journal override → LSDL Visibility → INCLUDED. */
export function effectiveHidden(
  obj: ModelObject,
  entity: LSdlEntity | null,
  journal: JournalRecord[],
): boolean {
  const staged = stagedHidden(journal, obj.id)
  if (staged !== undefined) return staged
  if (entity?.visibility?.value === 'Hidden') return true
  return false
}

/** Effective terms: journal override → entity Terms → []. */
export function effectiveTerms(
  entity: LSdlEntity | null,
  journal: JournalRecord[],
  objectId: string,
): LSdlTerm[] {
  const staged = stagedSynonyms(journal, objectId)
  if (staged !== undefined) return staged
  return entity?.terms ?? []
}

/** Non-tombstoned terms — the ones that count toward the 20 cap. */
export function liveTerms(terms: LSdlTerm[]): LSdlTerm[] {
  return terms.filter((t) => t.state !== 'Deleted')
}

/**
 * Stage-compute adding a user term. `added` is false when refused: the name is
 * blank, already a live term, or the live cap (20) would be exceeded.
 */
export function addTerm(terms: LSdlTerm[], name: string): { terms: LSdlTerm[]; added: boolean } {
  const trimmed = name.trim()
  if (trimmed === '') return { terms, added: false }
  const live = liveTerms(terms)
  if (live.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
    return { terms, added: false }
  }
  if (live.length >= SYNONYM_CAP) return { terms, added: false }
  return { terms: [...terms, { name: trimmed, state: 'User' }], added: true }
}

/**
 * Stage-compute removing a term:
 *   - Generated / Suggested  → TOMBSTONED (State: Deleted, entry kept) — FR-16.
 *   - User                   → hard-removed from the array.
 *   - already Deleted        → no-op.
 */
export function removeTerm(terms: LSdlTerm[], name: string): LSdlTerm[] {
  const trimmed = name.trim()
  const index = terms.findIndex(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.state !== 'Deleted',
  )
  if (index === -1) return terms
  const target = terms[index]
  if (target.state === 'Generated' || target.state === 'Suggested') {
    const next = terms.slice()
    next[index] = { ...target, state: 'Deleted' }
    return next
  }
  return [...terms.slice(0, index), ...terms.slice(index + 1)]
}

/**
 * The full reachable row set: folded objects (pending deletes respected) with
 * their resolved entity + effective AI state. `referenceObjects` is the
 * pristine model used to resolve bindings.
 */
export function buildAiRows(
  lsdl: LSDL,
  foldedObjects: ModelObject[],
  referenceObjects: ModelObject[],
  journal: JournalRecord[],
): AiObjectRow[] {
  const entityIndex = objectEntityIndex(lsdl, referenceObjects)
  return foldedObjects
    .filter((o) => o.type !== 'daxFunction')
    .map((obj) => {
      const entity = entityIndex.get(obj.id) ?? null
      return {
        obj,
        entity,
        hidden: effectiveHidden(obj, entity, journal),
        terms: effectiveTerms(entity, journal, obj.id),
      }
    })
}
