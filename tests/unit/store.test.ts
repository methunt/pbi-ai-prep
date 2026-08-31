// Task 6.1 — single Zustand store unit tests.
// TDD: written before src/state/store.ts exists (RED), green after implementation.
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../src/state/store'
import type { ModelObject } from '../../src/domain/objects'
import type { NewJournalRecord } from '../../src/domain/journal'

const FILE = 'definition/tables/Sales.tmdl'

function makeColumn(id: string, name: string, description?: string): ModelObject {
  return {
    id,
    type: 'column',
    name,
    table: 'Sales',
    file: FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
    ...(description === undefined ? {} : { description }),
  }
}

function makeMeasure(
  id: string,
  name: string,
  description?: string,
  dax?: string,
): ModelObject {
  return {
    id,
    type: 'measure',
    name,
    table: 'Sales',
    file: FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
    ...(description === undefined ? {} : { description }),
    ...(dax === undefined ? {} : { dax }),
  }
}

const fieldEdit = (objectId: string, value: unknown): NewJournalRecord => ({
  kind: 'field',
  objectId,
  field: 'description',
  new: value,
  file: FILE,
  context: 'user',
})

const deleteEdit = (objectId: string): NewJournalRecord => ({
  kind: 'delete',
  objectId,
  file: FILE,
  context: 'user',
})

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  useStore.getState().setProject({
    objects: [
      makeColumn('c1', 'Amount', 'Sum of Amount'),
      makeColumn('c2', 'Quantity'),
      makeMeasure('m1', 'Total Profit', undefined, 'SUM(Sales[Amount])'),
    ],
    files: { [FILE]: { text: 'x', spans: {} } },
    name: 'demo',
    edges: [{ from: 'm1', to: 'c1', kind: 'measure' }],
  })
})

describe('selection semantics (FR-30)', () => {
  it('keeps selectedIds unchanged across setFilter and setPage', () => {
    useStore.getState().toggleSelect('c1')
    useStore.getState().toggleSelect('c2')
    const before = useStore.getState().selectedIds
    expect(before).toEqual(['c1', 'c2'])

    useStore.getState().setFilter({ query: 'Amount' })
    useStore.getState().setFilter({ type: 'column' })
    useStore.getState().setSort({ key: 'name', dir: 'desc' })
    useStore.getState().setPage(3)

    expect(useStore.getState().selectedIds).toEqual(['c1', 'c2'])
  })

  it('toggleSelect adds then removes, preserving order', () => {
    useStore.getState().toggleSelect('c2')
    useStore.getState().toggleSelect('c1')
    expect(useStore.getState().selectedIds).toEqual(['c2', 'c1'])
    useStore.getState().toggleSelect('c2')
    expect(useStore.getState().selectedIds).toEqual(['c1'])
  })

  it('shiftSelectRange replaces the selection with a deduped, ordered range', () => {
    useStore.getState().toggleSelect('c1')
    useStore.getState().shiftSelectRange(['c2', 'c1', 'c2', 'm1'])
    expect(useStore.getState().selectedIds).toEqual(['c2', 'c1', 'm1'])
  })

  it('selectAllMatching and clearSelection set/replace the selection', () => {
    useStore.getState().toggleSelect('c1')
    useStore.getState().selectAllMatching(['c2', 'm1', 'c2'])
    expect(useStore.getState().selectedIds).toEqual(['c2', 'm1'])
    useStore.getState().clearSelection()
    expect(useStore.getState().selectedIds).toEqual([])
  })

  it('outsideFilterCount counts selected ids not in the current filtered view', () => {
    useStore.getState().toggleSelect('c1')
    useStore.getState().toggleSelect('c2')
    useStore.getState().toggleSelect('m1')
    useStore.getState().setFilter({ query: 'Quantity' }) // only c2 matches name/table/desc/dax
    expect(useStore.getState().outsideFilterCount()).toBe(2) // c1 + m1 are outside
  })
})

