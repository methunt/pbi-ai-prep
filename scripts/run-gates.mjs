// Gate runner: executes the fidelity + usage acceptance gates headlessly in
// Node and exits non-zero on any failure. Wired as `npm run gates`.
//
// RED note (Task 1.2): until Phase 2-4 land, both gates fail with
// module-not-found — that failure is the expected outcome of this phase.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

const gates = ['tests/gates/fidelity.gate.ts', 'tests/gates/usage.gate.ts']
for (const gate of gates) {
  if (!existsSync(join(root, gate))) {
    console.error(`gates: missing gate file ${gate}`)
    process.exit(1)
  }
}

const config = join(root, 'tests', 'gates', 'vitest.gates.config.ts')
if (!existsSync(config)) {
  console.error('gates: missing tests/gates/vitest.gates.config.ts')
  process.exit(1)
}

// Drive the gates through vitest (already a devDependency) rather than adding
// a TS runner: resolves the gate files' extensionless src/ imports and keeps
// the dependency whitelist untouched. Spawn node + the vitest entry directly
// so this works on Windows shells without .cmd shims.
const require = createRequire(import.meta.url)
let vitestBin
try {
  vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
} catch {
  console.error('gates: vitest not installed — run npm ci first')
  process.exit(1)
}

console.log('gates: running fidelity + usage gates (headless Node)')
const result = spawnSync(process.execPath, [vitestBin, 'run', '--config', config], {
  cwd: root,
  stdio: 'inherit',
})
if (result.error) {
  console.error(`gates: failed to launch vitest — ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
