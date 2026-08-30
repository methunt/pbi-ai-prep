// src/fs/access.ts — File System Access adapter (browser-only).
//
// Wraps the File System Access API for the PBIP workspace: a one-gesture
// read/write folder picker (FR-1), IndexedDB-retained handles (FR-4, AD-7 —
// handles survive only structured-clone stores, so they live in IndexedDB,
// never localStorage), the permission lifecycle (FR-24 — requestPermission
// MUST be called from a user gesture, so it returns a click-ready function),
// whole-file reads, a directory walk, an atomic full-file write (FR-22), and
// an on-disk-vs-snapshot change check (FR-25).
//
// BROWSER-ONLY. This module reads `window`/`indexedDB`/FSA handles and has no
// headless unit test (File System Access does not exist in Node). Runtime
// availability is guarded by `isSupported()`; the surrounding UI (FR-34)
// renders the unsupported message. AD-1's purity gate scans src/domain/** only,
// so this browser surface is out of scope for it.
//
// Paths are project-relative POSIX (`a/b/c`), matching the rest of the
// codebase (spans, journal, patches). A path is resolved against the ROOT
// handle the user picked — it is never an absolute filesystem path (FSA
// handles deliberately expose no absolute location).

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A folder the user picked. `name` is the folder's own basename. */
export interface PickedFolder {
  handle: FileSystemDirectoryHandle
  name: string
}

/** A retained folder handle rehydrated from IndexedDB. */
export interface RecentFolder {
  name: string
  handle: FileSystemDirectoryHandle
}

/** One entry the directory walk yielded. `path` is root-relative POSIX. */
export interface DirEntry {
  name: string
  kind: 'file' | 'directory'
  path: string
}

export interface ReadDirOptions {
  /** Replacement skip table (name → true) for `.pbi`/cache noise; default is `DEFAULT_SKIP_NAMES`. */
  skip?: Readonly<Record<string, true>>
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

/** Whether the runtime is a Chromium browser exposing the File System Access API. */
export function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

const SENSITIVE_NAME_RE = /^(windows|system32|syswow64|winnt|program files|program files \(x86\))$/i
const DRIVE_ROOT_RE = /^[a-z]:$/i

/**
 * Best-effort guard for sensitive system roots (`C:\Windows`, `Program Files`,
 * a drive root). FSA handles expose NO absolute path, so the check is over the
 * directory's own name — sufficient to refuse a directly-picked system root,
 * which is the reachable case. Deeply-nested system subtrees are not
 * reachable via the picker's protected-location restrictions, and we never
 * dereference an absolute path.
 */
export function isSensitiveRoot(handle: Pick<FileSystemDirectoryHandle, 'name'>): boolean {
  const name = handle.name
  return DRIVE_ROOT_RE.test(name) || SENSITIVE_NAME_RE.test(name)
}

/** Directory/file basenames the workspace walk skips (cache/PBI noise). */
export const DEFAULT_SKIP_NAMES: Readonly<Record<string, true>> = {
  '.pbi': true,
  '.cache': true,
  cache: true,
  Cache: true,
  caches: true,
}

/** Split a root-relative POSIX path into segments, refusing traversal. */
function splitPosix(path: string): string[] {
  const segs = path.split('/').filter((s) => s.length > 0)
  for (const s of segs) {
    if (s === '.' || s === '..') {
      throw new Error(`Illegal path segment in ${JSON.stringify(path)}: ${JSON.stringify(s)}`)
    }
  }
  return segs
}

/** Resolve an array of directory segments from `root`, never creating. */
async function resolveDir(root: FileSystemDirectoryHandle, segs: string[]): Promise<FileSystemDirectoryHandle> {
  let cur = root
  for (const seg of segs) {
    cur = await cur.getDirectoryHandle(seg)
  }
  return cur
}

/** Split a path into its parent directory segments and final file name. */
async function resolveFile(
  root: FileSystemDirectoryHandle,
  posixPath: string,
): Promise<{ dir: FileSystemDirectoryHandle; file: string }> {
  const segs = splitPosix(posixPath)
  if (segs.length === 0) {
    throw new Error(`Empty path: ${JSON.stringify(posixPath)}`)
  }
  const file = segs[segs.length - 1] as string
  const dir = await resolveDir(root, segs.slice(0, -1))
  return { dir, file }
}

/** Render a DOMException/browser refusal readably (FR-1). */
function readableFsError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'AbortError':
        return 'You cancelled the folder picker.'
      case 'SecurityError':
        return 'Permission requests must be triggered by a user click.'
      case 'NotAllowedError':
        return 'The browser refused this operation, or the permission was denied.'
      case 'NotFoundError':
        return 'The file or folder no longer exists.'
      default:
        return `${err.name}: ${err.message}`
    }
  }
  if (err instanceof Error) return err.message
  return String(err)
}

