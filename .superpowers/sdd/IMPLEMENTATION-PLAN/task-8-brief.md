### Task 2.3: One shared name→id resolver

**Files:**
- Create: `src/domain/identity.ts`

**Interfaces:**
- Produces: `NameIndex`; `resolveName(index, name, tableHint?) → string | undefined`; `buildNameIndex(objects)`. ONE resolver for all edge feeders (AD-6) — no feeder keeps its own mapping.

- [ ] **Step 1: Implement index** — map `type|table|name` (and a bare name fallback) → id.

- [ ] **Step 2: Unit test** — resolved vs. unresolved (undefined) + ambiguous table hint.

- [ ] **Step 3: Commit** — `git commit -m "feat: step 2fe0"`

