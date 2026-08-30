// Sortable header row for the Object grid (FR-10 / AD-11). Each sortable
// column header is a focusable tab stop; Enter/Space and click both toggle the
// sort direction. `aria-sort` announces the current order to assistive tech.
import type { KeyboardEvent } from 'react'
import type { SortSpec } from '../../state/store'
import { COLUMNS, type ColId } from './columns'

export interface HeadingProps {
  sort: SortSpec | null
  /** Toggles asc/desc on the given column (resets page in the parent). */
  onSort: (key: ColId) => void
}

const ARIA_SORT: Record<string, 'ascending' | 'descending' | 'none'> = {
  asc: 'ascending',
  desc: 'descending',
  none: 'none',
}

export default function Heading({ sort, onSort }: HeadingProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, key: ColId) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSort(key)
  }

  return (
    <div className="grid-row grid-head" role="row">
      {COLUMNS.map((col) => {
        if (!col.sortable) {
          return (
            <div
              key={col.id}
              role="columnheader"
              aria-label={col.id === 'checkbox' ? 'Select row' : 'Open in Lineage'}
              className="grid-head-cell"
            >
              {col.label}
            </div>
          )
        }
        const isSorted = sort?.key === col.id
        const dir = isSorted ? sort.dir : null
        return (
          <div
            key={col.id}
            role="columnheader"
            tabIndex={0}
            data-sort={col.id}
            aria-sort={ARIA_SORT[dir ?? 'none']}
            className={`grid-head-cell${isSorted ? ' sorted' : ''}`}
            onClick={() => onSort(col.id)}
            onKeyDown={(e) => onKeyDown(e, col.id)}
          >
            {col.label}
            <span className="sarr" aria-hidden="true">
              {isSorted ? (dir === 'desc' ? '▼' : '▲') : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
