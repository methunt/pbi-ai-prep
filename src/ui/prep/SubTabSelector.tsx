// SubTabSelector (FR-38) — the segmented pill selector that sits below the
// AI panel's KPI row and switches between the two Prep-for-AI views. The AI
// schema & synonyms tab carries a live N/M badge (included / total objects).
// AD-11: a real tablist with arrow-key navigation and focus management.
import type { KeyboardEvent } from 'react'
import { PenLine, Sparkles } from 'lucide-react'
import type { AiSubTab } from './lsdlModel'

const SUB_TABS: { id: AiSubTab; label: string; icon: typeof PenLine }[] = [
  { id: 'instr', label: 'AI instructions', icon: PenLine },
  { id: 'schema', label: 'AI schema & synonyms', icon: Sparkles },
]

interface SubTabSelectorProps {
  active: AiSubTab
  onChange(next: AiSubTab): void
  /** Live included/total objects for the schema tab badge (FR-38). */
  schemaCount: { included: number; total: number }
}

export default function SubTabSelector({ active, onChange, schemaCount }: SubTabSelectorProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: AiSubTab) => {
    const idx = SUB_TABS.findIndex((t) => t.id === id)
    let next = idx
    if (e.key === 'ArrowRight') next = (idx + 1) % SUB_TABS.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + SUB_TABS.length) % SUB_TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = SUB_TABS.length - 1
    else return
    e.preventDefault()
    onChange(SUB_TABS[next].id)
    document.getElementById(`ai-sub-${SUB_TABS[next].id}`)?.focus()
  }

  return (
    <div className="flex items-center gap-2 px-4 pb-3 flex-none">
      <div className="card p-1 flex items-center gap-1" role="tablist" aria-label="Prep for AI">
        {SUB_TABS.map((tab) => {
          const selected = active === tab.id
          return (
            <button
              key={tab.id}
              id={`ai-sub-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`ai-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="tab"
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => onKeyDown(e, tab.id)}
            >
              <tab.icon className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
              {tab.label}
              {tab.id === 'schema' && (
                <span className="mono pill pill-flat t-cyan !text-[10px]">
                  {schemaCount.included}/{schemaCount.total}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <span className="ml-1 text-[11.5px] text-foreground/60">
        {active === 'instr'
          ? 'Grounding rules Copilot reads before every answer.'
          : 'Expand a table to set reach and synonyms per field.'}
      </span>
    </div>
  )
}
