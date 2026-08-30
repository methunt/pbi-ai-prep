// Shared object-type metadata for the Object grid: the human label shown in
// the Type column, the blue-family dot tint (Tailwind token utility, no
// hardcoded RGB), and whether the type carries a DAX expression (FR-9).
import type { ObjectType } from '../../domain/objects'

export interface TypeMeta {
  /** Human label shown in the Type cell (mockup `o.kind.t`). */
  label: string
  /** Tailwind bg-* utility for the 7px type dot (token-bound). */
  dot: string
  /** Whether objects of this type render a DAX expression (FR-9). */
  hasDax: boolean
}

export const TYPE_META: Record<ObjectType, TypeMeta> = {
  table: { label: 'Table', dot: 'bg-foreground/35', hasDax: false },
  column: { label: 'Column', dot: 'bg-primary', hasDax: false },
  calculatedColumn: { label: 'Calc col', dot: 'bg-sky', hasDax: true },
  measure: { label: 'Measure', dot: 'bg-emerald', hasDax: true },
  hierarchy: { label: 'Hierarchy', dot: 'bg-cyan', hasDax: false },
  hierarchyLevel: { label: 'Hier. level', dot: 'bg-cyan/70', hasDax: false },
  calculationGroup: { label: 'Calc group', dot: 'bg-cyan', hasDax: false },
  calculationItem: { label: 'Calc item', dot: 'bg-cyan', hasDax: true },
  fieldParameter: { label: 'Parameter', dot: 'bg-amber', hasDax: false },
  daxFunction: { label: 'DAX fn', dot: 'bg-sky/70', hasDax: false },
}
