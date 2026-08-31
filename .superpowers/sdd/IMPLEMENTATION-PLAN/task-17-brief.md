### Task 5.1: Picker, retained handles, permission, atomic write

**Files:**
- Create: `src/fs/access.ts`

**Interfaces:**
- Produces: `pickFolder() → { handle, name }` (readwrite in one gesture, FR-1); `persistHandle(handle, name)` / `listRecent()` / `dropRecent(name)` (IndexedDB; handles survive only structured-clone stores, AD-7); `requestPermission(handle)` (user gesture required — return a function that calls it on click, FR-24); `readFile(handle, path)`, `readDir`, `writeFileAtomic(handle, path, bytes)` via `createWritable` (atomic replace); `isSupported()` (Chromium/`window.showDirectoryPicker`), `isSensitiveRoot(path)`; `changedOnDisk(handle, expectedBytes)` (FR-25 conflict check).

- [ ] **Step 1: Implement**, blocking sensitive system roots (`C:\Windows`, `/Program Files`), surfacing browser refusals readably (FR-1).

- [ ] **Step 2: Manual Chromium check** — open the app, pick a folder, read a file, write a temp file atomically, verify byte-identical content. (This is browser-dependent; document manual steps in `tests/e2e/README.md`.)

- [ ] **Step 3: Commit** — `git commit -m "feat: step 5a11"`

## Phase 6 — state/ + worker

