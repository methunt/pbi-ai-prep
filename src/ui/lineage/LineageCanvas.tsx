// LineageCanvas (FR-19/FR-20/FR-21) — the Relationships surface: a draggable,
// pan/zoom table graph with an elkjs auto-layout and a focus inspector.
//
// Nodes are tables (FR-19: "tables as nodes ... nodes COLLAPSED by default; a
// table node can expand to show its columns"), collapsed by default and
// expandable to their member objects. Elk lays the initial positions; the user
// can then drag ANY node (the explicit product requirement) and ReactFlow keeps
// those positions. Edges are table-level: relationship edges (grouped from a
// TMDL relationship's two endpoint columns) and dependency edges (collapsed
// from object-level measure/calc/field-param edges). Active vs inactive is rendered
// as lit+solid vs dashed+muted (see edgeStyle) — the parsed TMDL relationship
// carries no `isActive` flag, so an edge is "active" when it lies on the current
// focus's on-path tables (see the report for this interpretation).
//
// Off-path dimming (FR-20) is driven by graph.isolateTo via LineageNode/SidePanel
// reading the store; the canvas only centres on the focused object. FR-21
// round-trip: the grid's lineage button calls store.openOnCanvas; the side
// panel's "Select & return to grid" calls store.editOnGrid.
//
// restore-last-view: the canvas stays mounted (panels are hidden, not unmounted,
// in App.tsx), so node positions / viewport / expansion persist across tab
// switches. `fitView` runs exactly once per project, when the tab first becomes
// active — never on re-entry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
} from '@xyflow/react'
import ELK from 'elkjs/lib/elk.bundled.js'
import { ArrowLeft, RotateCcw } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { useStore } from '../../state/store'
import type { EdgeKind } from '../../domain/graph'
import type { ModelObject, ObjectType } from '../../domain/objects'
import LineageNode, { type LineageNodeType, type LineageRow } from './LineageNode'
import SidePanel from './SidePanel'

const NODE_W = 200
const NODE_H = 92
const elk = new ELK()

interface LineageEdgeData {
  kind: 'relationship' | 'dependency'
  active: boolean
  [key: string]: unknown
}
type LineageEdgeType = Edge<LineageEdgeData>

interface TableGroup {
  key: string
  tableName: string
  kind: ObjectType
  tableObjectId?: string
  objects: LineageRow[]
}

interface Lineage {
  baseNodes: LineageNodeType[]
  baseEdges: LineageEdgeType[]
  objectToNodeId: Map<string, string>
  groups: TableGroup[]
}

function tableKeyFor(o: ModelObject): string | undefined {
  if (o.type === 'table' || o.type === 'calculationGroup' || o.type === 'fieldParameter') {
    return `table:${o.name}`
  }
  if (o.table) return `table:${o.table}`
  return undefined
}

function buildLineage(objects: ModelObject[], edgesRaw: readonly { from: string; to: string; kind: EdgeKind }[]): Lineage {
  const groups = new Map<string, TableGroup>()
  const tableObjs = new Map<string, ModelObject>()
  for (const o of objects) {
    if (o.type === 'table' || o.type === 'calculationGroup' || o.type === 'fieldParameter') {
      tableObjs.set(o.name, o)
    }
  }
  for (const o of objects) {
    const isTableObj =
      o.type === 'table' || o.type === 'calculationGroup' || o.type === 'fieldParameter'
    if (isTableObj) {
      const key = `table:${o.name}`
      if (!groups.has(key)) {
        groups.set(key, { key, tableName: o.name, kind: o.type, tableObjectId: o.id, objects: [] })
      }
      continue
    }
    if (o.type === 'daxFunction') continue
    if (!o.table) continue
    const key = `table:${o.table}`
    let g = groups.get(key)
    if (!g) {
      const tobj = tableObjs.get(o.table)
      g = {
        key,
        tableName: o.table,
        kind: tobj?.type ?? 'table',
        tableObjectId: tobj?.id,
        objects: [],
      }
      groups.set(key, g)
    }
    g.objects.push({ id: o.id, name: o.name, type: o.type, dax: o.dax })
  }

  const list = [...groups.values()].sort((a, b) => a.tableName.localeCompare(b.tableName))
  for (const g of list) g.objects.sort((a, b) => a.name.localeCompare(b.name))

  const objectToNodeId = new Map<string, string>()
  for (const o of objects) {
    const k = tableKeyFor(o)
    if (k) objectToNodeId.set(o.id, k)
  }

  // Base nodes (positions filled by elk later).
  const baseNodes: LineageNodeType[] = list.map((g) => ({
    id: g.key,
    type: 'lineage',
    position: { x: 0, y: 0 },
    data: {
      kind: g.kind,
      name: g.tableName,
      tableObjectId: g.tableObjectId,
      memberCount: g.objects.length,
      objects: g.objects,
      expanded: false,
    },
  }))

  // Base edges: relationships grouped by minted relationship id, dependency edges
  // collapsed per table pair.
  const baseEdges: LineageEdgeType[] = []
  const seenDependency = new Set<string>()
  const seenRelationship = new Set<string>()
  const addEdge = (
    source: string,
    target: string,
    kind: 'relationship' | 'dependency',
    seen: Set<string>,
  ): void => {
    if (!source || !target || source === target) return
    const id = `${source}\u0000${target}\u0000${kind}`
    if (seen.has(id)) return
    seen.add(id)
    baseEdges.push({
      id: `${source}->${target}:${kind}`,
      source,
      target,
      type: 'straight',
      data: { kind, active: true },
    })
  }

  const relGroups = new Map<string, string[]>()
  for (const e of edgesRaw) {
    if (e.kind !== 'relationship') continue
    const arr = relGroups.get(e.from) ?? []
    arr.push(e.to)
    relGroups.set(e.from, arr)
  }
  for (const tos of relGroups.values()) {
    const tables = new Set<string>()
    for (const to of tos) {
      const key = objectToNodeId.get(to)
      if (key) tables.add(key)
    }
    const [a, b] = [...tables]
    if (a && b && a !== b) addEdge(a, b, 'relationship', seenRelationship)
  }

  for (const e of edgesRaw) {
    if (e.kind === 'relationship') continue
    const fromTable = objectToNodeId.get(e.from) // dependent table (displayed right)
    const toTable = objectToNodeId.get(e.to) // depended-on table (displayed left)
    if (!fromTable || !toTable || fromTable === toTable) continue
    // Display a left→right stream: depended-on (source) → dependent (target).
    addEdge(toTable, fromTable, 'dependency', seenDependency)
  }

  return { baseNodes, baseEdges, objectToNodeId, groups: list }
}

