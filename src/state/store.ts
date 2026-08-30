// Task 6.1 — the single Zustand store: the one UI-facing projection (AD-10).
//
// The store is the ONLY cross-surface owner: the loaded project (parse result
// + original texts + spans), the change journal, selection (ordered, unique,
// keyed by ModelObject.id — the lineageTag), filter/sort/pagination, per-layer
// parse state, KPI counts, and permission state. Component-local state is for
// non-shared display only (modal open, hover, local draft).
//
// Mutation footprint (AD-4): `journalAdd`/`journalDiscard` are the ONLY doors.
// They wrap the pure domain fold in ../domain/journal — they never set the
// journal array directly and never mutate a ModelObject. The `project` slice
// always holds the FOLDED read-model for the current journal; surfaces read it
// via a selector (never recompute the projection themselves).
//
// The graph is built over the PRISTINE model once (the graph is immutable;
// journal records never alter edges, AD-6), and `layers` transitions ready →
// stale when the journal changes so a lazy re-parse is requested only when a
// layer's data is actually outdated (AD-5/AD-7).

import { create } from 'zustand'
import type { ModelObject } from '../domain/objects'
import {
  journalAdd as domainJournalAdd,
  journalDiscard as domainJournalDiscard,
  project as projectModel,
  type JournalRecord,
  type NewJournalRecord,
} from '../domain/journal'
import { buildGraph, type Edge, type ObjectGraph } from '../domain/graph'

/** Whether the current folder permission allows writes (FR-34). */
export type Permission = 'granted' | 'denied' | 'prompt' | 'unknown'

/** Status-only layer parse state (AD-7). */
export type ParseState = 'idle' | 'parsing' | 'ready' | 'error' | 'stale'

export type LayerName = 'lsdl' | 'report' | 'lineage'

export interface LayerState {
  parseState: ParseState
  data?: unknown
}

export type LayerMap = Record<LayerName, LayerState>

/** One loaded file's original text and the spans the readers recorded into it. */
export interface FileRecord {
  text: string
  spans: unknown
}

/** The folded read-model the surfaces read: the loaded project + the journal applied. */
export interface ProjectResult {
  objectsById: Record<string, ModelObject>
  objects: ModelObject[]
  files: Record<string, FileRecord>
  name: string
}

export interface SortSpec {
  key: string
  dir: 'asc' | 'desc'
}

export interface Filters {
  query: string
  type: string | null
  table: string | null
  noDescription: boolean
  unused: boolean
  sort: SortSpec | null
  page: number
  pageSize: number
}

/**
 * KPI counts for the Description tab (FR-37) plus the AI-reach proxy, all
 * recomputed from the folded model + graph. `missingDescription` = the
 * "Backlog" card; `coverage` is the rounded share that already carry a
 * description; `aiReach` = expression-bearing objects a Copilot-style AI can
 * read today (the real LSDL-driven include-set lands with the AI-schema layer).
 */
export interface Kpi {
  total: number
  missingDescription: number
  unused: number
  pendingEdits: number
  coverage: number
  aiReach: number
}

export interface SetProjectPayload {
  objects: ModelObject[]
  files: Record<string, FileRecord>
  name: string
  edges?: readonly Edge[]
}

export interface StoreState {
  project: ProjectResult
  journal: JournalRecord[]
  selectedIds: string[]
  filters: Filters
  layers: LayerMap
  kpi: Kpi
  permission: Permission
  /** Pristine model behind the folded projection (AD-4). Surface read-only. */
  pristine: ModelObject[]
  /** Immutable dependency graph over the pristine model (AD-6). Surface read-only. */
  graph: ObjectGraph

  /** Load/replace a parsed project; resets the journal and rebuilds the graph. */
  setProject(payload: SetProjectPayload): void
  /** The ONLY mutation door for a field edit or delete (wraps the domain fold). */
  journalAdd(rec: NewJournalRecord): void
  /** The ONLY mutation door to discard a staged change (wraps the domain fold). */
  journalDiscard(recordId: string): void
  setFilter(partial: Partial<Omit<Filters, 'page' | 'sort'>>): void
  setSort(sort: SortSpec | null): void
  setPage(page: number): void
  toggleSelect(id: string): void
  shiftSelectRange(ids: readonly string[]): void
  selectAllMatching(ids: readonly string[]): void
  clearSelection(): void
  outsideFilterCount(): number
  /** Idempotent: re-applying the same parseState without new data is a no-op. */
  setLayerState(layer: LayerName, state: LayerState): void
  setPermission(permission: Permission): void
}

