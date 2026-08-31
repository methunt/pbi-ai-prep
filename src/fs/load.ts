// src/fs/load.ts — production folder→grid load orchestration (FR-1/FR-2/FR-5/FR-8).
//
// After the user picks a PBIP folder, this walks the whole tree, gathers every
// text file into a Map<posixPath,text> (the semantic-model TMDL tree plus the
// report's JSON and the culture files), and asks the broker's `objects` layer
// to parse it. The parse runs OFF the main thread in the parse worker (FR-8:
// the main thread never blocks >50ms on the model parse); the broker in state/
// is the ONLY commit path and calls setProject, so the grid/lineage/prep read
// the folded model. The extra, non-TMDL text lands in `project.files` so the
// lazy `lsdl`/`report`/`lineage` layers derive their deps from it (AD-7) —
// parseTmdlProject skips files with no reader vocabulary, and the report reader
// filters its file map by path.
//
// FR-2 hardening (rejects wrong folders fast):
//   1. EARLY SNIFF — before the walk, list the picked root's immediate child
//      directories and look for any PBIP child (`*.SemanticModel` OR `*.Report`).
//      A wrong folder (e.g. the user's home drive, a Downloads folder) is
//      rejected in microseconds with a clear message — no recursive walk.
//   2. WALK BUDGET — `readDir` throws `WalkBudgetExceeded` after 5,000 entries
//      so a stray giant folder never hangs the picker.
//   3. SHAPE REPORT — when the walk completes without finding `definition/
//      model.tmdl`, the error names what we DID see (subfolder names, .tmdl
//      file count) so the user can correct course.
//   4. SEMANTIC-MODEL CHECK — only `definition/model.tmdl` OR `definition/
//      database.tmdl` inside a `*.SemanticModel` directory counts as a
//      semantic model (a stray root-level `model.tmdl` does not).
//   5. REPORT-ONLY SUPPORT — a `*.Report` folder with no model is accepted;
//      the objects parse then yields zero model objects (graceful — the lineage
//      layer still loads report visuals).

import { listSubdirectories, readDir, readFile } from './access'
import { requestLayer } from '../state/broker'

/** Suffix PBIP semantic-model directories carry (e.g. "MyModel.SemanticModel"). */
const SEMANTIC_MODEL_SUFFIX = '.SemanticModel'
/** Suffix PBIP report directories carry (e.g. "MyModel.Report"). A report-only
 *  folder is a valid PBIP layout (no model — common for headless report editing
 *  or report extraction); the sniff accepts it the same way as a model-only pick. */
const REPORT_SUFFIX = '.Report'

/** Entry shape `summarizeWalk` accepts — re-exported as a public contract so the
 *  tests stay decoupled from `DirEntry`. */
export interface WalkSummaryEntry {
  name: string
  kind: 'file' | 'directory'
  path: string
}

/**
 * Load a picked PBIP folder: sniff the root, walk the tree (bounded), gather
 * the TMDL texts, and request the `objects` layer parse (workerized, idempotent).
 * Settles when the store has committed the parsed project via setProject.
 */
