# Task 1.2 Report — Fidelity + Used-count gate harness (TDD RED state)

**Status:** complete · **Commit:** `c2083e9` `test: step c412` (branch `feat/pbi-ai-prep`) · **Gates:** RED (expected)

## What was created

### `tests/gates/usage.gate.ts` — Used-count gate (PRD §5)

Logic:
1. Resolves `MODEL_DIR` = `tests/fixtures/mock-model/` from `import.meta.url`.
2. `readTmdlFiles()` walks the tree recursively, collecting every `.tmdl` file as
   `{ path → text }` keyed by project-relative POSIX path (`definition/tables/Sales.tmdl`, …) —
   matching AD-2 file identity. Result: 7 files (database, model, relationships, 4 tables).
3. `parseTmdlProject(files)` → `{ objects, errors }`; non-empty `errors` fails the gate (a half-parsed
   fixture would make counts meaningless).
4. `buildGraph(objects)` → `graph.usage(id)` asserted for **EVERY** id in
   `expected-usage.json` (16 ids) on **all four fields** (`direct`, `transitive`, `leaf`, `total`) —
   per the task contract, stronger than the brief sketch's `total`-only check.
   Mismatch throws `Error` naming id, expected, and got, e.g.
   `usage mismatch for <lineageTag>: expected {"direct":2,...}, got {"direct":0,...}`.

Comparison once modules exist (Phase 2.4/3.2): `parseTmdlProject(files: Map<path,text>) → {objects, errors}`
(plan Task 3.2 shape), `buildGraph(objects) → graph.usage(id) → {direct, transitive, leaf, total}`
(Task 2.4). A marked **wiring point** shows where PBIR visual edges (Task 3.4 `parseReport`)
feed `buildGraph` so `leaf` counts (fixture case 4) are exercised; until then the gate fails on
case-4 rows — by design, forcing the 3.4 integration.

### `tests/gates/fidelity.gate.ts` — byte-fidelity gate (FR-23 / SM-1)

Logic:
1. Reference model = `tests/fixtures/mock-model/` (swapped to the real `_test_pbip_w_ai` in
   Task 8.1). `listModelFiles()` enumerates **every file of the PBIP tree except
   `expected-usage.json`** (gate input, not model) — 10 files: `.pbism`, `version.json`, 7 `.tmdl`,
   `visual.json` — as project-relative POSIX paths.
2. Reads each file's **raw bytes** (`Buffer`) + UTF-8 text.
3. Parses the `.tmdl` subset via `parseTmdlProject` (parse errors fail the gate).
4. Drives the write path for an edit-free save: `planWrites(objects, [], {})` — empty journal,
   no lazy layers. Then three assertions:
   - no plan may target a file outside the model tree;
   - **no patch may be planned for any file** (an edit-free save plans zero edits — the semantic bar);
   - `applyPatches(text, patches)` re-encoded to UTF-8 must be **byte-identical** to the original
     `Buffer` (`Buffer.equals`), with `firstDiff()` reporting the exact first differing byte offset
     on drift — error shape names file, expected, got (failure-legibility convention).

Comparison once modules exist (Phase 4.1/4.2): `applyPatches(originalText, patches)` never touches
untouched spans (`[] → identity`), so green requires the planner to emit an empty patch list for a
pristine model AND the patch engine to round-trip bytes exactly. Any serializer drift, BOM, or line-
ending change trips the byte compare.

### `scripts/run-gates.mjs` + `tests/gates/vitest.gates.config.ts` — runner

- Verifies both gate files and the config exist (guards against silent shrinkage of the gate set).
- Drives the gates through **vitest** (already a devDependency — keeps the dep whitelist untouched;
  `tsx` would have added one): spawns `node <node_modules/vitest/vitest.mjs> run --config
  tests/gates/vitest.gates.config.ts` with `stdio: 'inherit'` — direct node+entry spawn is
  Windows-safe (no `.cmd` shim / shell needed).
- Dedicated config: `environment: 'node'`, `include: ['tests/gates/*.gate.ts']` — gates never
  leak into `npm test` (root config includes `tests/**/*.test.ts` only).
- Propagates vitest's exit status; launch errors and missing files exit 1.
- package.json: `"gates": "node scripts/run-gates.mjs"`.

Gate files register their logic as a single named `it(...)` each ("usage gate: …", "fidelity gate:
…") — the runner mechanism only; the acceptance lives in the gate assertions (plain `throw Error`,
no `expect`), and no unit tests were added.

## RED verification — `npm run gates` (exact output)

