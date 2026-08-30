// Object grid (FR-9 / FR-10 / FR-11) — the product's engine room.
//
// Reads the folded model + filters + graph + journal from the store, derives
// the filtered+sorted row set (deriveVisibleObjects), pages it to the store's
// pageSize (50 default), and virtualises the page rows with @tanstack/react-virtual
// so very large pages stay under the 16ms frame budget.
//
// Mutation footprint (AD-4): description / rename edits stage through
// journalAdd only; nothing here mutates a ModelObject. Read-only
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useStore, deriveVisibleObjects } from '../../state/store'
import { COLUMNS, COLUMN_COUNT, type ColId } from './columns'
import { TYPE_META } from './typeMeta'
import GridRow from './GridRow'
import Heading from './Heading'
import Pagination from './Pagination'
import FilterBar from './FilterBar'
import SelectionContext from './SelectionContext'
import { descriptionFor, hasJournalEdit, pendingRenameFor, pendingRenameRecordId } from './cellUtils'
import type { ModelObject, ObjectType } from '../../domain/objects'

const hasDescription = (o: { description?: string }): boolean =>
  typeof o.description === 'string' && o.description.trim() !== ''

export default function ObjectGrid() {
  const project = useStore((s) => s.project)
  const filters = useStore((s) => s.filters)
  const journal = useStore((s) => s.journal)
  const graph = useStore((s) => s.graph)
  const permission = useStore((s) => s.permission)
  const selectedIds = useStore((s) => s.selectedIds)
  const setFilter = useStore((s) => s.setFilter)
  const setSort = useStore((s) => s.setSort)
  const setPage = useStore((s) => s.setPage)
  const journalAdd = useStore((s) => s.journalAdd)
  const journalDiscard = useStore((s) => s.journalDiscard)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const shiftSelectRange = useStore((s) => s.shiftSelectRange)
  const selectAllMatching = useStore((s) => s.selectAllMatching)
  const pristine = useStore((s) => s.pristine)

  const readOnly = permission !== 'granted'
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastClickedRef = useRef<number | null>(null)

  const derived = useMemo(
    () => deriveVisibleObjects(project.objects, filters, graph, pristine),
    [project.objects, filters, graph, pristine],
  )

  const matchCount = derived.length
  const pageSize = filters.pageSize
  const pageCount = Math.max(1, Math.ceil(matchCount / pageSize))

  // Clamp to last page when a filter/narrowing leaves us beyond it.
  useEffect(() => {
    if (filters.page > pageCount) setPage(pageCount)
  }, [filters.page, pageCount, setPage])

  const start = (Math.min(filters.page, pageCount) - 1) * pageSize
  const pageRows = derived.slice(start, start + pageSize)
  const pageRowsRef = useRef(pageRows)
  pageRowsRef.current = pageRows
  const pristineById = useMemo(() => new Map(pristine.map((o) => [o.id, o])), [pristine])
  const pristineByIdRef = useRef(pristineById)
  pristineByIdRef.current = pristineById
  const journalRef = useRef(journal)
  journalRef.current = journal

  const virtualizer = useVirtualizer({
    count: pageRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 42,
    overscan: 12,
  })
  const virtualItems = virtualizer.getVirtualItems()

  const counts = useMemo(() => {
    let all = 0
    let empty = 0
    let unused = 0
    for (const o of project.objects) {
      all++
      if (!hasDescription(o)) empty++
      if (graph.usage(o.id).total === 0) unused++
    }
    return { all, empty, unused }
  }, [project.objects, graph])

  const objectTypes = useMemo(() => {
    const set = new Set<ObjectType>()
    for (const o of project.objects) set.add(o.type)
    return [...set]
      .sort((a, b) => TYPE_META[a].label.localeCompare(TYPE_META[b].label))
      .map((type) => ({ value: type, label: TYPE_META[type].label }))
  }, [project.objects])

  const tables = useMemo(() => {
    const set = new Set<string>()
    for (const o of project.objects) if (o.table) set.add(o.table)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [project.objects])

  const matchIds = useMemo(() => new Set(derived.map((o) => o.id)), [derived])
  const matchedSelected = useMemo(
    () => selectedIds.filter((id) => matchIds.has(id)).length,
    [selectedIds, matchIds],
  )
  const allMatch = matchCount > 0 && matchedSelected === matchCount
  const someMatch = matchedSelected > 0 && !allMatch

  const onSort = useCallback(
    (key: ColId) => {
      const cur = filters.sort
      const dir = cur?.key === key && cur.dir === 'asc' ? 'desc' : 'asc'
      setSort({ key, dir })
      setPage(1)
    },
    [filters.sort, setSort, setPage],
  )

  const focusControl = useCallback((row: number, col: string) => {
    const scope = scrollRef.current
    if (!scope) return
    const cell = scope.querySelector<HTMLElement>(`[data-row="${row}"] [data-col="${col}"]`)
    const focusable = cell?.querySelector<HTMLElement>('input,textarea,button,select') ?? cell
    focusable?.focus()
  }, [])

  // Arrow up/down row navigation between the same column's focusable control.
  const onGridKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const target = e.target as HTMLElement
      // Never hijack arrow keys from a text editor (caret movement).
      if (target.tagName === 'TEXTAREA') return
      const rowEl = target.closest<HTMLElement>('[data-row]')
      const colEl = target.closest<HTMLElement>('[data-col]')
      if (!rowEl || !colEl) return
      const row = Number(rowEl.dataset.row)
      const col = colEl.dataset.col ?? ''
      const next = e.key === 'ArrowDown' ? row + 1 : row - 1
      if (next < 0 || next >= pageRowsRef.current.length) return
      e.preventDefault()
      focusControl(next, col)
    },
    [focusControl],
  )

  const handleRowClick = useCallback(
    (e: MouseEvent<HTMLDivElement>, idx: number) => {
      const t = e.target as HTMLElement
      if (t.closest('input,button,textarea,select,a')) return
      if (e.shiftKey && lastClickedRef.current !== null) {
        const lo = Math.min(lastClickedRef.current, idx)
        const hi = Math.max(lastClickedRef.current, idx)
        shiftSelectRange(pageRowsRef.current.slice(lo, hi + 1).map((o) => o.id))
      } else {
        lastClickedRef.current = idx
      }
    },
    [shiftSelectRange],
  )

  const toggleAll = useCallback(
    (on: boolean) => {
      if (on) {
        selectAllMatching([...matchIds])
      } else {
        const remaining = selectedIds.filter((id) => !matchIds.has(id))
        shiftSelectRange(remaining)
      }
    },
    [matchIds, selectedIds, selectAllMatching, shiftSelectRange],
  )

  const onNavigate = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      const active = document.activeElement as HTMLElement | null
      const rowEl = active?.closest<HTMLElement>('[data-row]')
      const colEl = active?.closest<HTMLElement>('[data-col]')
      const colId = (colEl?.dataset.col ?? 'desc') as ColId
      const row = rowEl ? Number(rowEl.dataset.row) : 0
      const colIdx = COLUMNS.findIndex((c) => c.id === colId)
      let targetRow = row
      let targetCol = colIdx
      if (dir === 'down') targetRow = Math.min(row + 1, pageRowsRef.current.length - 1)
      else if (dir === 'up') targetRow = Math.max(row - 1, 0)
      else if (dir === 'left') targetCol = Math.max(colIdx - 1, 0)
      else targetCol = Math.min(colIdx + 1, COLUMN_COUNT - 1)
      const target = COLUMNS[targetCol].id
      if (targetRow !== row) {
        if (!pageRowsRef.current.length) return
        virtualizer.scrollToIndex(targetRow)
      }
      requestAnimationFrame(() => focusControl(targetRow, target))
    },
    [virtualizer, focusControl],
  )
  const commitDescription = useCallback(
    (obj: ModelObject, value: string) => {
      journalAdd({
        kind: 'field',
        objectId: obj.id,
        file: obj.file,
        context: 'user',
        field: 'description',
        new: value,
        old: undefined,
      })
    },
    [journalAdd],
  )

  const commitRename = useCallback(
    (obj: ModelObject, value: string) => {
      const pristineName = pristineByIdRef.current.get(obj.id)?.name ?? obj.name
      // Clearing the rename or leaving it unchanged un-stages it (revert to pristine).
      if (value.trim() === '' || value === pristineName) {
        const recordId = pendingRenameRecordId(journalRef.current, obj.id)
        if (recordId) journalDiscard(recordId)
        return
      }
      // Renames are staged as `field:'name'` (the write-planner's planRename path);
      // `old` is the pristine name, recomputed by the domain fold.
      journalAdd({
        kind: 'field',
        objectId: obj.id,
        file: obj.file,
        context: 'user',
        field: 'name',
        new: value,
        old: pristineName,
      })
    },
    [journalAdd, journalDiscard],
  )

  return (
    <div className="mx-4 mb-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <FilterBar
        filters={filters}
        objectTypes={objectTypes}
        tables={tables}
        counts={counts}
        matchCount={matchCount}
        selectedCount={selectedIds.length}
        allMatch={allMatch}
        someMatch={someMatch}
        readOnly={readOnly}
        onFilter={setFilter}
        onToggleAll={toggleAll}
      />

      <SelectionContext />

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        role="grid"
        aria-rowcount={pageRows.length + 1}
        aria-colcount={COLUMN_COUNT}
        aria-label="Model objects"
        onKeyDown={onGridKeyDown}
      >
        <div className="min-w-[1080px]">
          <Heading sort={filters.sort} onSort={onSort} />
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualItems.map((vi) => {
              const obj = pageRows[vi.index]
              const usage = graph.usage(obj.id)
              return (
                <div
                  key={vi.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <GridRow
                    obj={obj}
                    rowIndex={vi.index}
                    usage={usage}
                    selected={selectedIds.includes(obj.id)}
                    readOnly={readOnly}
                    description={descriptionFor(obj, journal)}
                    renameTo={pendingRenameFor(obj, journal)}
                    displayName={pristineById.get(obj.id)?.name ?? obj.name}
                    descChanged={hasJournalEdit(journal, obj.id, 'description')}
                    renameChanged={hasJournalEdit(journal, obj.id, 'name')}
                    onCommitDescription={commitDescription}
                    onCommitRename={commitRename}
                    onNavigate={onNavigate}
                    onToggleSelect={toggleSelect}
                    onRowClick={handleRowClick}
                  />
                </div>
              )
            })}
            {pageRows.length === 0 && (
              <div className="flex h-24 items-center justify-center text-[13px] text-foreground/55">
                No objects match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-none border-t border-border">
        <Pagination
          page={filters.page}
          pageSize={pageSize}
          total={matchCount}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
