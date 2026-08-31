// FR-9 Used cell: total count pill with the hover split into direct /
// transitive / leaf. The UNUSED (0) state is the light-blue highlight; 1–5 is
// grey and 6+ is grey-strong (inverted emphasis, per the mockup).
//
// A table's `total` is a BOOLEAN roll-up (0 or 1 — "used if any child column/
// measure/etc. is used", never a sum of children's counts, per
// domain/graph.ts's table containment rule) — labeling it "Used 1" would
// read as a literal single-consumer count, which it isn't. Tables show a
// plain "Used" / "Unused" with no number.
import type { Usage } from '../../domain/graph'
import { isTableLikeType, usedClass, usedTooltip } from './cellUtils'
import Tooltip from './Tooltip'

export interface UsedCellProps {
  usage: Usage
  /** Distinct consumer count; `usage.total` is the canonical value. */
  total: number
  /** The object's type — table-classified kinds show "Used"/"Unused" with no number. */
  type: string
}

export default function UsedCell({ usage, total, type }: UsedCellProps) {
  const cls = usedClass(total)
  const label = total === 0 ? 'Unused' : isTableLikeType(type) ? 'Used' : `Used ${total}`
  return (
    <Tooltip
      content={usedTooltip(usage, total)}
      contentClassName="whitespace-pre-line px-3 py-2 text-[11.5px] leading-relaxed"
    >
      <span className={`pill pill-flat ${cls} mono tabular`}>{label}</span>
    </Tooltip>
  )
}
