// Usage-count gate (PRD §5): for EVERY id in tests/fixtures/mock-model/expected-usage.json
// the built ObjectGraph must report exactly the expected { direct, transitive, leaf, total }.
//
// RED state (Task 1.2): src/parse/tmdl-reader and src/domain/graph do not exist yet,
// so this gate fails with a module-not-found error until Phase 2.4 / 3.2 land. That
// failure is the expected outcome, not a bug.
//
// Contracted call shape (pinned by IMPLEMENTATION-PLAN):
//   parseTmdlProject(files: Map<path, text>) -> { objects, errors }   (Task 3.2)
//   buildGraph(objects) -> graph; graph.usage(id) -> { direct, transitive, leaf, total }  (Task 2.4)
// Visual (leaf-kind) edges arrive via the PBIR reader (Task 3.4) and feed buildGraph
// at the marked wiring point below.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { buildGraph } from '../../src/domain/graph'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import expected from '../fixtures/mock-model/expected-usage.json'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

// Enumerate the definition tree's .tmdl files as { path -> text } keyed by
// project-relative POSIX path (AD-2 file identity).
function readTmdlFiles(): Map<string, string> {
  const files = new Map<string, string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.tmdl')) {
        const rel = relative(MODEL_DIR, full).split(sep).join('/')
        files.set(rel, readFileSync(full, 'utf8'))
      }
    }
  }
  walk(MODEL_DIR)
  return files
}

it('usage gate: fixture Used counts match expected-usage.json (PRD §5)', () => {
  const { objects, errors } = parseTmdlProject(readTmdlFiles())
  if (errors.length > 0) {
    throw new Error(`fixture failed to parse: ${JSON.stringify(errors)}`)
  }
  const graph = buildGraph(objects)
  // Wiring point (Task 3.4): parseReport(visuals) -> visualEdges feed buildGraph
  // so leaf (direct visual binding) counts are exercised.
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
