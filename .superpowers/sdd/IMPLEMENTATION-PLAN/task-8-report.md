# Task 2.3 Report — One shared name→id resolver (domain core)

**Status:** Complete. Commit `6bc48f2` ("feat: step 8d2a") on `feat/pbi-ai-prep`.
**Files:** `src/domain/identity.ts` (new), `tests/unit/identity.test.ts` (new).

## Exported signatures

```ts
export interface NameIndex {
  byName: ReadonlyMap<string, string[]>   // canonical (lowercased) bare name → ids
  byTable: ReadonlyMap<string, string[]>  // canonical `table\u0000name` → ids
  byType: ReadonlyMap<string, string[]>   // canonical `type\u0000table\u0000name` → ids (brief step 1)
}

export function buildNameIndex(objects: ModelObject[]): NameIndex
export function resolveName(index: NameIndex, name: string, tableHint?: string): string | undefined
```

## Behavior contract

- `buildNameIndex` indexes by bare name, (table, name), and (type, table, name);
  objects with a falsy `name` are skipped; does not mutate input; duplicate ids per key are deduped.
- Keys are lowercased — resolution is case-insensitive (DAX reference semantics).
- `resolveName` returns the id only on exactly one match; 0 or >1 matches → `undefined`.
- Supported reference forms (embedded table scopes resolution and **overrides** `tableHint`):
  `[Table].[Name]`, `Table[Name]`, `'Table.Name'`, plus `'Table'[Name]` / `'Table'.[Name]`.
  Bracket-only `[Name]` is treated as a bare-name reference (DAX measure form).
- Strict scoping: with an effective table (hint or embedded), only (table, name) is
  consulted — a miss stays `undefined`, no cross-table fallback (a wrong-table FQ ref
  never resolves to the name in a different table).
- Ambiguity: bare name in >1 table → `undefined` unless hinted/FQ; same table+name in
  >1 type (column vs measure) → `undefined` even with hint.
- Pure leaf (AD-1): only `import type { ModelObject } from './objects'`; no globals.
  No other name→id mapping exists — AD-6 one-resolver rule honored.

## TDD evidence

- **RED:** `npx vitest run tests/unit/identity.test.ts` →
  `Error: Cannot find module '../../src/domain/identity'` (test written first).
- **GREEN (first):** 18 tests, 2 failed → fixed (a) test expectation: a table object
  (`table: ''`) indexes under key `\u0000sales`, not `sales\u0000sales`; (b) parser gap:
  `'Table.Name'` has the dot *inside* the quotes — added in-quotes dot split.
- **GREEN (final):** `npx vitest run tests/unit/identity.test.ts` →
  `Test Files 1 passed (1), Tests 18 passed (18)`.
- Scoped checks: `npx tsc -b tsconfig.app.json` clean; `npx vitest run tests/unit/ad1-guard.test.ts`
  → 2 passed (domain purity intact). Full-suite run left to Main's project-wide validation.

## Test coverage (18)

buildNameIndex (keys + nameless skip) · unique bare name · case-insensitive · unknown name ·
bracket-only `[Name]` · ambiguous no-hint → undefined · ambiguous + correct hint (both tables) ·
strict hint scoping (hinted miss stays undefined) · case-insensitive hint · table+name across
types → undefined · FQ form matrix (5 forms) · embedded table overrides hint · wrong embedded
table → undefined · FQ table name resolves via bare-name lookup.

## Self-review & notes

- Rules: `ts-set-map` — `Map` used for runtime-built dynamic tables (allowed case, not static
  literals). `ts-no-tiny-functions` — `canon` kept (5 call sites need lockstep case-folding);
  `unbracket` kept as named parse contract; get-or-insert lives in `pushId` (real behavior).
- Internal `parseRef` is deliberately strict; malformed refs (unterminated quote/bracket) return
  the raw string as bare name, which never matches an indexed key → `undefined`.
- One mid-flight edit mis-anchored into `buildNameIndex` and briefly broke the file; caught by
  edit-tool warnings, repaired, and re-verified (final GREEN run above is post-repair).

## Concerns

- Quoted names containing a `.` are parsed as `'Table.Name'` per the brief's form list — a
  quoted *bare* name with a dot (e.g. measure `'Net.X'`) would split at the first dot. No
  current feeder produces that shape; if one appears, the quoted-bare case needs a
  `(table, name)`-pair existence check.
- `byType` is populated per the brief but unused by `resolveName` (it takes no type param);
  reserved for type-aware feeders. Deletable if the spine never needs it.
