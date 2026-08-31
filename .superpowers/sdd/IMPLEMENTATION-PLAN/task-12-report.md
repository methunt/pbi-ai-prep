# Task 3.3 Report — LSDL reader + binding index

Status: DONE. Commit `0732ded` (`feat: step 7c2e`) on `feat/pbi-ai-prep`.

## Files changed

- **Created** `src/parse/lsdl-reader.ts` — authored fresh (no borrow; lineage-tracer has no LSDL reader). Pure (AD-3): no fs, no browser. Imports only `domain/span` (type + `byteLen`), `domain/objects` (type), `domain/identity` (`buildNameIndex`, `resolveName`).
- **Created** `tests/unit/lsdl-reader.test.ts` — 15 tests, TDD (RED before implementation existed, GREEN after).

## LSDL interface

```ts
interface LSdlTerm    { name; state /* Generated|Suggested|Deleted */; type?; weight?; lastModified? }
interface LSdlVisibility { value?; state? }                       // raw { Value, State }
interface LSdlEntity  { key; binding /* "[T].[C]" | "[T]" | "" */; state; visibility: LSdlVisibility | null; terms: LSdlTerm[]; semanticType? }
interface LSdlDangling{ binding; file; span: Span; state }
interface LSDL {
  file: string                       // +added: culture path derived from `cultureInfo <lcid>` (needed for error naming + dangling.file)
  customInstructions: string         // decoded JSON string, '' when absent
  entities: Record<string, LSdlEntity>
  relationships: unknown             // raw parsed section, null when absent
  agents: unknown                    // raw parsed section, null when absent
  block: Span | null                 // byte span of the linguisticMetadata value; null when absent
  contentTypeLine: number | null     // 0-based line index; null when absent
  dangling: LSdlDangling[]           // populated by buildBindingIndex; [] before
}
type LSDLBindingIndex = Map<string /*objectId*/, { file: string; span: Span; state: string }>
```

`parseLSDL(cultureText)` is pure; `buildBindingIndex(lsdl, objects)` resolves via the shared resolver and flags danglings on the LSDL (idempotent: the list is rebuilt each call, never accumulated).

## Block / contentType location approach

- One offset-tracked line scan (`scanLines`) records per line: content (`\r` stripped, matching `split('\n')` convention), trimmed text, **charStart** (UTF-16) and **byteStart** (UTF-8) of the line. CRLF is handled (real reference file is CRLF).
- Opener: first line whose trimmed text matches `/^linguisticMetadata\s*=/`. No opener → **empty LSDL** (`block`/`contentTypeLine` null, `''`/`{}`/null/[]), not an error.
- Two real shapes:
  - **Fenced** (triple-backtick, per TMDL expression convention): span = first backtick byte → after the closing fence's last backtick (exactly the task's "start at the first backtick, end after the closing one").
  - **Unfenced** — **the repo's actual reference shape**: the JSON object is written directly as the expression value (`linguisticMetadata =` newline-indented `{...}`). Span = the opening `{` byte → just past the matching `}` (the faithful analogue of the fence rule; `slice(block)` is exactly the parseable JSON).