```
gates: running fidelity + usage gates (headless Node)

 RUN  v4.1.11 D:/AI/pbi-ai-prep

 ❯ tests/gates/fidelity.gate.ts (0 test)
 ❯ tests/gates/usage.gate.ts (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/gates/fidelity.gate.ts [ tests/gates/fidelity.gate.ts ]
Error: Cannot find module '../../src/parse/tmdl-reader' imported from D:/AI/pbi-ai-prep/tests/gates/fidelity.gate.ts
 ❯ tests/gates/fidelity.gate.ts:18:1
     16| import { fileURLToPath } from 'node:url'
     17| import { it } from 'vitest'
     18| import { parseTmdl } from '../../src/parse/tmdl-reader'
       | ^
     19| import { applyPatches } from '../../src/write/patch-engine'

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  tests/gates/usage.gate.ts [ tests/gates/usage.gate.ts ]
Error: Cannot find module '../../src/domain/graph' imported from D:/AI/pbi-ai-prep/tests/gates/usage.gate.ts
 ❯ tests/gates/usage.gate.ts:17:1
     15| import { fileURLToPath } from 'node:url'
     16| import { it } from 'vitest'
     17| import { buildGraph } from '../../src/domain/graph'
       | ^
     18| import { parseTmdl } from '../../src/parse/tmdl-reader'

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  no tests
   Start at  07:15:20
   Duration  368ms (transform 48ms, setup 0ms, import 0ms, tests 0ms, environment 1ms)
```

**Exit code: 1.** Both suites fail at collection with module-not-found — `src/parse/tmdl-reader`,
`src/domain/graph` (and transitively `src/write/patch-engine`, `src/write/write-planner` in the
fidelity gate, which stops at its first unresolved import). This is the expected RED: no stubs were
invented to green it.

## Files changed (commit `c2083e9`, 5 files, +213/−1)

| File | Change |
| --- | --- |
| `tests/gates/usage.gate.ts` | new — Used-count gate |
| `tests/gates/fidelity.gate.ts` | new — byte-fidelity gate |
| `tests/gates/vitest.gates.config.ts` | new — dedicated gates runner config (runner infra, see self-review) |
| `scripts/run-gates.mjs` | new — gate runner, exits non-zero on any failure |
| `package.json` | `"gates": "node scripts/run-gates.mjs"` |

## Self-review

- **Acceptance criteria:** all five job items met — both gates written against the plan-pinned
  interfaces, runner wired, RED verified with captured output, random-data commit (`crypto.randomBytes`
  token), gates-only acceptance with no unit tests added.
- **RED quality:** the failure is a clean module-not-found at import resolution — it will flip to
  green exactly when the contracted exports land (no assertion rework needed beyond the marked
  adaptation points). Gate files stay out of `tsc -b` (tsconfig.node/app include only
  `vite.config.ts`/`vitest.config.ts`/`src`), so `npm run build` is unaffected in the RED state.
- **Scoped checks:** `npm test` → 1 file / 2 tests passed (gates excluded — no harness pollution);
  `eslint scripts/run-gates.mjs` → clean. Project-wide validation left to the main agent.
- **windows:** runner avoids `npx`/`.cmd` shims by spawning `process.execPath` + `vitest.mjs` directly.

## Concerns / notes for later tasks

1. **Extra 4th file** (`tests/gates/vitest.gates.config.ts`) beyond the three listed in the brief —
   required infra for the sanctioned "vitest-driven ts execution" route; `tsx` was rejected to keep
   the dependency whitelist untouched.
2. **Export name (Task 3.2):** resolved in fix round 1 — the binding contract (plan Task 3.2
   signature, recorded in the ledger) pins `parseTmdlProject(files) → { objects, errors }`; the
   gates import and call that exact name. (The original Concern 2 recommended the opposite
   direction — asking Task 3.2 to export `parseTmdl`; corrected.)
3. **Task 3.4 wiring point:** `buildGraph(objects)` is called without visual edges; fixture case 4
   (visual bound via field parameter, `leaf` counts) will fail the usage gate until the PBIR reader's
   visual edges feed `buildGraph` at the marked line. Intentional forcing function, not a gap.
4. **Adaptation points marked in-file:** empty-journal/layers representation for `planWrites`
   (Tasks 2.2/4.2) and the exact call shapes for `applyPatches` follow the landed Phase-4 interfaces.
5. Task 8.1 must repoint `MODEL_DIR` in the fidelity gate (single constant) to `_test_pbip_w_ai`.

## Fix round 1

- **Restored `"lint": "eslint ."`** in package.json — unintentionally dropped when wiring `gates`
  (the original edit ranged over the lint line). Scripts now read exactly:
  `dev, build, test, lint, gates, preview`.
- **Renamed `parseTmdl` → `parseTmdlProject`** in BOTH gates — import + call in
  `tests/gates/usage.gate.ts` (lines 18, 43) and `tests/gates/fidelity.gate.ts` (lines 18, 59),
  plus the in-file header comments. The binding contract (plan Task 3.2 signature, recorded in
  the ledger) pins `parseTmdlProject(files: Map<path, text>) → { objects, errors }`; the gates
  now use that exact name. Concern 2 above corrected accordingly (it originally recommended the
  wrong direction — asking Task 3.2 to export `parseTmdl` instead of renaming the gates).
- **Re-verification (all three):**
  - `npm run gates` → exit **1**, RED preserved: `Cannot find module '../../src/parse/tmdl-reader'`
    (fidelity.gate.ts:18) and `Cannot find module '../../src/domain/graph'` (usage.gate.ts:17) —
    authentic module-not-found, collection snippets now showing `parseTmdlProject`.
  - `npm test` → exit **0** (1 file, 2 tests passed; gates excluded from unit include).
  - `npm run lint` → restored, exit **0**.

