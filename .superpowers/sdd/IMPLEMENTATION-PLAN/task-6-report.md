# Task 2.1 Report — ModelObject types and spans (pure domain core)

**Status:** DONE. Commit `677570c` `feat: step cf53` on `feat/pbi-ai-prep` (random-data message, no project names).
**Date:** 2026-08-30

## Files changed

| File | Change |
|---|---|
| `src/domain/span.ts` | Created — `Span`, `byteLen`, `spanDerive` |
| `src/domain/objects.ts` | Created — `ObjectType`, `SourceSpans`, `ModelObject`, `FIDELITY_CAPS` |
| `tests/unit/span.test.ts` | Created — 9 unit tests (written first, TDD) |

## Exported interfaces (exact)

`src/domain/span.ts` (pure leaf, zero imports; module-level `TextEncoder` reused):

```ts
export interface Span { start: number; end: number }  // half-open over UTF-8 byte offsets; end exclusive; 0 length = insertion

export function byteLen(s: string): number            // UTF-8 byte length via shared TextEncoder

export function spanDerive(file: string, span: Span): string
// Deterministic surrogate id (AD-2): `${encodeURIComponent(file)}#${span.start}-${end}`
// file = project-relative POSIX path, URI-escaped so a literal '#' or '%'
// cannot corrupt the single '#' delimiter; decodeURIComponent(file part) round-trips.
```

`src/domain/objects.ts` (imports only `type { Span } from './span'` — domain-internal, AD-1-safe):

```ts
export type ObjectType =
  | 'table' | 'column' | 'calculatedColumn' | 'measure' | 'hierarchy'
  | 'hierarchyLevel' | 'calculationGroup' | 'calculationItem' | 'fieldParameter' | 'daxFunction'

export interface SourceSpans {          // what every reader records per object (AD-3)
  declaration: Span
  name: Span
  docComment?: Span
}

export interface ModelObject {
  id: string                            // lineageTag, or surrogate via spanDerive; minted once, never re-keyed
  type: ObjectType
  name: string
  table: string                         // '' for tables / funcs / dax
  file: string                          // project-relative POSIX path
  declarationSpan: Span                 // full declaration block, excluding doc comment
  docCommentSpan?: Span
  nameSpan: Span                        // name token, required for rename patching (AD-3)
  dax?: string
  hidden: boolean
  isFieldParameter: boolean
  description?: string
  queryGroup?: string
  displayFolder?: string
  perspectiveMembership?: string[]
  ordinal?: number
}

export const FIDELITY_CAPS = {
  description: 500,
  copilotCutoff: 200,
  customInstructions: 10000,
  synonyms: 20,
} as const
```

## TDD evidence

**RED** — `tests/unit/span.test.ts` written first; implementation absent:

```
> npm test
Error: Cannot find module '../../src/domain/span'
  imported from D:/AI/pbi-ai-prep/tests/unit/span.test.ts
```

**GREEN** — after implementing `src/domain/span.ts` + `src/domain/objects.ts`:

```
> npm test
 RUN  v4.1.11 D:/AI/pbi-ai-prep
 Test Files  2 passed (2)
      Tests  11 passed (11)        # 9 span tests + 2 AD-1 guard tests
   Duration  336ms
```

Pristine output — no warnings, no noise, no unhandled errors.

## Test coverage in `tests/unit/span.test.ts`

- `spanDerive`: stable for same file+span; exact `file#start-end` template with URI-escaped path; differs on `start` change; differs on `end` change; differs across files; escapes `#` in path (`tables/Weird#Name.tmdl` → `tables%2FWeird%23Name.tmdl#5-9`, id splits into exactly 2 `#`-delimited parts).
- `byteLen`: ASCII `'abc'` = 3, `''` = 0; `'é'` = 2 bytes (string length 1 — sanity-asserted); `'🙂'` = 4 bytes (string length 2, surrogate pair — sanity-asserted); mixed `'aé🙂b'` = 8.

## Verification

- `npm test` — 11/11 green, pristine (AD-1 guard test included and green: no forbidden imports/globals in `src/domain/**`).
- `npm run build` — clean (`tsc -b` strict + vite build, 17 modules, no errors).
- `npm run lint` — exit 0.
- AD-1 purity by construction: `span.ts` imports nothing; `objects.ts` imports only `type Span` from `./span`; no `window`/`document`/FSA pickers anywhere; TextEncoder/TextDecoder only.

## Self-review

- Field set and types of `ModelObject` match the brief's code block 1:1 (order included); `ObjectType` matches the 10-member union in brief order; `FIDELITY_CAPS` values match `as const`.
- `byteLen` reuses one module-level `TextEncoder` (no per-call allocation).
- Tiny-function rule: `byteLen`/`spanDerive` are one-liners but qualify as allowed exceptions — exported stable domain concepts required by the plan's produced-interfaces contract, shared by all readers in lockstep.
- No project/company names in commit message (random `openssl rand` token `cf53`).

## Concerns (for Main)

1. **`SourceSpans` shape unpinned upstream.** The plan lists it under "Produces" but never defines it. I mirrored `ModelObject`'s spans (`declaration` + `name` required, `docComment?`) per the architecture's "readers record declaration, doc-comment, and name-token spans". If a later reader task needs a different shape (e.g. extra span kinds), this is the place that moves.
2. **Surrogate ids contain percent-encoded paths** (`definition%2Ftables%2FSales.tmdl#120-340`, not the raw POSIX path). This follows "URI-escape the file path" literally and guarantees exactly one `#` delimiter with exact `decodeURIComponent` round-trip — but if Main/readers expect raw slashes in ids, the escape policy should change to a narrower one (escape only `%` and `#`). Test pins current behavior; one-line change either way.
3. **`FIDELITY_CAPS` has no unit test** — the assignment scoped the test file to `span.ts` only; caps are literal `as const` values verified by review. Trivial to add if Main wants it defended.