export async function loadProject(
  root: FileSystemDirectoryHandle,
  name: string,
): Promise<void> {
  // (1) Early sniff: reject a wrong folder shape in microseconds, before the
  // walk. The PBIP folder shape is "a folder whose immediate children include
  // one or more `*.SemanticModel` OR `*.Report` directories". Picked one of
  // those child directories directly? Then the root itself carries the suffix
  // — handle that case too.
  const subdirs = await listSubdirectories(root)
  const shape = sniffProjectShape(root.name, subdirs)
  if (!shape.looksLikePbip) {
    throw new Error(shape.error ?? `Picked folder "${name}" does not look like a Power BI project folder.`)
  }

  // (2) Walk with a budget. A wrong-but-huge folder throws here; we surface
  // that as a clearer "too large" error.
  const entries = await readDir(root)

  const files = new Map<string, string>()
  for (const entry of entries) {
    if (entry.kind === 'file') {
      files.set(entry.path, await readFile(root, entry.path))
    }
  }

  // (3) Shape report: when no model.tmdl / database.tmdl landed, surface what
  // we DID find so the user can correct course. Walk + read are wasted on a
  // wrong folder, but the budget caps the waste. Report-only folders are an
  // accepted case — we let them through and the lineage layer picks up the
  // visuals (FR-7 over report-only works fine; the grid is empty by design).
  if (!hasSemanticModel(files)) {
    const summary = summarizeWalk(entries)
    // Soft warning vs hard error: if there is a .Report folder present, treat
    // this as a report-only pick and proceed; otherwise it's a wrong folder.
    const hasReportOnly = subdirs.some((n) => n.endsWith(REPORT_SUFFIX)) || root.name.endsWith(REPORT_SUFFIX)
    if (!hasReportOnly) {
      throw new Error(
        `Picked folder "${name}" contains a "${SEMANTIC_MODEL_SUFFIX}" subfolder ` +
          `but no semantic-model definition was found inside it. ` +
          `Expected "definition/model.tmdl" or "definition/database.tmdl". ` +
          `What was found: ${summary}.`,
      )
    }
  }

  await requestLayer('objects', { layerFiles: { files }, objects: [], projectName: name })
}

/** Whether the gathered text map contains a semantic model (a definition tree
 * with `model.tmdl` / `database.tmdl`). Rejects non-PBIP folders (FR-2). */
export function hasSemanticModel(files: Map<string, string>): boolean {
  for (const path of files.keys()) {
    if (/(^|\/)definition\/model\.tmdl$/.test(path) || /(^|\/)definition\/database\.tmdl$/.test(path)) {
      return true
    }
  }
  return false
}

/** Sniff a picked folder's shape from its own name + immediate child names.
 *  Pure: testable headlessly without a browser. Accepts either a `.SemanticModel`
 *  OR a `.Report` folder shape — both are valid PBIP entry points. */
export function sniffProjectShape(
  rootName: string,
  subdirNames: readonly string[],
): { looksLikePbip: boolean; error?: string } {
  // Case A: the user picked a known PBIP child directory directly (drill-in
  // pattern). Accept either a SemanticModel OR a Report folder.
  if (
    rootName.endsWith(SEMANTIC_MODEL_SUFFIX) ||
    rootName.endsWith(REPORT_SUFFIX)
  ) {
    return { looksLikePbip: true }
  }
  // Case B: the user picked the PBIP folder — look for at least one PBIP
  // child directory (SemanticModel OR Report).
  if (
    subdirNames.some(
      (n) => n.endsWith(SEMANTIC_MODEL_SUFFIX) || n.endsWith(REPORT_SUFFIX),
    )
  ) {
    return { looksLikePbip: true }
  }
  return {
    looksLikePbip: false,
    error: `Picked folder "${rootName}" does not look like a Power BI project folder — ` +
      `no "${SEMANTIC_MODEL_SUFFIX}" or "${REPORT_SUFFIX}" directory was found inside it. ` +
      `Pick the folder that contains your "*.SemanticModel" (model) or "*.Report" (report) subfolder.`,
  }
}

/** A short, readable summary of what the walk saw — used only on the failure
 *  path so the error message can name what was found instead of just "no model". */
export function summarizeWalk(entries: readonly WalkSummaryEntry[]): string {
  let tmdl = 0
  let reportJson = 0
  const topDirs: string[] = []
  for (const e of entries) {
    if (e.kind === 'directory' && !e.path.includes('/')) {
      topDirs.push(e.name)
    } else if (e.kind === 'file') {
      if (e.name.endsWith('.tmdl')) tmdl++
      else if (e.name.endsWith('.json')) reportJson++
    }
  }
  const dirSummary =
    topDirs.length === 0 ? 'no top-level subfolders' : `top-level subfolders [${topDirs.join(', ')}]`
  return `${tmdl} .tmdl files, ${reportJson} .json files; ${dirSummary}`
}