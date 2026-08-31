# Task 0.3 Report: AD-1 enforcement + test harness

**Status: DONE_WITH_CONCERNS → superseded by "Fix round 1" (bottom): AD-1 moved from lint to a unit-test gate per Main ruling; all gates green.**
**Commit: `4b2e853` — `chore: step dd2d`** (random token from `/dev/urandom`, brief's style; no project/company names)
**Branch: `feat/pbi-ai-prep`** · Working tree clean after commit · 5 files changed, +38/−1

## 1. `eslint.config.js` — AD-1 block (existing JS rules untouched)

Appended a third flat-config block after the existing JS block (lines 1–19 unchanged):

```js
{
  files: ['src/domain/**/*.ts'],
  rules: {
    'no-restricted-globals': [
      'error',
      { name: 'window', message: 'AD-1: domain/ is a pure leaf - no browser globals' },
      { name: 'document', message: 'AD-1: domain/ is a pure leaf - no DOM access' },
      { name: 'showDirectoryPicker', message: 'AD-1: domain/ must not use the File System Access API' },
      { name: 'showOpenFilePicker', message: 'AD-1: domain/ must not use the File System Access API' },
      { name: 'showSaveFilePicker', message: 'AD-1: domain/ must not use the File System Access API' },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            regex: '(?:^|/|(?:\\.\\./)+)(?:src/)?(?:parse|write|fs|state|ui|worker|ai)(?:/|$)',
            message: 'AD-1: domain/ is a pure leaf - may not import parse/, write/, fs/, state/, ui/, worker/ or ai/',
          },
        ],
      },
    ],
  },
},
```

### Design notes

- **Scope**: only `src/domain/**/*.ts`. Browser/FS code in `ui/`, `fs/`, `state/` is untouched (verified: lint exit 0 over the whole repo, which contains `src/ui/theme.ts` using `document`).
- **FSA globals**: all three picker globals banned (`showDirectoryPicker`, `showOpenFilePicker`, `showSaveFilePicker`) — the brief's list was non-exhaustive ("e.g."), so the third FSA method is included.
- **Import ban — depth-independent regex, not `../` groups.** The brief's `group: ['../parse/*', …]` only matches depth-1 imports. Since there are no path aliases in `tsconfig.app.json`/`vite.config.ts` (checked), layer imports are relative (`../parse/x` from `src/domain/`, `../../parse/x` from `src/domain/sub/`). The regex keys on the layer-name segment after any of: string start, one-or-more `../` prefixes, any `/` (covers `@/…` aliases if one is ever added), with an optional explicit `src/` segment; the layer name must be followed by `/` or end-of-string. Matched forms (all probe-verified): `../parse/x`, `../../write/x`, `src/parse/x`, `@/state/x`, and bare layer names (e.g. `fs` — the Node builtin — which a pure leaf must not import anyway).
- **No typescript-eslint added** — config stays JS-only for parsing, per constraint. `no-restricted-*` are core rules, no new plugins.
- Known regex trade-off: an npm package named exactly `parse`/`write`/`fs`/`state`/`ui`/`worker`/`ai` (e.g. Vercel's `ai` SDK) would be banned from `domain/` too — consistent with AD-1's spirit (domain must not import the app's `ai/` layer); flagged in Concerns.

## 2. `vitest.config.ts` (new)

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Acceptance for this task: `npm test` is green with 0 tests until Phase 1 adds them.
    passWithNoTests: true,
  },
})
```

**Deliberate deviation from the brief's literal snippet**: `passWithNoTests: true`. Without it, `vitest run` exits **1** on zero test files ("No test files found, exiting with code 1" — counterfactually verified via `npx vitest run --no-passWithNoTests`), which would violate the acceptance criterion "`npm test` runs green (0 tests, no crash)". Once real tests exist, they gate normally; the flag only affects the empty case.

## 3. `package.json` — `test` script added

`"test": "vitest run"` inserted after `lint`; `dev`/`build`/`lint`/`preview` untouched. No dependency changes (package-lock.json unmodified).

## 4. `tests/unit/.setup.ts` (new)

Minimal placeholder (2 comment lines, intentionally empty body): reserved for future Vitest global setup. NOT wired into `test.setupFiles` yet — wiring was not requested; the leading-dot name guarantees `include: ['tests/**/*.test.ts']` never picks it up as a test.

## 5. Supporting change: `tsconfig.node.json`

`"include": ["vite.config.ts"]` → `"include": ["vite.config.ts", "vitest.config.ts"]` (one-line edit). Canonical Vite pattern so the new config file lives inside a TS project instead of being type-checked by nothing. `tsc -b` verified clean with it (build gate below). Deviation from the brief's file list — flagging it explicitly.

## Verification (all gates green)

1. **Rule behavior — probe files** (created in `src/domain/`, results captured, then deleted):
   - Violation probe: `../parse/pipe` ✗, `../../write/emit` ✗, `src/parse/x` ✗, `@/state/store` ✗ (4× `no-restricted-imports` with AD-1 message) + `window`, `document`, `showDirectoryPicker`, `showOpenFilePicker`, `showSaveFilePicker` ✗ (5× `no-restricted-globals`). **9/9 caught**, depth-independent ✓.
   - Clean probe (imports of `zustand`, `elkjs`, `@tanstack/react-virtual`, `@xyflow/react`, `lucide-react`, `react-dom/client`, `react`): **0 errors** — no false positives on the real dependency tree.
   - TS-syntax probe (`export const x: number = 1`): `Parsing error: Unexpected token type` — see Concern 1.
2. **`npm run lint`** → exit **0**, no findings (probes removed).
3. **`npm run build`** (`tsc -b && vite build`) → exit **0**: `tsc -b` clean including `vitest.config.ts`; vite build ✓ 17 modules, 570ms.
4. **`npm test`** → exit **0**: `RUN v4.1.11 … No test files found, exiting with code 0`. Counterfactual (flag off) → exit 1.

## Files changed (commit `4b2e853`)

- Modified: `eslint.config.js` (AD-1 block appended), `package.json` (+test script), `tsconfig.node.json` (+vitest.config.ts in include)
- Created: `vitest.config.ts`, `tests/unit/.setup.ts`
- Untouched: `_bmad-output/`, `_agents/`, `_bmad/`, `_test_pbip_w_ai/`, `mockup/`, `.superpowers/` (gitignored — this report is not committed)

## Self-review

- Existing JS rules byte-identical (read-back verified after commit); no other config entries affected.
- `no-restricted-*` are ESLint core rules — no new deps, whitelist respected; package-lock.json untouched.
- Probe files fully removed (`rm` + `rmdir src/domain`); no leftovers (`git status` clean).
- Windows CRLF warnings from git are the repo's existing autocrlf behavior (same as prior commits).
- `tests/` is not in any tsconfig include yet — test files land in Phase 1 and will need their own project; not this task's scope.

## Concerns

1. **Material — espree cannot parse TS syntax; domain `.ts` files with type annotations will make `npm run lint` fail with `Parsing error` until a TS parser exists.** Probe-proven (`Unexpected token type`). This is the state the constraints mandate ("config stays JS-only for parsing", typescript-eslint outside the whitelist — Task 0.1 report already documented the same limitation for the repo at large), but my block actively pulls `src/domain/**/*.ts` into the lint set, so Phase 1's first domain file with an annotation will trip it. Exact remediation when the whitelist allows it: `npm i -D typescript-eslint`, then add `languageOptions: { parser: tsParser }` to the domain block (rules stay identical). Alternative short-term dodge (rejecting until sanctioned): scope `files` to `src/domain/**/*.js` so domain TS stays unlinted — but that drops the AD-1 net, so I kept the mandate as written.
2. **Minor — `passWithNoTests: true` is one key beyond the brief's literal config snippet** (required to meet the stated "0 tests green" acceptance; counterfactually proven). If the controller prefers the literal snippet, remove the key — but then `npm test` exits 1 until Phase 1 adds real tests.
3. **Info — regex bans bare npm packages named `parse`/`write`/`fs`/`state`/`ui`/`worker`/`ai` from `domain/`** (consistent with AD-1's leaf intent; relevant only if the `ai` SDK or similar is ever wanted inside domain, which AD-1 forbids anyway). `node:`-prefixed builtins (`node:fs`) are not matched — outside the enumerated layer list; `showSaveFilePicker` was added beyond the brief's two examples for completeness.

## Fix round 1: AD-1 moved from lint to unit test (Main ruling)

**Commit: `a9fb830` — `fix: step 0890`** · 2 files changed, +110/−24 · Working tree clean after commit.

Main's address-before-review ruling: the `src/domain/**/*.ts` eslint rules cannot execute without a TS parser (typescript-eslint outside the dep whitelist — Concern 1 above), so AD-1 is enforced by a headless Node unit test and the TS-scoped lint rules are reverted. This resolves Concern 1; Concern 2 (`passWithNoTests`) and Concern 3 (regex trade-offs, now living in the test) remain as documented.

### Change 1 — `eslint.config.js` reverted

Removed the entire `files: ['src/domain/**/*.ts']` block (both `no-restricted-*` rule groups). The config is byte-identical to the pre-task state (verified by read-back: same 20 lines, same snapshot tag as before the first edit). `npm run lint` is JS-only and green again; nothing else in the repo lints `.ts` files, so no parse-error landmine remains.

### Change 2 — `tests/unit/ad1-guard.test.ts` (new, the real AD-1 gate)

Runs under `npm test` (vitest, node env, matched by `include: ['tests/**/*.test.ts']`). Two test cases under `describe('AD-1: src/domain is a pure leaf')`:

1. **imports nothing from `parse/`, `write/`, `fs/`, `state/`, `ui/`, `worker/`, `ai/`** — recursively enumerates `src/domain/**/*.ts` (`node:fs` walk; 0 files ⇒ vacuous pass until domain exists), strips `//` and `/* */` comments (commented-out imports and prose must not trip it), extracts module specifiers from `from '…'`, bare `import '…'`, and dynamic `import('…')` syntax, and tests each against the same depth-independent segment regex proven in round 1: `(?:^|\/|(?:\.\.\/)+)(?:src\/)?(?:parse|write|fs|state|ui|worker|ai)(?:\/|$)` — covers `./`…`../../` relative forms AND `src/<layer>` absolute form (plus `@/<layer>` alias-style, and bare `fs`).
2. **references no `window`, `document`, `showDirectoryPicker`, `showOpenFilePicker`, `showSaveFilePicker`** — word-boundary match on comment-stripped lines. All four globals from Main's list plus `showSaveFilePicker` (the third FSA picker — AD-1 bans "the File System Access API", and round 1's lint rule already included it).

Both failures print `src/domain/<file>:<line>` + the offending specifier/identifier (e.g. `src/domain/x.ts:2 imports '../parse/pipe' (banned sibling layer)`) via vitest's `expect(actual, message)` second-arg message.

**Implementation notes:**
- Reads files as text — no TS parsing involved, so the espree limitation is irrelevant; `type` annotations in domain files cannot break the gate.
- The first draft had a genuine bug the probe round caught: unescaped `/` inside the regex literal terminated it early (`PARSE_ERROR at 16:32`, surfaced by vite 8/oxc as an empty-looking "Transform failed with 1 error"). Fixed by escaping every literal slash; regex is now semantically identical to round 1's string form used in eslint.
- `tests/` is in no tsconfig project (noted in round 1) — the build never type-checks the test file; vitest transforms it at runtime.

### Verification (all green)

1. **Guard bites — probe round**: created `src/domain/__probe_guard__.ts` containing 3 banned imports (`../parse/pipe`, `../../write/emit`, `src/parse/x`), `document`, `showDirectoryPicker`, a `zustand` import, a TS annotation, and a comment mentioning `document` + `../ui/theme`. `npx vitest run tests/unit/ad1-guard.test.ts` → **2/2 tests FAIL with exactly the right messages**: 3 import violations (lines 1/2/3) + 2 global violations (lines 7/8); `zustand` (line 4) and the comment NOT flagged. Probe deleted afterward.
2. **`npm run lint`** → exit 0 (JS-only config restored).
3. **`npm test`** → `Test Files 1 passed (1) / Tests 2 passed (2)`, exit 0 — now ≥1 real test as required.
4. **`npm run build`** (`tsc -b && vite build`) → exit 0, clean (522ms).
5. A minimal smoke test file was also used during bisection and deleted; no probe residue (`git status` clean).
