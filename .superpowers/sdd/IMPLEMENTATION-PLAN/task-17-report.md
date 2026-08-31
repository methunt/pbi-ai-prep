# Task 5.1 Report — Picker, retained handles, permission, atomic write (`src/fs/access.ts`)

**Status:** Complete. No headless test is possible for this layer (File System Access does not exist in Node), so verification is a documented manual Chromium smoke (`tests/e2e/README.md`) plus a self-review of the module. Browser runtime verification is deferred to Task 7.x / Task 8.x per the plan; this phase ships the typed adapter + smoke doc.

## Summary

Created `src/fs/access.ts`, the browser-only File System Access adapter for the PBIP workspace, plus `src/fs/fsa.d.ts` (ambient type closures) and `tests/e2e/README.md` (manual smoke). One supporting config change: added `ES2024` to `tsconfig.app.json`'s `lib` so `Promise.withResolvers()` (required by the project's ts-promise-with-resolvers rule) type-checks; the runtime target (modern Chromium) already supports it.

## API surface

```ts
export interface PickedFolder { handle: FileSystemDirectoryHandle; name: string }
export interface RecentFolder { name: string; handle: FileSystemDirectoryHandle }
export interface DirEntry { name: string; kind: 'file' | 'directory'; path: string }
export interface ReadDirOptions { skip?: Readonly<Record<string, true>> }   // default DEFAULT_SKIP_NAMES

export function isSupported(): boolean                                        // Chromium-only
export function isSensitiveRoot(handle: Pick<FileSystemDirectoryHandle,'name'>): boolean
export const DEFAULT_SKIP_NAMES: Readonly<Record<string, true>>               // '.pbi'/cache noise
export async function pickFolder(): Promise<PickedFolder>                     // FR-1 one-gesture readwrite
export async function persistHandle(handle, name): Promise<void>              // FR-4 / AD-7 IndexedDB
export async function listRecent(): Promise<RecentFolder[]>
export async function dropRecent(name): Promise<void>
export function requestPermission(handle): () => Promise<'granted' | 'denied'> // FR-24 click-ready closure
export function queryPermission(handle): Promise<PermissionState>              // no user prompt
export async function readFile(root, posixPath): Promise<string>               // root-relative POSIX
export async function readDir(root, posixPath?, options?): Promise<DirEntry[]> // recursive walk
export async function writeFileAtomic(root, posixPath, bytes): Promise<void>   // FR-22 atomic replace
export async function changedOnDisk(root, posixPath, expectedBytes): Promise<boolean> // FR-25
```

Paths are **project-relative POSIX** (`a/b/c`) resolved against the picked ROOT handle — never an absolute filesystem path (FSA handles expose no absolute location). This matches the codebase's POSIX key convention (spans, journal, patches).

## Type closure (`src/fs/fsa.d.ts`)

The bundled `lib.dom` for this TS version ships the **older** FSA surface — it lacks `window.showDirectoryPicker`, the per-handle `requestPermission`/`queryPermission`, `FileSystemHandlePermissionDescriptor`, `WellKnownDirectory`, and the directory async-iterator methods (`values`/`entries`/`keys`). `fsa.d.ts` is a global ambient declaration file (no imports/exports) that merges these into the DOM interfaces, so `access.ts` is fully typed rather than cast through `any`. AD-1's purity gate scans `src/domain/**` only, so this augmentation is out of scope for it.

## Permission / handle / IndexedDB design

- **One gesture (FR-1):** `pickFolder()` calls `window.showDirectoryPicker({ mode: 'readwrite' })` — read/write access is requested in the single picker gesture, no second prompt.
- **Retained handles (FR-4, AD-7):** handles are structured-cloneable but only structured-clone stores (IndexedDB) persist them; **localStorage cannot**, so `persistHandle`/`listRecent`/`dropRecent` use an IndexedDB DB (`pbi-ai-prep`, store `recents`, `keyPath: 'name'`) storing `{ name, kind: 'directory', handle }`. `listRecent` filters to `kind === 'directory'` and rehydrates `{ name, handle }`. Drop removes the named key.
- **Permission lifecycle (FR-24):** `requestPermission` is NOT invoked at call time — it **returns a closure** the caller wires to a click (the user-gesture gate). On click it calls `handle.requestPermission({ mode: 'readwrite' })` and resolves `'granted' | 'denied'` (non-granted → `'denied'`); a `SecurityError` (no gesture) is rethrown as the readable "Permission requests must be triggered by a user click." `queryPermission` reads the current `PermissionState` without prompting.

