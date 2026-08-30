// Inline 'rename to' cell (FR-9). Staging only — the deferred collision checks
// happen at bulk apply (7.3); here a rename commits as a pending journal change
// (`field: 'renameTo'`). Read-only renders the input DISABLED (visible, not hidden).
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { NavDir } from './DescriptionCell'

export interface RenameCellProps {
  /** Staged rename-to value (from the journal), `''` when none. */
  value: string
  readOnly: boolean
  isChanged: boolean
  onCommit: (value: string) => void
  onNavigate: (dir: NavDir) => void
}

export default function RenameCell({
  value,
  readOnly,
  isChanged,
  onCommit,
  onNavigate,
}: RenameCellProps) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastCommittedRef = useRef(value)

  // Sync the external staged value in when we are not the active editor.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(value)
      lastCommittedRef.current = value
    }
  }, [value])

  const commit = () => {
    if (draft !== lastCommittedRef.current) {
      lastCommittedRef.current = draft
      onCommit(draft)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      onNavigate('right')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value)
      lastCommittedRef.current = value
      inputRef.current?.blur()
    } else if (e.key === 'Tab') {
      // Let the browser move focus natively; commit the staged value first.
      commit()
      onNavigate(e.shiftKey ? 'left' : 'right')
    }
  }

  return (
    <div role="gridcell" data-col="rename" className="grid-cell">
      <input
        ref={inputRef}
        type="text"
        className={`field !py-1 !px-2 !text-[12px]${isChanged ? ' !border-primary/60' : ''}`}
        value={draft}
        disabled={readOnly}
        placeholder="rename…"
        aria-label="Rename to"
        title={readOnly ? 'Write access denied — read-only' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
      />
    </div>
  )
}
