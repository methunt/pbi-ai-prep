### Task 4.1: Patch engine

**Files:**
- Create: `src/write/patch-engine.ts`

**Interfaces:**
- Produces: `applyPatches(originalText, patches: Patch[]) → string`; `Patch = { start, end, replacement }` (half-open UTF-8 byte offsets; `end - start === 0` = insertion). Applies **descending** start, ties descending end, and **never touches** a span it wasn't given. Rejects overlaps (two patches sharing a byte) as a bug.

```ts
export function applyPatches(src: string, patches: Patch[]): string {
  const bytes = new TextEncoder().encode(src)
  if (!patches.length) return src
  const sorted = [...patches].sort((a, b) =>
    b.start - a.start || b.end - a.end)
  const out: Uint8Array[] = []
  let prev = new Uint8Array(0)
  for (const p of sorted) {
    if (prev.length && p.end > firstStartOfApplied) throw new Error('overlapping patches')
    out.push(bytes.subarray(p.end))
    out.push(new TextEncoder().encode(p.replacement))
    out.push(bytes.subarray(0, p.start))  // careful: slice the tail first
    prev = bytes.subarray(p.start, p.end)
  }
  return new TextDecoder().decode(concat(out))
}
```

- [ ] **Step 1: Implement with the descending sort + overlap guard** (a correct, simpler implementation is fine; the contract is descending + overlap-reject, not this exact sketch).

- [ ] **Step 2: Unit tests** — `tests/unit/patch-engine.test.ts`: single replace, insertion, two disjoint patches descend, same-span tie, overlap throws, multi-byte (emoji) offsets preserved.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 4472"`