## Atomic-write approach (`createWritable` semantics, FR-22)

`writeFileAtomic` uses **`createWritable({ keepExistingData: false })`** — the atomic-**replace** mode. It opens a fresh write stream for the *entire* file (no existing bytes retained), `write()` the exact bytes, then `close()` commits them as an *atomic OS swap*, so a concurrent reader never observes a half-written file. This is the correct choice because the adapter always rewrites the WHOLE file with the exact bytes; `keepExistingData: true` would only suit an in-place byte-range patch, which this adapter never does. On failure (write or close), `abort()` is called (secondary abort errors swallowed) so the stream is not left dangling. After `close()`, the committed byte length is read back and compared with `bytes.byteLength`; a mismatch throws rather than silently returning an incomplete write. `bytes` is typed `Uint8Array<ArrayBuffer>` because `FileSystemWriteChunkType` demands an `ArrayBuffer`-backed view (a `SharedArrayBuffer`-backed view is not writable). The parent directory is resolved but never created (we only `getFileHandle(file, { create: true })` for a brand-new file).

## Sensitive-root + unsupported handling (FR-1, FR-34)

- `isSupported()` gates on `typeof window.showDirectoryPicker === 'function'`, which is Chromium-only; the FR-34 UI renders the unsupported message. `pickFolder()` throws a readable "not supported in this browser… Chrome or Edge" when false.
- `isSensitiveRoot(handle)` blocks drive roots (`/^[a-z]:$/i`, e.g. `C:`) and sensitive basenames (`windows`, `system32`, `syswow64`, `winnt`, `program files`, `program files (x86)`). Because FSA handles expose **no absolute path**, the check is best-effort over the directory's own name — sufficient to refuse a directly-picked system root, which is the reachable case; the picker's protected-location restrictions prevent deep system subtrees.
- `pickFolder()` refuses a sensitive root with the readable "Refusing to open the sensitive system folder …". All browser refusals (abort/security/not-allowed/not-found) are surfaced readably via `readableFsError()`.

## Files changed

- `src/fs/access.ts` (new) — the adapter (types + 12 exported functions).
- `src/fs/fsa.d.ts` (new) — ambient FSA type closures.
- `tests/e2e/README.md` (new) — manual Chromium smoke.
- `tsconfig.app.json` (modified) — `lib` gains `ES2024` (for `Promise.withResolvers`).

## Manual smoke steps (detailed in `tests/e2e/README.md`)

1. `npm run dev` in Chrome/Edge over `localhost` (secure context).
2. **Unsupported path:** trigger the picker in non-Chromium → FR-34 message, no crash.
3. **Pick folder (FR-1):** pick `_test_pbip_w_ai`; one gesture, get `{handle, name}`.
4. **Sensitive-root refusal (FR-1):** pick a drive root / `C:\Windows` / `Program Files` → refusal, no handle, no crash.
5. **Read (FR-22):** read `Programmatic Insights - CI.SemanticModel/definition/model.tmdl`.
6. **List (skip noise):** `readDir(root,'')` includes the tree but no `/.pbi/` path.
7. **Atomic write + byte-identical:** write `_smoke_tmp.tmdl`, read back, byte-identical; overwrite confirms `keepExistingData:false` replace; delete temp.
8. **Permission (FR-24):** `queryPermission` reads state; `requestPermission(root)` from a click → granted; outside a gesture → readable SecurityError.
9. **Retained handles (FR-4/AD-7):** DevTools → IndexedDB shows `{name, kind, handle}`; reload → `listRecent()` rehydrates usable handle; `dropRecent` removes it.

## Self-review

