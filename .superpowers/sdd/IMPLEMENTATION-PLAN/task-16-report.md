# Task 4.3 Report — Post-save refresh (one post-save owner, AD-5)

**Status:** Complete.

## Summary

Created `src/write/refresh.ts` and `tests/unit/refresh.test.ts`. The refresh module is the ONE post-save owner: on a successful write the orchestrator commits `originalText <- written bytes`, shifts that file's stored spans by the applied patch deltas, and marks touched lazy layers `parseState = 'stale'`. A second in-session save does not false-conflict and a second in-session rename targets the current span (the AD-5 critical bar).

## `applyRefresh` interface — how patches are supplied

```ts
export function applyRefresh(
  file: string,
  writtenText: string,
  priorSpans: Record<string, SourceSpans>,
  priorText: string,
  patches: Patch[] = [],
): RefreshResult
```

- **Patches are supplied as a 5th parameter** (`patches: Patch[]`), default `[]`. The orchestrator passes the SAME `Patch[]` that produced `writtenText` via `applyPatches`. The refresh NEVER diffs `writtenText` vs `priorText` (diffing is not byte-faithful across re-serialization) and never re-derives deltas from text.
- **`RefreshResult`**: `{ text, spans }` where `text = writtenText` (the definitive new content) and `spans` is `Record<objectId, RefreshedSpans>` (per-object `{ declaration, name, docComment? }`, `Span | null`).
- **Input types**: `priorSpans: Record<string, SourceSpans>` — the per-file span set, keyed by objectId, each entry shaped per `domain/objects.ts` `SourceSpans` (`declaration`, `name`, `docComment?`), which is exactly what the tmdl-reader emits (`ModelObject` carries `declarationSpan`/`nameSpan`/`docCommentSpan`). The output `RefreshedSpans` permits `null` (a span whose content changed → the object must be re-derived).
- **Guard (correctness-first):** when `patches` is non-empty OR `writtenText !== priorText`, refresh asserts `applyPatches(priorText, patches) === writtenText`. A mismatch (e.g. patches omitted on a changed file) throws rather than emit silently wrong spans. This is why `priorText` is in the signature.
- **Purity:** no disk write, no mutation of inputs. `file` is bookkeeping for the error path (the shift math is over byte offsets).

## Span-shift logic

The shift is a monotone boundary remap. Every patch contributes a byte delta:

```
delta(p) = byteLen(p.replacement) - (p.end - p.start)   // replacedLen - removedLen
```

Patches are split into replacements/deletions (`nonIns`) and pure insertions (`ins`), sorted ascending by start. Two boundary-mapping functions are used to honor the half-open semantics:

