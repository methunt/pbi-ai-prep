### Task 2.1: ModelObject, types, and spans

**Files:**
- Create: `src/domain/objects.ts`, `src/domain/span.ts`

**Interfaces:**
- Produces: `ObjectType` union; `Span { start: number; end: number }` (half-open); `SourceSpans`; `ModelObject`; `spanDerive(...)` surrogate id helper; `byteLen(s)`.

```ts
export type ObjectType =
  | 'table' | 'column' | 'calculatedColumn' | 'measure' | 'hierarchy'
  | 'hierarchyLevel' | 'calculationGroup' | 'calculationItem' | 'fieldParameter' | 'daxFunction'

export interface Span { start: number; end: number } // half-open over UTF-8 bytes

export interface ModelObject {
  id: string               // lineageTag or surrogate file#byte-span; minted once
  type: ObjectType
  name: string
  table: string            // parent table name ('' for tables / funcs / dax)
  file: string             // project-relative POSIX path
  declarationSpan: Span
  docCommentSpan?: Span
  nameSpan: Span           // REQUIRED for rename (AD-3)
  dax?: string
  hidden: boolean
  isFieldParameter: boolean
  description?: string
  queryGroup?: string
  displayFolder?: string
  perspectiveMembership?: string[]
  ordinal?: number
}
```

- [ ] **Step 1: Write `span.ts`** — surrogate id derivation (`file#${start}-${end}`), exact URI-escape of file, and a `byteLen` that counts UTF-8 bytes.

- [ ] **Step 2: Write `objects.ts`** — the unions + a `FIDELITY_CAPS = { description: 500, copilotCutoff: 200, customInstructions: 10000, synonyms: 20 }`.

- [ ] **Step 3: Unit test** — `tests/unit/span.test.ts`: surrogate id stable for same file+span; byteLen counts a multi-byte char as 2+ bytes.

- [ ] **Step 4: Commit** — `git commit -m "feat: step 2c47"`

