# Manual Chromium smoke — File System Access adapter (`src/fs/access.ts`)

The `src/fs/` layer is **browser-only**: the File System Access API does not
exist in Node, so no headless unit test can exercise it (that is why there is
no `tests/unit/access.test.ts`). Runtime verification happens here, by hand, in
a Chromium browser, and again once the app shell lands (Task 7.x / Task 8.x per
the plan). This document is the manual smoke for Task 5.1.

## Prerequisites

- A **Chromium-based** browser: Chrome or Edge (Firefox/Safari do not expose
  `window.showDirectoryPicker` — the UI's FR-34 unsupported message must show).
- The app served over **`localhost`** (or HTTPS). The picker is gated on a
  secure context; a plain `http://<lan-ip>` page will not offer it.
- The reference model repository at the repo root: `_test_pbip_w_ai/`
  (read-only fixture — the smoke only reads it and writes a throwaway temp file
  inside a scratch location you delete afterwards).

## Start the app

```sh
npm run dev
```

Open the printed `http://localhost:5173` URL in Chrome/Edge.

## 1. Unsupported-browser path

In a non-Chromium browser (or without a secure context), open the app and
trigger the folder picker. Expected: the UI shows the FR-34 **unsupported**
message (the wrap of `isSupported()` returning `false`) instead of crashing.
`pickFolder()` throws the readable error shown by that UI.

## 2. Pick a folder (FR-1, one gesture, read/write)

1. Click **Open folder**.
2. In the OS picker, choose `_test_pbip_w_ai` at the repo root and confirm.
3. Expect a single gesture (no second "allow" prompt) because
   `showDirectoryPicker({ mode: 'readwrite' })` requests read/write in the one
   pick. The app receives `{ handle, name: '_test_pbip_w_ai' }`.

**Sensitive-root refusal (FR-1):** repeat the picker and choose a drive root
(e.g. `C:\`) or `C:\Windows` / `Program Files`. `isSensitiveRoot(handle)` must
refuse it — expected: a readable message "Refusing to open the sensitive system
folder …", no handle returned, no crash.

## 3. Read a file (FR-22 read path)

In the app, with `_test_pbip_w_ai` selected, read:

```
Atrium Sigma.SemanticModel/definition/model.tmdl
```

This calls `readFile(root, posixPath)`. Expected: the file's text loads (you can
verify the loaded model objects in the UI). Note the path is **root-relative
POSIX** — the root is the picked `_test_pbip_w_ai`, so the segment
`Atrium Sigma.SemanticModel/…` appears in the path.

If you forget the leading folder segment, `readFile` rejects with a readable
"file or folder no longer exists" / path error.

## 4. List the tree (skip `.pbi`/cache noise)

Call `readDir(root, '')`. Expected: the flat `{name, kind, path}[]` walk includes
`Atrium Sigma.SemanticModel/definition/…` entries and the
`.SemanticModel/definition` sub-tree, but **no** path containing `/.pbi/` (the
model's `.pbi` directory) — the default `DEFAULT_SKIP_NAMES` skips `.pbi` /
`cache` noise. Nothing else is skipped.

## 5. Atomic write (FR-22) + byte-identical check

In the app, write a throwaway temp file and read it back:

1. `writeFileAtomic(root, 'Atrium Sigma.SemanticModel/definition/_smoke_tmp.tmdl', bytes)`
   where `bytes` = `new TextEncoder().encode("<Some stable content>")`.
2. `readFile(root, 'Atrium Sigma.SemanticModel/definition/_smoke_tmp.tmdl')`.

Expected: the read-back string is **byte-identical** to the content you wrote.
Confirm the original file was **replaced atomically** (no partial write was
ever readable — the `createWritable({ keepExistingData: false })` stream commits
the whole file on `close()`).

To confirm the atomic-replace semantics, write the temp file, then overwrite it
with different bytes: the file must end up with exactly the new bytes
(`keepExistingData: false` discards the prior content; a reader with an open
handle sees the old or the new version, never a mix).

Delete `_smoke_tmp.tmdl` afterward.

## 5b. External-change detection (FR-25)

`changedOnDisk(root, path, expected)` compares the file's exact bytes against
the snapshot (a string is compared as its exact UTF-8 bytes), so a **same-size**
external edit is caught:

1. Write `writeFileAtomic(root, PATH, bytes)` with
   `bytes = new TextEncoder().encode('AAAA')`.
2. From the OS, edit that file's content to a DIFFERENT same-length string
   (`'BBBB'`). `changedOnDisk(root, PATH, bytes)` MUST return `true` (same size,
   different bytes) — a size-only check would wrongly return `false`.
3. Restore `'AAAA'`; `changedOnDisk(root, PATH, bytes)` returns `false`.
4. Delete the file from the OS; `changedOnDisk(root, PATH, bytes)` MUST return
   `true` (an external deletion is a change), never a `NotFoundError`.

## 6. Permission lifecycle (FR-24)

1. `queryPermission(root)` — expected to read back the current `PermissionState`
   (`'granted' | 'denied' | 'prompt'`) without prompting.
2. Call the function returned by `requestPermission(root)` **from a click
   handler** — this is the user-gesture gate. Expected: on first use it prompts
   and resolves `'granted'`; afterwards `queryPermission` returns `'granted'`.
3. Call that same function **without** a user gesture (e.g. from a
   `setTimeout`); expected: it rejects with the readable "Permission requests
   must be triggered by a user click." (a `SecurityError` surfaced by
   `readableFsError`).

## 7. Retained handles (FR-4 / AD-7)

After picking and granting, `persistHandle(root, name)` stores the handle in
**IndexedDB** (database `pbi-ai-prep`, store `recents`, keyed by `name`).
Verify in DevTools → Application → IndexedDB → `pbi-ai-prep` → `recents` that a
`{ name, kind: 'directory', handle }` record exists with a structured-clone
`handle`. Reload the page, call `listRecent()` — the same handle rehydrates and
remains usable (this is why handles live in IndexedDB, not `localStorage`).
Call `dropRecent(name)` and confirm the record is removed and `listRecent()`
no longer returns it.

## Confirmed via code review (no runtime in this phase)

- Atomic write uses `createWritable({ keepExistingData: false })` then `close()`
  (atomic OS swap), then verifies the committed byte length.
- `readFile`/`writeFileAtomic`/`changedOnDisk` resolve root-relative POSIX paths,
  never touching an absolute path.
- `changedOnDisk(root, path, expected)` content-compares the file's exact bytes
  against the snapshot (a string is compared as its UTF-8 bytes), so a SAME-SIZE
  external edit is still caught; an external deletion returns `true` (changed)
  rather than a `NotFoundError` (FR-25).
- `isSupported()` gates on `typeof window.showDirectoryPicker === 'function'`,
  which is Chromium-only.
