### Task 7.3: Selection + contextual action bar + bulk rename

**Files:**
- Create: `src/ui/grid/SelectionContext.tsx`, `src/ui/grid/ActionBar.tsx`, `src/ui/grid/BulkRenameDialog.tsx`

**Interfaces:**
- Consumes: store selection (FR-30), journal.
- Produces: FR-30 (per-row checkbox; keyed by object id survives sort/filter/search/page; shift-click range on visible page; Space toggles focused row; 'Select all N matching' all-pages; selection bar shows total + outside-filter count + one-click clear), FR-31 (contextual bar on selection: Apply renaming, Set description, Include/Exclude AI, Show/Hide, Delete selected, Clear; neutral styling except destructive delete; bulk writes land as pending changes), FR-32 (bulk rename transform: find/replace, strip prefix, strip suffix, underscores-to-spaces, Title Case, in stated order; live current→new preview; FR-12 collision blocks apply and names conflicts).

- [ ] **Step 1: Build selection semantics store actions** (done in 6.1) + checkbox UI.
- [ ] **Step 2: Build `ActionBar.tsx`** (appears on selection, neutral; delete destructive-red).
- [ ] **Step 3: Build `BulkRenameDialog.tsx`** (rules, live preview, collision block).
- [ ] **Step 4: Manual verify** against the mockup.
- [ ] **Step 5: Commit** — `git commit -m "feat: step 7c35"`

