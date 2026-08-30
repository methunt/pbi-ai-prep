// Bulk-rename planner (FR-32 + the FR-12 collision rule at scale).
// Pure leaf (AD-1): imports only from domain/objects; no browser, FS, or FSA.
//
// The rule order is binding (FR-32, mirrors the mockup's transform()):
//   1. find/replace        (whole-match, all occurrences)
//   2. strip prefix        (only when the name starts with it)
//   3. strip suffix        (only when the name ends with it)
//   4. underscores → spaces
//   5. Title Case
//   6. whitespace collapse + trim
//
// Collision (FR-12): a proposed name that DIFFERS from the current name AND
// would be shared with any other object in the SAME table after the whole batch
// is staged blocks apply. The collision set includes (a) a sibling whose folded
// name already is the proposal and that is not renamed away, (b) a co-selected
// object proposing the same destination, and (c) an unchanged selected sibling
// that keeps the proposal. Because all renames stage together, a sibling being
// renamed OFF the proposal does NOT count as a collision (otherwise every
// simultaneous swap would look blocked). Never mutates its inputs.

import type { ModelObject } from './objects'

export interface RenameRules {
  find: string
  replace: string
  stripPrefix: string
  stripSuffix: string
  underscoresToSpaces: boolean
  titleCase: boolean
}

export const DEFAULT_RENAME_RULES: RenameRules = {
  find: '',
  replace: '',
  stripPrefix: '',
  stripSuffix: '',
  underscoresToSpaces: false,
  titleCase: false,
}

export interface RenameProposal {
  objectId: string
  /** Object type (for the preview tone pill). */
  kind: ModelObject['type']
  /** Parent table name; `''` for tables/functions. */
  table: string
  /** The pristine base name the transform runs from (the Name-column display). */
  currentName: string
  /** The transformed name, or the same string when no rule alters it. */
  proposedName: string
  /** Whether the transform actually changes the name (no-op renames are never staged). */
  changed: boolean
  /** Current names of same-table objects that would share the final name (FR-12). */
  conflicts: string[]
}

export interface RenamePlan {
  rules: RenameRules
  proposals: RenameProposal[]
  /** How many selected objects collide (0 → apply is safe). */
  collisionCount: number
  hasCollisions: boolean
  /** How many selected objects the transform actually renames. */
  changedCount: number
  changedIds: string[]
  unchangedIds: string[]
}

/** Apply the rename rules in the stated order (see file doc). */
export function applyRenameRules(name: string, rules: RenameRules): string {
  let s = name
  if (rules.find) s = s.split(rules.find).join(rules.replace)
  if (rules.stripPrefix && s.startsWith(rules.stripPrefix)) {
    s = s.slice(rules.stripPrefix.length)
  }
  if (rules.stripSuffix && s.endsWith(rules.stripSuffix)) {
    s = s.slice(0, -rules.stripSuffix.length)
  }
  if (rules.underscoresToSpaces) s = s.replace(/_/g, ' ')
  if (rules.titleCase) s = s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Pure bulk-rename planner.
 * @param selected PRISTINE objects being renamed — their `.name` is the base the
 *   transform runs from and what the preview shows as the current name (FR-9:
 *   the Name column renders the pristine name, never a staged rename).
 * @param rules   The transform rules.
 * @param model   The folded read-model (`project.objects`): it carries any
 *   already-staged renames, so a sibling's effective name is its resolved name.
 *   Used ONLY for sibling-collision detection.
 * @returns A fresh plan. Never mutates `selected` or `model`.
 */
export function bulkRenamePlan(
  selected: readonly ModelObject[],
  rules: RenameRules,
  model: readonly ModelObject[],
): RenamePlan {
  const proposalMap = new Map<string, RenameProposal>()

  const raw: RenameProposal[] = selected.map((o) => {
    const proposedName = applyRenameRules(o.name, rules)
    const proposal: RenameProposal = {
      objectId: o.id,
      kind: o.type,
      table: o.table,
      currentName: o.name,
      proposedName,
      changed: proposedName !== o.name,
      conflicts: [],
    }
    proposalMap.set(o.id, proposal)
    return proposal
  })

  // Final name per object after the whole batch stages: a changed proposal wins
  // over its folded name; everything else keeps its folded name. Group by table
  // so we can detect any table that would end up with a duplicate.
  const finalName = (o: ModelObject): string => {
    const p = proposalMap.get(o.id)
    return p !== undefined && p.changed ? p.proposedName : o.name
  }
  const finalByTable = new Map<string, Map<string, string[]>>() // table -> name -> [sibling current names]
  for (const o of model) {
    const nm = finalName(o)
    let byName = finalByTable.get(o.table)
    if (byName === undefined) {
      byName = new Map()
      finalByTable.set(o.table, byName)
    }
    const holders = byName.get(nm)
    if (holders === undefined) byName.set(nm, [o.name])
    else holders.push(o.name)
  }

  for (const p of raw) {
    if (!p.changed) continue
    const holders = finalByTable.get(p.table)?.get(p.proposedName)
    if (holders !== undefined && holders.length > 1) {
      // Conflict: current names of the same-table objects that would share the
      // destination (this proposal's own current name is excluded by >1 count).
      p.conflicts = [...new Set(holders.filter((n) => n !== p.currentName))]
    }
  }

  const collisionCount = raw.filter((p) => p.conflicts.length > 0).length
  const changed = raw.filter((p) => p.changed)
  return {
    rules,
    proposals: raw,
    collisionCount,
    hasCollisions: collisionCount > 0,
    changedCount: changed.length,
    changedIds: changed.map((p) => p.objectId),
    unchangedIds: raw.filter((p) => !p.changed).map((p) => p.objectId),
  }
}
