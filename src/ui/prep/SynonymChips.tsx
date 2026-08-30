// SynonymChips (FR-16) — per-object synonym editing.
//
// Each term renders as a chip carrying its state label (USER / GENERATED /
// SUGGESTED / DELETED). Add stages a User term; remove of a Generated/Suggested
// term TOMBSTONES it (State: Deleted, entry kept, struck-through) — never a
// hard delete; a User term is removed outright. There is a 20-live-term cap
// (the amber `max 20 reached` chip replaces the add control at the cap); a live
// `N/20` counter sits in the field row. Max 6 chips render inline, the rest
// fold behind a '+N more' expander.
//
// The add control matches the mockup's SMALL DASHED `+ add` pill (mockup line
// 1518): clicking it reveals a small inline input to type the term, Enter
// commits, Escape cancels. Read-only (permission !== 'granted') disables every
// edit (visible, never hidden).
import { useState } from 'react'
import { X } from 'lucide-react'
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
  const [adding, setAdding] = useState(false)

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
    setAdding(false)
  }

  const startAdd = (): void => {
    if (readOnly || atCap) return
    setDraft('')
    setAdding(true)
  }

  const cancelAdd = (): void => {
    setAdding(false)
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
              className={`syn ${tone} ${deleted ? 'syn-del' : ''}`}
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
          <button type="button" className="syn t-slate" onClick={() => setExpanded(true)}>
            +{hidden} more
          </button>
        )}
        {expanded && hidden > 0 && (
          <button type="button" className="syn t-slate" onClick={() => setExpanded(false)}>
            Show fewer
          </button>
        )}
        {terms.length === 0 && (
          <span className="text-[11px] text-foreground/55">No synonyms yet</span>
        )}
        {atCap ? (
          <span
            className="syn"
            style={{
              background: 'color-mix(in srgb, var(--color-amber) 16%, transparent)',
              color: 'var(--color-amber)',
            }}
            title="They are the maximum of 20 synonyms"
          >
            max 20 reached
          </span>
        ) : adding ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              type="text"
              className="field mono !py-1 !px-2 !text-[11.5px] w-[150px]"
              placeholder="Add a synonym…"
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
                else if (e.key === 'Escape') cancelAdd()
              }}
              aria-label="Add synonym"
            />
            <button
              type="button"
              className="syn border border-dashed border-border text-foreground/60 hover:border-primary hover:text-primary"
              onClick={submit}
              disabled={draft.trim() === ''}
            >
              add
            </button>
          </span>
        ) : (
          <button
            type="button"
            className="syn border border-dashed border-border text-foreground/60 hover:border-primary hover:text-primary"
            disabled={readOnly}
            onClick={startAdd}
            aria-label="Add synonym"
            title="Add a synonym"
          >
            + add
          </button>
        )}
      </div>
    </div>
  )
}
