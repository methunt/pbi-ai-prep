// InstructionsEditor (FR-15) — the full-height AI instructions textarea.
//
// Live 10,000-char gauge; the cap REFUSES input beyond it (input truncated at
// the cap + a red overage badge). Saves into the journal as a `customInstructions`
// record on the CULTURE file (write-planner's sanctioned LSDL field); the
// planner re-encodes it as an escaped JSON string inside the linguisticMetadata
// block. Read-only (permission !== 'granted') disables editing (visible, never
// hidden). AD-11: the textarea owns focus, the header buttons are real buttons.
import { useCallback, useState } from 'react'
import { Copy, PenLine } from 'lucide-react'
import { useStore } from '../../state/store'
import type { LSDL } from '../../parse/lsdl-reader'
import type { JournalRecord, FieldJournalRecord } from '../../domain/journal'
import { INSTRUCTIONS_OBJECT_ID } from './lsdlModel'

const CHAR_CAP = 10000

interface InstructionsEditorProps {
  lsdl: LSDL
}

/** A staged customInstructions record on the culture file (model-wide). */
function isInstructionsRecord(r: JournalRecord): r is FieldJournalRecord {
  return (
    r.kind === 'field' &&
    r.objectId === INSTRUCTIONS_OBJECT_ID &&
    r.field === 'customInstructions'
  )
}

export default function InstructionsEditor({ lsdl }: InstructionsEditorProps) {
  const journal = useStore((s) => s.journal)
  const permission = useStore((s) => s.permission)
  const journalAdd = useStore((s) => s.journalAdd)
  const journalDiscard = useStore((s) => s.journalDiscard)
  const cultureFile = lsdl.file !== '' ? lsdl.file : 'definition/cultures/en-US.tmdl'

  const readOnly = permission !== 'granted'

  // Initial draft honours an already-staged customInstructions record so the
  // panel is never blank after a pending write.
  const staged = journal.find(isInstructionsRecord) as FieldJournalRecord | undefined
  const initial =
    staged !== undefined && typeof staged.new === 'string' ? staged.new : lsdl.customInstructions

  const [draft, setDraft] = useState(initial)
  const [overLimit, setOverLimit] = useState(false)

  const onEdit = useCallback(
    (value: string): void => {
      const wasOver = value.length > CHAR_CAP
      const next = wasOver ? value.slice(0, CHAR_CAP) : value
      setDraft(next)
      setOverLimit(wasOver)

      // Stage the pending write (coalesced on {objectId, field}); revert to a
      // no-op when the draft returns to the LSDL pristine value.
      const rec = journal.find(isInstructionsRecord) as FieldJournalRecord | undefined
      if (next === lsdl.customInstructions) {
        if (rec !== undefined) journalDiscard(rec.recordId)
      } else {
        journalAdd({
          kind: 'field',
          objectId: INSTRUCTIONS_OBJECT_ID,
          field: 'customInstructions',
          new: next,
          old: lsdl.customInstructions,
          file: cultureFile,
          context: 'user',
        })
      }
    },
    [journal, journalAdd, journalDiscard, lsdl.customInstructions, cultureFile],
  )

  const copyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(draft)
    } catch {
      // Clipboard unavailable (permissions / non-secure context) — ignore.
    }
  }, [draft])

  const pct = Math.min(100, Math.round((draft.length / CHAR_CAP) * 100))

  return (
    <div
      className="card flex min-h-0 flex-col overflow-hidden"
      style={{ borderRadius: '1rem' }}
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
          style={{
            background: 'color-mix(in srgb, var(--color-primary) 12%, transparent)',
            color: 'var(--color-primary)',
          }}
        >
          <PenLine className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-none">AI instructions</h3>
          <div className="mt-1 text-[11px] text-foreground/60">
            LSDL <span className="mono">CustomInstructions</span> · model-wide
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`mono tabular text-[11.5px] ${
              overLimit ? 'text-destructive' : 'text-foreground/60'
            }`}
            role="status"
            aria-live="polite"
          >
            {draft.length.toLocaleString()} / {CHAR_CAP.toLocaleString()}
          </span>
          {overLimit && (
            <span className="pill pill-flat !text-[10px] text-destructive" style={{ border: '1px solid color-mix(in srgb, var(--color-destructive) 40%, transparent)' }}>
              over limit
            </span>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void copyPrompt()}
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
            Copy prompt
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3.5">
        <textarea
          className="field mono min-h-0 flex-1 resize-none !text-[13px] leading-relaxed"
          value={draft}
          maxLength={CHAR_CAP}
          disabled={readOnly}
          onChange={(e) => {
            if (!readOnly) onEdit(e.target.value)
          }}
          aria-label="AI instructions"
          placeholder="Write the grounding rules Copilot reads before every answer…"
        />
        <div className="bar flex-none" role="presentation">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
