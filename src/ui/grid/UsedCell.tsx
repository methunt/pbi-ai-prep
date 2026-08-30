// FR-9 Used cell: total count pill with the hover split into direct /
// transitive / leaf. The UNUSED (0) state is the light-blue highlight; 1–5 is
// grey and 6+ is grey-strong (inverted emphasis, per the mockup).
import type { Usage } from '../../domain/graph'
import { usedClass, usedTooltip } from './cellUtils'
import Tooltip from './Tooltip'

export interface UsedCellProps {
  usage: Usage
  /** Distinct consumer count; `usage.total` is the canonical value. */
  total: number
}

export default function UsedCell({ usage, total }: UsedCellProps) {
  const cls = usedClass(total)
  const label = total === 0 ? 'Unused' : `Used ${total}`
  return (
    <Tooltip
      content={usedTooltip(usage, total)}
      contentClassName="whitespace-pre-line px-3 py-2 text-[11.5px] leading-relaxed"
    >
      <span className={`pill pill-flat ${cls} mono tabular`}>{label}</span>
    </Tooltip>
  )
}
