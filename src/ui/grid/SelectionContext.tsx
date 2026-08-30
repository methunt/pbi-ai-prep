// SelectionContext (FR-30 + FR-31 + FR-32) — the selection bar and its dialogs.
//
// Rendered by ObjectGrid between the filter bar and the grid. The ROW-LEVEL
// selection mechanics (per-row checkbox → toggleSelect, shift-click contiguous
// page range → shiftSelectRange, Space toggles the focused row via the focused
// checkbox, 'Select all N matching' across all pages → selectAllMatching) are
// already wired in 7.2's GridRow / ObjectGrid / FilterBar — this component does
// not duplicate them. It adds what FR-30/FR-31/FR-32 still need:
//   • a selection bar (N selected, M outside current filter, one-click Clear),
//   • the contextual ActionBar (only when selection > 0),
//   • the bulk-rename, set-description and delete dialogs.
// Bulk stages land as PENDING journal changes (AD-4) — never written to disk.
// Read-only (permission !== 'granted') disables every write action (visible,
// never hidden) and carries an in-bar explanation.
import { useMemo, useState } from 'react'
import { Trash2, Type } from 'lucide-react'
import { useStore } from '../../state/store'
import type { ModelObject } from '../../domain/objects'
import type { RenameProposal } from '../../domain/rename'
import ActionBar from './ActionBar'
import BulkRenameDialog from './BulkRenameDialog'

type ModalId = 'none' | 'rename' | 'desc' | 'delete'

