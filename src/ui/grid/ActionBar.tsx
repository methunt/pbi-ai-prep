// ActionBar (FR-31) — the contextual bulk-action button group.
//
// Rendered by SelectionContext inside the one selection bar; it shows ONLY the
// action buttons (Apply renaming, Set description, Include/Exclude AI,
// Show/Hide in model, Delete selected, Clear). Neutral styling everywhere;
// the sole destructive button is "Delete selected" (btn-danger), which uses the
// single red token. Read-only (permission !== 'granted') DISABLES every write
// action (visible, never hidden) and conveys an explanation; "Clear" is not a
// write and stays enabled.
import { EyeOff, Pencil, Sparkles, Trash2, Type, X } from 'lucide-react'

export interface ActionBarProps {
  readOnly: boolean
  /** Label for the model-visibility toggle ('Hide in model' / 'Show in model'). */
  hideLabel: string
  onRename: () => void
  onSetDescription: () => void
  onIncludeInAI: () => void
  onExcludeFromAI: () => void
  onToggleHide: () => void
  onDelete: () => void
  onClear: () => void
}

export default function ActionBar({
  readOnly,
  hideLabel,
  onRename,
  onSetDescription,
  onIncludeInAI,
  onExcludeFromAI,
  onToggleHide,
  onDelete,
  onClear,
}: ActionBarProps) {
  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={readOnly}
        onClick={onRename}
      >
        <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        Apply renaming…
      </button>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={readOnly}
        onClick={onSetDescription}
      >
        <Type className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        Set description…
      </button>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={readOnly}
        onClick={onIncludeInAI}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        Include in AI
      </button>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={readOnly}
        onClick={onExcludeFromAI}
      >
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        Exclude from AI
      </button>

      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={readOnly}
        onClick={onToggleHide}
      >
        <EyeOff className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
        {hideLabel}
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={readOnly}
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
          Delete selected
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
          Clear
        </button>
      </div>
    </>
  )
}
