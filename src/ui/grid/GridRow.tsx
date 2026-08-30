// One virtualised grid row (FR-9). Role/gridcell ARIA, fixed column order
// from columns.ts, hidden-object dimming, and per-cell edit staging wiring.
// Memoised (React.memo) because on scroll the virtualizer re-renders its item
// list; rows whose props (object, usage, edits, selection) are unchanged must
// skip re-rendering to hold the 16ms frame budget (FR-9).
import { memo } from 'react'
import type { MouseEvent } from 'react'
import { Network } from 'lucide-react'
import type { ModelObject } from '../../domain/objects'
import type { Usage } from '../../domain/graph'
import { TYPE_META } from './typeMeta'
import DescriptionCell, { type NavDir } from './DescriptionCell'
import RenameCell from './RenameCell'
import UsedCell from './UsedCell'
import Tooltip from './Tooltip'

export interface GridRowProps {
  obj: ModelObject
  /** Index within the current page rows (used for arrow-navigation). */
  rowIndex: number
  usage: Usage
  selected: boolean
  readOnly: boolean
  description: string
  renameTo: string
  descChanged: boolean
  renameChanged: boolean
  /** Current (pristine) object name — the Name column shows this, NOT the folded
   *  new value, so a pending (staged, unapplied) rename never mutates it. */
  displayName: string
  onCommitDescription: (obj: ModelObject, value: string) => void
  onCommitRename: (obj: ModelObject, value: string) => void
  onNavigate: (dir: NavDir) => void
  onToggleSelect: (id: string) => void
  onRowClick: (e: MouseEvent<HTMLDivElement>, rowIndex: number) => void
  /** FR-21: 'View on canvas' — focus this object on the lineage canvas and open the tab. */
  onOpenLineage: (id: string) => void
  /** FR-21: momentarily highlight the row after a canvas→grid round-trip. */
  flash: boolean
}

function GridRow({
  obj,
  rowIndex,
  usage,
  selected,
  readOnly,
  description,
  renameTo,
  descChanged,
  renameChanged,
  displayName,
  onCommitDescription,
  onCommitRename,
  onNavigate,
  onToggleSelect,
  onRowClick,
  onOpenLineage,
  flash,
}: GridRowProps) {
  const meta = TYPE_META[obj.type]
  const dax =
    meta.hasDax && typeof obj.dax === 'string' && obj.dax.trim() !== '' ? obj.dax : ''

  return (
    <div
      role="row"
      data-row={rowIndex}
      className={`grid-row${selected ? ' selected' : ''}${obj.hidden ? ' is-model-hidden' : ''}${flash ? ' grid-row-flash' : ''}`}
      onClick={(e) => onRowClick(e, rowIndex)}
    >
      <div role="gridcell" data-col="checkbox" className="grid-cell justify-center">
        <input
          type="checkbox"
          className="accent-primary h-3.5 w-3.5 align-middle"
          checked={selected}
          aria-label={`Select ${displayName}${obj.hidden ? ' (hidden)' : ''}`}
          onChange={() => onToggleSelect(obj.id)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div role="gridcell" data-col="lineage" className="grid-cell justify-center">
        <button
          type="button"
          className="hov btn btn-ghost !p-1"
          title="Open in Lineage"
          aria-label={`Open ${displayName} in Lineage`}
          onClick={(e) => {
            e.stopPropagation()
            onOpenLineage(obj.id)
          }}
        >
          <Network className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <div role="gridcell" data-col="type" className="grid-cell">
        <span className="type-cell">
          <span className={`type-dot ${meta.dot}`} aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      <div role="gridcell" data-col="table" className="grid-cell text-foreground/55">
        <span className="truncate" title={obj.table || undefined}>{obj.table || '—'}</span>
      </div>

      <div role="gridcell" data-col="name" className="grid-cell font-semibold">
        <span className="truncate" title={displayName}>{displayName}</span>
        {obj.hidden && <span className="pill t-slate !text-[9px] flex-none">hidden</span>}
      </div>

      <RenameCell
        value={renameTo}
        readOnly={readOnly}
        isChanged={renameChanged}
        onCommit={(v) => onCommitRename(obj, v)}
        onNavigate={onNavigate}
      />

      <div role="gridcell" data-col="used" className="grid-cell">
        <UsedCell usage={usage} total={usage.total} isTable={obj.type === 'table'} />
      </div>

      <DescriptionCell
        value={description}
        readOnly={readOnly}
        isChanged={descChanged}
        onCommit={(v) => onCommitDescription(obj, v)}
        onNavigate={onNavigate}
      />

      <div role="gridcell" data-col="dax" className="grid-cell mono text-[11.5px] text-foreground/55">
        {dax ? (
          <Tooltip
            className="min-w-0 flex-1"
            contentClassName="max-w-[560px] max-h-[360px] overflow-auto whitespace-pre-wrap px-3 py-2.5 text-left text-[11px] leading-relaxed"
            content={dax}
          >
            <span className="truncate cursor-help">{dax}</span>
          </Tooltip>
        ) : (
          <span>—</span>
        )}
      </div>
    </div>
  )
}

export default memo(GridRow)
