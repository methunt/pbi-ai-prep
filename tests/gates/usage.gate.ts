// Usage-count gate (PRD §5): for EVERY id in tests/fixtures/mock-model/expected-usage.json
// the built ObjectGraph must report exactly the expected { direct, transitive, leaf, total }.
//
// Wired state (Task 3.4): relationship edges (Task 3.2) and PBIR visual edges
// (Task 3.4) feed buildGraph. Rows still mismatching belong to the pending
// DAX-reference feeders (measure / calcObject / fieldParam kinds) — the gate
// goes 16/16 when that task lands.
//
// Contracted call shape (pinned by IMPLEMENTATION-PLAN):
//   parseTmdlProject(files) -> { objects, edges, errors }   (Task 3.2)
//   parseReport(visuals, objects) -> { edges }              (Task 3.4)
//   buildGraph(objects, edges) -> graph; graph.usage(id)    (Task 2.4)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { buildGraph } from '../../src/domain/graph'
import { parseReport } from '../../src/parse/pbir-reader'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import expected from '../fixtures/mock-model/expected-usage.json'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

// Enumerate the fixture tree as { path -> text } keyed by project-relative
// POSIX path (AD-2 file identity), split into the TMDL model and the report's
// visual.json files.
function readFixtureFiles(): { tmdl: Map<string, string>; visuals: Map<string, string> } {
  const tmdl = new Map<string, string>()
  const visuals = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else {
        const rel = relative(MODEL_DIR, full).split(sep).join('/')
        if (entry.endsWith('.tmdl')) tmdl.set(rel, readFileSync(full, 'utf8'))
        else if (entry.endsWith('visual.json')) visuals.set(rel, readFileSync(full, 'utf8'))
      }
    }
  }
  walk(MODEL_DIR)
  return { tmdl, visuals }
}

it('usage gate: fixture Used counts match expected-usage.json (PRD §5)', () => {
  const { tmdl, visuals } = readFixtureFiles()
  const { objects, edges: tmdlEdges, errors } = parseTmdlProject(tmdl)
  if (errors.length > 0) {
    throw new Error(`fixture failed to parse: ${JSON.stringify(errors)}`)
  }
  // Wired (Task 3.4): parseReport(visuals, objects) -> visual edges feed
  // buildGraph alongside the TMDL reader's relationship edges, so leaf
  // (direct visual binding) counts are exercised.
  const report = parseReport(visuals, objects)
  const graph = buildGraph(objects, [...tmdlEdges, ...(report?.edges ?? [])])
  for (const [id, exp] of Object.entries(expected)) {
    const got = graph.usage(id)
    if (
      got.direct !== exp.direct ||
      got.transitive !== exp.transitive ||
      got.leaf !== exp.leaf ||
      got.total !== exp.total
    ) {
      throw new Error(`usage mismatch for ${id}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(got)}`)
    }
  }
})
