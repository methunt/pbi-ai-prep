// Task 2.2 — domain/journal unit tests.
// TDD: written before src/domain/journal.ts exists (RED), green after implementation.
import { describe, expect, it } from 'vitest'
import {
  journalAdd,
  journalDiscard,
  project,
  type JournalRecord,
  type NewJournalRecord,
} from '../../src/domain/journal'
import type { ModelObject } from '../../src/domain/objects'

const FILE = 'definition/tables/Sales.tmdl'

function makeColumn(id: string, name: string, description?: string): ModelObject {
  return {
    id,
    type: 'column',
    name,
    table: 'Sales',
    file: FILE,
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
    ...(description === undefined ? {} : { description }),
  }
}

const fieldEdit = (objectId: string, value: unknown): NewJournalRecord => ({
  kind: 'field',
  objectId,
  field: 'description',
  new: value,
  file: FILE,
  context: 'user',
})

const deleteEdit = (objectId: string): NewJournalRecord => ({
  kind: 'delete',
  objectId,
  file: FILE,
  context: 'user',
})

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('journalAdd', () => {
  it('appends a field record with a UUID recordId and the pristine old, without mutating the input journal', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]
    const journal: JournalRecord[] = []

    const next = journalAdd(model, journal, fieldEdit('c1', 'Net revenue'))

    expect(journal).toHaveLength(0) // input untouched
    expect(next).toHaveLength(1)
    expect(next[0].recordId).toMatch(UUID)
    expect(next[0]).toMatchObject({
      kind: 'field',
      objectId: 'c1',
      field: 'description',
      old: 'Sum of Amount', // from the pristine model, not from a prior edit
      new: 'Net revenue',
      file: FILE,
      context: 'user',
    })
  })

  it('coalesces a re-edit of the same {objectId, field}: one record, old stays the pristine value, new is the latest, recordId stable', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]

    const first = journalAdd(model, [], fieldEdit('c1', 'First edit'))
    const second = journalAdd(model, first, fieldEdit('c1', 'Second edit'))

    expect(second).toHaveLength(1)
    expect(second[0].recordId).toBe(first[0].recordId) // same journal entry, re-edited
    expect(second[0]).toMatchObject({ old: 'Sum of Amount', new: 'Second edit' })
    expect(first[0]).toMatchObject({ old: 'Sum of Amount', new: 'First edit' }) // first untouched
    expect(second).not.toBe(first) // new journal array, no mutation
  })

  it('keeps edits to different fields or objects as separate records', () => {
    const model = [
      makeColumn('c1', 'Amount', 'Sum of Amount'),
      makeColumn('c2', 'Qty', 'Sum of Qty'),
    ]

    let journal = journalAdd(model, [], fieldEdit('c1', 'A'))
    journal = journalAdd(model, journal, { kind: 'field', objectId: 'c1', field: 'hidden', new: true, file: FILE, context: 'user' })
    journal = journalAdd(model, journal, fieldEdit('c2', 'B'))

    expect(journal).toHaveLength(3)
  })

  it('dedupes delete records on objectId', () => {
    const model = [makeColumn('c1', 'Amount')]

    const first = journalAdd(model, [], deleteEdit('c1'))
    const second = journalAdd(model, first, deleteEdit('c1'))

    expect(second).toHaveLength(1)
    expect(second[0].recordId).toBe(first[0].recordId)
  })
})

describe('journalDiscard', () => {
  it('removes only the record with the given recordId, leaving the input journal untouched', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]

    const journal = journalAdd(model, [], fieldEdit('c1', 'A'))
    const kept = journalAdd(model, journal, deleteEdit('x1'))

    const after = journalDiscard(model, kept, journal[0].recordId)

    expect(after).toHaveLength(1)
    expect(after[0].recordId).toBe(kept[1].recordId)
    expect(kept).toHaveLength(2) // input untouched
  })

  it('keeps everything when the recordId is unknown', () => {
    const model = [makeColumn('c1', 'Amount')]

    const journal = journalAdd(model, [], fieldEdit('c1', 'A'))
    const after = journalDiscard(model, journal, 'no-such-id')

    expect(after).toHaveLength(1)
  })
})