describe('journal mutation doors (AD-4)', () => {
  it('leaves the journal untouched when non-journal state changes', () => {
    const beforeRef = useStore.getState().journal
    useStore.getState().setFilter({ query: 'x' })
    useStore.getState().setPage(2)
    useStore.getState().toggleSelect('c1')
    expect(useStore.getState().journal).toBe(beforeRef)
  })

  it('changes journal only through journalAdd/journalDiscard', () => {
    expect(useStore.getState().journal).toHaveLength(0)
    useStore.getState().journalAdd(fieldEdit('c1', 'Net revenue'))
    const afterAdd = useStore.getState().journal
    expect(afterAdd).toHaveLength(1)
    expect(afterAdd[0]).toMatchObject({ kind: 'field', objectId: 'c1', field: 'description' })

    useStore.getState().journalDiscard(afterAdd[0].recordId)
    expect(useStore.getState().journal).toHaveLength(0)
  })

  it('journalDiscardAll empties the journal in one fold', () => {
    useStore.getState().journalAdd(fieldEdit('c1', 'Net revenue'))
    useStore.getState().journalAdd(deleteEdit('c2'))
    expect(useStore.getState().journal).toHaveLength(2)
    useStore.getState().journalDiscardAll()
    expect(useStore.getState().journal).toHaveLength(0)
    expect(useStore.getState().kpi.pendingEdits).toBe(0)
    expect(useStore.getState().project.objects).toHaveLength(3)
  })

  it('applySaveCommit recomputes pendingEdits from the remaining journal', () => {
    useStore.getState().journalAdd(fieldEdit('c1', 'Net revenue'))
    expect(useStore.getState().kpi.pendingEdits).toBe(1)
    // The save commits the written file's edits (all of them here) — the
    // header chip + KPI card must read 0 immediately after.
    useStore.getState().applySaveCommit(
      { [FILE]: { text: 'x', spans: {} } },
      useStore.getState().pristine,
      [],
      useStore.getState().layers,
    )
    expect(useStore.getState().journal).toHaveLength(0)
    expect(useStore.getState().kpi.pendingEdits).toBe(0)
  })
})

describe('projection through the fold (AD-4)', () => {
  it('reflects a field edit in the folded model after journalAdd', () => {
    useStore.getState().journalAdd(fieldEdit('c1', 'Net revenue'))
    const obj = useStore.getState().project.objects.find(o => o.id === 'c1')
    expect(obj?.description).toBe('Net revenue')
    expect(useStore.getState().project.objectsById.c1?.description).toBe('Net revenue')
  })

  it('removes a deleted object from the folded model', () => {
    expect(useStore.getState().project.objects).toHaveLength(3)
    useStore.getState().journalAdd(deleteEdit('c1'))
    const objects = useStore.getState().project.objects
    expect(objects.some(o => o.id === 'c1')).toBe(false)
    expect(objects).toHaveLength(2)
    expect(useStore.getState().project.objectsById.c1).toBeUndefined()
  })

  it('recomputes KPI from the folded model and graph', () => {
    const k0 = useStore.getState().kpi
    expect(k0.total).toBe(3)
    expect(k0.missingDescription).toBe(2) // c2 and m1
    expect(k0.unused).toBe(2) // c2 + m1 (only m1→c1 edge exists)
    expect(k0.pendingEdits).toBe(0)
    expect(k0.coverage).toBe(33) // 1/3 described, rounded
    expect(k0.aiReach).toBe(1) // m1 carries a DAX expression

    useStore.getState().journalAdd(fieldEdit('c2', 'Now described'))
    const k1 = useStore.getState().kpi
    expect(k1.missingDescription).toBe(1)
    expect(k1.pendingEdits).toBe(1)
    expect(k1.coverage).toBe(67)

    useStore.getState().journalAdd(deleteEdit('c1'))
    expect(useStore.getState().kpi.total).toBe(2)
  })
})

