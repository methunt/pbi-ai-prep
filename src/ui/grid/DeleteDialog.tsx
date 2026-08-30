// DeleteDialog (FR-33) — the delete-cascade confirmation with visible blast radius.
//
// Visual contract: mockup/index.html MODAL · DELETE CASCADE (`#mDelete`).
// Grouped-by-table rows with counts + expandable lists; per-object named
// downstream dependents that break (facts, never a verdict); the ONE warning
// line 'Removal writes an M-query step and cannot be undone here — only via
// Git.'; and the WAVE CASCADE — each confirm round stages delete journal
// records IN MEMORY (the write-planner materialises them only on Save), the
// graph recomputes, and newly-orphaned objects (those with no remaining
// dependents after this round) are named + confirmed as the NEXT round; repeat
// until a round yields zero new orphans. NOTHING writes to disk until Save.
//
// AD-11: this dialog hardens focus handling — a Tab/Shift+Tab focus trap is
// installed while it is open, focus is moved to the panel on mount, and focus
// is restored to the element that opened it on close. Read-only
// (permission !== 'granted') disables the confirm (visible, never hidden).
//
// The cascade logic is exported as pure functions so the round machine is
// unit-testable outside React (vitest node env).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X } from 'lucide-react'
import type { ModelObject } from '../../domain/objects'
import type { ObjectGraph } from '../../domain/graph'
import { TYPE_META } from './typeMeta'
import { confirmLabel, deleteTitle, groupByTable, newlyOrphaned, remainingDependents } from './deleteCascade'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DeleteDialogProps {
  /** The round-1 selection (PRISTINE objects) being deleted. */
  selected: ModelObject[]
  /** Immutable dependency graph over the pristine model (AD-6). */
  graph: ObjectGraph
  /** All PRISTINE model objects — scanned for newly-orphaned objects per round. */
  model: ModelObject[]
  /** permission !== 'granted' — disables the confirm (visible, never hidden). */
  readOnly: boolean
  /** Close the dialog without staging anything new (cancel / escape). */
  onCancel: () => void
  /** Stage one round of delete journal records (the caller journalAdds each). */
  onStage: (objects: ModelObject[]) => void
  /** The cascade is complete / the user stopped adding rounds: close + clear. */
  onDone: () => void
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function DeleteDialog({
  selected,
  graph,
  model,
  readOnly,
  onCancel,
  onStage,
  onDone,
}: DeleteDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // The round machine. `stagedSoFar` = ids confirmed across every accepted
  // round; `roundCurrent` = the batch being confirmed in the current round
  // (initially the selection; later the newly-orphaned batch). Nothing reaches
  // the journal until a confirm round — and nothing writes to disk until Save.
  const [stagedSoFar, setStagedSoFar] = useState<string[]>([])
  const [roundCurrent, setRoundCurrent] = useState<ModelObject[]>(selected)
  const [isOrphanRound, setIsOrphanRound] = useState(false)
  const [includeOrphans, setIncludeOrphans] = useState(true)
  const [round, setRound] = useState(1)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const s = new Set<string>()
    for (const g of groupByTable(selected)) s.add(g.table)
    return s
  })

  const nameIndex = useMemo(() => new Map(model.map((o) => [o.id, o.name])), [model])
  const nameFor = useCallback((id: string): string => nameIndex.get(id) ?? id, [nameIndex])

  // Objects already committed to deletion: the initial selection plus every
  // accepted round. Used to compute "still referenced" / per-object breakage as
  // facts that exclude the downstream objects also being deleted.
  const committedIds = useMemo(() => {
    const s = new Set<string>(stagedSoFar)
    for (const o of selected) s.add(o.id)
    return s
  }, [stagedSoFar, selected])

  const groups = useMemo(() => groupByTable(selected), [selected])

  // AD-11 focus trap + restore. Capture the element that opened the dialog
  // (the Delete button) BEFORE focusing the panel; on close, restore focus to
  // it if it is still connected (it may unmount when the selection clears).
  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => {
      const t = triggerRef.current
      if (t && t.isConnected) t.focus()
    }
  }, [])

  // Escape closes without staging anything new; Tab is trapped to the panel.
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
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
    },
    [onCancel],
  )

  const toggleGroup = useCallback((table: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(table)) next.delete(table)
      else next.add(table)
      return next
    })
  }, [])

  // The total shown on the confirm button: the core selection plus any
  // currently-offered orphan batch that is ticked for inclusion (the wave
  // checkbox grows it, matching the mockup).
  const totalPlanned = isOrphanRound
    ? stagedSoFar.length + (includeOrphans ? roundCurrent.length : 0)
    : selected.length

  const title = useMemo(
    () => deleteTitle(selected, graph, committedIds),
    [selected, graph, committedIds],
  )

  const confirm = useCallback((): void => {
    if (isOrphanRound && !includeOrphans) {
      // Stop adding rounds: keep every already-staged round, close.
      onDone()
      return
    }
    const batch = isOrphanRound ? roundCurrent : selected
    onStage(batch)
    const prior = new Set<string>(stagedSoFar)
    const next = new Set<string>(prior)
    for (const o of batch) next.add(o.id)
    setStagedSoFar([...next])
    const orphans = newlyOrphaned(graph, model, prior, next)
    if (orphans.length === 0) {
      // The cascade landed — no further objects orphaned. Done; nothing writes
      // to disk until Save.
      onDone()
      return
    }
    setRoundCurrent(orphans)
    setIsOrphanRound(true)
    setIncludeOrphans(true)
    setRound((r) => r + 1)
  }, [
    includeOrphans,
    isOrphanRound,
    roundCurrent,
    selected,
    stagedSoFar,
    graph,
    model,
    onStage,
    onDone,
  ])

  return (
    <div
      ref={panelRef}
      className="scrim on"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
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
            <svg
              className="h-[18px] w-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.3}
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
            </svg>
          </div>
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-bold leading-snug">{title}</h3>
            <p className="mt-1 text-[12px] leading-snug text-foreground/55">
              Removal writes an M-query step and cannot be undone here — only via Git.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto !p-1.5 flex-none"
            onClick={onCancel}
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[300px] space-y-3 overflow-auto px-5 py-4">
          {groups.length === 0 && (
            <p className="text-[12px] text-foreground/55">No objects selected.</p>
          )}
          {groups.map((g) => {
            const open = expanded.has(g.table)
            return (
              <div key={g.table} className="overflow-hidden rounded-[10px] border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 bg-secondary/40 px-3.5 py-2 text-left"
                  onClick={() => toggleGroup(g.table)}
                  aria-expanded={open}
                  aria-label={`${g.table} — ${g.count} object${g.count === 1 ? '' : 's'}`}
                >
                  <svg
                    className="h-3.5 w-3.5 flex-none text-foreground/50"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.4}
                    aria-hidden="true"
                  >
                    {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
                  </svg>
                  <span className="mono flex-1 truncate text-[12px] font-semibold">{g.table}</span>
                  <span className="pill pill-flat t-blue flex-none !text-[10px]">{g.count}</span>
                </button>
                {open && (
                  <div className="divide-y divide-border/70">
                    {g.objects.map((o) => {
                      const deps = remainingDependents(graph, o.id, committedIds)
                      return (
                        <div key={o.id} className="px-3.5 py-2">
                          <div className="flex items-center gap-2 text-[12px]">
                            <span className="pill pill-flat t-slate !text-[10px] flex-none">
                              {TYPE_META[o.type].label}
                            </span>
                            <span className="mono flex-1 truncate font-semibold">{o.name}</span>
                          </div>
                          <div className="ml-2 mt-1">
                            {deps.length === 0 ? (
                              <span className="text-[11px] text-foreground/45">
                                No downstream references.
                              </span>
                            ) : (
                              <div className="text-[11px] leading-snug">
                                <span className="text-foreground/55">
                                  Breaks {deps.length} downstream:{' '}
                                </span>
                                <span className="mono text-destructive/85">
                                  {deps.map(nameFor).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {isOrphanRound && roundCurrent.length > 0 && (
          <div
            className="mx-5 mb-4 rounded-[10px] px-3.5 py-3"
            style={{
              background: 'color-mix(in srgb, var(--color-amber) 9%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-amber) 28%, transparent)',
            }}
          >
            <div className="flex items-start gap-2.5">
              <svg
                className="mt-px h-4 w-4 flex-none"
                style={{ color: 'color-mix(in srgb, var(--color-amber) 60%, black)' }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                aria-hidden="true"
              >
                <path d="M12 9v4M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[12.5px] font-semibold"
                  style={{ color: 'color-mix(in srgb, var(--color-amber) 60%, black)' }}
                >
                  Round {round} — removing these orphans {roundCurrent.length} more object
                  {roundCurrent.length === 1 ? '' : 's'}
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-foreground/55">
                  {roundCurrent.map((o, i) => (
                    <span key={o.id} className="mono">
                      {i > 0 ? ', ' : ''}
                      {nameFor(o.id)}
                    </span>
                  ))}
                </div>
                <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="accent-primary h-3.5 w-3.5"
                    checked={includeOrphans}
                    onChange={(e) => setIncludeOrphans(e.target.checked)}
                  />
                  Include the {roundCurrent.length} newly orphaned object
                  {roundCurrent.length === 1 ? '' : 's'} (
                  {stagedSoFar.length + roundCurrent.length} total)
                </label>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
          <span className="mono text-[11.5px] text-foreground/55">
            Round {round} · PBIPreAI_RemoveUnusedCols
          </span>
          {readOnly && (
            <span className="text-[11px] text-amber">Read-only — delete is disabled</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={readOnly}
              onClick={confirm}
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.3}
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {confirmLabel(totalPlanned)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