// ---------------------------------------------------------------------------
// Picker (FR-1)
// ---------------------------------------------------------------------------

/** Open the one-gesture read/write folder picker (FR-1).
 *
 * Throws a readable error when unsupported (FR-34 UI surfaces it), when the
 * user declines, when the browser refuses, or when the picked root is a
 * sensitive system root (FR-1 refusal).
 */
export async function pickFolder(): Promise<PickedFolder> {
  if (!isSupported()) {
    throw new Error(
      'The File System Access API is not supported in this browser. Please use a recent Chromium-based browser, such as Chrome or Edge.',
    )
  }
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  } catch (err) {
    throw new Error(`Could not open the folder: ${readableFsError(err)}`)
  }
  if (isSensitiveRoot(handle)) {
    throw new Error(`Refusing to open the sensitive system folder "${handle.name}". Pick a project folder instead.`)
  }
  return { handle, name: handle.name }
}

// ---------------------------------------------------------------------------
// Retained handles (FR-4 / AD-7) — IndexedDB
// ---------------------------------------------------------------------------

const DB_NAME = 'pbi-ai-prep'
const DB_VERSION = 1
const RECENTS_STORE = 'recents'

/** A stored recent entry; the handle survives only structured-clone stores. */
interface RecentEntry {
  name: string
  kind: 'directory'
  handle: FileSystemDirectoryHandle
}

function openIdb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable in this browser.'))
  }
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
  const req = indexedDB.open(DB_NAME, DB_VERSION)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(RECENTS_STORE)) {
      db.createObjectStore(RECENTS_STORE, { keyPath: 'name' })
    }
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error ?? new Error('Could not open the retained-handles database.'))
  return promise
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'))
  return promise
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'))
  tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'))
  return promise
}

/** Store a picked folder handle under `name` for a later session (FR-4). */
export async function persistHandle(handle: FileSystemDirectoryHandle, name: string): Promise<void> {
  const db = await openIdb()
  const tx = db.transaction(RECENTS_STORE, 'readwrite')
  tx.objectStore(RECENTS_STORE).put({ name, kind: 'directory', handle } satisfies RecentEntry)
  await transactionDone(tx)
}

/** Rehydrate the retained folder handles. */
export async function listRecent(): Promise<RecentFolder[]> {
  const db = await openIdb()
  const tx = db.transaction(RECENTS_STORE, 'readonly')
  const entries = await requestToPromise<RecentEntry[]>(tx.objectStore(RECENTS_STORE).getAll())
  return entries.filter((e) => e?.kind === 'directory').map(({ name, handle }) => ({ name, handle }))
}

/** Forget a retained folder (used after the user removes it from the recents list). */
export async function dropRecent(name: string): Promise<void> {
  const db = await openIdb()
  const tx = db.transaction(RECENTS_STORE, 'readwrite')
  tx.objectStore(RECENTS_STORE).delete(name)
  await transactionDone(tx)
}

// ---------------------------------------------------------------------------
// Permission lifecycle (FR-24)
// ---------------------------------------------------------------------------

/**
 * Return a function the caller wires to a click (user gesture) that asks for
 * read/write access. `requestPermission` must be invoked from a gesture, so it
 * is NOT called here — the returned closure is. Resolves to 'granted'|'denied';
 * a SecurityError (no gesture) becomes a readable throw.
 */
export function requestPermission(handle: FileSystemDirectoryHandle): () => Promise<'granted' | 'denied'> {
  return async () => {
    try {
      const status = await handle.requestPermission({ mode: 'readwrite' })
      return status === 'granted' ? 'granted' : 'denied'
    } catch (err) {
      throw new Error(`Permission request failed: ${readableFsError(err)}`)
    }
  }
}

/** Query the granted access (no user prompt); pins the read/write mode. */
export function queryPermission(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  return handle.queryPermission({ mode: 'readwrite' })
}

