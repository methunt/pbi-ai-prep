// SidePanel (FR-20/FR-21) — the focus inspector beside the lineage canvas.
//
// Shows, for the focused object: its kind + used count, the downstream
// dependents (direct / transitive / leaf+visuals), the upstream feeders
// (rel keys / transitive), its DAX and the references it draws on, and its
// description. The footer "Select & return to grid" (FR-21) opens the grid
// narrowed + scrolled to the focused object via the store's editOnGrid.
//
// The listed dependents/feeders come straight from the graph (usage,
// dependents, isolateTo) — names resolve through the folded model; ids that
// are not model objects (PBIR visual / TMDL relationship feeder-mints) are
// rendered as a "visual"/"rel" chip. Token-bound only (blue family).

import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useStore } from '../../state/store'
import type { ModelObject, ObjectType } from '../../domain/objects'
import { TYPE_META } from '../grid/typeMeta'
import { isTableLikeType } from '../grid/cellUtils'

const NAME_OF = (id: string, objectsById: Record<string, ModelObject>): string =>
  objectsById[id]?.name ?? id

const PILL: Partial<Record<ObjectType, string>> = {
  table: 't-slate',
  column: 't-blue',
  measure: 't-emerald',
  calculatedColumn: 't-sky',
  calculationItem: 't-cyan',
  calculationGroup: 't-cyan',
  hierarchy: 't-cyan',
  hierarchyLevel: 't-cyan',
  fieldParameter: 't-amber',
}

interface Sections {
  focusObj: ModelObject | undefined
  total: number
  direct: { id: string; name: string; type: string }[]
  transitive: { id: string; name: string; type: string }[]
  leafVisuals: number
  minted: { id: string; name: string }[]
  upstreamDirect: { id: string; name: string }[]
  upstreamTransitive: { id: string; name: string }[]
}

function useSections(focusId: string | null): Sections | null {
  const graph = useStore((s) => s.graph)
  const objectsById = useStore((s) => s.project.objectsById)
  return useMemo<Sections | null>(() => {
    if (!focusId) return null
    const iso = graph.isolateTo(focusId)
    const usage = graph.usage(focusId)
    const focusObj = objectsById[focusId]

    // Downstream: 1-hop dependents, then dist>=2 via BFS over `dependents`.
    const directIds = [...graph.dependents(focusId)].filter(
      (x) => x !== focusId && x !== '',
    )
    const seen = new Set<string>([focusId, ...directIds])
    const transitiveIds: string[] = []
    let frontier = directIds
    while (frontier.length > 0) {
      const next: string[] = []
      for (const n of frontier) {
        for (const c of graph.dependents(n)) {
          if (c === focusId || seen.has(c)) continue
          seen.add(c)
          transitiveIds.push(c)
          next.push(c)
        }
      }
      frontier = next
    }

    const downstream = new Set([...directIds, ...transitiveIds])
    const upstreamIds: string[] = []
    for (const x of iso.inPath) {
      if (x === focusId || downstream.has(x)) continue
      upstreamIds.push(x)
    }
    const upstreamDirect: { id: string; name: string }[] = []
    const upstreamTransitive: { id: string; name: string }[] = []
    for (const x of upstreamIds) {
      const entry = { id: x, name: NAME_OF(x, objectsById) }
      if (graph.dependents(x).has(focusId)) upstreamDirect.push(entry)
      else upstreamTransitive.push(entry)
    }

    const direct = directIds.map((id) => ({
      id,
      name: NAME_OF(id, objectsById),
      type: objectsById[id] ? 'model' : 'minted',
    }))
    const transitive = transitiveIds.map((id) => ({
      id,
      name: NAME_OF(id, objectsById),
      type: objectsById[id] ? 'model' : 'minted',
    }))
    const minted = [...direct, ...transitive].filter((r) => r.type === 'minted')

    return {
      focusObj,
      total: usage.total,
      direct: direct.filter((r) => r.type === 'model'),
      transitive: transitive.filter((r) => r.type === 'model'),
      leafVisuals: usage.leaf,
      minted,
      upstreamDirect,
      upstreamTransitive,
    }
  }, [focusId, graph, objectsById])
}

