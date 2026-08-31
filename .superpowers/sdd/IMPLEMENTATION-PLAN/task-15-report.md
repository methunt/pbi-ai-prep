# Task 4.2 Report — Write Planner (journal → per-file byte patches)

Status: COMPLETE (all 5 write kinds implemented + tested). Commit `5becca5` ("feat: step 8f21") on `feat/pbi-ai-prep`.
TDD followed: RED first (`Cannot find module '../../src/write/write-planner'`), then GREEN (29/29).

## Files changed
- Created `src/write/write-planner.ts` (~740 lines) — the 4.2 planner.
- Created `tests/unit/write-planner.test.ts` — 29 unit tests in 7 describe blocks.
- Modified `src/parse/spans.ts` — exported `LineEntry`, `lineTable`, `indentOf` (bodies unchanged, `indentOf` moved above its first use; 20/20 spans tests still green).

## planWrites interface
```ts
planWrites(model: ModelObject[], journal: JournalRecord[], layers: unknown)
  → Map<file, { patches: Patch[] }>
```
- Patches are half-open UTF-8 **byte** offsets into the file's ORIGINAL text (applyPatches contract). Replacement bytes derive from the original plus the reader-recorded spans only; ids never re-key.
- **Empty-journal behavior (the fidelity-gate contract):** an empty journal returns an **empty Map** — a file appears in the map only when it has ≥ 1 patch (absent ≡ untouched). `planWrites(objects, [], {})` → `plans.size === 0`; for every fixture file `applyPatches(text, plans.get(path)?.patches ?? []) === text`. Gate `tests/gates/fidelity.gate.ts` passes (ran it: 1/1).
- `layers` (adaptation point; gate passes `{}`) is `PlanLayers`:
  - `texts?: Map<string,string> | Record<string,string>` — original file texts; the planner builds `{ text, bytes: TextEncoder(text), lines: lineTable(text) }` per file, once, on first touch (a file needed by a record but missing throws legibly).
  - `lsdl?: PlanLsdlLayer[] | Map | Record` — parsed culture layers (a `parseLSDL()` result satisfies the structural `{ file, block, entities }` shape).
- Fold semantics mirror `domain/project()`: later field records win per `{objectId,field}`; deletes win over edits of the same object (`foldJournal`).
- Byte-span discipline: every span read goes through `spanText(bytes, span)` = `TextDecoder.decode(bytes.subarray(start,end))` — **never** `String.slice` (UTF-16 indices). This was a real bug in the first draft (char-index slicing mis-cut spans after multi-byte bytes; caught by the multibyte test, fixed, covered).
- Overlap safety: at most one patch per span per file; grouped records coalesce per file; the engine rejects overlaps loudly if the planner ever violates it.

## Per-kind patch logic

**1. Description** — if `docCommentSpan` exists: replace its span with `docBlock(description, indent, eol)` — each line `<indent>///` + (` ${line}` when non-empty), joined and terminated with the ORIGINAL block's own terminator (`\r\n` when the block slice contains CRLF). Empty description deletes the block (span ends at declaration start, no stray blank line). No span → insert the fresh block at `declarationSpan.start` with the declaration line's own indentation + terminator. Same-value writes plan no patch.

**2. Rename** — one patch on exactly `nameSpan`; replacement = `requotedName(originalToken, newName)`: the token's ORIGINAL quoting style is preserved (single-quoted stays single-quoted with embedded `'` doubled — FR-12; double-quoted likewise; `[bracket]` stays bracketed unless the name contains `]`/`'`; a bare token stays bare only for bare-safe names, else single quotes). Name unchanged → no patch. No DAX rewrites, no id re-key (v1 warn+list is a surface concern per the brief's Assumption).

**3. Visibility** — hide: ONE insertion at `declarationSpan.end` emitting `\t\tisHidden` + `\t\tchangedProperty = IsHidden` (marker suppressed when `changedProperty` already includes `IsHidden` — no duplicate; FR-13). Unhide: one deletion patch per own `isHidden` / `changedProperty = IsHidden` property line inside the object's block (block extent = first non-blank line at ≤ declaration indentation, blank separators excluded; deeper/equal-indent lines never touched). Same-state → no patch.

**4. LSDL** (the ONE sanctioned re-serialization) — all records for one culture file fold into ONE patch on the reader's `block {start,end}`: slice the block via spanText, split fenced ``` wrappers (preserved verbatim as prefix/suffix), `JSON.parse` the inner, apply mutations in journal order (customInstructions set/delete-key; synonyms replace the entity's `Terms` as `{ "<name>": { State, LastModified?, Type?, Weight? } }[]`; visibility → `Visibility { Value: 'Hidden'|'Visible', State: 'Authored' }`), then re-encode with `serializeJsonBlock`: continuation lines prefixed by the original block's tab prefix, `JSON.stringify(raw, null, unit)` with unit = the original non-tab indent unit (2-space fallback; single-line block → compact). objectId → entity key resolves through `buildNameIndex` + `resolveName` over the entities' `Definition.Binding` (AD-8; first entity wins). An object no entity binds auto-creates `{ Definition: { Binding }, State: 'Generated' }` under the dot-rule key `<table>.<name>` lowercased (tables: `<name>`). Value-preserving rewrite reproduces the original block bytes exactly → no patch. The `contentType: json` line sits OUTSIDE the block span and is byte-untouched; `Agents` rides inside `raw` and survives verbatim. Unknown culture file / no block / missing text / bad record shapes → legible throws.

