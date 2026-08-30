// BulkRenameDialog (FR-32) — the bulk rename transform modal.
//
// Rules apply in a stated order (find/replace → strip prefix → strip suffix →
// underscores-to-spaces → Title Case → collapse + trim). A live preview lists
// current→new for EVERY selected object BEFORE anything is staged. A proposed
// name that differs and would be shared with a same-table sibling blocks Apply
// (FR-12): the banner counts the collisions and names the conflicting siblings,
// and the Apply button is disabled. On Apply, only the changed proposals are
// handed back for the parent to stage via journalAdd(field:'name').
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Pencil, X } from 'lucide-react'
import {
  bulkRenamePlan,
  DEFAULT_RENAME_RULES,
  type RenameProposal,
  type RenameRules,
} from '../../domain/rename'
import type { ModelObject } from '../../domain/objects'
import { TYPE_META } from './typeMeta'

export interface BulkRenameDialogProps {
  /** PRISTINE objects being renamed — their `.name` is the transform base (FR-9). */
  selected: ModelObject[]
  /** Folded read-model used for same-table sibling collision (FR-12). */
  model: ModelObject[]
  readOnly: boolean
  onClose: () => void
  onApply: (changed: RenameProposal[]) => void
}

export default function BulkRenameDialog({
  selected,
  model,
  readOnly,
  onClose,
  onApply,
}: BulkRenameDialogProps) {
  const [rules, setRules] = useState<RenameRules>({ ...DEFAULT_RENAME_RULES })
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  const plan = useMemo(() => bulkRenamePlan(selected, rules, model), [selected, rules, model])
  const changed = plan.proposals.filter((p) => p.changed)
  const canApply = !readOnly && changed.length > 0 && !plan.hasCollisions
  const conflictNames = useMemo(
    () => [...new Set(plan.proposals.flatMap((p) => p.conflicts))],
    [plan.proposals],
  )

  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setRule = <K extends keyof RenameRules>(key: K, value: RenameRules[K]): void =>
    setRules((prev) => ({ ...prev, [key]: value }))

  return (
    <div
      className="scrim on"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Apply renaming"
    >
      <div className="card elev-lg mx-4 w-full max-w-[720px] overflow-hidden fade-up">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div
            className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]"
            style={{
              background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
              color: 'var(--color-primary)',
            }}
          >
            <Pencil className="h-[18px] w-[18px]" strokeWidth={2.3} aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-[14.5px] font-bold leading-snug">
              Apply renaming to {selected.length} objects
            </h3>
            <p className="mt-0.5 text-[12px] text-foreground/55">
              Rules apply to every selected object. Preview updates live; nothing is written
              until you save.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto !p-1.5 flex-none"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-border px-5 py-4">
          <label className="block">
            <span className="lbl mb-1.5 block">Find</span>
            <input
              className="field"
              ref={firstInputRef}
              value={rules.find}
              placeholder="e.g. dim_"
              onChange={(e) => setRule('find', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="lbl mb-1.5 block">Replace with</span>
            <input
              className="field"
              value={rules.replace}
              placeholder="leave empty to remove"
              onChange={(e) => setRule('replace', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="lbl mb-1.5 block">Strip prefix</span>
            <input
              className="field"
              value={rules.stripPrefix}
              placeholder="e.g. fact_"
              onChange={(e) => setRule('stripPrefix', e.target.value)}
            />
          </label>
          <label className="block">
            <span className="lbl mb-1.5 block">Strip suffix</span>
            <input
              className="field"
              value={rules.stripSuffix}
              placeholder="e.g. _raw"
              onChange={(e) => setRule('stripSuffix', e.target.value)}
            />
          </label>
          <div className="col-span-2 flex items-center gap-5 pt-0.5">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                className="accent-primary h-3.5 w-3.5"
                checked={rules.underscoresToSpaces}
                onChange={(e) => setRule('underscoresToSpaces', e.target.checked)}
              />
              Underscores → spaces
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                className="accent-primary h-3.5 w-3.5"
                checked={rules.titleCase}
                onChange={(e) => setRule('titleCase', e.target.checked)}
              />
              Title Case
            </label>
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 pb-1 pt-3">
          <span className="lbl">Preview</span>
          <span className="text-[11px] text-foreground/55">current → new</span>
        </div>
        <div className="max-h-[260px] divide-y divide-border/70 overflow-auto" role="list">
          {plan.proposals.map((p) => {
            const taken = p.changed && p.conflicts.length > 0
            return (
              <div
                key={p.objectId}
                className="flex items-center gap-3 px-4 py-2 text-[12px]"
                role="listitem"
              >
                <span className="pill pill-flat t-slate !text-[10px] flex-none">
                  {TYPE_META[p.kind].label}
                </span>
                <span className="mono w-[150px] flex-none truncate text-foreground/55">
                  {p.table || '—'}
                </span>
                <span className="mono flex-1 truncate">{p.currentName}</span>
                <ArrowRight
                  className="h-3.5 w-3.5 flex-none text-foreground/45"
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
                <span
                  className={`mono flex-1 truncate font-semibold ${
                    p.changed ? '' : 'text-foreground/55'
                  }`}
                >
                  {p.proposedName}
                </span>
                {taken && (
                  <span className="pill pill-flat !text-[10px] flex-none border border-destructive/26 bg-destructive/12 text-destructive">
                    name taken
                  </span>
                )}
                {!p.changed && (
                  <span className="flex-none text-[10px] text-foreground/45">unchanged</span>
                )}
              </div>
            )
          })}
        </div>

        {plan.hasCollisions && (
          <div className="mx-5 mt-3 flex items-start gap-2.5 rounded-[10px] border border-destructive/26 bg-destructive/8 px-3.5 py-2.5">
            <svg
              className="mt-px h-4 w-4 flex-none text-destructive"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <div className="text-[12px] leading-snug">
              <span className="font-semibold text-destructive">
                {plan.collisionCount} name collision{plan.collisionCount === 1 ? '' : 's'}
              </span>
              <span className="text-foreground/60">
                {' '}
                — a sibling in the same table already uses that name. Adjust the rules to
                continue.
              </span>
              {conflictNames.length > 0 && (
                <div className="mt-1 text-[11px] text-foreground/60">
                  Conflicting name{conflictNames.length === 1 ? '' : 's'}:{' '}
                  {conflictNames.map((n) => (
                    <span key={n} className="mono">
                      {n}
                    </span>
                  )).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-border bg-secondary/40 px-5 py-3.5">
          <span className="text-[11.5px] text-foreground/55">
            Renames also update report JSON bindings and LSDL entity keys
          </span>
          {readOnly && (
            <span className="text-[11px] text-amber">Read-only — staged renames are disabled</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!canApply} onClick={() => onApply(changed)}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
              Stage renames
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
