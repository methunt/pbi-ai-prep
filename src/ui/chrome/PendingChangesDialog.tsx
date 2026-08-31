// PendingChangesDialog (FR-12) — the review-before-save modal.
//
// Mockup contract (mockup/index.html mPending): a scrim modal listing EVERY
// pending journal record as a row — [field pill] [object label] [old → new]
// [X discard] — with Keep editing / Save all changes footer actions.
//
// Wiring:
//   - rows read straight from `journal` (the single source of pending state);
//   - the per-row X calls store.journalDiscard(recordId) — the same door the
//     rename cell uses, so discarding re-folds the read-model immediately;
//   - Discard all empties the journal (store.journalDiscardAll);
//   - Save all changes delegates to the shell's save flow.
//
// AI-schema changes (lsdlVisibility / synonyms / customInstructions) stage
// through the same journal, so they appear here automatically — there is no
// separate AI pending surface.
import { useEffect, useMemo, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { PenLine, X } from 'lucide-react'
import { useStore } from '../../state/store'
import {
  pendingFieldLabel,
  pendingNewText,
  pendingObjectLabel,
  pendingOldText,
} from './pendingChanges'

export interface PendingChangesDialogProps {
  /** Launch the shell save flow (the Save button's handler). */
  onSave: () => void
  /** Close without discarding or saving. */
  onClose: () => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function PendingChangesDialog({ onSave, onClose }: PendingChangesDialogProps) {
  const journal = useStore((s) => s.journal)
  const pristine = useStore((s) => s.pristine)
  const journalDiscard = useStore((s) => s.journalDiscard)
  const journalDiscardAll = useStore((s) => s.journalDiscardAll)
  const permission = useStore((s) => s.permission)

  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const pristineById = useMemo(
    () => new Map(pristine.map((o) => [o.id, o])),
    [pristine],
  )
  // AD-11 focus trap + restore, mirroring DeleteDialog.
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      const t = triggerRef.current
      if (t && t.isConnected) t.focus()
    }
  }, [])

  // Escape closes even when focus has escaped the panel (a document-level
  // listener, not just the panel's onKeyDown) — a modal that ignores Escape
  // reads as "stuck" and every later change looks like it re-opened it.
  useEffect(() => {
    const onDocKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onDocKeyDown)
    return () => document.removeEventListener('keydown', onDocKeyDown)
  }, [onClose])

  // Clicking the scrim (anywhere outside the panel) closes — standard modal
  // behaviour; without it the only exits are the buttons and a stuck modal
  // shadows every surface behind it.
  const onScrimMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    if (!panel) return
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const readOnly = permission !== 'granted'

  return (
    <div className="mesh fixed inset-0 z-50 flex items-center justify-center p-6" onMouseDown={onScrimMouseDown}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${journal.length} pending changes`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="card elev-lg w-full max-w-[620px] overflow-hidden outline-none"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-primary/10 text-primary">
            <PenLine className="h-[18px] w-[18px]" strokeWidth={2.3} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[14.5px] font-bold leading-snug">
              {journal.length} pending change{journal.length === 1 ? '' : 's'}
            </h3>
            <p className="mt-0.5 text-[12px] text-foreground/60">
              Review before writing to disk. Every change is reversible until you save.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto flex-none !p-1.5"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[340px] divide-y divide-border overflow-auto">
          {journal.length === 0 ? (
            <div className="px-5 py-6 text-center text-[12px] text-foreground/55">
              No pending changes.
            </div>
          ) : (
            journal.map((rec) => {
              const isDelete = rec.kind === 'delete'
              return (
                <div key={rec.recordId} className="flex items-start gap-3 px-5 py-3">
                  <span
                    className={`mt-0.5 flex-none rounded-full border px-2 py-0.5 !text-[10px] ${
                      isDelete
                        ? 'border-destructive/30 bg-destructive/8 text-destructive'
                        : 'pill pill-flat t-blue'
                    }`}
                  >
                    {pendingFieldLabel(rec)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mono truncate text-[12.5px] font-semibold">
                      {pendingObjectLabel(rec, pristineById)}
                    </div>
                    <div className="mt-1 flex items-start gap-2 text-[11.5px]">
                      <span className="max-w-[190px] truncate text-foreground/55 line-through">
                        {pendingOldText(rec)}
                      </span>
                      <svg
                        className="mt-0.5 h-3 w-3 flex-none text-foreground/55"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        aria-hidden="true"
                      >
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                      <span className="max-w-[230px] truncate">{pendingNewText(rec)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm flex-none !p-1"
                    title="Discard this change"
                    aria-label={`Discard ${pendingFieldLabel(rec)} change on ${pendingObjectLabel(rec, pristineById)}`}
                    disabled={readOnly}
                    onClick={() => journalDiscard(rec.recordId)}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
          <span className="text-[11.5px] text-foreground/55">
            {readOnly ? 'Read-only — discard is disabled' : 'Discarding a change cannot be undone'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={readOnly || journal.length === 0}
              onClick={() => {
                journalDiscardAll()
                onClose()
              }}
            >
              Discard all
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Keep editing
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onSave}>
              Save all changes
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
