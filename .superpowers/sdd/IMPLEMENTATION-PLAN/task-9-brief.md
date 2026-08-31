### Task 2.4: ObjectGraph (transitive Used count)

**Files:**
- Create: `src/domain/graph.ts`

**Interfaces:**
- Produces: `EdgeKind = 'visual'|'measure'|'calcObject'|'calcItem'|'fieldParam'|'function'|'relationship'`; `buildGraph(objects, edges) → ObjectGraph`; `graph.usage(id) → { direct, transitive, leaf, total }`; `graph.dependents(id) → Set<string>`; `graph.isolateTo(id) → { inPath, offPath }`. Edge kinds fixed; **visual→visual excluded** (AD-6). Built from the **pristine** model; deletion is a derived subgraph view.

- [ ] **Step 1: Build adjacency over the fixed edge kinds**, keyed by object id, resolving names through the shared resolver.

- [ ] **Step 2: Implement transitive traversal with cycle guard** (visited set — circular references terminate, PRD §5 case 5).

- [ ] **Step 3: Implement `usage(id)`** — direct = in-edges, transitive = reachable-through, leaf = terminal dependents, total = card of union (no double count).

- [ ] **Step 4: Unit tests** — `tests/unit/graph.test.ts`: chain counts, hidden-measure transitivity, cycle termination, fieldParam indirection, no double-count.

- [ ] **Step 5: Commit** — `git commit -m "feat: step 24b5"`

## Phase 3 — parse/ readers