**5. Delete** — measures/calc columns/calculation items/hierarchies/levels/daxFunctions: span-delete from `docCommentSpan.start` (or declaration start) to the block end (same block-extent rule; the block delete does NOT swallow the following blank separator — sibling content starts where the next non-blank line begins, leaving exactly one blank line between remaining siblings). Table/calculationGroup/fieldParameter: delete the whole file bytes. **Source columns** → fresh final M step, never mutating user steps: locate the `partition … = m` + `let` + last step + `in` machinery (`findMPartition`; non-M or computed-`in` shapes throw legibly rather than guess), then TWO patches: insert `PBIPreAI_RemoveUnusedCols = Table.RemoveColumns(<prevStepRef>, {"Col A", "Col B"})` immediately before the `in` line (one step naming ALL of that table's deleted columns), and retarget the `in` result identifier to `PBIPreAI_RemoveUnusedCols` (previous-step reference quoted as `#"…"` when the original step name was quoted). Column deletes of one table coalesce into a single step regardless of record count.

## TDD evidence
- RED: `npx vitest run tests/unit/write-planner.test.ts` → `Error: Cannot find module '../../src/write/write-planner'` (tests written first; implementation absent).
- GREEN (after implementation): `29 passed (29)` in `tests/unit/write-planner.test.ts`.
- Intermediate RED→GREEN for the byte-span bug: the multibyte test (`patch start 16, not the char count 13`) failed against the first char-index draft, passed after `spanText` — evidence the test defends the byte contract.
- Fidelity gate (the strongest test, per brief): `npx vitest run --config tests/gates/vitest.gates.config.ts tests/gates/fidelity.gate.ts` → `1 passed (1)`.
- Regression scope (spans exports changed): spans/tmdl-reader/lsdl-reader/journal/patch-engine unit files all green (70/70 + 76/76 across runs).
- Per subagent coop rules I did not run the whole `npm test`/gates suite beyond the fidelity gate; the main agent owns project-wide validation.

## Test coverage (29 tests, 7 blocks)
1. Empty journal: empty map; every fixture file round-trips byte-identical (the gate scenario, mirrored).
2. Description: doc-comment replace (byte-exact expected string incl. `///` at declaration indentation), insert above declaration-less object, CRLF preservation, empty-description delete, later-record-wins when the journal was not pre-coalesced.
3. Rename: name-token-span-only patch (surrounding text byte-compared), bare→quoted, embedded `'` doubled (FR-12).
4. Visibility: hide = single insertion with both lines at exact offsets; no duplicate `changedProperty` when the object already carries it; unhide = two line deletions matching a filtered-text expectation.
5. LSDL: instructions re-serialization (prefix/suffix byte-identity, contentType line verbatim, Agents preserved, untouched sections), value-preserving → no patch, empty → key deleted, synonyms replace Terms incl. `User` add + `Deleted` tombstone with binding survival, visibility `{Value, State: Authored}`, auto-created entity (dot rule), missing layer throws.
6. Delete: measure block delete (byte-exact; asserts the DECLARATION gone — Chain B's DAX `[Chain A]` reference legitimately survives per v1 no-rewrite), calc column delete, source column → M step (fresh final step + `in` retarget, user `Source` line untouched), multi-column coalescing into ONE step, delete-beats-edit.
7. Legibility: unsupported field throws, missing original text throws, unknown object throws, multi-byte prefix offsets (`byteLen(prefix)` — é=2, ☕=3).

## Write kinds: COMPLETE vs PARTIAL
- Description: **COMPLETE**
- Rename: **COMPLETE**
- Visibility (isHidden + changedProperty): **COMPLETE**
- LSDL (instructions / synonyms add+tombstone / entity visibility): **COMPLETE**
- Delete (source columns M step; measures/calc columns/calc items block delete; tables): **COMPLETE**

## Self-review
- Empty-journal path returns before any layer is consulted; the map stays empty — the gate asserts both the map emptiness and the byte-identity for every file.
- Contract checked line by line against the task context: half-open byte offsets from reader spans only; one patch per span; the only re-serialization inside the LSDL block span; line endings/indentation cloned from the original; `contentType` and `Agents` untouched; source-column deletes append a FRESH step (user steps byte-verified untouched in tests); block deletes leave one separator blank line.
- Judgment calls to flag: (a) `spans.ts` exports widened (`LineEntry`/`lineTable`/`indentOf`) so the planner shares the reader's line conventions instead of re-implementing them — a reuse decision, no behavior change; (b) rename quoting preserves the original token style (safest for "patch the name token only"); (c) LSDL record contract (`file` = culture path; fields `customInstructions`/`synonyms`/`lsdlVisibility`) is documented in the module header for the 7.x surfaces to consume; (d) whole-table delete empties the file bytes (fs writer may drop the file) — noted as an interface note for Task 4.3.
- Editing-process note: several `edit`-tool hunks mis-landed mid-implementation; each was repaired and the final file was rewritten in one clean pass and re-verified (tsc clean, 29/29, gate green). Final artifacts, not intermediate states, are what the commit contains.

## Concerns
- The `layers` shape (`PlanLayers`) is my adaptation-point decision per the gate's `{}`; if Task 8.x wants a different packaging (e.g. `Map<string, LSDL>` straight from parseLSDL — already accepted structurally), it is a narrow change at `readLayers`.
- M-step planning supports the common `partition … = m` + `let … in <identifier>` shape and throws legibly on anything else (fenced M, computed `in` results, no-`let` partitions). The fixture's two M tables fit; the real reference model's M partitions are expected to fit the same shape but are only verified in SM-2.
- Rename's v1 "warn + list referencing expressions" is not a planner output — it belongs to the surface/store layer per the brief's Assumption; the planner only patches the token.
