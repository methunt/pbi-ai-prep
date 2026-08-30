// FR-11 inline editable description.
//   · 500-char cap (maxLength + hard slice).
//   · 200-char Copilot cutoff marker (live counter + "reads first 200" note).
//   · multi-line preserved; display collapses newlines to `///`.
//   · Enter commits + moves DOWN · Escape reverts · Tab/Shift+Tab move cells.
// Read-only (permission !== 'granted') renders the value visible but disabled.
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { FIDELITY_CAPS } from '../../domain/objects'
import { collapseLines, overCopilotCutoff } from './cellUtils'

export type NavDir = 'up' | 'down' | 'left' | 'right'

export interface DescriptionCellProps {
  value: string
  readOnly: boolean
  isChanged: boolean
  onCommit: (value: string) => void
  onNavigate: (dir: NavDir) => void
}

export default function DescriptionCell({
  value,
  readOnly,
  isChanged,
  onCommit,
  onNavigate,
}: DescriptionCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const cancelledRef = useRef(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Re-seed the draft when we (re)enter edit mode for this cell.
  useEffect(() => {
    if (editing) {
      setDraft(value)
      cancelledRef.current = false
      taRef.current?.focus()
    }
  }, [editing, value])

  const commit = () => {
    if (!cancelledRef.current && draft !== value) {
      onCommit(draft.slice(0, FIDELITY_CAPS.description))
    }
    setEditing(false)
  }

  const cancel = () => {
    cancelledRef.current = true
    setEditing(false)
  }

  const display = collapseLines(value) || 'No description yet'
  const showHint = overCopilotCutoff(draft)

  if (readOnly) {
    return (
      <div role="gridcell" data-col="desc" className={`grid-cell${isChanged ? ' cell-changed' : ''} opacity-60`} title="Write access denied — read-only">
        <span className={`truncate ${value ? '' : 'italic text-amber'}`} aria-disabled="true">
          {display}
        </span>
      </div>
    )
  }

  if (editing) {
    const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        commit()
        onNavigate('down')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        commit()
        onNavigate(e.shiftKey ? 'left' : 'right')
      }
    }
    return (
      <div role="gridcell" data-col="desc" className={`grid-cell${isChanged ? ' cell-changed' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <textarea
            ref={taRef}
            className="field min-w-0 flex-1 resize-none !py-1 !text-[12.5px] leading-relaxed"
            style={{ height: '26px', maxHeight: '84px' }}
            maxLength={FIDELITY_CAPS.description}
            value={draft}
            aria-label="Description"
            onKeyDown={onEditKeyDown}
            onBlur={commit}
            onChange={(e) => setDraft(e.target.value)}
          />
          <span className="mono flex-none text-[10px] text-foreground/45">
            {draft.length}/{FIDELITY_CAPS.description}
            {showHint && (
              <span className="text-amber"> · Copilot reads first {FIDELITY_CAPS.copilotCutoff} chars</span>
            )}
          </span>
        </div>
      </div>
    )
  }

  const onDisplayKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setEditing(true)
    }
  }

  return (
    <div role="gridcell" data-col="desc" className={`grid-cell${isChanged ? ' cell-changed' : ''}`}>
      <button
        type="button"
        className={`truncate text-left ${value ? '' : 'italic text-amber'}`}
        aria-label={
          value
            ? `Edit description: ${collapseLines(value)}`
            : 'Set description (empty)'
        }
        onClick={() => setEditing(true)}
        onKeyDown={onDisplayKeyDown}
      >
        {display}
      </button>
    </div>
  )
}
