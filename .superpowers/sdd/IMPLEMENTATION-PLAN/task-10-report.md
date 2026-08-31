# Task 3.1 — Source-span emitter (plan task-10)

**Status:** COMPLETE. Branch `feat/pbi-ai-prep`, commit `a7cc858` `feat: step 3907` (2 files, +320).

## Files changed

- Created `src/parse/spans.ts` — the adapter-layer span emitter (imports only `src/domain/span`; AD-1 guard scans `src/domain/**` only, untouched).
- Created `tests/unit/spans.test.ts` — 18 unit tests, written FIRST (TDD RED before the module existed).

## Exact signatures

```ts
export function byteOffsetAt(text: string, charIndex: number): number
export function locateDeclaration(text: string, line: number): Span
export function locateDocComment(text: string, declStart: number): Span | undefined
export function locateNameToken(text: string, declLine: number): Span
```

`Span` is `{ start: number; end: number }` (half-open) re-exported as a type import from `src/domain/span`. `byteOffsetAt` is the required JS-string-index → UTF-8-byte-offset helper.

## Pinned conventions (contract for 3.2 reader / 4.2 write planner)

1. **Line numbers: 0-based**, exactly matching `text.split('\n')` indexing. The empty phantom segment after a trailing newline IS addressable (`locateDeclaration` returns a zero-length span there — an insertion point per `span.ts` semantics) and `lines.length === text.split('\n').length` always holds. Out-of-range line → `RangeError`.
2. **Line spans INCLUDE the line terminator** (`\r\n` = 2 bytes, `\n` = 1) when present. A final line without a terminator ends at the text's byte length. Rationale: the write path deletes blocks; with terminator-inclusive spans a block composes and deletes as `[first line start .. last line end]` with no leftover blank line and no `+1` adjustments. CRLF handled (a `\r` directly before `\n` is terminator, not content); a lone `\r` is content. Chosen over the line-content-only alternative and applied uniformly to every line, which subsumes the "include it for the last line of a block" requirement.
3. **Name-token span covers the token exactly as written** — quotes/brackets included: `"Name"`, `'Name'`, `[Name]`, or a bare identifier. A bare token ends at whitespace or `=`. Renaming = replace the span with a freshly quoted name. The token is the first token AFTER the leading keyword (`table`, `column`, `measure`, …); the keyword, type, or DAX expression are never inside the span.
4. **Doc-comment span** covers the contiguous run of `///` lines immediately above the line containing `declStart` (must be `locateDeclaration(...).start`), terminator included, so `span.end === declStart`. The run stops at any non-`///` line (blank, `//`, code); `undefined` when the line immediately above is not `///`. Indentation before `///` is part of the span. `declStart` outside the text → `RangeError`.
5. **Errors are thrown, never silent:** `RangeError` for out-of-range line/offset; `Error` for a line with no declaration/name token and for unterminated quoted/bracketed names — a wrong span would silently corrupt patches, so malformed input fails loudly.

## How byte offsets are computed

Single-pass internal `lineTable(text)` builds one entry per `split('\n')` segment with `byteStart`/`byteEnd` (terminator included) accumulated via the domain helper `byteLen` (`TextEncoder().encode(s).length` — never `.length`/JS string indices). Name tokens are found as JS indices within the line content, then converted line-locally: `start = line.byteStart + byteLen(content.slice(0, i))`, `end = start + byteLen(content.slice(i, tokenEnd))` — O(line) per token, not O(text) per call. Quoted-name scanning is doubled-quote aware (TMDL escaping: `measure 'Bob''s Measure'`). `byteOffsetAt(text, i)` = `byteLen(text.slice(0, i))`, O(i); `charIndex` must be a code-point boundary (surrogate-pair halves encode as replacement bytes — documented). All three locators are pure per call (rebuild the table each time); inputs are small TMDL sources.

## TDD evidence

**RED** — test file written first, module absent:

```
> npm test -- tests/unit/spans.test.ts
Error: Cannot find module '../../src/parse/spans' imported from D:/AI/pbi-ai-prep/tests/unit/spans.test.ts
```

**GREEN** — after implementing `src/parse/spans.ts`:

```
> npm test -- tests/unit/spans.test.ts
 RUN  v4.1.11 D:/AI/pbi-ai-prep
 Test Files  1 passed (1)
      Tests  18 passed (18)
 Duration  317ms
```

One mid-GREEN iteration: the first version of the `byteOffsetAt` test expected JS index 3 of `'aé🙂b'` → 7 bytes, but `🙂` is a surrogate pair occupying JS indices 2–3, so index 3 is mid-pair, not a boundary. Fixed the TEST expectation (boundaries 0/1/2/4/5 → 0/1/3/7/8) and documented the boundary requirement; the implementation was already correct.

