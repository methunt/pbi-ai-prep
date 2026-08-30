// Ambient File System Access API additions that this TS lib.dom version omits.
// The shipped lib.dom carries the OLDER FSA surface (FileSystemHandle /
// FileSystemDirectoryHandle / createWritable) but not the Chromium-only
// additions we rely on: `showDirectoryPicker`, the per-handle permission
// queries, and the directory async-iterator methods.
//
// These are real browser globals (runtime availability is guarded by
// `isSupported()`); the declarations only close the type gap. AD-1's purity
// gate scans src/domain/** only, so this augmentation (src/fs/**) is out of
// scope for it.

/** Well-known OS directories usable as a picker `startIn`. */
type WellKnownDirectory = 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'

/** Permission descriptor for `requestPermission` / `queryPermission`. */
interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite'
}

interface FileSystemHandle {
  /** Ask the user for read/write access (MUST be called from a user gesture). */
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
  /** Query the current granted access without prompting the user. */
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>
}

interface FileSystemDirectoryHandle {
  /** Async iterate the directory's direct children (files and sub-directories). */
  values(): AsyncIterableIterator<FileSystemHandle>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  keys(): AsyncIterableIterator<string>
}

interface DirectoryPickerOptions {
  mode?: 'read' | 'readwrite'
  id?: string
  startIn?: FileSystemHandle | WellKnownDirectory
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>
}