- The matching `}` is found by a **string-aware brace scanner** (tracks `"`, `\` escapes), not brace counting — braces inside `CustomInstructions` prose cannot terminate the block early.
- **Char-space vs byte-space (the one real bug found and fixed):** JSON extraction and the brace scan run in **char space** (`charStart`); the recorded spans are converted to **UTF-8 byte offsets** (`byteAt`/`byteOfChar`). The first draft sliced the culture text with byte offsets via `String.slice` (UTF-16 indices), which mis-cut by the multi-byte surplus of the prefix (`é`, `—`) — caught by the TDD byte-exactness assertions, fixed, and now covered by UTF-8 fixtures.
- `contentTypeLine`: first line at/after the block end whose trimmed text starts with `contentType:`. The reader only records offsets — it never rewrites either the block or the contentType line (FR-6/FR-23). Tests assert non-disturbance by byte-slicing the ORIGINAL text with the returned spans and comparing verbatim.

## Binding-index resolution (AD-8) and dangling flag (FR-6)

- Each entity's `Definition.Binding` (`ConceptualEntity` + optional `ConceptualProperty`) is expressed as a canonical reference: `[Table].[Column]` (property present) or `[Table]` (table-level entity, e.g. `sales` → `[Sales]`), then resolved **exclusively through the shared resolver** — `buildNameIndex` + `resolveName`, never text search. The resolver handles bracket-quoted tables with spaces (`[Site Performance].[X]`).
- Resolved → `index.set(objectId, { file: obj.file, span: obj.declarationSpan, state: entity.state })` (model-side location; `state` = the LSDL entity's top-level `State`, e.g. `Generated`). First entity wins if two keys bind the same object (deterministic).
- Unresolved → **retained** (stays in `lsdl.entities`) **and flagged**: `lsdl.dangling.push({ binding, file: <culture file>, span: <block span>, state })`. Dangling `file`/`span` necessarily point at the culture file (no model object exists to own a span); the block span locates the region to inspect.
- Empty LSDL → empty index, no flags.

## Real-shape conformance notes (reference file, READ-ONLY)

`_test_pbip_w_ai/Programmatic Insights - CI.SemanticModel/definition/cultures/en-US.tmdl` (24 360 lines, CRLF, ~652 KB) smoke-parsed successfully:

- `file` = `definition/cultures/en-US.tmdl` (derived from `cultureInfo en-US`).
- `block = [47, 652459)` — byte-slicing the original file at that span yields parseable JSON (`sliceStartsBrace`/`sliceEndsBrace`/`sliceParses` all true).
- `contentTypeLine = 24358` (0-based) → the real `\t\tcontentType: json\r` line.
- 214 entities; `Relationships` and `Agents` present; `CustomInstructions` decoded (6 497 chars, real markdown).
- Entity shape matched: `Definition.Binding.{ConceptualEntity,ConceptualProperty}`, `State: Generated`, `Visibility {Value, State: Authored|absent}`, `Terms[]` with `Generated`/`Suggested`/`Deleted` states, `SemanticType`.
- Note: the reference file has **no triple-backtick fence** — the JSON is a direct indented expression. The reader supports both shapes; the primary test fixture mirrors the reference exactly, and a fenced variant is covered by dedicated tests (the task text described the fenced form).

## TDD evidence

1. **RED** — wrote `tests/unit/lsdl-reader.test.ts` first; `npx vitest run tests/unit/lsdl-reader.test.ts` failed with `Failed to resolve import "../../src/parse/lsdl-reader"` (module did not exist).
2. **GREEN** — implemented the reader; same command → 15/15 passed.
3. Two intermediate failures were caught and fixed by the tests themselves:
   - `blockStart is not defined` (leftover outer declaration after a refactor) — caught by the run.
   - **byte-vs-char offset bug** (above): `expected 1555 to be 1558` on the UTF-8 fixture; fixed by char-space extraction + byte-space spans; UTF-8 fixtures (`café`, `—`) now guard it permanently.

## Test results

- `tests/unit/lsdl-reader.test.ts`: **15/15 passed** (block boundaries byte-exact + not disturbed; contentType line located; four sections split; `[Sales].[Amount]`/`[Sales]` resolution via shared resolver; dangling binding retained+flagged + idempotent re-flag; fenced variant; empty LSDL; legible JSON-parse failure naming `definition/cultures/en-US.tmdl`; unterminated block).
- Full suite `npm test` (Vitest, node): **8 files / 118 tests, all passed** (exit 0).
- `npx tsc --noEmit -p tsconfig.app.json`: clean (exit 0).
- Real-file smoke (one-off script, deleted afterwards): results above.

## Self-review

- Pure-function contract held: `parseLSDL` takes only text; the temp smoke test did the fs read outside the reader.
- Constraints honored: no touching `_bmad-output/`, `_agents/`, `_bmad/`, `.superpowers/` (report file itself excepted, as instructed), `mockup/`, or the reference model; no formatter/linter config changed; eslint does not cover these paths (0 errors, config-side).
- Rules applied from tooling feedback: inlined a 2-callsite `errorMessage` helper (`ts-no-tiny-functions`); `Map` usages are all dynamic-key (binding index, id lookup) per `ts-set-map`.
- Also fixed en route: the first draft's outer `try/catch` would have double-wrapped `splitSections`' own legible error; JSON parsing now goes through one `parseJsonOr` boundary.

## Concerns / decisions worth the main agent's eyes

1. **`state` semantics** — the task did not pin down which state the index carries. I chose the LSDL entity's top-level `State` (always present in real data, e.g. `Generated`); `Visibility.State` (`Authored`) remains reachable on the entity itself (`visibility.state`). One-line change if rename planning wants authored-ness instead.
2. **Index value = model-side location** (`obj.file`/`obj.declarationSpan`) — chosen because the index is objectId-keyed and feeds rename planning; the LSDL side is patched by re-serializing the block JSON (spans inside one giant JSON block would be brittle).
3. **Unparseable-but-present `linguisticMetadata` without a `{`** (e.g. an expression reference like `= metadataExpr`) returns an empty LSDL, not an error — only malformed *JSON blocks* fail legibly. Flagging if the Prep tab should distinguish these.
4. **Dangling span = whole block span** (not per-entity JSON spans). Exact per-entity spans would require a position-tracking JSON parser; the block span locates the region and satisfies the `{binding, file, span, state}` contract.
5. `file` was **added** to the LSDL interface beyond the stated shape — required so error messages and dangling flags can name the culture file from a pure function (derived from the `cultureInfo` line; generic label `cultureInfo` when the line is absent).