- **`startPos(x)`** (a span's START boundary): counts a patch's delta when `p.end <= x`, counts an insertion when its point `<= x`. Insertions AT the start land before the span's first byte, so they shift the start.
- **`endPos(x)`** (a span's END boundary): counts a patch's delta when `p.end <= x`, counts an insertion when its point `< x`. An insertion exactly at the span's end lands AFTER the span's last byte, so it does NOT shift the end.

This is exactly the rule "a span whose start/end is after the applied patch's start shifts by the delta" plus the half-open boundary refinement that makes "a span BEFORE an insertion does NOT shift" true. A span's new location is `[startPos(start), endPos(end))`.

`startPos`/`endPos` throw if a boundary lands strictly inside a replaced region (a deleted byte). That is unreachable for a non-overlapping span and is kept as an invariant guard.

## Overlap-invalid handling (AD-5)

A span is **invalid (set `null`)** if it shares any byte with a replacement/deletion span: `s.start < p.end && s.end > p.start` (half-open overlap, non-insertion patches only). Pure insertions never invalidate. When a span is `null`, the caller must re-derive it from the written text (the renamed/edited object). This is the mechanism that makes the second in-session rename correct: after rename 1 the object's own name/declaration spans are `null`, and the orchestrator re-derives them from the current text before rename 2 targets them.

## `markLayersStale`

```ts
export function markLayersStale(
  layers: Record<string, LayerLike>,
  touchedFiles: Iterable<string> | string,
): Record<string, LayerLike>
```

Pure: returns a NEW layers object. Each layer whose parsed `data` references any touched file (a bounded breadth-first probe for a `file` string, matching the LSDL layer's `.file` and file references inside report/lineage data) gets `parseState = 'stale'`; all others keep their state. Inputs are never mutated. `LayerLike` is `{ parseState: 'idle'|'parsing'|'ready'|'error'|'stale', data? }`, matching AD-7's `layers[<layer>] = { parseState, data }`.

## TDD evidence

**RED** (`src/write/refresh.ts` not yet present):

```
Error: Cannot find module '../../src/write/refresh' imported from .../tests/unit/refresh.test.ts
```

**GREEN** (after creating the module):

```
Test Files  1 passed (1)
      Tests  10 passed (10)
```

The failing step after the module was written was a transient malformed source (a missing `}` once — esbuild `Expected '}' but found 'EOF'`), caught and fixed before GREEN. The fix brought the module's closing brace back; all 10 tests then passed.

## Files changed

- `src/write/refresh.ts` (new) — `applyRefresh`, `markLayersStale`, types.
- `tests/unit/refresh.test.ts` (new) — 10 tests.

## Test results

`npx vitest run tests/unit/refresh.test.ts` → **10 passed (10)**. Coverage of the brief's requirements:

1. A span after a preceding patch shifts by the delta (`[21,27) → [23,29)`; declaration `[12,32) → [14,34)`).
2. A span BEFORE an insertion does NOT shift; a span after it DOES (`[21,27) → [22,28)`).
3. **Two sequential renames** (AD-5 critical): rename 1 `Sales → Revenue` invalidates the object's own spans; the orchestrator re-derives the name span to `[6,13)`; rename 2 `Revenue → Profit` (`patch(6,13,'Profit')`) targets the correct span and yields `table Profit\n\tmeasure Amount = 1\n`. A second test re-derives the declaration span to `[0,14)`.
4. A span overlapping a replaced region is marked invalid (`null`).
5. `markLayersStale`: touched owning layer → `stale`, others preserved, input never mutated, nested/string forms handled.
6. `applyRefresh` returns `writtenText` as `text`.

## Self-review

- **Byte-faithful:** the shift math is over UTF-8 byte offsets and reuses `byteLen`; boundaries are half-open and consistent with the patch engine contract.
- **No string diffing**: deltas come from the supplied patches; `priorText` is only used in the reconstruct-equality guard.
- **AD-5 closure:** invalid spans are `null` so the orchestrator re-derives them; the two-rename test proves the second rename targets the current (re-derived) span.
- **Pure & leaf:** imports only `domain/*` and `write/patch-engine`; no fs/browser/state. `noUnusedLocals`-safe (all params/helpers used; removed a stray unused `isRecord`).
- **Escape hatches documented** in the module header.

## Concerns

1. **`markLayersStale` ownership detection is a heuristic** — it probes `data` for `file` strings. The exact report/lineage data shape isn't built yet (Task 8.x), so ownership may need tightening once those layer shapes land. The bounded BFS (40 k nodes) prevents a large layer from stalling a save but could miss a deeply nested reference beyond the budget.
2. **Invalidation is coarse by design**: any span sharing bytes with a patch is `null`. Since patches are token/line-anchored, only the touched object's spans invalidate in practice; but if a future write ever patches across two objects, both get re-derived (correct, just more work).
3. **Guard throws on patch/text mismatch.** This is the safe choice for a "critical" refresh, but a future caller passing `writtenText` from a different source (rather than `applyPatches(priorText, patches)`) will trip it. Documented in the header and the parameter doc.

## Commit

- `git commit -m "feat: step 4b91"` — `src/write/refresh.ts`, `tests/unit/refresh.test.ts`.
