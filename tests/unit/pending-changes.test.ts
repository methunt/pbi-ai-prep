// Pending-changes modal (FR-12) — pure row-formatting contract.
// PendingChangesDialog renders one row per journal record via these helpers;
// these tests pin the labels + old→new humanising so AI-schema records
// (lsdlVisibility / synonyms / customInstructions) surface correctly.
import { describe, expect, it } from 'vitest'
import type { JournalRecord } from '../../src/domain/journal'
import type { ModelObject, ObjectType } from '../../src/domain/objects'
import {
  pendingFieldLabel,
  pendingNewText,
  pendingObjectLabel,
  pendingOldText,
  pendingValueText,
} from '../../src/ui/chrome/pendingChanges'

function make(id: string, type: ObjectType, name: string, table: string): ModelObject {
  return {
    id,
    type,
    name,
    table,
    file: table ? `definition/tables/${table}.tmdl` : 'definition/model.tmdl',
    declarationSpan: { start: 0, end: 100 },
    nameSpan: { start: 30, end: 30 + name.length },
    hidden: false,
    isFieldParameter: false,
  }
}

const fieldRec = (field: string, old: unknown, neu: unknown): JournalRecord => ({
  kind: 'field',
  recordId: 'r-1',
  objectId: 'm-1',
  file: 'definition/tables/Metrics.tmdl',
  context: 'user',
  field,
  old,
  new: neu,
})

describe('pendingFieldLabel — pill per record kind + field', () => {
  it('maps grid + AI-schema fields to their user-facing pills', () => {
    expect(pendingFieldLabel(fieldRec('description', '', 'x'))).toBe('description')
    expect(pendingFieldLabel(fieldRec('name', 'a', 'b'))).toBe('rename')
    expect(pendingFieldLabel(fieldRec('hidden', false, true))).toBe('visibility')
    expect(pendingFieldLabel(fieldRec('lsdlVisibility', false, true))).toBe('AI schema')
    expect(pendingFieldLabel(fieldRec('synonyms', [], []))).toBe('synonyms')
    expect(pendingFieldLabel(fieldRec('customInstructions', '', 'x'))).toBe('AI instructions')
  })

  it('labels a delete record and passes unknown fields through', () => {
    const rec: JournalRecord = {
      kind: 'delete',
      recordId: 'r-2',
      objectId: 'm-1',
      file: 'f',
      context: 'user',
    }
    expect(pendingFieldLabel(rec)).toBe('delete')
    expect(pendingFieldLabel(fieldRec('weirdField', 1, 2))).toBe('weirdField')
  })
})

describe('pendingObjectLabel — row identity', () => {
  const pristine = new Map<string, ModelObject>([
    ['m-1', make('m-1', 'measure', 'Media Cost', 'Metrics')],
    ['t-1', make('t-1', 'table', 'Metrics', '')],
  ])

  it('renders fields as Table[Name] and tables as the bare name', () => {
    expect(pendingObjectLabel(fieldRec('description', '', 'x'), pristine)).toBe('Metrics[Media Cost]')
    const tableRec = fieldRec('lsdlVisibility', false, true)
    expect(pendingObjectLabel({ ...tableRec, objectId: 't-1' }, pristine)).toBe('Metrics')
  })

  it('renders the model-wide instructions record and unknown ids', () => {
    const instr = { ...fieldRec('customInstructions', '', 'x'), objectId: '' }
    expect(pendingObjectLabel(instr, pristine)).toBe('AI Instructions (en-US)')
    expect(pendingObjectLabel({ ...fieldRec('description', '', 'x'), objectId: 'gone' }, pristine)).toBe('gone')
  })
})

describe('pendingValueText / pendingOldText / pendingNewText — old → new humanising', () => {
  it('maps empty values to an em dash', () => {
    expect(pendingValueText(undefined)).toBe('—')
    expect(pendingValueText(null)).toBe('—')
    expect(pendingValueText('')).toBe('—')
  })

  it('reads AI-schema booleans as Included/Excluded', () => {
    expect(pendingValueText(true)).toBe('Included')
    expect(pendingValueText(false)).toBe('Excluded')
  })

  it('reads the grid hidden field as Visible/Hidden on both sides', () => {
    const rec = fieldRec('hidden', false, true)
    expect(pendingOldText(rec)).toBe('Visible')
    expect(pendingNewText(rec)).toBe('Hidden')
  })

  it('joins synonym term arrays into a comma list', () => {
    expect(pendingValueText([{ name: 'cost' }, { name: 'spend' }])).toBe('cost, spend')
    expect(pendingValueText([])).toBe('—')
  })

  it('renders a delete as — → removed', () => {
    const rec: JournalRecord = {
      kind: 'delete',
      recordId: 'r-3',
      objectId: 'm-1',
      file: 'f',
      context: 'user',
    }
    expect(pendingOldText(rec)).toBe('—')
    expect(pendingNewText(rec)).toBe('removed')
  })
})
