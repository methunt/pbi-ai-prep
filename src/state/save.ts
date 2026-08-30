// src/state/save.ts — the save orchestrator (Task 6.4 / AD-5): the ONE
// production caller of the write path.
//
// The Save button's driver. Groups the journal by file, checks each target for
// on-disk drift (FR-25), plans byte patches (planWrites), applies them
// (applyPatches), atomically rewrites the file (FR-22 writeFileAtomic), commits
// the written bytes + shifted spans (applyRefresh), marks touched lazy layers
// stale (markLayersStale), and clears the written files' journal records.
// FR-24 (revoked permission) retains the whole journal and offers a user-gesture
// retry; FR-25 (external change) surfaces reload-or-overwrite naming the file.
//
// The file-key ↔ disk-path mapping is the subtlety: model files use the
// project-relative POSIX path as BOTH the journal `file` and the fs path, while
// an LSDL culture file's journal records carry the write-planner's derived key
// (`definition/cultures/en-US.tmdl`) yet live at a different project path
// (`X.SemanticModel/definition/cultures/en-US.tmdl`). planWrites keys by the
// journal convention; the fs layer (read/check/write) needs the real path.

import { useStore } from './store'
import type { FileRecord, LayerMap } from './store'
import type { ModelObject } from '../domain/objects'
import type { JournalRecord } from '../domain/journal'
import { project as projectModel } from '../domain/journal'
import { planWrites, type PlanLayers, type PlanLsdlLayer } from '../write/write-planner'
import { applyPatches, type Patch } from '../write/patch-engine'
import { applyRefresh, markLayersStale, type RefreshedFileSpans } from '../write/refresh'
import { changedOnDisk, writeFileAtomic, readFile, requestPermission } from '../fs/access'
import { requestLayer } from './broker'
import { deriveCultureText } from './layerDeps'
import type { SourceSpans } from '../domain/objects'
import { parseTmdlProject } from '../parse/tmdl-reader'

/** The folder handle the currently-open project was picked from; bound during load. */
let activeRoot: FileSystemDirectoryHandle | null = null

/** Bind the picked folder handle so the save orchestrator can read/check/write. */
export function bindRootHandle(root: FileSystemDirectoryHandle): void {
  activeRoot = root
}

export type SaveStatus = 'success' | 'conflict' | 'permission' | 'empty' | 'error'

export interface SaveOutcome {
  status: SaveStatus
  /** Plan keys written (journal `file` convention) — those records are cleared. */
  written: string[]
  /** Plan keys that conflicted on disk (FR-25) — the user chooses reload/overwrite. */
  conflicts: string[]
  message?: string
  /** FR-24: click-ready re-request of read/write permission. */
  retryRequestPermission?: () => Promise<'granted' | 'denied'>
}

const LSDL_FIELDS = new Set(['customInstructions', 'synonyms', 'lsdlVisibility'])

/** Whether an error is a browser read/write permission refusal (FR-24). */
function isPermissionError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'NotAllowedError' || err.name === 'SecurityError'
  }
  return /permission|NotAllowed|denied/i.test(err instanceof Error ? err.message : String(err))
}