async function runElkLayout(nodes: LineageNodeType[], edges: LineageEdgeType[]): Promise<LineageNodeType[]> {
  if (nodes.length === 0) return []
  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.considerModelOrder': 'false',
    },
    children: nodes.map((n) => ({ id: n.id, width: NODE_W, height: NODE_H })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  }
  const layout = await elk.layout(graph)
  const pos = new Map<string, { x: number; y: number }>()
  for (const c of layout.children ?? []) pos.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 })
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } }))
}

function edgeStyle(kind: 'relationship' | 'dependency', active: boolean): Record<string, string> {
  if (kind === 'relationship') {
    return active
      ? { stroke: 'var(--color-primary)', strokeWidth: '1.8' }
      : { stroke: 'var(--color-border)', strokeWidth: '1.4', strokeDasharray: '4 3', opacity: '0.5' }
  }
  return active
    ? { stroke: 'var(--color-emerald)', strokeWidth: '1.2', opacity: '0.85' }
    : { stroke: 'var(--color-border)', strokeWidth: '1.1', strokeDasharray: '3 3', opacity: '0.4' }
}

function edgeMarker(kind: 'relationship' | 'dependency', active: boolean) {
  const color = active
    ? kind === 'relationship'
      ? 'var(--color-primary)'
      : 'var(--color-emerald)'
    : 'var(--color-border)'
  return { type: MarkerType.ArrowClosed, width: 14, height: 14, color }
}

const nodeTypes = { lineage: LineageNode }

function useOnPathTables(focusId: string | null, graph: { isolateTo(id: string): { inPath: Set<string> } }, objectToNodeId: Map<string, string>): Set<string> | null {
  return useMemo(() => {
    if (!focusId) return null
    const iso = graph.isolateTo(focusId)
    const set = new Set<string>()
    for (const id of iso.inPath) {
      const k = objectToNodeId.get(id)
      if (k) set.add(k)
    }
    return set
  }, [focusId, graph, objectToNodeId])
}

