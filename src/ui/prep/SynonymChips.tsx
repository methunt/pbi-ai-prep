// SynonymChips (FR-16) — per-object synonym editing.
//
// Each term renders as a chip carrying its state label (USER / GENERATED /
// SUGGESTED / DELETED). Add stages a User term; remove of a Generated/Suggested
// term TOMBSTONES it (State: Deleted, entry kept, struck-through) — never a
// hard delete; a User term is removed outright. There is a 20-live-term cap with
// a live `N/20` counter beside the add (refuses at cap); deleted terms are
// struck-through and excluded from that count. Max 6 chips render inline, the
// rest fold behind a '+N more' expander.
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { LSdlTerm } from '../../parse/lsdl-reader'
import { SYNONYM_CAP, SYNONYM_INLINE_MAX, TERM_STATE_LABEL, liveTerms } from './lsdlModel'

/** Token-bound tone per term state (deleted renders muted + struck through). */
const STATE_TONE: Record<string, string> = {
  User: 't-blue',
  Generated: 't-sky',
  Suggested: 't-cyan',
  Deleted: 't-slate',
}

interface SynonymChipsProps {
  terms: LSdlTerm[]
  /** Stage an add of a User term; the caller enforces the cap + journal write. */
  onAdd(name: string): void
  /** Stage a remove (tombstone / hard delete) of a term. */
  onRemove(name: string): void
  readOnly: boolean
}

export default function SynonymChips({ terms, onAdd, onRemove, readOnly }: SynonymChipsProps) {
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState('')

  const live = liveTerms(terms)
  const liveCount = live.length
  const atCap = liveCount >= SYNONYM_CAP

  const visible = expanded ? terms : terms.slice(0, SYNONYM_INLINE_MAX)
  const hidden = terms.length - visible.length

  const submit = (): void => {
    const name = draft.trim()
    if (name === '' || atCap || readOnly) return
    onAdd(name)
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {visible.map((term) => {
          const deleted = term.state === 'Deleted'
          const tone = STATE_TONE[term.state] ?? 't-slate'
          return (
            <span
              key={term.name}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium ${tone} ${
                deleted ? 'opacity-60 line-through' : ''
              }`}
            >
              <span className="font-medium">{term.name}</span>
              <span className="mono text-[9.5px] font-semibold uppercase opacity-80">
                {TERM_STATE_LABEL[term.state] ?? term.state}
              </span>
              {!deleted && !readOnly && (
                <button
                  type="button"
                  className="ml-0.5 -mr-1 flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10"
                  onClick={() => onRemove(term.name)}
                  aria-label={`Remove ${term.name}`}
                  title="Remove synonym"
                >
                  <X className="h-3 w-3" strokeWidth={2.4} aria-hidden="true" />
                </button>
              )}
            </span>
          )
        })}
        {hidden > 0 && !expanded && (
          <button
            type="button"
            className="chip !py-0.5 !text-[11px]"
            onClick={() => setExpanded(true)}
          >
            +{hidden} more
          </button>
        )}
        {expanded && hidden > 0 && (
          <button
            type="button"
            className="chip !py-0.5 !text-[11px]"
            onClick={() => setExpanded(false)}
          >
            Show fewer
          </button>
        )}
        {terms.length === 0 && (
          <span className="text-[11px] text-foreground/55">No synonyms yet</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          className="field !py-1.5 !text-[12px]"
          placeholder="Add a synonym…"
          value={draft}
          disabled={readOnly || atCap}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          aria-label="Add synonym"
        />
        <button
          type="button"
          className="btn btn-outline btn-sm flex-none"
          disabled={readOnly || atCap || draft.trim() === ''}
          onClick={submit}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
          Add
        </button>
        <span
          className={`mono tabular flex-none text-[11px] ${atCap ? 'text-destructive' : 'text-foreground/60'}`}
        >
          {liveCount}/{SYNONYM_CAP}
        </span>
      </div>
    </div>
  )
}