export default function SidePanel() {
  const focusId = useStore((s) => s.lineageFocusId)
  const editOnGrid = useStore((s) => s.editOnGrid)
  const focusLineage = useStore((s) => s.focusLineage)
  const sections = useSections(focusId)

  if (!sections) {
    return (
      <div className="card flex flex-col min-h-0 overflow-hidden">
        <div className="flex flex-1 items-center justify-center p-5 text-center text-[12px] text-foreground/55">
          Select a column or measure on the canvas to inspect its lineage.
        </div>
      </div>
    )
  }

  const { focusObj, total, direct, transitive, leafVisuals, minted, upstreamDirect, upstreamTransitive } = sections
  const kind = focusObj?.type
  const name = focusObj?.name ?? focusId ?? ''
  const refs = [...upstreamDirect, ...upstreamTransitive]

  return (
    <div className="card flex flex-col min-h-0 overflow-hidden">
      <div className="border-b border-border px-3.5 py-3">
        <div className="lbl mb-1.5">Selected</div>
        <div className="mono text-[13px] font-bold">{name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`pill pill-flat ${kind ? PILL[kind] ?? 't-slate' : 't-cyan'} !text-[10px]`}>
            {kind ? TYPE_META[kind].label : 'visual'}
          </span>
          <span className="pill pill-flat u6 !text-[10px]">
            {total === 0 ? 'Unused' : kind !== undefined && isTableLikeType(kind) ? 'Used' : `Used ${total}`}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-3.5">
        <div>
          <div className="lbl mb-2">Downstream · {total}</div>
          {direct.length === 0 && transitive.length === 0 && minted.length === 0 && (
            <div className="text-[11.5px] text-foreground/45">No dependents.</div>
          )}
          <div className="space-y-1.5">
            {direct.map((d) => (
              <DownstreamRow key={d.id} id={d.id} name={d.name} tag="direct" onFocus={focusLineage} />
            ))}
            {transitive.map((d) => (
              <DownstreamRow key={d.id} id={d.id} name={d.name} tag="transitive" onFocus={focusLineage} />
            ))}
            {minted.slice(0, 6).map((m) => (
              <DownstreamRow key={m.id} id={m.id} name={m.name} tag="leaf" onFocus={focusLineage} />
            ))}
          </div>
          {leafVisuals > 0 && (
            <div className="mt-1.5 text-[11px] text-foreground/55">
              + {leafVisuals} visual{leafVisuals === 1 ? '' : 's'} consume directly.
            </div>
          )}
        </div>

        <div>
          <div className="lbl mb-2">Upstream · {upstreamDirect.length + upstreamTransitive.length}</div>
          {refs.length === 0 && (
            <div className="text-[11.5px] text-foreground/45">No feeders.</div>
          )}
          <div className="space-y-1.5">
            {upstreamDirect.map((u) => (
              <UpstreamRow key={u.id} id={u.id} name={u.name} tag="rel key" onFocus={focusLineage} />
            ))}
            {upstreamTransitive.map((u) => (
              <UpstreamRow key={u.id} id={u.id} name={u.name} tag="transitive" onFocus={focusLineage} />
            ))}
          </div>
        </div>

        {focusObj?.dax && (
          <div>
            <div className="lbl mb-2">DAX</div>
            <pre className="mono max-h-[160px] overflow-auto rounded-lg border border-border bg-secondary/60 p-2.5 text-[11px] leading-relaxed">
              {focusObj.dax}
            </pre>
            {refs.length > 0 && (
              <div className="mt-2 text-[11.5px] text-foreground/60">
                <span className="text-foreground/45">References · </span>
                {refs.map((r, i) => (
                  <span key={r.id}>
                    <button
                      type="button"
                      className="mono hover:text-foreground"
                      onClick={() => focusLineage(r.id)}
                    >
                      {r.name}
                    </button>
                    {i < refs.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {focusObj?.description && (
          <div>
            <div className="lbl mb-2">Description</div>
            <p className="text-[12px] leading-relaxed text-foreground/60">{focusObj.description}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border px-3.5 py-3">
        <button
          type="button"
          className="btn btn-outline btn-sm w-full justify-center"
          onClick={() => editOnGrid(focusId ?? '')}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
          Select &amp; return to grid
        </button>
      </div>
    </div>
  )
}

function DownstreamRow({
  id,
  name,
  tag,
  onFocus,
}: {
  id: string
  name: string
  tag: 'direct' | 'transitive' | 'leaf'
  onFocus: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-1.5 h-1.5 flex-none rounded-full bg-emerald" aria-hidden="true" />
      <button type="button" className="mono min-w-0 truncate hover:text-foreground" onClick={() => onFocus(id)}>
        {name}
      </button>
      <span className="ml-auto flex-none text-[10.5px] text-foreground/45">{tag}</span>
    </div>
  )
}

function UpstreamRow({
  id,
  name,
  tag,
  onFocus,
}: {
  id: string
  name: string
  tag: string
  onFocus: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-1.5 h-1.5 flex-none rounded-full bg-primary" aria-hidden="true" />
      <button type="button" className="mono min-w-0 truncate hover:text-foreground" onClick={() => onFocus(id)}>
        {name}
      </button>
      <span className="ml-auto flex-none text-[10.5px] text-foreground/45">{tag}</span>
    </div>
  )
}