describe('layer state machine (AD-7)', () => {
  it('transitions idle → parsing → ready with data', () => {
    expect(useStore.getState().layers.lsdl.parseState).toBe('idle')
    useStore.getState().setLayerState('lsdl', { parseState: 'parsing' })
    expect(useStore.getState().layers.lsdl.parseState).toBe('parsing')
    useStore.getState().setLayerState('lsdl', { parseState: 'ready', data: { rows: 3 } })
    expect(useStore.getState().layers.lsdl.parseState).toBe('ready')
    expect(useStore.getState().layers.lsdl.data).toEqual({ rows: 3 })
  })

  it('transitions idle → parsing → error', () => {
    useStore.getState().setLayerState('report', { parseState: 'parsing' })
    useStore.getState().setLayerState('report', { parseState: 'error', data: { message: 'failed' } })
    expect(useStore.getState().layers.report.parseState).toBe('error')
    expect(useStore.getState().layers.report.data).toEqual({ message: 'failed' })
  })

  it('marks a ready layer stale when the journal changes', () => {
    useStore.getState().setLayerState('lsdl', { parseState: 'ready', data: { rows: 1 } })
    expect(useStore.getState().layers.lsdl.parseState).toBe('ready')
    useStore.getState().journalAdd(fieldEdit('c2', 'Now described'))
    expect(useStore.getState().layers.lsdl.parseState).toBe('stale')
  })

  it('can move a layer to stale explicitly', () => {
    useStore.getState().setLayerState('lineage', { parseState: 'stale' })
    expect(useStore.getState().layers.lineage.parseState).toBe('stale')
  })

  it('is idempotent: re-applying the same parseState without data is a no-op', () => {
    useStore.getState().setLayerState('lsdl', { parseState: 'parsing' })
    const layers = useStore.getState().layers
    useStore.getState().setLayerState('lsdl', { parseState: 'parsing' })
    expect(useStore.getState().layers).toBe(layers)
  })
})

describe('permission', () => {
  it('updates via setPermission', () => {
    expect(useStore.getState().permission).toBe('unknown')
    useStore.getState().setPermission('granted')
    expect(useStore.getState().permission).toBe('granted')
  })
})

describe('tab + lineage/grid round-trip (FR-21)', () => {
  it('setActiveTab switches the active surface tab', () => {
    expect(useStore.getState().activeTab).toBe('desc')
    useStore.getState().setActiveTab('rel')
    expect(useStore.getState().activeTab).toBe('rel')
  })

  it('openOnCanvas focuses the object and opens the rel tab', () => {
    const nonce0 = useStore.getState().lineageFocusNonce
    useStore.getState().openOnCanvas('c1')
    const s = useStore.getState()
    expect(s.activeTab).toBe('rel')
    expect(s.lineageFocusId).toBe('c1')
    expect(s.lineageFocusNonce).toBe(nonce0 + 1)
  })

  it('focusLineage refocuses without changing the tab', () => {
    useStore.getState().setActiveTab('rel')
    const nonce0 = useStore.getState().lineageFocusNonce
    useStore.getState().focusLineage('m1')
    const s = useStore.getState()
    expect(s.activeTab).toBe('rel')
    expect(s.lineageFocusId).toBe('m1')
    expect(s.lineageFocusNonce).toBe(nonce0 + 1)
  })

  it('editOnGrid for a column narrows the grid to its table and focuses it', () => {
    const nonce0 = useStore.getState().gridFocusNonce
    useStore.getState().editOnGrid('c1')
    const s = useStore.getState()
    expect(s.activeTab).toBe('desc')
    expect(s.filters.table).toBe('Sales')
    expect(s.filters.type).toBeNull()
    expect(s.gridFocusId).toBe('c1')
    expect(s.gridFocusNonce).toBe(nonce0 + 1)
  })

  it('editOnGrid for a table object narrows the grid to its type', () => {
    useStore.setState((s) => ({
      ...s,
      project: { ...s.project, objectsById: { ...s.project.objectsById, tbl: { ...s.project.objectsById.c1, id: 'tbl', type: 'table', name: 'Sales', table: '' } } },
    }))
    useStore.getState().editOnGrid('tbl')
    const s = useStore.getState()
    expect(s.activeTab).toBe('desc')
    expect(s.filters.type).toBe('table')
    expect(s.filters.table).toBeNull()
    expect(s.gridFocusId).toBe('tbl')
  })

  it('editOnGrid for an unknown id is a no-op', () => {
    const before = useStore.getState().activeTab
    useStore.getState().editOnGrid('does-not-exist')
    expect(useStore.getState().activeTab).toBe(before)
    expect(useStore.getState().gridFocusId).toBeNull()
  })

  it('setProject retains edges in the project slice for the canvas', () => {
    useStore.setState(useStore.getInitialState())
    useStore.getState().setProject({
      objects: [makeColumn('c1', 'Amount')],
      files: { [FILE]: { text: 'x', spans: {} } },
      name: 'demo',
      edges: [{ from: 'm1', to: 'c1', kind: 'measure' }],
    })
    expect(useStore.getState().project.edges).toEqual([{ from: 'm1', to: 'c1', kind: 'measure' }])
  })
})
