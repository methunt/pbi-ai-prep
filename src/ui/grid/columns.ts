// Grid column order contract (FR-9). The order is fixed and binding:
// [Lineage Icon] Type | Table | Name | RenameTo | Used | Description | DAX,
// with the leading checkbox + lineage columns. `sortable` mirrors the mockup's
// `data-sort` headers; the sort key equals the column id.
export type ColId =
  | 'checkbox'
  | 'lineage'
  | 'type'
  | 'table'
  | 'name'
  | 'rename'
  | 'used'
  | 'desc'
  | 'dax'

export interface ColDef {
  id: ColId
  /** Header label; empty for the checkbox / lineage columns. */
  label: string
  sortable: boolean
}

export const COLUMNS: ColDef[] = [
  { id: 'checkbox', label: '', sortable: false },
  { id: 'lineage', label: '', sortable: false },
  { id: 'type', label: 'Type', sortable: true },
  { id: 'table', label: 'Table', sortable: true },
  { id: 'name', label: 'Name', sortable: true },
  { id: 'rename', label: 'Rename to', sortable: false },
  { id: 'used', label: 'Used', sortable: true },
  { id: 'desc', label: 'Description', sortable: true },
  { id: 'dax', label: 'DAX', sortable: true },
]

export const COLUMN_COUNT = COLUMNS.length

/** Per-row cell roles used by the ARIA grid (row/gridcell). */
export const GRID_ROLE = 'grid' as const