function LineageInner() {
  const project = useStore((s) => s.project)
  const graph = useStore((s) => s.graph)
  const activeTab = useStore((s) => s.activeTab)
  const lineageFocusId = useStore((s) => s.lineageFocusId)
  const lineageFocusNonce = useStore((s) => s.lineageFocusNonce)
  const focusLineage = useStore((s) => s.focusLineage)
  const setActiveTab = useStore((s) => s.setActiveTab)

  const reactFlow = useReactFlow<LineageNodeType, LineageEdgeType>()
  const [nodes, setNodes, onNodesChange] = useNodesState<LineageNodeType>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<LineageEdgeType>([])
  const [layoutReady, setLayoutReady] = useState(false)
  const didInitialFit = useRef(false)

  const lineage = useMemo<Lineage>(
    () => buildLineage(project.objects, project.edges),
    [project.objects, project.edges],
  )

  // Elk auto-layout once per project; positions thereafter belong to the user (drag).
  useEffect(() => {
    let cancelled = false
    setLayoutReady(false)
    if (lineage.baseNodes.length === 0) {
      setNodes([])
      setEdges([])
      setLayoutReady(true)
      didInitialFit.current = false
      return
    }
    void (async () => {
      const positioned = await runElkLayout(lineage.baseNodes, lineage.baseEdges)
      if (cancelled) return
      setNodes(positioned)
      setEdges(lineage.baseEdges)
      setLayoutReady(true)
      didInitialFit.current = false
    })()
    return () => {
      cancelled = true
    }
  }, [lineage])

  // Edge active/inactive styling on focus change and after layout.
  const onPathTables = useOnPathTables(lineageFocusId, graph, lineage.objectToNodeId)
  useEffect(() => {
    setEdges((prev) =>
      prev.map((e) => {
        const active =
          onPathTables === null || (onPathTables.has(e.source) && onPathTables.has(e.target))
        const kind = e.data?.kind ?? 'dependency'
        return { ...e, data: { kind, active }, style: edgeStyle(kind, active), markerEnd: edgeMarker(kind, active) }
      }),
    )
  }, [onPathTables, lineage, setEdges])

  // fitView exactly once per project, once the rel tab is visible.
  useEffect(() => {
    if (!layoutReady || activeTab !== 'rel' || didInitialFit.current || nodes.length === 0) return
    didInitialFit.current = true
    requestAnimationFrame(() => reactFlow.fitView({ padding: 0.15, duration: 300 }))
  }, [layoutReady, activeTab, nodes.length, reactFlow])

  // FR-21 centre the focused object's table (auto-expanding it) on focus actions.
  useEffect(() => {
    if (!layoutReady || activeTab !== 'rel') return
    if (!lineageFocusId) return
    const nodeId = lineage.objectToNodeId.get(lineageFocusId)
    if (!nodeId) return
    let node = reactFlow.getNode(nodeId)
    if (!node) return
    if (!node.data.expanded) {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, expanded: true } } : n)),
      )
      node = { ...node, data: { ...node.data, expanded: true } }
    }
    const { x, y } = node.position
    const w = node.measured?.width ?? NODE_W
    const h = node.measured?.height ?? NODE_H
    reactFlow.setCenter(x + w / 2, y + h / 2, { zoom: 0.85, duration: 300 })
  }, [lineageFocusNonce, lineageFocusId, layoutReady, activeTab, lineage, reactFlow, setNodes])

  // AD-11: the expand header toggles a table; a member row focuses an object.
  const onNodeClick = useCallback<NodeMouseHandler<LineageNodeType>>(
    (event, node) => {
      const target = event.target as HTMLElement
      const rowEl = target.closest<HTMLElement>('[data-nodefocus]')
      if (rowEl) {
        const id = rowEl.getAttribute('data-nodefocus')
        if (id) focusLineage(id)
        return
      }
      if (target.closest('[data-expand-toggle]')) {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === node.id ? { ...n, data: { ...n.data, expanded: !n.data.expanded } } : n,
          ),
        )
      }
    },
    [focusLineage, setNodes],
  )

  const resetView = useCallback(() => {
    reactFlow.fitView({ padding: 0.15, duration: 300 })
  }, [reactFlow])

  const focusObjName =
    lineageFocusId != null
      ? (project.objectsById[lineageFocusId]?.name ?? lineageFocusId)
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 px-4 pb-3">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setActiveTab('desc')}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
          Back to Description &amp; Update
        </button>
        <div className="chip !cursor-default">
          <span className="text-foreground/55">Focused</span>
          <span className="mono max-w-[220px] truncate font-semibold text-foreground">
            {focusObjName ?? '—'}
          </span>
        </div>
        <button type="button" className="chip" onClick={resetView}>
          <RotateCcw className="h-3 w-3" strokeWidth={2.2} aria-hidden="true" />
          Reset view
        </button>
        <span className="ml-auto text-[11.5px] text-foreground/55">
          Table-level · upstream + downstream · drag any node
        </span>
      </div>

      <div className="mx-4 mb-3 grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_290px] gap-3">
        <div className="card lnode-dots relative min-h-0 overflow-hidden">
          {lineage.baseNodes.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-[13px] text-foreground/55">
              No tables loaded — open a project to see the model's lineage.
            </div>
          ) : (
            <ReactFlow<LineageNodeType, LineageEdgeType>
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView={false}
              minZoom={0.15}
              maxZoom={2.5}
              panOnScroll
              panOnDrag
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable
              defaultEdgeOptions={{ type: 'straight' }}
              className="!bg-transparent"
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--color-border)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          )}
        </div>
        <SidePanel />
      </div>
    </div>
  )
}

export default function LineageCanvas() {
  return (
    <ReactFlowProvider>
      <LineageInner />
    </ReactFlowProvider>
  )
}
