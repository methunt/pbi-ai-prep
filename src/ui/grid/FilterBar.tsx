// FR-10 filter bar: one-action empty-description chip, unused chip, type and
// table dropdowns, free-text search, and "select all matching". Every change
// routes through `onFilter`, which the store handles by resetting to page 1.
import type { ChangeEvent } from 'react'
import { Search } from 'lucide-react'
import type { Filters } from '../../state/store'
import type { ObjectType } from '../../domain/objects'

export interface FilterBarProps {
  filters: Filters
  objectTypes: { value: ObjectType; label: string }[]
  tables: string[]
  counts: { all: number; empty: number; unused: number }
  matchCount: number
  selectedCount: number
  allMatch: boolean
  someMatch: boolean
  readOnly: boolean
  onFilter: (partial: Partial<Pick<Filters, 'query' | 'type' | 'table' | 'noDescription' | 'unused'>>) => void
  onToggleAll: (on: boolean) => void
}

type ChipKey = 'all' | 'empty' | 'unused'

export default function FilterBar({
  filters,
  objectTypes,
  tables,
  counts,
  matchCount,
  selectedCount,
  allMatch,
  someMatch,
  readOnly,
  onFilter,
  onToggleAll,
}: FilterBarProps) {
  const chip: ChipKey =
    filters.unused ? 'unused' : filters.noDescription ? 'empty' : 'all'

  const setChip = (key: ChipKey) => {
    if (key === 'empty') onFilter({ noDescription: true, unused: false })
    else if (key === 'unused') onFilter({ unused: true, noDescription: false })
    else onFilter({ noDescription: false, unused: false })
  }

  const onType = (e: ChangeEvent<HTMLSelectElement>) => {
    onFilter({ type: e.target.value === '' ? null : e.target.value })
  }
  const onTable = (e: ChangeEvent<HTMLSelectElement>) => {
    onFilter({ table: e.target.value === '' ? null : e.target.value })
  }

  const chipCls = (key: ChipKey) => `chip${chip === key ? ' on' : ''}`

  return (
    <div className="flex flex-none flex-wrap items-center gap-2 px-4 pb-3">
      <div className="relative min-w-[200px] max-w-[300px] flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45"
          aria-hidden="true"
        />
        <input
          className="field !pl-9"
          placeholder="Search objects, tables, DAX…"
          value={filters.query}
          aria-label="Search objects, tables, DAX"
          onChange={(e) => onFilter({ query: e.target.value })}
        />
      </div>

      <button type="button" className={chipCls('all')} onClick={() => setChip('all')}>
        All <span className="mono">{counts.all.toLocaleString()}</span>
      </button>
      <button type="button" className={chipCls('empty')} onClick={() => setChip('empty')}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" /> Empty{' '}
        <span className="mono">{counts.empty.toLocaleString()}</span>
      </button>
      <button type="button" className={chipCls('unused')} onClick={() => setChip('unused')}>
        <span className="h-1.5 w-1.5 rounded-full bg-sky" aria-hidden="true" /> Unused{' '}
        <span className="mono">{counts.unused.toLocaleString()}</span>
      </button>

      <select
        className="field w-auto !py-1.5 !text-[12px]"
        value={filters.type ?? ''}
        aria-label="Filter by object type"
        onChange={onType}
      >
        <option value="">All types</option>
        {objectTypes.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <select
        className="field w-auto !py-1.5 !text-[12px]"
        value={filters.table ?? ''}
        aria-label="Filter by table"
        onChange={onTable}
      >
        <option value="">All tables</option>
        {tables.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <label className="ml-auto flex cursor-pointer select-none items-center gap-2 text-[11.5px] text-foreground/55">
        <input
          type="checkbox"
          className="accent-primary h-3.5 w-3.5"
          checked={allMatch}
          aria-label="Select all matching"
          onChange={(e) => onToggleAll(e.target.checked)}
        />
        <span className={someMatch ? 'text-foreground/70' : ''}>
          Select all <span className="mono tabular">{matchCount.toLocaleString()}</span> matching
        </span>
        {selectedCount > 0 && (
          <span className="mono tabular text-foreground/70">· {selectedCount} selected</span>
        )}
      </label>

      {readOnly && (
        <span className="text-[11px] text-amber" title="Write access denied — read-only">
          read-only
        </span>
      )}
    </div>
  )
}
