// LineageNode (FR-19/FR-20) — one table rendered as a @xyflow/react node.
//
// The canvas is table-level (FR-19: "tables as nodes ... nodes COLLAPSED by
// default; a table node can expand to show its columns"). A collapsed card
// shows the table name + its kind pill + member count; expanding (via the
// header) lists the table's member objects, each a focusable row that selects
// it (FR-20). Dim/hot styling reads the store's `lineageFocusId` and the graph's
// isolateTo: a table is on-path when it (or any member object) lies on the
// focused object's dependency/consumer cone; everything off-path dims.
//
// AD-11: the expand header and each member row are real buttons; keyboard focus
// works through them. Token-bound only (no violet/purple).

import { memo, useMemo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { useStore } from '../../state/store'
import type { ObjectType } from '../../domain/objects'
import { TYPE_META } from '../grid/typeMeta'

export interface LineageRow {
  id: string
  name: string
  type: ObjectType
  dax?: string
}

export interface LineageNodeData {
  /** The group's table kind (table / calculationGroup / fieldParameter). */
  kind: ObjectType
  /** Table display name. */
  name: string
  /** The table/group object's own id (the focus when selecting the table itself). */
  tableObjectId?: string
  memberCount: number
  objects: LineageRow[]
  expanded: boolean
  [key: string]: unknown
}

export type LineageNodeType = Node<LineageNodeData>

/** Tone pill per kind (mockup `t-*`; token-bound, blue family only). */
export const KIND_PILL: Partial<Record<ObjectType, string>> = {
  table: 't-slate',
  calculationGroup: 't-cyan',
  fieldParameter: 't-amber',
  hierarchy: 't-cyan',
}

const ROW_PILL: Partial<Record<ObjectType, string>> = {
  column: 't-blue',
  measure: 't-emerald',
  calculatedColumn: 't-sky',
  calculationItem: 't-cyan',
  hierarchy: 't-cyan',
  hierarchyLevel: 't-cyan',
  fieldParameter: 't-amber',
}

function LineageNodeComponent({ data }: NodeProps<LineageNodeType>) {
  const focusId = useStore((s) => s.lineageFocusId)
  const graph = useStore((s) => s.graph)

  // On-path / off-path partition (FR-20). Reading the store here keeps node
  // positions and `expanded` untouched on every focus change (restore-view).
  const { dim, hot } = useMemo(() => {
    if (!focusId) return { dim: false, hot: false }
    const inPath = graph.isolateTo(focusId).inPath
    const selfOnPath =
      (data.tableObjectId !== undefined && inPath.has(data.tableObjectId)) ||
      data.objects.some((o) => inPath.has(o.id))
    const selfHot =
      (data.tableObjectId !== undefined && data.tableObjectId === focusId) ||
      data.objects.some((o) => o.id === focusId)
    return { dim: !selfOnPath, hot: selfHot }
  }, [focusId, graph, data])

  const pill = KIND_PILL[data.kind] ?? 't-slate'
  const kindLabel = TYPE_META[data.kind].label

  return (
    <div
      className={`lnode w-[200px] select-none p-2.5${hot ? ' hot' : ''}${dim ? ' dim' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <Handle type="source" position={Position.Right} className="!bg-primary" />

      <button
        type="button"
        data-expand-toggle
        aria-expanded={data.expanded}
        aria-label={`${data.expanded ? 'Collapse' : 'Expand'} ${data.name}`}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className="w-2 h-2 flex-none rounded-sm"
          style={{ background: `var(--color-${dotHue(data.kind)})` }}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-bold leading-tight">{data.name}</span>
          <span className="block text-[11px] mono text-foreground/55">
            {data.memberCount} object{data.memberCount === 1 ? '' : 's'}
          </span>
        </span>
        <span className="ml-auto">
          <span className={`pill pill-flat ${pill} !text-[10px]`}>{kindLabel}</span>
        </span>
      </button>

      {data.expanded && (
        <div className="mt-1.5 space-y-1 border-t border-border pt-1.5">
          {data.objects.length === 0 && (
            <div className="text-[11px] text-foreground/45">No member objects.</div>
          )}
          {data.objects.map((o) => {
            const onPath = focusId
              ? graph.isolateTo(focusId).inPath.has(o.id)
              : true
            const isFocus = o.id === focusId
            return (
              <button
                key={o.id}
                type="button"
                data-nodefocus={o.id}
                aria-label={`Select ${o.name}`}
                className={`flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left text-[11.5px] ${
                  isFocus
                    ? 'bg-primary/10 text-foreground'
                    : onPath
                      ? 'text-foreground/80'
                      : 'text-foreground/40'
                } ${isFocus ? 'hot' : ''}`}
              >
                <span className={`w-1.5 h-1.5 flex-none rounded-full ${TYPE_META[o.type].dot}`} aria-hidden="true" />
                <span className="min-w-0 truncate">{o.name}</span>
                <span className={`pill pill-flat ${ROW_PILL[o.type] ?? 't-slate'} !text-[9px] ml-auto`}>
                  {TYPE_META[o.type].label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function dotHue(kind: ObjectType): string {
  switch (kind) {
    case 'calculationGroup':
      return 'cyan'
    case 'fieldParameter':
      return 'amber'
    default:
      return 'primary'
  }
}

export default memo(LineageNodeComponent)