describe('project', () => {
  it('applies field records onto a fresh model and never mutates the inputs', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]
    const journal = journalAdd(model, [], fieldEdit('c1', 'Net revenue'))

    const folded = project(model, journal)

    expect(folded[0].description).toBe('Net revenue')
    expect(folded[0]).not.toBe(model[0]) // fresh object
    expect(model[0].description).toBe('Sum of Amount') // pristine untouched
    expect(folded).not.toBe(model) // fresh array
  })

  it('returns the model unchanged for an empty journal', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]

    const folded = project(model, [])

    expect(folded).toEqual(model)
    expect(folded).not.toBe(model)
  })

  it('applies the last field record per {objectId, field}', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]
    // Hand-built journal (bypassing journalAdd coalescing) to pin fold semantics.
    const journal: JournalRecord[] = [
      { kind: 'field', recordId: 'r1', objectId: 'c1', field: 'description', old: 'Sum of Amount', new: 'first', file: FILE, context: 'user' },
      { kind: 'field', recordId: 'r2', objectId: 'c1', field: 'description', old: 'Sum of Amount', new: 'second', file: FILE, context: 'user' },
    ]

    expect(project(model, journal)[0].description).toBe('second')
  })

  it('removes delete-recorded objects from the folded model, leaving the pristine model intact', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount'), makeColumn('c2', 'Qty', 'Sum of Qty')]
    const journal = journalAdd(model, [], deleteEdit('c2'))

    const folded = project(model, journal)

    expect(folded.map(o => o.id)).toEqual(['c1'])
    expect(model).toHaveLength(2) // pristine untouched
  })

  it('a delete wins over field edits for the same object', () => {
    const model = [makeColumn('c1', 'Amount', 'Sum of Amount')]

    let journal = journalAdd(model, [], fieldEdit('c1', 'Net revenue'))
    journal = journalAdd(model, journal, deleteEdit('c1'))

    expect(project(model, journal)).toEqual([])
  })

  it('deleting a TABLE cascades to its columns, calculated columns and measures', () => {
    // The children share the table's .tmdl file — the writer span-deletes the
    // whole file on save, so the fold must drop them or every surface shows
    // ghost rows after a table-only delete.
    const table: ModelObject = { ...makeColumn('t1', 'Sales'), type: 'table', table: '' }
    const col: ModelObject = { ...makeColumn('c1', 'Amount'), table: 'Sales' }
    const calc: ModelObject = { ...makeColumn('cc1', 'Amount Doubled'), type: 'calculatedColumn', table: 'Sales' }
    const measure: ModelObject = { ...makeColumn('m1', 'Total'), type: 'measure', table: 'Sales' }
    const other: ModelObject = { ...makeColumn('c2', 'Qty'), table: 'Inventory' }
    const model = [table, col, calc, measure, other]

    const folded = project(model, journalAdd(model, [], deleteEdit('t1')))

    expect(folded.map((o) => o.id)).toEqual(['c2'])
  })

  it('a table delete cascades even when a child was explicitly edited or deleted', () => {
    const table: ModelObject = { ...makeColumn('t1', 'Sales'), type: 'table', table: '' }
    const col: ModelObject = { ...makeColumn('c1', 'Amount'), table: 'Sales' }
    const measure: ModelObject = { ...makeColumn('m1', 'Total'), type: 'measure', table: 'Sales' }
    const model = [table, col, measure]

    let journal = journalAdd(model, [], fieldEdit('c1', 'Edited')) // edit moot after cascade
    journal = journalAdd(model, journal, deleteEdit('m1')) // explicit child delete too
    journal = journalAdd(model, journal, deleteEdit('t1'))

    expect(project(model, journal)).toEqual([])
  })
})
