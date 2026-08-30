// Small pure helpers shared by the Object grid cells. Kept free of React so
// they can be reused by tests and by the store-side selectors if needed.
import type { JournalRecord } from '../../domain/journal'
import type { Usage } from '../../domain/graph'
import { FIDELITY_CAPS } from '../../domain/objects'

/** The single-line display text for a cell: collapse runs of newlines to a `///` separator. */
export function collapseLines(value: string): string {
  return value.replace(/\n+/g, ' /// ')
}

/** First N chars of a description + an ellipsis if it was cut (display mode). */
export function clip(value: string, max = FIDELITY_CAPS.description): string {
  if (value.length <= max) return value
  return value.slice(0, max)
}

/** Whether `value` exceeds the Copilot-read cutoff (FR-11). */
export function overCopilotCutoff(value: string): boolean {
  return value.length > FIDELITY_CAPS.copilotCutoff
}

/** Latest journal value for `{objectId, field}`, or undefined when none staged. */
export function journalValueFor(
  journal: readonly JournalRecord[],
  objectId: string,
  field: string,
): unknown {
  for (let i = journal.length - 1; i >= 0; i--) {
    const r = journal[i]
    if (r.kind === 'field' && r.objectId === objectId && r.field === field) return r.new
  }
  return undefined
}

/** Whether any journal record stages `{objectId, field}` (a pending edit → cell changed). */
export function hasJournalEdit(
  journal: readonly JournalRecord[],
  objectId: string,
  field: string,
): boolean {
  return journal.some(r => r.kind === 'field' && r.objectId === objectId && r.field === field)
}

/** The folded description for an object, honouring the journal (AD-4). */
export function descriptionFor(o: { id: string; description?: string }, journal: readonly JournalRecord[]): string {
  const staged = journalValueFor(journal, o.id, 'description')
  return typeof staged === 'string' ? staged : o.description ?? ''
}

/** The staged rename-to value for an object, or `''` when nothing staged. */
export function renameToFor(o: { id: string }, journal: readonly JournalRecord[]): string {
  const staged = journalValueFor(journal, o.id, 'renameTo')
  return typeof staged === 'string' ? staged : ''
}

/** FR-9 used-pill class: 0 → light-blue highlight, 1–5 grey, 6+ grey strong. */
export function usedClass(total: number): string {
  if (total === 0) return 'u0'
  return total <= 5 ? 'u1' : 'u6'
}

/** The tooltip body for the Used cell (FR-9 hover split of direct/transitive/leaf). */
export function usedTooltip(usage: Usage, total: number): string {
  if (total === 0) return 'No downstream references of any kind'
  return `${total} dependents\ndirect ${usage.direct} · transitive ${usage.transitive} · leaf ${usage.leaf}`
}

/** Stable string form for sort-free equality (used by row key reconciliation). */
export function rowKey(o: { id: string; name: string }, index: number): string {
  return `${o.id}::${index}`
}
