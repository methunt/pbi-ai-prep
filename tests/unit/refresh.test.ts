// Task 4.3 — src/write/refresh post-save refresh unit tests (TDD: RED before
// src/write/refresh.ts exists, then GREEN).
//
// The refresh is the ONE post-save owner (AD-5): on a successful write the
// orchestrator commits, per written file, `originalText <- written bytes`,
// shifts that file's stored spans by the applied patch deltas, and marks
// touched lazy layers `parseState = 'stale'`. The critical bar (AD-5): a
// second in-session save does NOT false-conflict and a second in-session
// rename targets the CURRENT (shifted/re-derived) span, not a stale one.
//
// PINNED CONTRACT under test:
// - applyRefresh(file, writtenText, priorSpans, priorText, patches?) returns
//   `{ text: writtenText, spans }` where `spans` is objectId -> span set.
//   It NEVER writes to disk and NEVER diffs strings — the deltas come from the
//   orchestrator's applied `patches` (when `patches` is omitted and the text
//   changed, refresh throws rather than emit silently wrong spans).
// - A span after a preceding patch shifts by the patch's byte delta.
// - A span before an insertion does NOT shift.
// - A span that shares any byte with a replaced region is INVALID (set null):
//   the caller must re-derive it (AD-5).
// - markLayersStale(layers, touchedFiles) returns NEW layers whose owning
//   layer(s) have parseState = 'stale', leaving inputs untouched.

import { describe, expect, it } from 'vitest'
import { byteLen } from '../../src/domain/span'
import { locateDeclaration, locateNameToken } from '../../src/parse/spans'
import { applyPatches } from '../../src/write/patch-engine'
import type { Patch } from '../../src/write/patch-engine'
import { applyRefresh, markLayersStale } from '../../src/write/refresh'
import type { LayerLike } from '../../src/write/refresh'

const patch = (start: number, end: number, replacement: string): Patch => ({
  start,
  end,
  replacement,
})

// "table Sales\\n\\tmeasure Amount = 1\\n"
//   line 0: "table Sales\n"        bytes [0,12)  name "Sales"    [6,11)
//   line 1: "\tmeasure Amount = 1\n" bytes [12,32) name "Amount"  [21,27)
const TEXT = 'table Sales\n\tmeasure Amount = 1\n'
const OBJ_A = 'obj-sales' // the table, later renamed
const OBJ_B = 'obj-amount' // the measure, untouched by the rename
const priorSpans = {
  [OBJ_A]: { declaration: { start: 0, end: 12 }, name: { start: 6, end: 11 } },
  [OBJ_B]: { declaration: { start: 12, end: 32 }, name: { start: 21, end: 27 } },
}

// The rename patch: "Sales" -> "Revenue" (replacedLen 7, removedLen 5, delta +2).
const P_RENAME = patch(6, 11, 'Revenue')
const WRITTEN_1 = 'table Revenue\n\tmeasure Amount = 1\n'

describe('applyRefresh — span shifting by patch deltas', () => {
  it('shifts a span after a preceding patch by the delta', () => {
    const res = applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT, [P_RENAME])
    // Object B is entirely after the rename patch: every span shifts by +2.
    expect(res.spans[OBJ_B].declaration).toEqual({ start: 14, end: 34 })
    expect(res.spans[OBJ_B].name).toEqual({ start: 23, end: 29 })
  })

  it('does NOT shift a span before an insertion, but DOES shift one after it', () => {
    const p = patch(20, 20, 'X') // pure insertion at byte 20 (inside B's declaration)
    const written = applyPatches(TEXT, [p])
    const res = applyRefresh('definition/tables/Sales.tmdl', written, priorSpans, TEXT, [p])
    // Object A's spans are entirely before the insertion at byte 20 → unchanged.
    expect(res.spans[OBJ_A].declaration).toEqual({ start: 0, end: 12 })
    expect(res.spans[OBJ_A].name).toEqual({ start: 6, end: 11 })
    // Object B's spans (wholly after byte 20) shift by +1.
    expect(res.spans[OBJ_B].name).toEqual({ start: 22, end: 28 })
  })

  it('marks a span overlapping a replaced region as invalid (null)', () => {
    const res = applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT, [P_RENAME])
    // Object A (the renamed one) has spans that share bytes with the patch →
    // invalid, so the orchestrator re-derives them (AD-5).
    expect(res.spans[OBJ_A].name).toBeNull()
    expect(res.spans[OBJ_A].declaration).toBeNull()
    // A span that does NOT overlap is never invalidated.
    expect(res.spans[OBJ_B].name).not.toBeNull()
  })

  it('returns the written text as the definitive new content', () => {
    const res = applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT, [P_RENAME])
    expect(res.text).toBe(WRITTEN_1)
  })

  it('throws when writtenText was produced by no patches but differs from priorText', () => {
    expect(() =>
      applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT),
    ).toThrow(/writtenText is not applyPatches/i)
  })
})