## Test results

18/18 passed: declaration spans (0-based, terminator included, no-trailing-newline end, phantom zero-length, RangeError), doc-comment spans (contiguous `///` run, `end === declStart`, undefined cases, run interrupted by `//`), name tokens (quoted / bare / single-quoted / bracketed, keyword-and-expression excluded, no-token throws), and byte-correctness (`"Café ☕"` span = 11 UTF-8 bytes ≠ 8 JS units; earlier multi-byte lines shift later offsets; `byteOffsetAt` across multi-byte chars). Round-trip proof: every span is decoded back from `TextEncoder.encode(text).subarray(start, end)` and string-compared against the fixture.

Scoped checks: `npx tsc --noEmit --ignoreConfig --strict --target es2023 --module esnext --moduleResolution bundler --verbatimModuleSyntax --noUnusedLocals --noUnusedParameters <files>` — clean. ESLint only lints `**/*.{js,mjs,cjs}` in this repo, so TS files are intentionally out of its scope. Project-wide `npm test`/`npm run gates` left to the main agent per coordination rules.

## Self-review

- Reuses domain `byteLen`/`Span`; no duplicated encoder, no second convention beside the existing one.
- House style kept (single quotes, no semicolons, `// Task 3.1 —` header); a `ts-no-tiny-functions` rule violation was fixed by inlining the single-call-site `isDocLine`; `isBlankChar` kept (3 lockstep call sites). A mis-anchored edit during that fix was caught by re-read and repaired before any test run.
- `locateDocComment`/`locateNameToken`/`locateDeclaration` compose: reader can do `locateDocComment(text, locateDeclaration(text, i).start)` and the doc span end equals the declaration start (tested).
- AD-1 guard: `src/domain/**` untouched; adapter imports domain only.

## Concerns / notes for consumers

- `[Name]` bracket form is accepted because the task description mentions it, though real TMDL columns normally use bare or double-quoted names; harmless superset.
- Keyword is not validated against the `ObjectType` list — the locator is a generic "first token after the leading word" finder; the 3.2 reader owns deciding which lines are object declarations.
- Phantom trailing-line span is zero-length (insertion point); writers deleting to it will not remove the preceding terminator.
- Per-call line table rebuild is O(text) per locator call; if the 3.2 reader calls these per object over large files, a shared-table variant can be added later without breaking these signatures.
- `npm test` (full suite) not run here by design — siblings edit concurrently; scoped proof only.

## Fix round 1 — doc-comment indentation guard (review finding: Important)

**Finding:** `locateDocComment` walked up on the `///` prefix alone, so a `///` line deeper-indented inside a DAX body (e.g. the last line of a measure's expression block, `/// A excludes returns`) was captured as the doc comment of the FOLLOWING object. A 4.2 description write would then corrupt measure A's DAX body — the silent-corruption class this task exists to prevent. Span math itself was correct.

**Fix:** indentation guard on the doc-comment run (`src/parse/spans.ts`). A doc comment must sit at the declaration's EXACT indentation: `locateDocComment` now computes `declIndent = indentOf(lines[decl].content)` (leading-whitespace prefix) and the walk-up stops at any line that is blank, non-`///`, or differently indented — more-indented `///` is body/expression text, less-indented `///` belongs to the parent object. Both directions fail safe: wrongly excluded loses only a description; wrongly included corrupted DAX. Indentation is compared as the literal whitespace prefix string (strict "same indentation"); mixed tab/space styles therefore stop the run rather than mis-capture. `locateDocComment`'s JSDoc updated; a new `indentOf` helper (loop body, 2 lockstep call sites) was added.

**Regression tests (both in `locateDocComment` describe):**
- `never captures a /// line deeper-indented inside a DAX body` — measure "Total"'s body ends with `\t\t/// A excludes returns` directly above measure "Refunds"' declaration: `locateDocComment` for Refunds is `undefined` (the corrupted span 45..70 case), while Total's OWN doc comment at the same indentation still returns `\t/// Total sales amount.\n`.
- `never captures a /// line less indented than the declaration` — a column-0 `///` above a tab-indented declaration is not captured.

**Evidence:**

```
> npm test -- tests/unit/spans.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)     // was 18; +2 regression cases
```

Scoped strict `tsc` re-run clean (same flags as above). No signature changes; pinned conventions unchanged except the doc-comment rule now reads "contiguous `///` lines at the declaration's exact indentation".

**Committed:** random-data message per task constraints.
