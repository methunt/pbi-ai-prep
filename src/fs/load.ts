// src/fs/load.ts — production folder→grid load orchestration (FR-1/FR-2/FR-5/FR-8).
//
// After the user picks a PBIP folder, this walks the semantic model's
// definition tree, gathers the TMDL text into a Map<posixPath,text>, and asks
// the broker's `objects` layer to parse it. The parse runs OFF the main thread
// in the parse worker (FR-8: the main thread never blocks >50ms on the model
// parse); the broker in state/ is the ONLY commit path and calls setProject, so
// the grid/lineage/prep read the folded model.
//
// FR-2: a folder with no semantic model (no `definition/*.tmdl`) is rejected
// with a readable error BEFORE any parse is dispatched.
// FR-5: parse errors inside the model never abort the load — parseTmdlProject
// collects them per file and the remaining files still load (the broker commits
// the partial project; the errors ride in the layer data).

import { readDir, readFile } from './access'
import { requestLayer } from '../state/broker'

/**
 * Load a picked PBIP folder: walk the definition tree, gather the TMDL texts,
 * and request the `objects` layer parse (workerized, idempotent). Settles when
 * the store has committed the parsed project via setProject.
 */
export async function loadProject(
  root: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  const entries = await readDir(root)
  const files = new Map<string, string>()
  for (const entry of entries) {
    if (entry.kind === 'file' && entry.path.endsWith('.tmdl')) {
      files.set(entry.path, await readFile(root, entry.path))
    }
  }

  if (!hasSemanticModel(files)) {
    throw new Error(
      'No Power BI semantic model found in this folder — no `definition/*.tmdl` files. Pick a folder containing a PBIP semantic model.',
    )
  }

  await requestLayer('objects', { layerFiles: { files }, objects: [], projectName: name })
}

/** Whether the gathered text map contains a semantic model (a definition tree
 * with `model.tmdl` / `database.tmdl`). Rejects non-PBIP folders (FR-2). */
function hasSemanticModel(files: Map<string, string>): boolean {
  for (const path of files.keys()) {
    if (/(^|\/)definition\/model\.tmdl$/.test(path) || /(^|\/)definition\/database\.tmdl$/.test(path)) {
      return true
    }
  }
  return false
}