// ---------------------------------------------------------------------------
// Reads / writes
// ---------------------------------------------------------------------------

/** Read a whole file as text. `posixPath` is root-relative POSIX. */
export async function readFile(root: FileSystemDirectoryHandle, posixPath: string): Promise<string> {
  const { dir, file } = await resolveFile(root, posixPath)
  const fh = await dir.getFileHandle(file)
  const fileObj = await fh.getFile()
  return fileObj.text()
}

/**
 * Walk the directory tree from `root` (or the subtree at `posixPath`) and
 * return a flat list of entries with root-relative POSIX paths. Skips the
 * configured `.pbi`/cache noise names (default `DEFAULT_SKIP_NAMES`); nothing
 * else is skipped.
 */
export async function readDir(
  root: FileSystemDirectoryHandle,
  posixPath = '',
  options: ReadDirOptions = {},
): Promise<DirEntry[]> {
  const skip = options.skip ?? DEFAULT_SKIP_NAMES
  const dir = posixPath ? await resolveDir(root, splitPosix(posixPath)) : root
  const out: DirEntry[] = []
  await walkDir(dir, '', out, skip)
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  basePath: string,
  out: DirEntry[],
  skip: Readonly<Record<string, true>>,
): Promise<void> {
  for await (const entry of dir.values()) {
    if (skip[entry.name] === true) continue
    const path = basePath ? `${basePath}/${entry.name}` : entry.name
    out.push({ name: entry.name, kind: entry.kind === 'directory' ? 'directory' : 'file', path })
    if (entry.kind === 'directory') {
      await walkDir(await dir.getDirectoryHandle(entry.name), path, out, skip)
    }
  }
}

/**
 * Atomically replace a whole file with `bytes` (FR-22).
 *
 * `createWritable({ keepExistingData: false })` is the atomic-replace mode:
 * it opens a fresh write stream for the entire file (no existing bytes are
 * retained), the content is written, and `close()` commits it as an atomic
 * swap on the OS side — a reader never observes a half-written file. This is
 * the correct choice because the adapter always rewrites the WHOLE file with
 * the exact bytes; `keepExistingData: true` would only be right for an
 * in-place byte-range patch, which this adapter never does.
 *
 */
export async function writeFileAtomic(
  root: FileSystemDirectoryHandle,
  posixPath: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  const { dir, file } = await resolveFile(root, posixPath)
  const fh = await dir.getFileHandle(file, { create: true })
  const writable = await fh.createWritable({ keepExistingData: false })
  try {
    await writable.write(bytes)
    await writable.close()
  } catch (err) {
    try {
      await writable.abort()
    } catch {
      // Swallow a secondary abort failure; the original error is the signal.
    }
    throw err
  }
  const committed = await fh.getFile()
  if (committed.size !== bytes.byteLength) {
    throw new Error(
      `writeFileAtomic: expected ${bytes.byteLength} bytes but ${committed.size} were committed for ${JSON.stringify(posixPath)}`,
    )
  }
}

/**
 * FR-25 external-change detection: whether the on-disk file at `posixPath`
 * differs from the parse snapshot. Compares the file's exact BYTES against
 * `expected` (a string is compared as its exact UTF-8 bytes), so a SAME-SIZE
 * external edit is still caught — a size match is never trusted. An external
 * deletion (file or a parent directory gone) is treated as 'changed' rather
 * than surfacing a NotFoundError, so the conflict path never trusts a stale
 * snapshot. Any other read/permission error still throws.
 */
export async function changedOnDisk(
  root: FileSystemDirectoryHandle,
  posixPath: string,
  expected: Uint8Array | string,
): Promise<boolean> {
  let fh: FileSystemFileHandle
  try {
    const { dir, file } = await resolveFile(root, posixPath)
    fh = await dir.getFileHandle(file)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') return true
    throw err
  }
  const fileObj = await fh.getFile()
  const current = new Uint8Array(await fileObj.arrayBuffer())
  const expectedBytes = typeof expected === 'string' ? new TextEncoder().encode(expected) : expected
  if (current.byteLength !== expectedBytes.byteLength) return true
  for (let i = 0; i < current.byteLength; i++) {
    if (current[i] !== expectedBytes[i]) return true
  }
  return false
}