const EMPTY_FILES: Record<string, FileRecord> = {}
const INITIAL_FILTERS: Filters = {
  query: '',
  type: null,
  table: null,
  noDescription: false,
  unused: false,
  sort: null,
  page: 1,
  pageSize: 50,
}
const INITIAL_LAYERS: LayerMap = {
  lsdl: { parseState: 'idle' },
  report: { parseState: 'idle' },
  lineage: { parseState: 'idle' },
}
const INITIAL_KPI: Kpi = {
  total: 0,
  missingDescription: 0,
  unused: 0,
  pendingEdits: 0,
  coverage: 0,
  aiReach: 0,
}

function indexObjects(objects: ModelObject[]): Record<string, ModelObject> {
  const byId: Record<string, ModelObject> = {}
  for (const o of objects) byId[o.id] = o
  return byId
}

const hasDescription = (o: ModelObject): boolean =>
  typeof o.description === 'string' && o.description.trim() !== ''

function computeKpi(
  objects: ModelObject[],
  graph: ObjectGraph,
  journal: JournalRecord[],
): Kpi {
  let described = 0
  let unused = 0
  let aiReach = 0
  for (const o of objects) {
    if (hasDescription(o)) described++
    if (graph.usage(o.id).total === 0) unused++
    if (typeof o.dax === 'string' && o.dax.trim() !== '') aiReach++
  }
  const total = objects.length
  return {
    total,
    missingDescription: total - described,
    unused,
    pendingEdits: journal.length,
    coverage: total === 0 ? 0 : Math.round((described / total) * 100),
    aiReach,
  }
}

