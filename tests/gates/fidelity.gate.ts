// Fidelity gate (FR-23 / SM-1): opening the reference model and saving with no
// edits must leave every file byte-identical. The write path is byte-faithful by
// construction (AD-3): an empty journal plans no patch for any file, and the
// patch engine round-trips the original bytes untouched.
//
// RED state (Task 1.2): the Phase-4 write path (src/write/patch-engine,
// src/write/write-planner) and the Phase-3 reader (src/parse/tmdl-reader) do not
// exist yet, so this gate fails with a module-not-found error until Tasks 4.x /
// 3.2 land. That failure is the expected outcome, not a bug.
//
// Reference model: tests/fixtures/mock-model/ until Task 8.1 swaps in the real
// _test_pbip_w_ai model. Adaptation points when the real interfaces land are
// marked below (planWrites/applyPatches/parseTmdlProject shapes per Tasks 3.2/4.1/4.2).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { parseTmdlProject } from '../../src/parse/tmdl-reader'
import { applyPatches } from '../../src/write/patch-engine'
import { planWrites } from '../../src/write/write-planner'

const MODEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mock-model')

// Every file of the PBIP tree EXCEPT the gate's own expectations file,
// as project-relative POSIX paths.
function listModelFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else {
        const rel = relative(MODEL_DIR, full).split(sep).join('/')
        if (rel !== 'expected-usage.json') files.push(rel)
      }
    }
  }
  walk(MODEL_DIR)
  return files.sort()
}

// Offset of the first byte where the two buffers differ (== length when equal
// prefix, i.e. pure length drift).
function firstDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i
  }
  return n
}

it('fidelity gate: edit-free save is byte-identical (FR-23/SM-1)', () => {
  const paths = listModelFiles()
  const originals = new Map(paths.map((p) => [p, readFileSync(join(MODEL_DIR, p))]))
  const texts = new Map(paths.map((p) => [p, (originals.get(p) as Buffer).toString('utf8')]))

  const tmdlFiles = new Map([...texts].filter(([p]) => p.endsWith('.tmdl')))
  const { objects, errors } = parseTmdlProject(tmdlFiles)
  if (errors.length > 0) {
    throw new Error(`reference model failed to parse: ${JSON.stringify(errors)}`)
  }

  // Edit-free save: no journal records, no lazy layers parsed.
  // Adaptation point (Tasks 2.2/4.2): empty journal + layers representation
  // follows the landed domain shapes.
  const plans = planWrites(objects, [], {})

  for (const planned of plans.keys()) {
    if (!originals.has(planned)) {
      throw new Error(`fidelity: write plan targets file outside the model: ${planned}`)
    }
  }
  for (const [path, bytes] of originals) {
    const patches = (plans.get(path) as { patches?: unknown[] } | undefined)?.patches ?? []
    if (patches.length > 0) {
      throw new Error(`fidelity: edit-free save planned ${patches.length} patch(es) for ${path}`)
    }
    const written = applyPatches(texts.get(path) as string, patches as never[])
    const writtenBytes = Buffer.from(written, 'utf8')
    if (!writtenBytes.equals(bytes)) {
      const at = firstDiff(bytes, writtenBytes)
      throw new Error(
        `fidelity: ${path} drifted after edit-free save — expected ${bytes.length} bytes, got ${writtenBytes.length} (first diff at byte ${at})`,
      )
    }
  }
})