describe('applyRefresh — two sequential renames (AD-5 critical bar)', () => {
  it('targets the CURRENT re-derived span, not a stale one', () => {
    // Rename 1: "Sales" -> "Revenue". Refresh shifts every following span and
    // marks OBJ_A's own spans invalid (the object is re-derived per AD-5).
    const res1 = applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT, [P_RENAME])
    expect(res1.spans[OBJ_A].name).toBeNull()

    // The orchestrator re-derives the renamed object's name span from the
    // CURRENT (written) text — this is the "refresh the snapshot" step.
    const declLine = 0 // "table Revenue" is still line 0 of the file
    const rederivedName = locateNameToken(WRITTEN_1, declLine)
    expect(rederivedName).toEqual({ start: 6, end: 13 }) // "Revenue" is [6,13)

    // Rename 2: "Revenue" -> "Profit" targets the re-derived span, never a stale one.
    const p2 = patch(rederivedName.start, rederivedName.end, 'Profit')
    expect(p2.start).toBe(6)
    expect(p2.end).toBe(13) // the shifted/current span, not the stale [6,11)
    expect(applyPatches(WRITTEN_1, [p2])).toBe('table Profit\n\tmeasure Amount = 1\n')
  })

  it('re-derives the declaration span from the current text after a rename', () => {
    const res1 = applyRefresh('definition/tables/Sales.tmdl', WRITTEN_1, priorSpans, TEXT, [P_RENAME])
    expect(res1.spans[OBJ_A].declaration).toBeNull()
    // A full re-parse of the written text yields the current declaration span.
    expect(locateDeclaration(WRITTEN_1, declLineOf(WRITTEN_1, 6))).toEqual({ start: 0, end: 14 })
  })
})

describe('markLayersStale — touched lazy layers become stale', () => {
  const file = 'definition/cultures/en-US.tmdl'
  const ready = 'ready' as const

  it('marks the owning layer stale and leaves others untouched (pure)', () => {
    const layers: Record<string, LayerLike> = {
      lsdl: { parseState: ready, data: { file, entities: {} } },
      report: { parseState: ready, data: { visuals: [] } },
      lineage: { parseState: 'idle', data: null },
    }
    const res = markLayersStale(layers, [file])
    expect(res.lsdl.parseState).toBe('stale')
    expect(res.report.parseState).toBe(ready)
    expect(res.lineage.parseState).toBe('idle')
    // Input is never mutated.
    expect(layers.lsdl.parseState).toBe(ready)
  })

  it('matches a touched file referenced by a nested layer entry', () => {
    const layers: Record<string, LayerLike> = {
      lsdl: { parseState: 'ready', data: { layers: [{ file }, { file: 'definition/cultures/fr-FR.tmdl' }] } },
    }
    const res = markLayersStale(layers, [file])
    expect(res.lsdl.parseState).toBe('stale')
  })

  it('accepts a single file path string', () => {
    const layers: Record<string, LayerLike> = { lsdl: { parseState: 'ready', data: { file } } }
    const res = markLayersStale(layers, file)
    expect(res.lsdl.parseState).toBe('stale')
  })
})

/** The 0-based line whose span contains byte `offset`. */
function declLineOf(text: string, offset: number): number {
  const lines = text.split('\n')
  let at = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = at + byteLen(line) + (i < lines.length - 1 ? 1 : 0)
    if (offset >= at && offset < next) return i
    at = next
  }
  return lines.length - 1
}
