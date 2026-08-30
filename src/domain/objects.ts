// Domain model objects and fidelity caps.
// Pure leaf (AD-1): imports only from domain/span.

import type { Span } from './span'

/** Kind of a model object (naming per architecture spine; calculated tables are `table`). */
export type ObjectType =
  | 'table'
  | 'column'
  | 'calculatedColumn'
  | 'measure'
  | 'hierarchy'
  | 'hierarchyLevel'
  | 'calculationGroup'
  | 'calculationItem'
  | 'fieldParameter'
  | 'daxFunction'

/** The source spans a reader records for one object (AD-3: declaration, name token, doc comment). */
export interface SourceSpans {
  declaration: Span
  name: Span
  docComment?: Span
}

/**
 * One parsed semantic-model object. `id` is its lineageTag or, when absent,
 * a surrogate minted once by the producing reader via `spanDerive` (AD-2) —
 * ids never re-key on rename.
 */
export interface ModelObject {
  id: string
  type: ObjectType
  name: string
  /** Parent table name; `''` for tables, functions, and dax. */
  table: string
  /** Project-relative POSIX path. */
  file: string
  /** Half-open byte range of the full declaration block, excluding the doc comment. */
  declarationSpan: Span
  docCommentSpan?: Span
  /** Name-token span inside the declaration; required for rename patching (AD-3). */
  nameSpan: Span
  dax?: string
  hidden: boolean
  isFieldParameter: boolean
  description?: string
  queryGroup?: string
  displayFolder?: string
  perspectiveMembership?: string[]
  /** Property-change markers Power BI wrote under the object (`changedProperty = IsHidden`), kept so writes cannot lose them. */
  changedProperty?: string[]
  ordinal?: number
}

/** Field fidelity caps (decoded characters / live counts) from the plan's global constraints. */
export const FIDELITY_CAPS = {
  description: 500,
  copilotCutoff: 200,
  customInstructions: 10000,
  synonyms: 20,
} as const