- **Correctness:** atomic replace uses `keepExistingData:false` + `close()` with a byte-count verification; `readFile`/`writeFileAtomic`/`changedOnDisk` resolve root-relative POSIX, never absolute; `changedOnDisk` compares on-disk size to the parse snapshot's `expectedBytes` (FR-25).
- **Type-safety:** no `any` — the missing FSA globals are augmented in `fsa.d.ts`; a scoped `tsc` of the two fs files under the project's strict flags passed clean (no unused locals/params, `erasableSyntaxOnly`, `verbatimModuleSyntax`).
- **Project rules satisfied:** used `Promise.withResolvers()` (ES2024 lib added), a `Record<string,true>` for the static skip table, and kept the mandated public-API wrappers (`isSupported`, `queryPermission`) which the brief requires as contract seams.
- **Scope:** no headless test fabricated (FSA is Node-absent); verification is the documented manual smoke + self-review, with runtime verification deferred to Task 7.x/8.x per plan.

## Concerns

1. **`isSensitiveRoot` is name-only.** FSA handles expose no absolute path, so a directly-picked `C:\Windows`/drive root is refused by name, but a nested system subtree cannot be detected. This matches the reachable picker surface (protected-location restrictions); documented in the module header.
2. **IndexedDB recents keyed by `name`.** Two folders sharing a basename collide (second overwrites the first). `dropRecent(name)` and `listRecent()` follow the brief's `name`-keyed interface; a path-unique key isn't available from FSA handles.
3. **`requestPermission` maps `'prompt'` → `'denied'`.** Outside a user gesture some engines return `'prompt'` (others throw `SecurityError`); both end as non-granted. Conservative — the caller won't proceed without an actual grant.
4. **`changedOnDisk` content comparison (resolved in fix round 1).** The initial size-only check missed same-size edits and surfaced deletions as `NotFoundError`; both were fixed by switching to a byte-exact content comparison (deletion → `true`). See the "Fix round 1" section. Remaining nuance: it now requires the caller to supply the snapshot BYTES, not just a byte count.
5. **`fsa.d.ts` shipped as a separate ambient file** rather than inlined — it is additive and only surfaces the browser globals we already call, but it touches `tsconfig.app.json`'s `lib` to enable `Promise.withResolvers` (additive, low risk).

## Commit

- `2fcdfb9 feat: step 5a11` — `src/fs/access.ts`, `src/fs/fsa.d.ts`, `tests/e2e/README.md`, `tsconfig.app.json`.

## Fix round 1 (review) — FR-25 false-negative

**Finding (Important):** the initial `changedOnDisk(root, posixPath, expectedBytes: number)`
compared only `file.size !== expectedBytes`. An external edit that keeps the same
byte length returned `false` ('unchanged'), so the caller's conflict path would
trust it and `writeFileAtomic` would silently clobber the user's external edit.
An external deletion also surfaced as a `NotFoundError` from `getFileHandle`
rather than a 'changed' signal, and `resolveFile`'s `getDirectoryHandle` threw
the same way when a parent directory was removed.

**Fix:** `changedOnDisk` now does a CONTENT comparison.

- Signature: `changedOnDisk(root, posixPath, expected: Uint8Array | string)`.
  A string is compared as its exact UTF-8 bytes (`TextEncoder`); the file's
  current bytes are read via `arrayBuffer()` and compared byte-for-byte.
- **Same-size edits caught:** a size fast-path rejects a length mismatch, but a
  size match is NEVER trusted — it still content-compares every byte, so a
  same-length content change returns `true`.
- **Deletion → changed:** `NotFoundError` from `resolveFile`/`getFileHandle`
  (file gone, or a parent directory gone) is caught and returns `true` rather
  than throwing. Any other DOMException/read/permission error still throws, so
  genuine failures are not masked as 'changed'.
- No headless test is added (FSA is Node-absent); the manual smoke
  `tests/e2e/README.md` gained section **5b** covering a same-size content edit
  (`'AAAA'` → `'BBBB'` → `changedOnDisk` true), a restore (false), and an
  external deletion (true, no exception). The code-review bullet was updated.

**Verification:** scoped `tsc` of `src/fs/access.ts` + `src/fs/fsa.d.ts` passes
clean (strict, no unused locals/params, verbatim module syntax, erasable-only).

**Commit:** `0b72c27 fix: 00112d7881` — `src/fs/access.ts`, `tests/e2e/README.md`.
