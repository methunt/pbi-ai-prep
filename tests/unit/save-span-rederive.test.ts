// Regression test (AD-5): a rename cascade patching object B's DAX (a
// reference to renamed object A) lands inside B's declaration span WITHOUT
// editing B directly — applyRefresh correctly invalidates B's span (any
// patch overlapping a span invalidates it), but bakePristine's OLD fallback
// kept B's STALE declarationSpan.start "as a best effort". After a save shifts
// the file's bytes, that stale offset no longer lands on a line boundary, and
// the NEXT planWrites call for B throws:
//   "planWrites: recorded span for B does not land on a line boundary"
// — the exact "can't save more than once" bug. bakePristine must re-derive
// B's span via a single-file re-parse instead of trusting the stale offset.
import { describe, expect, it } from 'vitest'
import { buildGraph } from '../../src/domain/graph'
import { journalAdd, type NewJournalRecord } from '../../src/domain/journal'
import type { ModelObject } from '../../src/domain/objects'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { applyPatches } from '../../src/write/patch-engine'
import { applyRefresh } from '../../src/write/refresh'
import { planWrites } from '../../src/write/write-planner'
import { bakePristine, rederiveSpans } from '../../src/state/save'

const FILE = 'definition/tables/Sales.tmdl'
const rec = (model: ModelObject[], r: NewJournalRecord) => journalAdd(model, [], r)

function fixtureText(): string {
  return (
    'table Sales\n\tlineageTag: 11111111-1111-4111-8111-111111111111\n\n' +
    '\tmeasure \'Chain A\' = [Chain B]\n\t\tlineageTag: 22222222-2222-4222-8222-222222222222\n\n' +
    '\tmeasure \'Chain B\' = [Chain A]\n\t\tlineageTag: 33333333-3333-4333-8333-333333333333\n'
  )
}

describe('save.ts — span re-derivation after a rename cascade (regression)', () => {
  it('re-derives an invalidated span instead of leaving it stale — a second save then succeeds', () => {
    const text = fixtureText()
    const { objects, edges } = parseTmdlProject(new Map([[FILE, text]]))
    const graph = buildGraph(objects, edges)
    const chainA = objects.find((o) => o.name === 'Chain A') as ModelObject
    const chainB = objects.find((o) => o.name === 'Chain B') as ModelObject

    // Rename Chain B → Middle Chain: patches Chain B's own name token AND
    // (cascade) Chain A's DAX reference `[Chain B]` — Chain A's declaration
    // itself is untouched in content, but its span now overlaps a patch.
    const journal = rec(objects, {
      kind: 'field',
      objectId: chainB.id,
      field: 'name',
      new: 'Middle Chain',
      file: chainB.file,
      context: 'user',
    })
    const plans = planWrites(objects, journal, { texts: new Map([[FILE, text]]) }, graph)
    const patches = plans.get(FILE)?.patches ?? []
    expect(patches.length).toBe(2) // Chain B's name token + Chain A's [Chain B] reference

    const written = applyPatches(text, patches)
    const priorSpans: Record<string, { declaration: typeof chainA.declarationSpan; name: typeof chainA.nameSpan }> = {
      [chainA.id]: { declaration: chainA.declarationSpan, name: chainA.nameSpan },
      [chainB.id]: { declaration: chainB.declarationSpan, name: chainB.nameSpan },
    }
    const refresh = applyRefresh(FILE, written, priorSpans, text, patches)

    // Chain A's span WAS invalidated (its declaration overlaps the cascade patch).
    expect(refresh.spans[chainA.id]?.declaration).toBeNull()

    const baked = bakePristine(
      objects,
      journal,
      new Set([chainB.file]),
      { [FILE]: refresh.spans },
      { [FILE]: written },
    )
    const bakedChainA = baked.find((o) => o.id === chainA.id) as ModelObject

    // The FIX: declarationSpan must be RE-DERIVED (pointing at a real line in
    // the shifted text), never the stale pre-shift offset.
    const lineStarts = new Set<number>()
    let offset = 0
    for (const line of written.split('\n')) {
      lineStarts.add(offset)
      offset += new TextEncoder().encode(line).length + 1
    }
    expect(lineStarts.has(bakedChainA.declarationSpan.start)).toBe(true)

    // The actual regression: a SECOND planWrites call (e.g. renaming Chain A
    // itself, or any edit needing its span) must not throw the "line
    // boundary" error using the re-derived object.
    const secondJournal = rec(baked, {
      kind: 'field',
      objectId: chainA.id,
      field: 'description',
      new: 'Second edit after the cascade',
      file: bakedChainA.file,
      context: 'user',
    })
    expect(() => planWrites(baked, secondJournal, { texts: new Map([[FILE, written]]) })).not.toThrow()
  })

  it('rederiveSpans matches by lineageTag id across a byte shift', () => {
    const text = fixtureText()
    const { objects } = parseTmdlProject(new Map([[FILE, text]]))
    const chainA = objects.find((o) => o.name === 'Chain A') as ModelObject
    // Simulate the file after Chain B was renamed (shifts everything after it).
    const shifted = text.replace('[Chain B]', '[A Much Longer Middle Chain Name]')
    const rederived = rederiveSpans(chainA, shifted)
    expect(rederived).toBeDefined()
    const bytes = new TextEncoder().encode(shifted)
    const declText = new TextDecoder().decode(
      bytes.subarray(rederived!.declarationSpan.start, rederived!.declarationSpan.end),
    )
    expect(declText).toContain("measure 'Chain A' = [A Much Longer Middle Chain Name]")
  })
})