export default function SelectionContext() {
  const selectedIds = useStore((s) => s.selectedIds)
  const project = useStore((s) => s.project)
  const filters = useStore((s) => s.filters)
  const graph = useStore((s) => s.graph)
  const pristine = useStore((s) => s.pristine)
  const permission = useStore((s) => s.permission)
  const outsideFilterCount = useStore((s) => s.outsideFilterCount)
  const journalAdd = useStore((s) => s.journalAdd)
  const clearSelection = useStore((s) => s.clearSelection)

  const [modal, setModal] = useState<ModalId>('none')
  const selectedCount = selectedIds.length

  const selectedObjs = useMemo(() => {
    const byId = new Map(pristine.map((o) => [o.id, o]))
    return selectedIds
      .map((id) => byId.get(id))
      .filter((o): o is ModelObject => o !== undefined)
  }, [selectedIds, pristine])

  const outside = useMemo(
    () => (selectedCount === 0 ? 0 : outsideFilterCount()),
    [selectedCount, outsideFilterCount, filters, project, graph, selectedIds],
  )

  const readOnly = permission !== 'granted'

  // Toggle label: 'Show in model' when every selected object is already hidden
  // (folded model → a staged hide is reflected, so the label flips immediately).
  const allHidden =
    selectedObjs.length > 0 &&
    selectedObjs.every((o) => (project.objectsById[o.id]?.hidden ?? o.hidden) === true)
  const hideLabel = allHidden ? 'Show in model' : 'Hide in model'

  if (selectedCount === 0) return null

  const pristineById = new Map(pristine.map((o) => [o.id, o]))

  const stageField = (field: string, value: unknown): void => {
    for (const id of selectedIds) {
      const obj = pristineById.get(id)
      if (obj === undefined) continue
      journalAdd({
        kind: 'field',
        objectId: obj.id,
        file: obj.file,
        context: 'user',
        field,
        new: value,
        old: undefined,
      })
    }
  }

  const applyRename = (changed: RenameProposal[]): void => {
    for (const p of changed) {
      const obj = pristineById.get(p.objectId)
      if (obj === undefined) continue
      journalAdd({
        kind: 'field',
        objectId: p.objectId,
        file: obj.file,
        context: 'user',
        field: 'name',
        new: p.proposedName,
        old: p.currentName,
      })
    }
    setModal('none')
  }

  const applyDescription = (value: string): void => {
    stageField('description', value)
    setModal('none')
  }

  const confirmDelete = (): void => {
    for (const id of selectedIds) {
      const obj = pristineById.get(id)
      if (obj === undefined) continue
      journalAdd({ kind: 'delete', objectId: obj.id, file: obj.file, context: 'user' })
    }
    clearSelection()
    setModal('none')
  }

  return (
    <>
      <div
        className="elev mx-4 mb-3 flex flex-none items-center gap-2 rounded-[10px] px-3 py-2"
        style={{
          background: 'var(--color-card)',
          border: '1px solid color-mix(in srgb, var(--color-primary) 40%, transparent)',
        }}
      >
        <span className="pill pill-flat t-blue mono tabular flex-none">
          {selectedCount} selected
        </span>
        {outside > 0 && (
          <span className="flex-none text-[11.5px] text-foreground/55">
            {outside} outside current filter
          </span>
        )}
        <div className="mx-1 h-5 w-px bg-border" />
        {readOnly && (
          <span className="flex-none text-[11px] text-amber">
            Read-only — write actions disabled
          </span>
        )}
        <ActionBar
          readOnly={readOnly}
          hideLabel={hideLabel}
          onRename={() => setModal('rename')}
          onSetDescription={() => setModal('desc')}
          onIncludeInAI={() => stageField('includedInAI', true)}
          onExcludeFromAI={() => stageField('includedInAI', false)}
          onToggleHide={() => stageField('hidden', !allHidden)}
          onDelete={() => setModal('delete')}
          onClear={clearSelection}
        />
      </div>

      {modal === 'rename' && (
        <BulkRenameDialog
          selected={selectedObjs}
          model={project.objects}
          readOnly={readOnly}
          onClose={() => setModal('none')}
          onApply={applyRename}
        />
      )}

      {modal === 'desc' && (
        <SetDescriptionDialog
          selected={selectedObjs}
          readOnly={readOnly}
          onClose={() => setModal('none')}
          onApply={applyDescription}
        />
      )}

      {modal === 'delete' && (
        <DeleteSelectedDialog
          selected={selectedObjs}
          readOnly={readOnly}
          onClose={() => setModal('none')}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}

function SetDescriptionDialog({
  selected,
  readOnly,
  onClose,
  onApply,
}: {
  selected: ModelObject[]
  readOnly: boolean
  onClose: () => void
  onApply: (value: string) => void
}) {
  const [value, setValue] = useState('')
  return (
    <div
      className="scrim on"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Set description"
    >
      <div className="card elev-lg mx-4 w-full max-w-[520px] overflow-hidden fade-up">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
            style={{
              background: 'color-mix(in srgb, var(--color-sky) 12%, transparent)',
              color: 'var(--color-sky)',
            }}
          >
            <Type className="h-[18px] w-[18px]" strokeWidth={2.3} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[14.5px] font-bold leading-snug">
              Set description for {selected.length} objects
            </h3>
            <p className="mt-0.5 text-[12px] text-foreground/55">
              The same description is staged for every selected object. Nothing is written
              until you save.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto !p-1.5 flex-none"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <textarea
            className="field min-h-[120px] resize-y"
            placeholder="Description applied to all selected objects…"
            aria-label="Description"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
          {readOnly && (
            <span className="text-[11px] text-amber">Read-only — staged edits are disabled</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={readOnly}
              onClick={() => onApply(value)}
            >
              Apply to selected
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeleteSelectedDialog({
  selected,
  readOnly,
  onClose,
  onConfirm,
}: {
  selected: ModelObject[]
  readOnly: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="scrim on"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Delete selected"
    >
      <div className="card elev-lg mx-4 w-full max-w-[560px] overflow-hidden fade-up">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
            style={{
              background: 'color-mix(in srgb, var(--color-destructive) 13%, transparent)',
              color: 'var(--color-destructive)',
            }}
          >
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.3} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-bold leading-snug">
              Delete {selected.length} selected object{selected.length === 1 ? '' : 's'}
            </h3>
            <p className="mt-1 text-[12px] leading-snug text-foreground/55">
              Removal stages a pending change and cannot be undone here — only via Git.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto !p-1.5 flex-none"
            onClick={onClose}
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[300px] space-y-3 overflow-auto px-5 py-4">
          {selected.map((o) => (
            <div key={o.id} className="flex items-center gap-3 text-[12px]">
              <span className="mono flex-none text-foreground/55">{o.table || '—'}</span>
              <span className="mono flex-1 truncate font-semibold">{o.name}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
          {readOnly && (
            <span className="text-[11px] text-amber">Read-only — delete is disabled</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={readOnly} onClick={onConfirm}>
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
              Remove {selected.length} object{selected.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
