# Task 4.1 Report — Patch Engine (byte-faithful writer core)

Status: COMPLETE. Commit `01db508` ("feat: step 5543") on `feat/pbi-ai-prep`.
TDD followed: tests written first (RED: module not found), then implementation (GREEN: 21/21).

## Files changed
- Created `src/write/patch-engine.ts` — the patch engine (~100 lines, pure leaf, zero imports; TextEncoder/TextDecoder as globals, same convention as `domain/span.ts`).
- Created `tests/unit/patch-engine.test.ts` — 21 unit tests in 6 describe blocks.

## Exported interface
```ts
export interface Patch {
  start: number        // inclusive UTF-8 BYTE offset into the ORIGINAL text
  end: number          // exclusive; start === end marks a pure insertion point
  replacement: string  // literal text, inserted verbatim; '' deletes the span
}
export function applyPatches(originalText: string, patches: Patch[]): string
```

## Descending-order + overlap-reject logic
- Sort a copy of `patches` DESCENDING by `start`, ties DESCENDING by `end`
  (`b.start - a.start || b.end - a.end`). `Array#sort` is stable, so equal
  `(start, end)` patches keep input order. The caller's array is never mutated.
- Conflict detection runs in the same descending pass, before splicing:
  - **Overlap (share >= 1 byte) → `Error`** (never a fallback). Walking
    descending, all previously applied non-empty patches start at or after the
    current one, so only the most recent non-empty patch (`applied`) can be
    reached: `p.end > applied.start` ⇒ throw. This catches identical spans,
    partial overlaps, contained spans, and same-start sub-ranges.
  - **Insertion strictly inside a replaced span → `Error`** (deliberate
    addition, see Self-review): an insertion point `[s,s)` with
    `p.start < s < p.end` targets a byte the replacement deletes — the edit is
    ambiguous (no defined position inside the replacement text), so it is a
    planner bug like an overlap. Tracked via the most recent insertion point;
    insertions AT a span's start/end boundary remain legal and land adjacent
    to the replacement (before it at start, after it at end).
  - **Range validation → `RangeError`** (deliberate addition, see
    Self-review): non-integer, negative, inverted (`end < start`), or
    beyond-text offsets throw instead of silently corrupting via `subarray`
    clamping.
- Empty patches (`end === start`) share no bytes by definition, so insertions
  never trigger the overlap guard — including two insertions at the same byte,
  which both apply (later-listed lands first/leftmost, matching sequential
  descending application).

## Byte-splicing approach
1. Encode `originalText` **once** → `Uint8Array` (multi-byte chars before a
   patch can never shift byte offsets).
2. Walk the descending-sorted patches emitting segments tail-first: for each
   patch push `bytes.subarray(p.end, pos)` (untouched bytes up to the previous
   patch's start) then `encoder.encode(p.replacement)`; set `pos = p.start`.
   Finally push `bytes.subarray(0, pos)` (head) and reverse the segment list.
3. `concatBytes` allocates exactly one output buffer of the total length and
   `set`s each segment (one copy total; `subarray`s are views, not copies).
4. Decode once with `TextDecoder`.
Cost: O(n log n) sort + O(text + patches) single pass, one encode of the
original, one decode, one output allocation. Empty patch list returns
`originalText` by reference — a true identity (`toBe`-verified in tests), so an
edit-free save never touches the file.

The brief's inline sketch was NOT copied: its concat order was reversed (tail
pushed before head) and its guard referenced an undefined
`firstStartOfApplied`. The contract (descending + overlap-reject +
byte-faithful) is implemented directly.

## TDD evidence
- RED: `npx vitest run tests/unit/patch-engine.test.ts` →
  `Error: Cannot find module '../../src/write/patch-engine'` (test file
  written first, implementation absent).
- GREEN (after implementation):
  ```
  Test Files  1 passed (1)
       Tests  21 passed (21)
  ```
- Scope note: ran the scoped single test file only (per subagent coop rules —
  siblings are editing concurrently); the main agent runs the full
  `npm test` suite after all subagents land.

## Test coverage (21 tests)
- Single-patch edits: replace byte span; insertion (`start === end`); deletion
  (`replacement: ''`); replace whole text; append via insertion at byte length.
- Multiple disjoint patches: descending application regardless of input order
  (both input orders asserted); offsets measured against the ORIGINAL text
  (a longer earlier replacement does not shift the later patch); adjacent
  spans `[0,3)`/`[3,6)` allowed; two same-point insertions both apply with
  pinned deterministic order (later-listed leftmost).
- Overlap rejection: identical `(start,end)`; partial overlap; contained span;
  same-start sub-range; insertion strictly inside a replaced span — all throw;
  start/end-boundary insertions asserted legal with exact output.
- Byte correctness: patch after a 4-byte emoji lands at the byte offset
  (`byteLen('table 😀\n') === 11`, not the 8 JS chars); emoji replaced by its
  exact byte span `[3,7)` in `aé😀b`; multi-byte replacement text (é, 😀)
  round-trips; empty patch list → identity (`toBe`).
- Input validation: out-of-range, inverted, non-integer offsets → `RangeError`.

## Self-review
- Contract conformance checked line by line against the binding constraints:
  half-open byte offsets, descending/tie order, overlap throw, literal
  replacements, untouched unmodified spans, identity for `[]`.
- Hand-traced the tricky interactions before/while testing: insertion at span
  boundaries (allowed, adjacent), insertion inside a span (rejected),
  same-point insertions (both apply), adjacent spans, tail-gap slicing when a
  patch's end meets an insertion point.
- Two deliberate additions beyond the 7 required test cases, flagged for main
  agent review:
  1. `RangeError` on offsets outside `[0, byteLen]` / non-integer — without it
     `subarray` clamps silently and the writer emits corrupted bytes, which
     contradicts "byte-faithful" more than a loud error would. Removal is a
     6-line deletion + 1 test block if deemed scope creep.
  2. Rejection of an insertion point strictly inside a replaced span — the
     segment-splice construction cannot express it and any placement inside
     the replacement would be arbitrary; it shares no byte, so it is not
     covered by the literal overlap rule, hence this explicit guard.
  Neither affects the pinned contract cases; both are tested.
- Pinned (and tested) the previously unspecified order of two same-point
  insertions: sequential descending application ⇒ later-listed lands first.
  Documented in the module header and the test comment.

## Concerns
- The two deliberate additions above are the only judgment calls; everything
  else is the contract as written.
- Full-suite green is unverified here by design (concurrent siblings); scoped
  file is 21/21.