function messageFor(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** The project-relative disk path for a plan key. Model files use the key as-is;
 * the LSDL culture file's plan key is the derived `definition/cultures/…` key,
 * mapped to the real path by a trailing-path match into `project.files`. */
function diskPathFor(files: Record<string, FileRecord>, planKey: string): string | null {
  if (files[planKey] !== undefined) return planKey
  for (const key of Object.keys(files)) {
    if (key === planKey || key.endsWith('/' + planKey) || key.endsWith('\\' + planKey)) return key
  }
  return null
}

/** Build the write-planner's `PlanLayers` from the store, registering the LSDL
 * culture text under its derived key (the journal `file` convention). */
function buildPlanLayers(files: Record<string, FileRecord>, layers: LayerMap): PlanLayers {
  const texts = new Map<string, string>()
  for (const [path, record] of Object.entries(files)) {
    if (typeof record.text === 'string') texts.set(path, record.text)
  }

  const lsdlLayers: PlanLsdlLayer[] = []
  const lsdlData = layers.lsdl?.data
  if (lsdlData !== undefined && typeof lsdlData === 'object') {
    const lsd = lsdlData as Record<string, unknown>
    if (typeof lsd.file === 'string' && lsd.file !== '') {
      const planKey = lsd.file
      const disk = diskPathFor(files, planKey)
      if (disk !== null && !texts.has(planKey)) {
        texts.set(planKey, files[disk].text)
      }
      lsdlLayers.push({
        file: planKey,
        block: (lsd.block ?? null) as PlanLsdlLayer['block'],
        entities: (lsd.entities ?? {}) as PlanLsdlLayer['entities'],
      })
    }
  }

  return { texts, lsdl: lsdlLayers }
}

/**
 * Re-derive one object's spans by re-parsing ONLY its own file's fresh text.
 * A `null` span (AD-5: "content changed, must be re-derived") means a byte
 * shift from ANOTHER edit in the same file — a rename cascade patching a
 * different object's DAX reference, for example — moved this object without
 * touching its own content. The PREVIOUS "keep the stale span as a best
 * effort" fallback left `declarationSpan.start` pointing at a byte offset
 * that no longer lands on a line boundary in the shifted file, which is
 * exactly the "does not land on a line boundary" crash on the NEXT save.
 * Matched by lineageTag-derived id first (stable across a re-parse); a
 * surrogate (span-derived) id cannot survive a shift, so those fall back to
 * matching by (table, name, type) instead, which the reader keeps stable.
 */
export function rederiveSpans(obj: ModelObject, freshText: string): Pick<ModelObject, 'declarationSpan' | 'nameSpan' | 'docCommentSpan'> | undefined {
  const { objects } = parseTmdlProject(new Map([[obj.file, freshText]]))
  const byId = objects.find((o) => o.id === obj.id)
  const match = byId ?? objects.find((o) => o.type === obj.type && o.table === obj.table && o.name === obj.name)
  if (match === undefined) return undefined
  return { declarationSpan: match.declarationSpan, nameSpan: match.nameSpan, docCommentSpan: match.docCommentSpan }
}

/** Bake the written field edits into the pristine model and apply the refreshed
 * spans, so the read-model stays consistent after the journal is cleared. */
export function bakePristine(
  pristine: ModelObject[],
  journal: JournalRecord[],
  writtenKeys: ReadonlySet<string>,
  refreshedSpansByFile: Record<string, RefreshedFileSpans>,
  freshTextByFile: Record<string, string>,
): ModelObject[] {
  const writtenRecords = journal.filter((r) => writtenKeys.has(r.file))
  const baked = projectModel(pristine, writtenRecords)
  if (Object.keys(refreshedSpansByFile).length === 0) return baked
  return baked.map((obj) => {
    const sp = refreshedSpansByFile[obj.file]?.[obj.id]
    if (sp === undefined) return obj
    const copy: ModelObject = { ...obj }
    const declarationInvalidated = sp.declaration === null
    const nameInvalidated = sp.name === null
    if (sp.declaration !== null && sp.declaration !== undefined) copy.declarationSpan = sp.declaration
    if (sp.name !== null && sp.name !== undefined) copy.nameSpan = sp.name
    if (sp.docComment !== undefined) copy.docCommentSpan = sp.docComment ?? undefined
    if (declarationInvalidated || nameInvalidated) {
      const freshText = freshTextByFile[obj.file]
      const rederived = freshText === undefined ? undefined : rederiveSpans(copy, freshText)
      if (rederived !== undefined) {
        copy.declarationSpan = rederived.declarationSpan
        copy.nameSpan = rederived.nameSpan
        copy.docCommentSpan = rederived.docCommentSpan
      }
    }
    return copy
  })
}

/**
 * Save the journal's pending edits to disk. Returns an outcome the surface
 * renders; it never throws for expected states (conflict / permission).
 *
 * `overwrite` skips the FR-25 drift check and writes over the on-disk changes
 * (the user chose "Write anyway" in the conflict prompt).
 */
export async function saveWrites(options: { overwrite?: boolean } = {}): Promise<SaveOutcome> {
  const store = useStore.getState()
  const { journal, project, pristine, layers, permission } = store
  if (journal.length === 0) return { status: 'empty', written: [], conflicts: [] }
  if (activeRoot === null) {
    return { status: 'error', written: [], conflicts: [], message: 'No folder handle bound — open a project before saving.' }
  }
  if (permission !== 'granted' && !options.overwrite) {
    return {
      status: 'permission',
      written: [],
      conflicts: [],
      message: 'Write access was not granted.',
      retryRequestPermission: requestPermission(activeRoot),
    }
  }

  // FR-15..18 writes land in the LSDL culture block; if the lsdl layer has not
  // parsed yet (or is stale), parse it first so planWrites can re-derive it.
  const hasLsdlRecords = journal.some(
    (r) => r.kind === 'field' && LSDL_FIELDS.has((r as { field: string }).field),
  )
  if (hasLsdlRecords && layers.lsdl?.parseState !== 'ready') {
    await requestLayer('lsdl', {
      layerFiles: { cultureText: deriveCultureText(project) ?? '' },
      objects: pristine,
    })
  }

  const planLayers = buildPlanLayers(project.files, useStore.getState().layers)
  const plans = planWrites(pristine, journal, planLayers, useStore.getState().graph)

  const targets: { planKey: string; diskPath: string; patches: Patch[]; text: string }[] = []
  for (const [planKey, { patches }] of plans) {
    const diskPath = diskPathFor(project.files, planKey)
    if (diskPath === null) {
      return { status: 'error', written: [], conflicts: [], message: `Cannot locate ${JSON.stringify(planKey)} on disk.` }
    }
    targets.push({ planKey, diskPath, patches, text: project.files[diskPath]?.text ?? '' })
  }

  // FR-25 preflight: any on-disk drift blocks the write (unless the user
  // explicitly chose to overwrite). Naming the conflicting file.
  const conflicts: string[] = []
  if (!options.overwrite) {
    for (const t of targets) {
      if (await changedOnDisk(activeRoot, t.diskPath, t.text)) conflicts.push(t.planKey)
    }
    if (conflicts.length > 0) return { status: 'conflict', written: [], conflicts }
  }

  const writtenKeys: string[] = []
  const updatedFiles: Record<string, { text: string; spans: unknown }> = {}
  const refreshedSpansByFile: Record<string, RefreshedFileSpans> = {}
  const touched = new Set<string>()

  for (const t of targets) {
    try {
      const written = applyPatches(t.text, t.patches)
      await writeFileAtomic(activeRoot, t.diskPath, new TextEncoder().encode(written))
      const priorSpans = (project.files[t.diskPath]?.spans ?? {}) as Record<string, SourceSpans>
      const refresh = applyRefresh(t.diskPath, written, priorSpans, t.text, t.patches)
      updatedFiles[t.diskPath] = { text: refresh.text, spans: refresh.spans }
      refreshedSpansByFile[t.diskPath] = refresh.spans
      writtenKeys.push(t.planKey)
      touched.add(t.diskPath)
      touched.add(t.planKey)
    } catch (err) {
      // FR-24: a permission revocation mid-save. The whole journal is retained —
      // the already-written files are reported so the user knows what landed,
      // and the retry re-requests permission from the click.
      if (isPermissionError(err)) {
        return {
          status: 'permission',
          written: writtenKeys,
          conflicts: [],
          message: `Write access was revoked mid-save. ${writtenKeys.length} file(s) were written; the remaining edits are kept.`,
          retryRequestPermission: requestPermission(activeRoot),
        }
      }
      return { status: 'error', written: writtenKeys, conflicts: [], message: messageFor(err) }
    }
  }

  // Commit the save: bake written edits into pristine, clear their journal
  // records, mark touched lazy layers stale, refresh file texts + spans.
  const writtenKeySet = new Set(writtenKeys)
  const remainingJournal = journal.filter((r) => !writtenKeySet.has(r.file))
  const freshTextByFile: Record<string, string> = {}
  for (const [path, f] of Object.entries(updatedFiles)) freshTextByFile[path] = f.text
  const bakedPristine = bakePristine(pristine, journal, writtenKeySet, refreshedSpansByFile, freshTextByFile)
  const nextLayers = markLayersStale(layers, touched) as LayerMap
  useStore.getState().applySaveCommit(updatedFiles, bakedPristine, remainingJournal, nextLayers)

  return { status: 'success', written: writtenKeys, conflicts: [] }
}

/**
 * FR-25 "Reload" action: discard a conflicted file's pending changes and reload
 * its text from disk. Spans are cleared (honest "unknown" until a re-parse);
 * the on-disk bytes become the new baseline.
 */
export async function reloadConflicts(conflictPlanKeys: string[]): Promise<void> {
  if (activeRoot === null) return
  const store = useStore.getState()
  const updatedFiles: Record<string, { text: string; spans: unknown }> = {}
  const clearKeys = new Set<string>()
  for (const planKey of conflictPlanKeys) {
    const disk = diskPathFor(store.project.files, planKey)
    if (disk === null) continue
    updatedFiles[disk] = { text: await readFile(activeRoot, disk), spans: {} }
    clearKeys.add(planKey)
    clearKeys.add(disk)
  }
  const remainingJournal = store.journal.filter((r) => !clearKeys.has(r.file))
  store.applySaveCommit(updatedFiles, store.pristine, remainingJournal, store.layers)
}