function matchesFilter(o: ModelObject, f: Filters, graph: ObjectGraph): boolean {
  if (f.type !== null && o.type !== f.type) return false
  if (f.table !== null && o.table !== f.table) return false
  if (f.noDescription && hasDescription(o)) return false
  if (f.unused && graph.usage(o.id).total > 0) return false
  const q = f.query.trim().toLowerCase()
  if (q !== '') {
    // 'search = lowercase substring over name+table+desc+DAX' (DESIGN Do's).
    const hay = [o.name, o.table, o.description ?? '', o.dax ?? '']
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  return true
}

/**
 * The grid's row projection: filter the folded model by the current filters
 * then sort by `filters.sort` (FR-10). Returns a NEW array — never mutates
 * `objects`. Pagination is applied downstream by the grid (slice of a page).
 * Sort keys mirror the mockup's `data-sort` values; `used` is numeric via the
 * graph, everything else compares case-insensitively. `Array.prototype.sort`
 * is stable (ES2019+), so ties keep the folded model's original order.
 */
export function deriveVisibleObjects(
  objects: ModelObject[],
  filters: Filters,
  graph: ObjectGraph,
  pristine: readonly ModelObject[] = objects,
): ModelObject[] {
  const filtered = objects.filter(o => matchesFilter(o, filters, graph))
  const sort = filters.sort
  if (!sort) return filtered
  const dir = sort.dir === 'desc' ? -1 : 1
  // The Name column renders the PRISTINE name (a pending rename is staged, not
  // applied), so the 'name' sort must order by that same display name (FR-9) —
  // not the folded `obj.name`, which can carry a pending rename and split-brain
  // the sort against what the cell renders.
  const pristineName = new Map<string, string>()
  for (const o of pristine) pristineName.set(o.id, o.name)
  return [...filtered].sort((a, b) => {
    let cmp: number
    switch (sort.key) {
      case 'used': {
        cmp = graph.usage(a.id).total - graph.usage(b.id).total
        break
      }
      case 'desc':
        cmp = (a.description ?? '').localeCompare(b.description ?? '')
        break
      case 'dax':
        cmp = (a.dax ?? '').localeCompare(b.dax ?? '')
        break
      case 'type':
        cmp = a.type.localeCompare(b.type)
        break
      case 'name': {
        cmp = (pristineName.get(a.id) ?? a.name).localeCompare(
          pristineName.get(b.id) ?? b.name,
        )
        break
      }
      default: {
        // 'table' (and any future string column) — table never changes on rename.
        const va = (a as unknown as Record<string, unknown>)[sort.key]
        const vb = (b as unknown as Record<string, unknown>)[sort.key]
        cmp = String(va ?? '').localeCompare(String(vb ?? ''))
      }
    }
    return cmp * dir
  })
}

function dedupeOrdered(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

/** A journal change invalidates delivered (ready) layer data → stale (AD-5). */
function staleReady(layers: LayerMap): LayerMap {
  const names = Object.keys(layers) as LayerName[]
  let changed = false
  const next: LayerMap = { ...layers }
  for (const layer of names) {
    if (next[layer].parseState === 'ready') {
      next[layer] = { ...next[layer], parseState: 'stale' }
      changed = true
    }
  }
  return changed ? next : layers
}

export const useStore = create<StoreState>()((set, get) => {
  /**
   * Re-fold the pristine model through the journal and refresh the projected
   * read-model (objects + objectsById) and KPI. Never mutates inputs; the only
   * place `journal` and the folded `project.objects` are written (AD-4).
   */
  const refold = (nextJournal: JournalRecord[]): void => {
    const { pristine, graph } = get()
    const objects = projectModel(pristine, nextJournal)
    set({
      journal: nextJournal,
      project: { ...get().project, objects, objectsById: indexObjects(objects) },
      kpi: computeKpi(objects, graph, nextJournal),
      layers: staleReady(get().layers),
    })
  }

  return {
    project: { objectsById: {}, objects: [], files: EMPTY_FILES, name: '' },
    journal: [],
    selectedIds: [],
    filters: INITIAL_FILTERS,
    layers: INITIAL_LAYERS,
    kpi: INITIAL_KPI,
    permission: 'unknown',
    pristine: [],
    graph: buildGraph([]),

    setProject({ objects, files, name, edges = [] }) {
      const graph = buildGraph(objects, edges)
      set({
        pristine: objects,
        graph,
        journal: [],
        project: { objectsById: indexObjects(objects), objects, files, name },
        kpi: computeKpi(objects, graph, []),
      })
    },

    journalAdd(rec) {
      refold(domainJournalAdd(get().pristine, get().journal, rec))
    },

    journalDiscard(recordId) {
      refold(domainJournalDiscard(get().pristine, get().journal, recordId))
    },

    setFilter(partial) {
      // Any filter change narrows the result set → reset to page 1.
      set({ filters: { ...get().filters, ...partial, page: 1 } })
    },

    setSort(sort) {
      set({ filters: { ...get().filters, sort } })
    },

    setPage(page) {
      set({ filters: { ...get().filters, page } })
    },

    toggleSelect(id) {
      const { selectedIds } = get()
      set({
        selectedIds: selectedIds.includes(id)
          ? selectedIds.filter(x => x !== id)
          : [...selectedIds, id],
      })
    },

    shiftSelectRange(ids) {
      set({ selectedIds: dedupeOrdered(ids) })
    },

    selectAllMatching(ids) {
      set({ selectedIds: dedupeOrdered(ids) })
    },

    clearSelection() {
      set({ selectedIds: [] })
    },

    outsideFilterCount() {
      const { selectedIds, project, filters, graph } = get()
      const visible = new Set(
        project.objects
          .filter(o => matchesFilter(o, filters, graph))
          .map(o => o.id),
      )
      let count = 0
      for (const id of selectedIds) if (!visible.has(id)) count++
      return count
    },

    setLayerState(layer, state) {
      const current = get().layers[layer]
      // Idempotent: re-applying the same parseState without new data is a no-op,
      // so a duplicate "parsing" trigger never fires an extra request.
      if (current.parseState === state.parseState && state.data === undefined) return
      set({ layers: { ...get().layers, [layer]: { ...current, ...state } } })
    },

    setPermission(permission) {
      set({ permission })
    },
  }
})
