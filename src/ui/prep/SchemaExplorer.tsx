// SchemaExplorer (FR-17) — the table-level AI data-schema & synonym explorer.
//
// Objects are grouped by their containing table. Each collapsed table row shows
// the field count, included/total reach and synonym total, plus an indicator dot
// that is GREY when EVERY field is excluded and BLUE when ANY is included. The
// row expands to list each field with its own include toggle (journal
// `lsdlVisibility`, false=Visible/Include, true=Hidden/Exclude) and its synonym
// chips. Bulk include/exclude applies over the expansion. Excluding an object
// that a currently-included object depends on raises a warning naming both
// (graph.dependents). Read-only (permission !== 'granted') disables edits.
import { useMemo, useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { useStore } from '../../state/store'
import type { LSDL, LSdlTerm } from '../../parse/lsdl-reader'
import type { ModelObject } from '../../domain/objects'
import SynonymChips from './SynonymChips'
import {
  buildAiRows,
  groupKeyOf,
  liveTerms,
  addTerm,
  removeTerm,
  SYNONYM_CAP,
  type AiObjectRow,
} from './lsdlModel'

interface SchemaExplorerProps {
  lsdl: LSDL
}

interface TableGroup {
  key: string
  rows: AiObjectRow[]
}

export default function SchemaExplorer({ lsdl }: SchemaExplorerProps) {
  const project = useStore((s) => s.project)
  const pristine = useStore((s) => s.pristine)
  const journal = useStore((s) => s.journal)
  const graph = useStore((s) => s.graph)
  const permission = useStore((s) => s.permission)
  const journalAdd = useStore((s) => s.journalAdd)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const readOnly = permission !== 'granted'
  const cultureFile = lsdl.file !== '' ? lsdl.file : 'definition/cultures/en-US.tmdl'

  const rows = useMemo(
    () => buildAiRows(lsdl, project.objects, pristine, journal),
    [lsdl, project.objects, pristine, journal],
  )
  const aiRowsById = useMemo(() => new Map(rows.map((r) => [r.obj.id, r])), [rows])

  const groups = useMemo<TableGroup[]>(() => {
    const byKey = new Map<string, AiObjectRow[]>()
    for (const row of rows) {
      const key = groupKeyOf(row.obj)
      const list = byKey.get(key)
      if (list === undefined) byKey.set(key, [row])
      else list.push(row)
    }
    const q = query.trim().toLowerCase()
    return [...byKey.entries()]
      .map(([key, groupRows]) => ({ key, rows: groupRows }))
      .filter((g) => {
        if (q === '') return true
        if (g.key.toLowerCase().includes(q)) return true
        return g.rows.some((r) => r.obj.name.toLowerCase().includes(q))
      })
            // Mockup keeps the model's order (TABLES array), not alphabetical —
      // alphabetising tables makes the AI-schema field order diverge.
  }, [rows, query])

  const includesFor = (list: AiObjectRow[]): { included: number; total: number } => {
    const included = list.filter((r) => !r.hidden).length
    return { included, total: list.length }
  }

  const synonymTotalFor = (list: AiObjectRow[]): number =>
    list.reduce((acc, r) => acc + liveTerms(r.terms).length, 0)

  const stageVisibility = (list: AiObjectRow[], hidden: boolean): void => {
    for (const r of list) {
      journalAdd({
        kind: 'field',
        objectId: r.obj.id,
        file: cultureFile,
        context: 'user',
        field: 'lsdlVisibility',
        new: hidden,
        old: undefined,
      })
    }
  }

  const stageTerms = (obj: ModelObject, terms: LSdlTerm[]): void => {
    journalAdd({
      kind: 'field',
      objectId: obj.id,
      file: cultureFile,
      context: 'user',
      field: 'synonyms',
      new: terms,
      old: undefined,
    })
  }

  const toggleExpand = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setAllExpanded = (expandAll: boolean): void => {
    setExpanded(expandAll ? new Set(groups.map((g) => g.key)) : new Set())
  }

  /** Included dependents of a field that would be affected by excluding it. */
  const dependentNames = (row: AiObjectRow): ModelObject[] => {
    const dependents = graph.dependents(row.obj.id)
    const names: ModelObject[] = []
    for (const id of dependents) {
      const dep = aiRowsById.get(id)
      if (dep === undefined) continue
      // Skip a dependent that is AI-EXCLUDED (effective lsdlVisibility /
      // entity Visibility) — never the model's PBI IsHidden flag, which is a
      // different signal entirely (FR-17 cross-impact warning).
      if (dep.hidden) continue
      names.push(dep.obj)
    }
    return names
  }

  return (
    <div className="card flex min-h-0 flex-col overflow-hidden" style={{ borderRadius: '1rem' }}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
        <div
          className="flex h-7 w-7 flex-none items-center justify-center rounded-lg"
          style={{
            background: 'color-mix(in srgb, var(--color-cyan) 12%, transparent)',
            color: 'var(--color-cyan)',
          }}
        >
          <Search className="h-3.5 w-3.5" strokeWidth={2.3} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold leading-none">AI data schema &amp; synonyms</h3>
          <div className="mt-1 text-[11px] text-foreground/60">
            Expand a table to set reach and synonyms per field
          </div>
        </div>

        <div className="relative ml-3 w-[210px]">
          <input
            type="text"
            className="field !py-1.5 !pl-8 !text-[12px]"
            placeholder="Filter tables or fields…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter tables or fields"
          />
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/55" aria-hidden="true" />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className="chip" onClick={() => setAllExpanded(true)}>
            Expand all
          </button>
          <button type="button" className="chip" onClick={() => setAllExpanded(false)}>
            Collapse all
          </button>
          <div className="mx-1 h-5 w-px bg-border" />
          <button type="button" className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => stageVisibility(rows, false)}>
            Include all
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => stageVisibility(rows, true)}>
            Exclude all
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {groups.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-foreground/55">
            No objects to show.
          </div>
        ) : (
          groups.map((group) => (
            <TableGroupRow
              key={group.key}
              group={group}
              expanded={expanded.has(group.key)}
              readOnly={readOnly}
              onToggleExpand={() => toggleExpand(group.key)}
              onStageVisibility={(hidden) => stageVisibility(group.rows, hidden)}
              onStageField={(row, hidden) => stageVisibility([row], hidden)}
              onAddTerm={(obj, terms) => stageTerms(obj, terms)}
              onRemoveTerm={(obj, terms) => stageTerms(obj, terms)}
              dependentNames={dependentNames}
              includesFor={includesFor}
              synonymTotalFor={synonymTotalFor}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface TableGroupRowProps {
  group: TableGroup
  expanded: boolean
  readOnly: boolean
  onToggleExpand(): void
  onStageVisibility(hidden: boolean): void
  onStageField(row: AiObjectRow, hidden: boolean): void
  onAddTerm(obj: ModelObject, terms: LSdlTerm[]): void
  onRemoveTerm(obj: ModelObject, terms: LSdlTerm[]): void
  dependentNames(row: AiObjectRow): ModelObject[]
  includesFor(list: AiObjectRow[]): { included: number; total: number }
  synonymTotalFor(list: AiObjectRow[]): number
}

function TableGroupRow({
  group,
  expanded,
  readOnly,
  onToggleExpand,
  onStageVisibility,
  onStageField,
  onAddTerm,
  onRemoveTerm,
  dependentNames,
  includesFor,
  synonymTotalFor,
}: TableGroupRowProps) {
  const { included, total } = includesFor(group.rows)
  const allExcluded = included === 0
  const synonymTotal = synonymTotalFor(group.rows)

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2.5 px-4 py-3 hover:bg-primary/5">
        <button
          type="button"
          className="flex flex-none items-center gap-2.5"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          aria-label={`${group.key} table`}
        >
          <ChevronRight
            className={`h-4 w-4 text-foreground/50 transition-transform ${expanded ? 'rotate-90' : ''}`}
            strokeWidth={2.2}
            aria-hidden="true"
          />
          <span
            className={`h-2.5 w-2.5 flex-none rounded-full ${
              allExcluded ? 'bg-foreground/30' : 'bg-primary'
            }`}
            aria-label={allExcluded ? 'All fields excluded' : 'Some fields included'}
            title={allExcluded ? 'All fields excluded' : 'Some fields included'}
          />
          <span className="text-[13px] font-semibold">{group.key}</span>
        </button>
        <span className="pill pill-flat t-slate mono !text-[10px]">
          {total} field{total === 1 ? '' : 's'}
        </span>
        <span className={`pill pill-flat mono !text-[10px] ${allExcluded ? 't-slate' : 't-amber'}`}>
          {included}/{total} in AI
        </span>
        <span className="pill pill-flat t-cyan mono !text-[10px]">
          {synonymTotal} synonym{synonymTotal === 1 ? '' : 's'}
        </span>
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <button type="button" className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => onStageVisibility(false)}>
            Include all
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={readOnly} onClick={() => onStageVisibility(true)}>
            Exclude
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-secondary/20 px-4 py-3">
          <div className="flex flex-col divide-y divide-border/60">
            {group.rows.map((row) => (
              <FieldRow
                key={row.obj.id}
                row={row}
                readOnly={readOnly}
                dependents={dependentNames(row)}
                onToggleInclude={() => onStageField(row, !row.hidden)}
                onAddTerm={(terms) => onAddTerm(row.obj, terms)}
                onRemoveTerm={(terms) => onRemoveTerm(row.obj, terms)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface FieldRowProps {
  row: AiObjectRow
  readOnly: boolean
  dependents: ModelObject[]
  onToggleInclude(): void
  onAddTerm(terms: LSdlTerm[]): void
  onRemoveTerm(terms: LSdlTerm[]): void
}

function FieldRow({ row, readOnly, dependents, onToggleInclude, onAddTerm, onRemoveTerm }: FieldRowProps) {
  const liveTermsCount = liveTerms(row.terms).length

  // A widened reach change: excluding (hiding) a field that included objects
  // depend on surfaces a warning naming both (graph.dependents).
  const warn = row.hidden && dependents.length > 0

  const handleAdd = (name: string): void => {
    const result = addTerm(row.terms, name)
    if (result.added) onAddTerm(result.terms)
  }
  const handleRemove = (name: string): void => {
    const result = removeTerm(row.terms, name)
    if (result !== row.terms) onRemoveTerm(result)
  }

  // Mockup field row (single line): [type-dot + type] [name ~190px + Used/not
  // reachable] [synonym chips — inline flex-wrap, flex-1] [switch — right].
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <span className="type-cell mt-0.5 flex-none">
        <span className="type-dot" aria-hidden="true" />
        {row.obj.type}
      </span>
      <div className="min-w-0 w-[190px] flex-none">
        <div className="truncate text-[12.5px] font-semibold">{row.obj.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-foreground/55">
          {row.hidden && <span className="opacity-70">not reachable</span>}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <SynonymChips
          terms={row.terms}
          onAdd={handleAdd}
          onRemove={handleRemove}
          readOnly={readOnly}
        />
        {warn && (
          <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-[11px] text-destructive">
            <span aria-hidden="true">⚠</span>
            <span>
              Excluding <span className="font-semibold">{row.obj.name}</span> also affects{' '}
              {dependents.map((d) => d.name).join(', ')} which depend on it.
            </span>
          </div>
        )}
      </div>
      <span className="mono tabular flex-none text-[11px] text-foreground/60">
        {liveTermsCount}/{SYNONYM_CAP}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={!row.hidden}
        aria-label={`${row.obj.name} included in AI`}
        className={`switch mt-0.5 flex-none ${row.hidden ? '' : 'on'} ${readOnly ? 'cursor-not-allowed' : ''}`}
        disabled={readOnly}
        onClick={onToggleInclude}
      />
    </div>
  )
}
