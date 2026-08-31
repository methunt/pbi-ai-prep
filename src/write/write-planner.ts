// Task 4.2 — write planner: journal → per-file byte patches.
//
// Consumes the readers' recorded spans (AD-3) and the 4.1 patch engine; the
// planner is the ONLY component that turns journal records into Patch values.
//
// PINNED CONTRACT (consumed by the fidelity gate tests/gates/fidelity.gate.ts):
// - planWrites(model, journal, layers) → Map<file, { patches }> where patches
//   are half-open UTF-8 BYTE offsets into the file's ORIGINAL text (applyPatches
//   contract). Replacement bytes are computed from the original text plus the
//   reader-recorded spans — never recomputed by hand, never re-keyed ids.
// - An EMPTY journal plans NOTHING: the returned map is empty (a file appears
//   in the map only when it has at least one patch — absent ≡ untouched).
// - At most ONE patch targets any byte span; the patch engine rejects overlaps.
// - The ONE sanctioned re-serialization is the enclosed LSDL JSON block
//   (re-encoded strictly within the lsdl-reader's block {start,end}); the
//   `contentType: json` line lives outside that span and is never touched.
// - Fold semantics mirror domain/project(): later field records win per
//   {objectId, field}; a delete record wins over any edits of the same object.
// - Line endings are whatever the original bytes hold; replacements reuse the
//   surrounding lines' terminator (\r\n or \n) — nothing is normalized.
// - Spans are UTF-8 BYTE offsets: they are decoded with TextDecoder over the
//   encoded original (spanText), never with String.slice (UTF-16 indices).
//
// layers (adaptation point — the gate passes {}): the lazily parsed inputs the
// planner needs beyond the eager model — original file TEXTS (byte-fidelity
// source for indentation/structure the reader did not record as spans) and the
// LSDL culture layers. See PlanLayers below.
//
// LSDL journal records (contract for the 7.x surfaces): FieldJournalRecords
// whose `file` is the CULTURE file path (the file the patch lands in):
//   field 'customInstructions' → new: string (the new instructions text)
//   field 'synonyms'           → new: array of { name, state, type?, weight?, lastModified? }
//                                 replacing the bound entity's whole Terms list
//   field 'lsdlVisibility'     → new: boolean (true = Hidden) → Visibility
//                                 { Value: 'Hidden'|'Visible', State: 'Authored' }
// A synonym/visibility record for an object no entity binds AUTO-CREATES the
import { deletedIdsWithChildren, type FieldJournalRecord, type JournalRecord } from '../domain/journal'

import type { ModelObject } from '../domain/objects'
import type { Span } from '../domain/span'
import { byteLen } from '../domain/span'
import { buildNameIndex, resolveName } from '../domain/identity'
import { indentOf, lineTable, type LineEntry } from '../parse/spans'
import type { Patch } from './patch-engine'

/** Journal fields the planner routes to the LSDL culture file (see header). */
const LSDL_FIELDS: ReadonlySet<string> = new Set(['customInstructions', 'synonyms', 'lsdlVisibility'])

/** Object kinds deleted by span-patching their declaration block (FR-33). */
const BLOCK_DELETE_TYPES: ReadonlySet<string> = new Set([
  'measure',
  'calculatedColumn',
  'calculationItem',
  'hierarchy',
  'hierarchyLevel',
  'daxFunction',
])

/** Table-classified kinds: deleting one empties the whole table file. */
const TABLE_DELETE_TYPES: ReadonlySet<string> = new Set(['table', 'calculationGroup', 'fieldParameter'])

const decoder = new TextDecoder()

/**
 * Decode the byte span `span` out of `bytes` (the encoded ORIGINAL text).
 * Spans are UTF-8 byte offsets — they must NEVER be used with String.slice,
 * which indexes UTF-16 code units; every span read goes through here.
 */
function spanText(bytes: Uint8Array, span: Span): string {
  return decoder.decode(bytes.subarray(span.start, span.end))
}

/**
 * One lazy LSDL layer, structurally the lsdl-reader's `LSDL` (a plain
 * parseLSDL() result satisfies it). Only what planning needs: the culture
 * file, the block span, and the entities' canonical bindings for
 * objectId → entity-key resolution (AD-8: through the ONE shared resolver).
 */
export interface PlanLsdlLayer {
  file: string
  block: Span | null
  entities: Record<string, { binding?: string }>
}

/**
 * The planner's lazy-layer input. `texts` carries each file's ORIGINAL text
 * (the planner computes replacement bytes — indentation, property lines, M
 * steps — from the original bytes plus the recorded spans). `lsdl` carries the
 * parsed culture layers. The fidelity gate passes `{}` (empty journal plans
 * nothing, so no layer is ever consulted on the edit-free path).
 */
export interface PlanLayers {
  texts?: Map<string, string> | Record<string, string>
  lsdl?: readonly PlanLsdlLayer[] | Map<string, PlanLsdlLayer> | Record<string, PlanLsdlLayer>
}

interface LayerBundle {
  texts: Map<string, string>
  lsdl: Map<string, PlanLsdlLayer>
}

/** One file's original text plus the byte/line views the planners need. */
interface FileSource {
  text: string
  bytes: Uint8Array
  lines: LineEntry[]
}

/**
 * Plan the writes for one save: fold the journal (later field records win,
 * deletes win over edits — project() semantics), group the derived changes by
 * the file each patch targets, and emit at most one patch per byte span.
 */
export function planWrites(
  model: ModelObject[],
  journal: JournalRecord[],
  layers: unknown,
  graph?: ObjectGraphLike,
): Map<string, { patches: Patch[] }> {
  const bundle = readLayers(layers)
  const { edits, deletes: journalDeletes } = foldJournal(journal)
  // The delete set EXPANDED with the fold-cascade rule (the SAME helper the
  // read-model fold uses): a table delete takes its children — so their
  // dependents (measures elsewhere, field parameters, relationships) get
  // strand-guarded exactly as if the user had staged the children too.
  // Guard-only: planning iterates the journal's own deletes (the table's
  // whole-file span-delete already covers the children — planning them
  // individually would overlap the file patch).
  const deletes = deletedIdsWithChildren(model, journal)
  for (const objectId of deletes) edits.delete(objectId) // deletes win over edits, cascade victims included
  const byId = new Map(model.map((o) => [o.id, o]))
  const plans = new Map<string, Patch[]>()
  const add = (file: string, patches: Patch[]): void => {
    if (patches.length === 0) return // a file with no patches never enters the map
    const existing = plans.get(file)
    if (existing) existing.push(...patches)
    else plans.set(file, patches)
  }
  const requireObject = (objectId: string): ModelObject => {
    const obj = byId.get(objectId)
    if (obj === undefined) {
      throw new Error(`planWrites: journal record references unknown object ${JSON.stringify(objectId)} — writes need the object's recorded spans`)
    }
    return obj
  }
  // Per-file original: text, its bytes (patch offsets are byte offsets), and
  // the line table — built once per file, on first touch.
  const files = new Map<string, FileSource>()
  const fileOf = (file: string): FileSource => {
    const cached = files.get(file)
    if (cached) return cached
    const text = bundle.texts.get(file)
    if (text === undefined) {
      throw new Error(`planWrites: no original text for ${JSON.stringify(file)} — layers.texts must carry every edited file's bytes`)
    }
    const source: FileSource = { text, bytes: new TextEncoder().encode(text), lines: lineTable(text) }
    files.set(file, source)
    return source
  }

  // Field edits (LSDL records are grouped per culture file and planned after).
  // A 'name' edit ALSO cascades: every other DAX-bearing object referencing
  // the renamed object by name goes stale otherwise (Power BI shows it as a
  // broken reference) — see planRenameCascadeDax.
  const lsdlRecords = new Map<string, FieldJournalRecord[]>()
  const renames: { obj: ModelObject; newName: string }[] = []
  for (const [objectId, byField] of edits) {
    for (const [field, rec] of byField) {
      if (LSDL_FIELDS.has(field)) {
        const bucket = lsdlRecords.get(rec.file)
        if (bucket) bucket.push(rec)
        else lsdlRecords.set(rec.file, [rec])
        continue
      }
      const obj = requireObject(objectId)
      add(obj.file, plansForField(obj, field, rec, fileOf(obj.file)))
      if (field === 'name' && typeof rec.new === 'string' && rec.new !== '' && rec.new !== obj.name) {
        renames.push({ obj, newName: rec.new })
      }
    }
  }
  for (const { obj, newName } of renames) {
    for (const [file, patches] of planRenameCascadeDax(obj, newName, graph, byId, model, fileOf)) {
      add(file, patches)
    }
    for (const [file, patches] of planRenameCascadeReport(obj, newName, bundle)) {
      add(file, patches)
    }
    for (const [file, patches] of planRenameCascadeRoles(obj, newName, bundle)) {
      add(file, patches)
    }
    for (const [file, patches] of planRenameCascadeRelationships(obj, newName, bundle)) {
      add(file, patches)
    }
    for (const [file, patches] of planRenameCascadePerspectives(obj, newName, bundle)) {
      add(file, patches)
    }
  }

  // Deletes: block span-deletes, whole-table-file empties, and — for source
  // columns — the per-table PBIPreAI_RemoveUnusedCols M step (one step per
  // table no matter how many columns died).
  const columnDeletes = new Map<string, ModelObject[]>()
  // Files whose table-classified object dies in this same save. The whole
  // file block is span-deleted below, so source-column M surgery on them is
  // meaningless — and on a calculated table (`partition … = calculated`,
  // no M query) findMPartition would throw and block the entire save. The
  // delete dialog's wave cascade stages exactly this combo: the table, then
  // its orphaned columns as the next round.
  const deletedTableFiles = new Set<string>()
  for (const objectId of journalDeletes) {
    const obj = requireObject(objectId)
    if (obj.type === 'column') {
      const bucket = columnDeletes.get(obj.file)
      if (bucket) bucket.push(obj)
      else columnDeletes.set(obj.file, [obj])
      continue
    }
    if (TABLE_DELETE_TYPES.has(obj.type)) deletedTableFiles.add(obj.file)
    add(obj.file, plansForDelete(obj, fileOf(obj.file)))
  }
  for (const [file, cols] of columnDeletes) {
    if (deletedTableFiles.has(file)) continue
    add(file, plansForColumnDeletes(cols, fileOf(file)))
  }

  // Group-B guard (FR-33 hard mode): a delete must not strand surviving
  // references. Blocking here is atomic — nothing was written yet — and the
  // message names every blocker so the user knows exactly what to delete or
  // re-point first. Known v1 gaps that stay WARNING-level (the cascade dialog
  // names them, this guard does not block): field-parameter JSON refs, RLS
  // role filters, hierarchy levels, report visuals (report-level breakage).
  const blockers = planDeleteBlockers(deletes, byId, graph, columnDeletes, deletedTableFiles, plans, fileOf)
  if (blockers.length > 0) {
    throw new Error(`planWrites: save blocked to protect the model — ${[...new Set(blockers)].join(' · ')}`)
  }

  // LSDL: all records for one culture file fold into ONE re-serialization of
  // the enclosed JSON block (the single exception to never-re-serialize). A
  // culture file also needs re-serializing when a rename touches an object it
  // BINDS, even with no explicit synonym/visibility edit this session — the
  // entity's Definition.Binding string otherwise keeps the OLD name forever
  // (plansForLsdl only rewrote bindings for entities an explicit rec named).
  // Only files with a real linguisticMetadata block are candidates — a file
  // without one has nothing to rebind and plansForLsdl requires the block.
  const lsdlFiles = new Set(lsdlRecords.keys())
  if (renames.length > 0) {
    for (const [file, layer] of bundle.lsdl) {
      if (layer.block !== null) lsdlFiles.add(file)
    }
  }
  for (const file of lsdlFiles) {
    add(file, plansForLsdl(file, lsdlRecords.get(file) ?? [], bundle, byId, requireObject, fileOf(file), renames))
  }

  return new Map([...plans].map(([file, patches]) => [file, { patches }]))
}

// --- journal fold (mirrors domain/project(): later wins, deletes win) --------

function foldJournal(journal: JournalRecord[]): {
  edits: Map<string, Map<string, FieldJournalRecord>>
  deletes: Set<string>
} {
  const edits = new Map<string, Map<string, FieldJournalRecord>>()
  const deletes = new Set<string>()
  for (const rec of journal) {
    if (rec.kind === 'delete') {
      deletes.add(rec.objectId)
      continue
    }
    let byField = edits.get(rec.objectId)
    if (byField === undefined) {
      byField = new Map()
      edits.set(rec.objectId, byField)
    }
    byField.set(rec.field, rec) // later records win
  }
  for (const objectId of deletes) edits.delete(objectId) // deletes win over edits
  return { edits, deletes }
}

// --- layers normalization ----------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asLsdlLayer(v: unknown, at: string): PlanLsdlLayer {
  if (!isPlainObject(v) || typeof v.file !== 'string') {
    throw new Error(`planWrites: layers.lsdl${at} is not an LSDL layer ({ file, block, entities })`)
  }
  const block = v.block
  if (block !== null && (!isPlainObject(block) || typeof block.start !== 'number' || typeof block.end !== 'number')) {
    throw new Error(`planWrites: layers.lsdl${at} has a malformed block span`)
  }
  const entities = v.entities
  if (entities !== undefined && !isPlainObject(entities)) {
    throw new Error(`planWrites: layers.lsdl${at} has malformed entities`)
  }
  return { file: v.file, block: (block ?? null) as Span | null, entities: (entities ?? {}) as PlanLsdlLayer['entities'] }
}

function readLayers(layers: unknown): LayerBundle {
  const bundle: LayerBundle = { texts: new Map(), lsdl: new Map() }
  if (layers === null || layers === undefined) return bundle
  if (!isPlainObject(layers)) throw new Error('planWrites: layers must be an object (PlanLayers)')
  const texts = layers.texts
  if (texts instanceof Map) {
    for (const [key, value] of texts) {
      if (typeof value !== 'string') throw new Error(`planWrites: layers.texts[${JSON.stringify(String(key))}] is not a string`)
      bundle.texts.set(String(key), value)
    }
  } else if (isPlainObject(texts)) {
    for (const [key, value] of Object.entries(texts)) {
      if (typeof value !== 'string') throw new Error(`planWrites: layers.texts[${JSON.stringify(key)}] is not a string`)
      bundle.texts.set(key, value)
    }
  } else if (texts !== undefined) {
    throw new Error('planWrites: layers.texts must be a Map or Record of path → original text')
  }
  const lsdl = layers.lsdl
  if (Array.isArray(lsdl)) {
    lsdl.forEach((layer, i) => {
      const parsed = asLsdlLayer(layer, `[${i}]`)
      bundle.lsdl.set(parsed.file, parsed)
    })
  } else if (lsdl instanceof Map) {
    for (const layer of lsdl.values()) {
      const parsed = asLsdlLayer(layer, '[]')
      bundle.lsdl.set(parsed.file, parsed)
    }
  } else if (isPlainObject(lsdl)) {
    for (const [key, layer] of Object.entries(lsdl)) {
      const parsed = asLsdlLayer(layer, `.${key}`)
      bundle.lsdl.set(parsed.file, parsed)
    }
  } else if (lsdl !== undefined) {
    throw new Error('planWrites: layers.lsdl must be an array, Map, or Record of LSDL layers')
  }
  return bundle
}

// --- description write -------------------------------------------------------

/** `description` split into `///` lines at `indent`, each terminated with `eol`. */
function docBlock(description: string, indent: string, eol: string): string {
  return (
    description
      .split('\n')
      .map((line) => `${indent}///${line === '' ? '' : ` ${line}`}`)
      .join(eol) + eol
  )
}

/** Terminator convention of one source line (CRLF when its line has 2 term bytes). */
function lineEol(line: LineEntry): string {
  return line.byteEnd - line.byteStart - byteLen(line.content) === 2 ? '\r\n' : '\n'
}

/** Terminator convention of a line slice that still carries its terminator. */
function lineEolOfText(lineSlice: string): string {
  return lineSlice.endsWith('\r\n') ? '\r\n' : '\n'
}

function planDescription(obj: ModelObject, value: unknown, file: FileSource): Patch[] {
  if (value !== null && value !== undefined && typeof value !== 'string') {
    throw new Error(`planWrites: description of ${JSON.stringify(obj.name)} must be a string`)
  }
  const description = value === null || value === undefined ? '' : value
  if (description === obj.description) return [] // nothing changed — no patch
  if (description === '') {
    // No description: drop the doc-comment block entirely (span ends at the
    // declaration start, so no stray blank line survives).
    if (obj.docCommentSpan === undefined) return []
    return [{ start: obj.docCommentSpan.start, end: obj.docCommentSpan.end, replacement: '' }]
  }
  if (obj.docCommentSpan !== undefined) {
    const span = obj.docCommentSpan
    const original = spanText(file.bytes, span)
    // Indentation before `///` is part of the span and equals the declaration's.
    const indent = indentOf(original.slice(0, original.indexOf('///')))
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    return [{ start: span.start, end: span.end, replacement: docBlock(description, indent, eol) }]
  }
  // Insert a fresh block directly above the declaration, at its indentation,
  // using the declaration line's own terminator convention.
  const decl = obj.declarationSpan
  const declLine = spanText(file.bytes, decl)
  return [
    { start: decl.start, end: decl.start, replacement: docBlock(description, indentOf(declLine), lineEolOfText(declLine)) },
  ]
}

// --- rename write ------------------------------------------------------------

/** A bare TMDL identifier: no whitespace, quotes, brackets, or `=`/`:`. */
function isBareSafeName(name: string): boolean {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name)
}

/**
 * The name token re-emitted in the ORIGINAL token's quoting style (FR-12):
 * quoted styles stay quoted (embedded quotes doubled); a bare token stays
 * bare only when the new name is a bare-safe identifier, else single quotes.
 */
function requotedName(originalToken: string, newName: string): string {
  if (originalToken.startsWith("'")) return `'${newName.replace(/'/g, "''")}'`
  if (originalToken.startsWith('"')) return `"${newName.replace(/"/g, '""')}"`
  if (originalToken.startsWith('[')) {
    return newName.includes(']') || newName.includes("'") ? `'${newName.replace(/'/g, "''")}'` : `[${newName}]`
  }
  return isBareSafeName(newName) ? newName : `'${newName.replace(/'/g, "''")}'`
}

function planRename(obj: ModelObject, value: unknown, file: FileSource): Patch[] {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`planWrites: name of ${JSON.stringify(obj.name)} must be a non-empty string`)
  }
  if (value === obj.name) return [] // rename to the same name — no patch
  const span = obj.nameSpan
  const token = spanText(file.bytes, span)
  if (token === '') throw new Error(`planWrites: object ${JSON.stringify(obj.id)} has an empty name token — cannot rename`)
  return [{ start: span.start, end: span.end, replacement: requotedName(token, value) }]
}

// --- rename cascade: DAX text references in OTHER objects --------------------
//
// planRename above only patches the renamed object's OWN name token. Every
// OTHER object's DAX that references it by name (`[Old]`, `'Table'[Old]`,
// `Table[Old]`) goes stale — Power BI shows it as a broken reference. This
// walks the graph's dependents, re-locates each reference occurrence inside
// the dependent's OWN declaration text, and rewrites just the identifier
// inside the brackets — never touching surrounding text/quoting/whitespace,
// and never matching inside a `""` string literal or `//`/`/* */` comment
// (mirrors the reader's cleanDax masking, but computed as a same-length mask
// so match byte offsets in the ORIGINAL text stay valid).

/** Escape a string for literal use inside a RegExp. */
function reEscape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Same-length mask of `text`: comment and string-literal ranges replaced with
 * a sentinel character that cannot appear in a valid identifier, so a regex
 * match landing there can be rejected WITHOUT shifting any index — the mask
 * is used only to test match validity; replacements always use the ORIGINAL
 * text. Mirrors tmdl-reader's cleanDax (block comments, line comments, `"…"`
 * literals), but same-length instead of stripped.
 */
function maskCommentsAndStrings(text: string): string {
  let out = text.replace(/\/\*[\s\S]*?\*\//g, (m) => '\u0000'.repeat(m.length))
  out = out.replace(/\/\/[^\n]*/g, (m) => '\u0000'.repeat(m.length))
  out = out.replace(/"[^"]*"/g, (m) => '\u0000'.repeat(m.length))
  return out
}

/** UTF-8 byte offset of the UTF-16 code-unit index `charIndex` into `text`. */
function byteOffsetAt(text: string, charIndex: number): number {
  return byteLen(text.slice(0, charIndex))
}

/**
 * Every byte-offset occurrence, within `declText` (the dependent's OWN
 * declaration text), of a reference to `oldTable`/`oldName` — qualified
 * (`'Table'[Name]` / `Table[Name]`) when `oldTable` is given, plus bare
 * `[Name]` (row-context / measure-to-measure references, which are
 * unqualified regardless of the target's table). Returns spans relative to
 * `declText`'s own byte 0 (the caller offsets by the declaration's absolute
 * start).
 */
function findDaxRenameSpans(
  declText: string,
  mask: string,
  oldTable: string | null,
  oldName: string,
): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = []
  const nameGroup = reEscape(oldName)

  if (oldTable !== null) {
    const qualified = new RegExp(`(?:'${reEscape(oldTable)}'|\\b${reEscape(oldTable)}\\b)\\[(${nameGroup})\\]`, 'g')
    let m: RegExpExecArray | null
    while ((m = qualified.exec(declText)) !== null) {
      if (mask.slice(m.index, m.index + m[0].length).includes('\u0000')) continue
      const nameStart = m.index + m[0].lastIndexOf(m[1])
      spans.push({
        start: byteOffsetAt(declText, nameStart),
        end: byteOffsetAt(declText, nameStart + m[1].length),
      })
    }
  }

  // Bare `[Name]` — only a reference to THIS object when unqualified (no
  // preceding identifier char, dot, or opening quote), same rule the reader
  // uses (extractBareRefs) so a qualified match above is never double-counted.
  const bare = new RegExp(`\\[(${nameGroup})\\]`, 'g')
  let bm: RegExpExecArray | null
  while ((bm = bare.exec(declText)) !== null) {
    if (mask.slice(bm.index, bm.index + bm[0].length).includes('\u0000')) continue
    const before = declText.slice(Math.max(0, bm.index - 1), bm.index)
    if (before === '.' || /\w/.test(before) || before === "'") continue
    const nameStart = bm.index + 1
    spans.push({
      start: byteOffsetAt(declText, nameStart),
      end: byteOffsetAt(declText, nameStart + bm[1].length),
    })
  }
  return spans
}

// --- rename cascade: RLS role DAX (roles/*.tmdl tablePermission filters) ----
//
// `tablePermission X = X[Column] = <DAX expr>` uses the SAME bracket
// reference syntax as measure/column DAX (confirmed against a real fixture:
// `tablePermission Sec_Geo = Sec_Geo[UserName] = USERPRINCIPALNAME()`), but
// roles/*.tmdl is never parsed into ModelObjects (tmdl-reader only
// syntax-validates it) — so it never enters `graph.dependents()` and the
// measure/column cascade above never reaches it. Reuses the exact same
// masked-regex matcher; roles files are small, so the whole file is the scan
// window (no declaration-span windowing needed).

/** A roles/*.tmdl file, wherever it sits under a SemanticModel's definition/ tree. */
const ROLES_FILE = /(^|[\\/])roles[\\/][^\\/]+\.tmdl$/i

function planRenameCascadeRoles(
  renamed: ModelObject,
  newName: string,
  bundle: LayerBundle,
): Map<string, Patch[]> {
  const byFile = new Map<string, Patch[]>()
  const oldTable = isTableLike(renamed) ? null : renamed.table
  for (const [file, text] of bundle.texts) {
    if (!ROLES_FILE.test(file.replace(/\\/g, '/'))) continue
    const mask = maskCommentsAndStrings(text)
    const spans = findDaxRenameSpans(text, mask, oldTable, renamed.name)
    if (spans.length === 0) continue
    byFile.set(
      file,
      spans.map((s) => ({ start: s.start, end: s.end, replacement: newName })),
    )
  }
  return byFile
}

// --- rename cascade: relationships.tmdl (fromColumn/toColumn dot-syntax) ----
//
// `fromColumn: Table.Column` / `toColumn: 'Table Name'.Column` — a
// completely different reference format from DAX brackets, confirmed
// against a real fixture (relationships.tmdl). tmdl-reader DOES already turn
// these into graph edges (kind: 'relationship'), but the edge's `from` is a
// feeder-minted relationship node id, never a ModelObject — so it's
// invisible to `graph.dependents()`'s ModelObject-only lookup the DAX
// cascade uses. Scanned directly by property line instead: precise (only
// `fromColumn:`/`toColumn:` values, never arbitrary text) and reuses the
// same table-then-column dot-split the reader's own parseColumnRef performs.

/** A `fromColumn:`/`toColumn:` value line: optional single-quoted table, a
 *  dot outside any quotes, then the column — mirrors parseColumnRef exactly. */
const RELATIONSHIP_ENDPOINT = /^(\s*(?:fromColumn|toColumn)\s*:\s*)('[^']*'|[^.\r\n]+)\.([^\r\n]+?)\s*$/gm

/** A relationships.tmdl file, wherever it sits under a SemanticModel's definition/ tree. */
const RELATIONSHIPS_FILE = /(^|[\\/])relationships\.tmdl$/i

function planRenameCascadeRelationships(
  renamed: ModelObject,
  newName: string,
  bundle: LayerBundle,
): Map<string, Patch[]> {
  const byFile = new Map<string, Patch[]>()
  const isTable = isTableLike(renamed)
  for (const [file, text] of bundle.texts) {
    if (!RELATIONSHIPS_FILE.test(file.replace(/\\/g, '/'))) continue
    const patches: Patch[] = []
    let m: RegExpExecArray | null
    RELATIONSHIP_ENDPOINT.lastIndex = 0
    while ((m = RELATIONSHIP_ENDPOINT.exec(text)) !== null) {
      const [, prefix, tableRaw, columnRaw] = m
      const table = tableRaw.startsWith("'") && tableRaw.endsWith("'") ? tableRaw.slice(1, -1) : tableRaw.trim()
      const column = columnRaw.trim()
      // Char offsets within the WHOLE text — converted to byte offsets only
      // at the moment each patch is built (spans are UTF-8 bytes).
      const tableCharStart = m.index + prefix.length
      if (isTable) {
        if (table !== renamed.name) continue
        patches.push({
          start: byteOffsetAt(text, tableCharStart),
          end: byteOffsetAt(text, tableCharStart + tableRaw.length),
          replacement: requotedName(tableRaw, newName),
        })
      } else {
        if (table !== renamed.table || column !== renamed.name) continue
        const columnCharStart = tableCharStart + tableRaw.length + 1 // +1 skips the '.'
        patches.push({
          start: byteOffsetAt(text, columnCharStart),
          end: byteOffsetAt(text, columnCharStart + columnRaw.length),
          replacement: requotedName(columnRaw.trim(), newName),
        })
      }
    }
    if (patches.length > 0) byFile.set(file, patches)
  }
  return byFile
}

// --- rename cascade: perspectives/*.tmdl membership tokens ------------------
//
// `perspectiveTable X` / `perspectiveColumn Y` / `perspectiveMeasure Z` /
// `perspectiveHierarchy W` — bare name tokens (quoted the same way a
// declaration's own name token is), scoped to the most recent
// `perspectiveTable` line above them (confirmed against a real fixture).
// Never parsed into a ModelObject or a graph edge at all (tmdl-reader only
// attaches membership data, per its own header comment) — invisible to
// every OTHER cascade, so this is the only path that reaches it.

/** A perspectives/*.tmdl file, wherever it sits under a SemanticModel's definition/ tree. */
const PERSPECTIVES_FILE = /(^|[\\/])perspectives[\\/][^\\/]+\.tmdl$/i

const PERSPECTIVE_LINE = /^([ \t]*)(perspectiveTable|perspectiveColumn|perspectiveMeasure|perspectiveHierarchy)\s+('[^']*'|\S+)\s*$/gm

function planRenameCascadePerspectives(
  renamed: ModelObject,
  newName: string,
  bundle: LayerBundle,
): Map<string, Patch[]> {
  const byFile = new Map<string, Patch[]>()
  const isTable = isTableLike(renamed)
  for (const [file, text] of bundle.texts) {
    if (!PERSPECTIVES_FILE.test(file.replace(/\\/g, '/'))) continue
    const patches: Patch[] = []
    let currentTable: string | null = null
    let m: RegExpExecArray | null
    PERSPECTIVE_LINE.lastIndex = 0
    while ((m = PERSPECTIVE_LINE.exec(text)) !== null) {
      const [, indent, keyword, tokenRaw] = m
      const token = tokenRaw.startsWith("'") && tokenRaw.endsWith("'") ? tokenRaw.slice(1, -1) : tokenRaw
      if (keyword === 'perspectiveTable') {
        currentTable = token
        if (isTable && token === renamed.name) {
          const tokenCharStart = m.index + indent.length + keyword.length + 1
          patches.push({
            start: byteOffsetAt(text, tokenCharStart),
            end: byteOffsetAt(text, tokenCharStart + tokenRaw.length),
            replacement: requotedName(tokenRaw, newName),
          })
        }
        continue
      }
      if (isTable || currentTable !== renamed.table || token !== renamed.name) continue
      const kindMatches =
        (keyword === 'perspectiveColumn' && renamed.type === 'column') ||
        (keyword === 'perspectiveMeasure' && renamed.type === 'measure') ||
        (keyword === 'perspectiveHierarchy' && renamed.type === 'hierarchy')
      if (!kindMatches) continue
      const tokenCharStart = m.index + indent.length + keyword.length + 1
      patches.push({
        start: byteOffsetAt(text, tokenCharStart),
        end: byteOffsetAt(text, tokenCharStart + tokenRaw.length),
        replacement: requotedName(tokenRaw, newName),
      })
    }
    if (patches.length > 0) byFile.set(file, patches)
  }
  return byFile
}

/**
 * Rewrite every OTHER DAX-bearing object's reference to a renamed object.
 * `graph` supplies dependents; a dependent lacking `.dax` (not a
 * DAX-bearing kind) or not present in `byId` (a visual/report node — handled
 * separately by planRenameReportCascade) is skipped.
 *
 * Scan window: `declarationSpan` covers only the declaration LINE for a
 * triple-backtick-fenced DAX body — the fenced body itself lives in bytes
 * AFTER `declarationSpan.end` that the reader never spans. Widen the scan to
 * the next declaration's start in the same file (or EOF) so a fenced body's
 * references are reachable too, without risking a match spilling into that
 * next object's own declaration: `nextStart` is an exclusive upper bound.
 */
function planRenameCascadeDax(
  renamed: ModelObject,
  newName: string,
  graph: ObjectGraphLike | undefined,
  byId: Map<string, ModelObject>,
  model: ModelObject[],
  fileOf: (file: string) => FileSource,
): Map<string, Patch[]> {
  const byFile = new Map<string, Patch[]>()
  if (graph === undefined) return byFile
  const oldTable = isTableLike(renamed) ? null : renamed.table

  const startsByFile = new Map<string, number[]>()
  const startsFor = (file: string): number[] => {
    const cached = startsByFile.get(file)
    if (cached) return cached
    const starts = model
      .filter((o) => o.file === file)
      .map((o) => o.declarationSpan.start)
      .sort((a, b) => a - b)
    startsByFile.set(file, starts)
    return starts
  }
  for (const depId of graph.dependents(renamed.id)) {
    if (depId === renamed.id) continue // a self-reference is patched by planRename itself
    const dep = byId.get(depId)
    if (dep === undefined || dep.dax === undefined) continue
    const source = fileOf(dep.file)
    const starts = startsFor(dep.file)
    const nextStart = starts.find((s) => s > dep.declarationSpan.start) ?? source.bytes.length
    const windowSpan = { start: dep.declarationSpan.start, end: nextStart }
    const windowText = spanText(source.bytes, windowSpan)
    const mask = maskCommentsAndStrings(windowText)
    const spans = findDaxRenameSpans(windowText, mask, oldTable, renamed.name)
    if (spans.length === 0) continue
    const patches = spans.map((s) => ({
      start: windowSpan.start + s.start,
      end: windowSpan.start + s.end,
      replacement: newName,
    }))
    const bucket = byFile.get(dep.file)
    if (bucket) bucket.push(...patches)
    else byFile.set(dep.file, patches)
  }
  return byFile
}
// --- rename cascade: report JSON field bindings (visuals/pages/bookmarks) ---
//
// Report JSON (visual.json, page.json, report.json, *.bookmark.json) has no
// byte-span tracking (the reader is a plain JSON.parse walk) and the SAME
// string can legitimately appear unrelated elsewhere in the same file (a
// title, a filter's literal value, a different table's column of the same
// name) — a raw text find/replace would risk silently corrupting an
// unrelated value. The safe path (validated against a published PBIR
// remap tool, github.com/methunt/pbir-field-remap-toolkit): parse the JSON,
// structurally walk every `{Column|Measure|Hierarchy}.Expression.SourceRef`
// field-reference shape (wherever it appears — projections, sort,
// fieldParameters, filterConfig, bookmarks, visual objects — the shape is
// self-identifying so one generic walk covers all of them), mutate ONLY an
// Entity/Property that matches the renamed object's OLD table+name exactly,
// and re-serialize the WHOLE file. This is the one OTHER sanctioned
// re-serialization exception beyond the LSDL block: report JSON has no
// per-field byte spans to patch instead, and whole-file JSON re-serialize
// is the field-remap ecosystem's accepted approach for this exact problem.

function isJsonRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** A report definition JSON file worth scanning for field references. */
const REPORT_JSON_FILE = /\.report[\\/].*\.(json)$/i

/**
 * One field-object mutation: `{Column|Measure|Hierarchy}.Expression.SourceRef.Entity`
 * + the sibling `Property`/`Hierarchy` name. Returns true when it matched and
 * mutated (old_entity, old_name) → (new_entity, new_name).
 */
function remapFieldObject(
  node: Record<string, unknown>,
  oldEntity: string,
  oldName: string | null,
  newEntity: string,
  newName: string | null,
): boolean {
  for (const kind of ['Column', 'Measure', 'HierarchyLevel', 'Aggregation'] as const) {
    const ref = node[kind]
    if (!isJsonRecord(ref)) continue
    const expression = ref.Expression
    const sourceRef = isJsonRecord(expression) ? expression.SourceRef : undefined
    if (!isJsonRecord(sourceRef) || typeof sourceRef.Entity !== 'string') continue
    if (typeof ref.Property !== 'string') continue
    if (sourceRef.Entity !== oldEntity) continue
    // A table rename (oldName === null) matches on Entity alone and never
    // touches Property; a field rename requires the exact old Property too.
    if (oldName !== null && ref.Property !== oldName) continue
    sourceRef.Entity = newEntity
    if (newName !== null) ref.Property = newName
    return true
  }
  // Hierarchy shape: { Hierarchy: { Expression: { SourceRef: { Entity } }, Hierarchy: name } }
  const hier = node.Hierarchy
  if (isJsonRecord(hier)) {
    const expression = hier.Expression
    const sourceRef = isJsonRecord(expression) ? expression.SourceRef : undefined
    if (
      isJsonRecord(sourceRef) &&
      sourceRef.Entity === oldEntity &&
      typeof hier.Hierarchy === 'string' &&
      (oldName === null || hier.Hierarchy === oldName)
    ) {
      sourceRef.Entity = newEntity
      if (newName !== null) hier.Hierarchy = newName
      return true
    }
  }
  return false
}

/**
 * Recursively walk arbitrary report JSON, remapping every field-reference
 * shape and the `queryRef`/`selector.metadata` derived strings that ride
 * alongside a projection. Mutates `node` in place; returns whether anything
 * changed anywhere in the subtree.
 */
function walkReportJson(
  node: unknown,
  oldEntity: string,
  oldName: string | null,
  newEntity: string,
  newName: string | null,
): boolean {
  let changed = false
  if (Array.isArray(node)) {
    for (const item of node) {
      if (walkReportJson(item, oldEntity, oldName, newEntity, newName)) changed = true
    }
    return changed
  }
  if (!isJsonRecord(node)) return false

  // A container with an explicit `field` object (projections, sort, filter
  // entries) also carries a derived `queryRef` ("Table.Name") to rebuild —
  // reading the (possibly just-updated) Property back off the field object
  // so a table-only rename still rebuilds queryRef with the RIGHT property.
  const field = node.field
  if (isJsonRecord(field) && remapFieldObject(field, oldEntity, oldName, newEntity, newName)) {
    changed = true
    if (typeof node.queryRef === 'string') {
      const prop = fieldPropertyOf(field)
      if (prop !== undefined) node.queryRef = `${newEntity}.${prop}`
    }
  }
  // A bare field object anywhere (fieldParameters.parameterExpr, bookmark
  // filter expressions, FillRule inputs, …) — the shape is self-identifying.
  if (remapFieldObject(node, oldEntity, oldName, newEntity, newName)) changed = true

  // selector.metadata is a derived "Table.Name" string, not a field object —
  // only rewritten for an exact field rename (table-only renames don't know
  // the metadata's property half without a field object to read it from).
  const selector = node.selector
  if (oldName !== null && newName !== null && isJsonRecord(selector) && typeof selector.metadata === 'string') {
    const dot = selector.metadata.indexOf('.')
    if (dot > 0) {
      const entity = selector.metadata.slice(0, dot)
      const name = selector.metadata.slice(dot + 1)
      if (entity === oldEntity && name === oldName) {
        selector.metadata = `${newEntity}.${newName}`
        changed = true
      }
    }
  }

  for (const value of Object.values(node)) {
    if (walkReportJson(value, oldEntity, oldName, newEntity, newName)) changed = true
  }
  return changed
}

/** The Property (or Hierarchy name) a just-remapped field object now carries. */
function fieldPropertyOf(field: Record<string, unknown>): string | undefined {
  for (const kind of ['Column', 'Measure', 'HierarchyLevel', 'Aggregation'] as const) {
    const ref = field[kind]
    if (isJsonRecord(ref) && typeof ref.Property === 'string') return ref.Property
  }
  const hier = field.Hierarchy
  if (isJsonRecord(hier) && typeof hier.Hierarchy === 'string') return hier.Hierarchy
  return undefined
}

/**
 * Rewrite every report JSON file's field bindings that reference a renamed
 * object. `layers.texts` already carries every project file (loadProject
 * gathers the whole tree), so report files are reachable the same way TMDL
 * files are — filtered to the `.Report/` definition tree by path.
 */
function planRenameCascadeReport(
  renamed: ModelObject,
  newName: string,
  bundle: LayerBundle,
): Map<string, Patch[]> {
  const byFile = new Map<string, Patch[]>()
  // A table rename changes the Entity for EVERY property bound to it
  // (`oldName: null` tells walkReportJson to match on Entity alone); a
  // column/measure/hierarchy rename changes just its own Property under an
  // unchanged Entity.
  const oldEntity = isTableLike(renamed) ? renamed.name : renamed.table
  const oldName = isTableLike(renamed) ? null : renamed.name
  const newEntity = isTableLike(renamed) ? newName : renamed.table
  const newFieldName = isTableLike(renamed) ? null : newName
  for (const [file, text] of bundle.texts) {
    if (!REPORT_JSON_FILE.test(file.replace(/\\/g, '/'))) continue
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      continue // an unparsable report file is skipped, never fatal (mirrors the reader)
    }
    if (!isJsonRecord(json)) continue
    const changed = walkReportJson(json, oldEntity, oldName, newEntity, newFieldName)
    if (!changed) continue
    const serialized = JSON.stringify(json, null, 2) + '\n'
    byFile.set(file, [{ start: 0, end: byteLen(text), replacement: serialized }])
  }
  return byFile
}

/** The graph slice the rename cascade needs — kept minimal so tests can stub it. */
export interface ObjectGraphLike {
  dependents(id: string): Set<string>
}

// --- visibility write --------------------------------------------------------

/** Line index of the declaration line (`declarationSpan.start` is a byte offset). */
function lineIndexOf(lines: LineEntry[], byteStart: number, what: string): number {
  const idx = lines.findIndex((l) => l.byteStart === byteStart)
  if (idx === -1) throw new Error(`planWrites: recorded span for ${what} does not land on a line boundary — reader/planner span mismatch`)
  return idx
}

/**
 * Byte offset where the declaration's block ends: the first non-blank line at
 * or above the declaration's indentation (next sibling, the parent's next
 * property, a partition, …), or the end of text. Blank separators before that
 * line belong to the block, so a block delete leaves exactly one separator.
 */
function declarationBlockEnd(lines: LineEntry[], declIdx: number, declIndent: string): number {
  for (let i = declIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.content.trim() === '') continue
    if (indentOf(line.content).length <= declIndent.length) return line.byteStart
  }
  return lines[lines.length - 1].byteEnd
}

function planVisibility(obj: ModelObject, value: unknown, file: FileSource): Patch[] {
  if (typeof value !== 'boolean') {
    throw new Error(`planWrites: hidden of ${JSON.stringify(obj.name)} must be a boolean`)
  }
  if (value === obj.hidden) return [] // already in the requested state
  const lines = file.lines
  const declIdx = lineIndexOf(lines, obj.declarationSpan.start, obj.name)
  const declIndent = indentOf(lines[declIdx].content)
  if (value) {
    // Hide: insert isHidden (and the IsHidden marker the object does not yet
    // carry — FR-13) as the first properties under the declaration.
    const childIndent = `${declIndent}\t`
    const eol = lineEol(lines[declIdx])
    const markerAlready = obj.changedProperty?.includes('IsHidden') ?? false
    const replacement =
      `${childIndent}isHidden${eol}` + (markerAlready ? '' : `${childIndent}changedProperty = IsHidden${eol}`)
    const at = obj.declarationSpan.end
    return [{ start: at, end: at, replacement }]
  }
  // Unhide: remove the object's own isHidden / changedProperty = IsHidden
  // property lines inside its block (each line's terminator goes with it).
  const blockEnd = declarationBlockEnd(lines, declIdx, declIndent)
  const patches: Patch[] = []
  for (let i = declIdx + 1; i < lines.length && lines[i].byteStart < blockEnd; i++) {
    const line = lines[i]
    const trimmed = line.content.trim()
    if (trimmed !== 'isHidden' && trimmed !== 'changedProperty = IsHidden') continue
    if (indentOf(line.content).length <= declIndent.length) continue // not the object's property
    patches.push({ start: line.byteStart, end: line.byteEnd, replacement: '' })
  }
  return patches
}

// --- delete writes -----------------------------------------------------------

function planBlockDelete(obj: ModelObject, file: FileSource): Patch {
  const declIdx = lineIndexOf(file.lines, obj.declarationSpan.start, obj.name)
  const declIndent = indentOf(file.lines[declIdx].content)
  const start = obj.docCommentSpan?.start ?? obj.declarationSpan.start
  return { start, end: declarationBlockEnd(file.lines, declIdx, declIndent), replacement: '' }
}

function plansForDelete(obj: ModelObject, file: FileSource): Patch[] {
  if (TABLE_DELETE_TYPES.has(obj.type)) {
    // A table-classified object IS its file: span-delete the whole file (the
    // fs writer may then drop the now-empty file).
    return [{ start: 0, end: file.bytes.length, replacement: '' }]
  }
  if (BLOCK_DELETE_TYPES.has(obj.type)) return [planBlockDelete(obj, file)]
  throw new Error(`planWrites: deleting a ${obj.type} (${JSON.stringify(obj.name)}) is not supported by the planner`)
}
/** Object kinds whose DAX text breaks visibly when a referenced object dies. */
const DAX_REF_TYPES: ReadonlySet<string> = new Set(['measure', 'calculatedColumn', 'calculationItem'])

/**
 * Group-B guard: name every surviving reference a delete batch would strand.
 *   1. Surviving DAX-bearing dependents (measure / calculated column / calc
 *      item) of any deleted object — their expression keeps a dead `[Name]`.
 *   2. Relationship nodes: a relationship endpoint column dying while the
 *      relationship survives is a model-load error. Relationships are not
      deletable in v1, so ANY surviving relationship dependent blocks.
 *   3. TMDL property refs inside the column's own table file: sortByColumn /
 *      groupByColumn lines pointing at a deleted column from a SURVIVING
 *      block (a line inside another deleted block vanishes with it).
 * Dependents are the raw 1-hop consumer ids: model objects resolve in byId,
 * report visuals are `visual:`-prefixed (report-level, never blocks), and
 * every other id is a feeder-minted relationship node.
 */
function planDeleteBlockers(
  deletes: ReadonlySet<string>,
  byId: ReadonlyMap<string, ModelObject>,
  graph: ObjectGraphLike | undefined,
  columnDeletes: ReadonlyMap<string, readonly ModelObject[]>,
  deletedTableFiles: ReadonlySet<string>,
  plans: ReadonlyMap<string, Patch[]>,
  fileOf: (file: string) => FileSource,
): string[] {
  const blockers: string[] = []
  const kindLabel = (o: ModelObject): string =>
    o.type === 'calculatedColumn' ? 'calculated column' : o.type === 'calculationItem' ? 'calculation item' : o.type
  if (graph !== undefined) {
    const deletedIds = new Set(deletes)
    for (const objectId of deletes) {
      const obj = byId.get(objectId)
      if (obj === undefined) continue
      for (const depId of graph.dependents(objectId)) {
        if (deletedIds.has(depId)) continue // dies in the same save — no strand
        const dep = byId.get(depId)
        if (dep !== undefined) {
          if (DAX_REF_TYPES.has(dep.type)) {
            blockers.push(
              `${kindLabel(dep)} '${dep.name}' still references deleted ${obj.type} '${obj.name}' in its DAX — delete or re-point it first`,
            )
          } else if (dep.type === 'fieldParameter') {
            // A field parameter's extendedProperty JSON wraps the column by
            // name — a dead wrap entry is a broken parameter.
            blockers.push(
              `field parameter '${dep.name}' still wraps deleted ${obj.type} '${obj.name}' — delete or re-point it first`,
            )
          } else if (dep.type === 'table') {
            // A plain table emits no edges; a table-typed dependent is a
            // CALCULATED table whose partition DAX references the deleted
            // object (calcObject edge).
            blockers.push(
              `calculated table '${dep.name}' still references deleted ${obj.type} '${obj.name}' in its partition DAX — delete or re-point it first`,
            )
          } else if (dep.type === 'daxFunction') {
            blockers.push(
              `DAX function '${dep.name}' still references deleted ${obj.type} '${obj.name}' in its body — delete or re-point it first`,
            )
          }
        } else if (!depId.startsWith('visual:')) {
          blockers.push(
            `${obj.type} '${obj.name}' is an endpoint of a table relationship — delete that relationship in Power BI Desktop first`,
          )
        }
      }
    }
  }
  // Property refs live in the deleted column's own table file (sortByColumn /
  // groupByColumn are same-table properties by TMDL semantics).
  for (const [file, cols] of columnDeletes) {
    if (deletedTableFiles.has(file)) continue
    const names = new Set(cols.map((c) => c.name))
    const src = fileOf(file)
    const vanishing = (plans.get(file) ?? []).filter((p) => p.replacement === '' && p.end > p.start)
    for (const line of src.lines) {
      const match = /^\s*(sortByColumn|groupByColumn):\s*(.+)$/.exec(line.content)
      if (match === null) continue
      const ref = match[2].trim().replace(/^'(.*)'$/, '$1')
      if (!names.has(ref)) continue
      // The line disappears when its owning block is deleted in this batch.
      if (vanishing.some((p) => p.start <= line.byteStart && line.byteEnd <= p.end)) continue
      blockers.push(
        `column '${ref}' is deleted but a surviving column still uses it as its ${match[1] === 'sortByColumn' ? 'sort-by column' : 'group-by column'} in ${file} — re-point or delete that column first`,
      )
    }
  }
  return blockers
}

// --- source-column deletes: the fresh final M step ---------------------------

const M_STEP_NAME = 'PBIPreAI_RemoveUnusedCols'

/**
 * One M step-assignment line. The identifier may be bare (`Source`) or the
 * #"quoted" form (`#"Changed Type"` — quote-doubled escapes inside). The
 * #"quoted" form is what Power Query's UI mints for every default step
 * (Changed Type, Renamed Columns, …); missing it made every real-world
 * table throw "is not a step reference" on delete.
 */
const M_STEP_LINE = /^\s*(?:#?"([^"]*)"(?:\s*=\s*|$)|([A-Za-z_][A-Za-z0-9_.]*)\s*=)/
const M_STEP_REF = /^(?:#?"(?:[^"]|"")*"|[A-Za-z_][A-Za-z0-9_.]*)$/

/** M string literal (doubled-quote escaping). */
function mString(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

/** How the new step must reference the previous final step. */
function mStepRef(name: string, quoted: boolean): string {
  return quoted ? `#"${name.replace(/"/g, '""')}"` : name
}

interface MPartition {
  inIdx: number
  lastStep: { name: string; quoted: boolean; line: LineEntry }
  result: { line: LineEntry; contentStart: number } // identifier-only result expression
}

/**
 * Locate the table's M partition machinery: the `partition … = m` section, the
 * last `let` step before `in`, and the identifier-only `in` result. Anything
 * else (no M partition, no let/in, a computed `in` expression) throws — the
 * fresh-final-step pattern cannot be planned for shapes it does not fit.
 */
function findMPartition(lines: LineEntry[]): MPartition {
  const isPartitionStart = (line: LineEntry): boolean => /^\s*partition\b/.test(line.content)
  const isTableStart = (line: LineEntry): boolean => /^\s*table\b/.test(line.content)
  let partitionIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (isPartitionStart(lines[i]) && /\bm\s*$/.test(lines[i].content.replace(/^.*=/, ''))) {
      partitionIdx = i
      break
    }
  }
  if (partitionIdx === -1) throw new Error('planWrites: no M partition (`partition … = m`) found — source-column removal needs an M query')
  let letIdx = -1
  for (let i = partitionIdx + 1; i < lines.length; i++) {
    if (lines[i].content.trim() === 'let') {
      letIdx = i
      break
    }
    if (isPartitionStart(lines[i]) || isTableStart(lines[i])) break
  }
  if (letIdx === -1) throw new Error('planWrites: M partition has no `let` expression — cannot plan the removal step')
  let inIdx = -1
  for (let i = letIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].content.trim()
    if (trimmed === 'in' || trimmed.startsWith('in ')) {
      inIdx = i
      break
    }
    if (isPartitionStart(lines[i]) || isTableStart(lines[i])) break
  }
  if (inIdx === -1) throw new Error('planWrites: M partition has no `in` clause — cannot plan the removal step')
  // Steps sit at the let body's indentation; scanning upward, only assignment
  // lines at that depth count (deeper lines are step-body continuations).
  let bodyIndent: string | null = null
  for (let i = letIdx + 1; i < inIdx; i++) {
    if (lines[i].content.trim() === '') continue
    bodyIndent = indentOf(lines[i].content)
    break
  }
  let lastStep: MPartition['lastStep'] | null = null
  for (let i = inIdx - 1; i > letIdx; i--) {
    const line = lines[i]
    const match = M_STEP_LINE.exec(line.content)
    if (match === null) continue
    if (bodyIndent !== null && indentOf(line.content) !== bodyIndent) continue
    lastStep = { name: match[1] ?? match[2], quoted: match[1] !== undefined, line }
    break
  }
  if (lastStep === null) throw new Error('planWrites: M let-expression has no step assignment before `in` — cannot reference the previous step')
  // The `in` result must be a bare or #"quoted" identifier alone, on the `in`
  // line itself (`in Source`) or the next line (`in` alone).
  const inLine = lines[inIdx]
  const trimmed = inLine.content.trim()
  let resultLine = inLine
  let exprStartChar: number
  if (trimmed === 'in') {
    resultLine = lines[inIdx + 1]
    if (resultLine === undefined) throw new Error('planWrites: M `in` clause has no result expression')
    exprStartChar = indentOf(resultLine.content).length
  } else {
    exprStartChar = indentOf(inLine.content).length + 3 // after 'in '
  }
  const expr = resultLine.content.slice(exprStartChar).trim()
  if (!M_STEP_REF.test(expr)) {
    throw new Error(`planWrites: M \`in\` result ${JSON.stringify(expr)} is not a step reference — refusing to guess the rewrite`)
  }
  const contentStart = resultLine.byteStart + byteLen(resultLine.content.slice(0, resultLine.content.indexOf(expr)))
  return { inIdx, lastStep, result: { line: resultLine, contentStart } }
}

function plansForColumnDeletes(cols: ModelObject[], file: FileSource): Patch[] {
  // TMDL side: each deleted column's declaration block must go too — the M
  // step alone would leave a `sourceColumn` the query no longer produces,
  // which is a Power BI load error. Blocks sit above the partition, so these
  // never overlap the M patches below.
  const blockPatches = cols.map((c) => planBlockDelete(c, file))
  const partition = findMPartition(file.lines)
  const stepIndent = indentOf(partition.lastStep.line.content)
  const stepEol = lineEol(partition.lastStep.line)
  const at = file.lines[partition.inIdx].byteStart
  const inPatch: Patch = {
    start: partition.result.contentStart,
    end: partition.result.line.byteStart + byteLen(partition.result.line.content),
    replacement: M_STEP_NAME,
  }

  // Second-wave delete: the step already exists as the final step (a previous
  // save wrote it). M let-bindings must be UNIQUE — minting another
  // PBIPreAI_RemoveUnusedCols would write a file Power BI refuses to load.
  // Extend the existing step's column list instead.
  if (partition.lastStep.name === M_STEP_NAME) {
    const parsed = parseRemoveColumnsLine(partition.lastStep.line.content)
    if (parsed !== null) {
      const merged = [...new Set([...parsed.columns, ...cols.map((c) => c.name)])]
      const rewritten = `${stepIndent}${M_STEP_NAME} = Table.RemoveColumns(${parsed.source}, {${merged.map(mString).join(', ')}})${stepEol}`
      const patches: Patch[] = [
        ...blockPatches,
        // line.byteEnd includes the terminator — re-emit it.
        { start: partition.lastStep.line.byteStart, end: partition.lastStep.line.byteEnd, replacement: rewritten },
      ]
      const resultText = file.text.slice(
        partition.result.contentStart,
        partition.result.line.byteStart + byteLen(partition.result.line.content),
      )
      // The in-result already points at the step — only re-target when it
      // doesn't (e.g. Power BI reordered the query between saves).
      if (resultText !== M_STEP_NAME) patches.push(inPatch)
      return patches
    }
    // The line no longer matches the exact shape we write (Power BI may have
    // reformatted it) — fall back to a unique suffix rather than corrupt.
    const suffix = uniqueStepSuffix(file.text)
    const name = suffix > 1 ? `${M_STEP_NAME} ${suffix}` : M_STEP_NAME
    const stepLine = `${stepIndent}${name} = Table.RemoveColumns(${mStepRef(partition.lastStep.name, partition.lastStep.quoted)}, {${cols.map((c) => mString(c.name)).join(', ')}})`
    return [
      ...blockPatches,
      { start: at, end: at, replacement: `${stepLine}${stepEol}` },
      { ...inPatch, replacement: name },
    ]
  }

  const columns = cols.map((c) => mString(c.name)).join(', ')
  const stepLine = `${stepIndent}${M_STEP_NAME} = Table.RemoveColumns(${mStepRef(partition.lastStep.name, partition.lastStep.quoted)}, {${columns}})`
  return [
    ...blockPatches,
    // The fresh final step, inserted directly before the `in` line.
    { start: at, end: at, replacement: `${stepLine}${stepEol}` },
    // The `in` result retargeted to the new step (steps themselves untouched).
    inPatch,
  ]
}

/** `… = Table.RemoveColumns(<source>, {<names>})` → source text + unescaped names. */
function parseRemoveColumnsLine(line: string): { source: string; columns: string[] } | null {
  const match = /=\s*Table\.RemoveColumns\(\s*(.+?)\s*,\s*\{(.*)\}\s*\)\s*$/.exec(line)
  if (match === null) return null
  const names = [...match[2].matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'))
  return { source: match[1], columns: names }
}

/** Next free "Name N" suffix so a fallback step never collides with an existing binding. */
function uniqueStepSuffix(text: string): number {
  let n = 1
  const re = new RegExp(`${M_STEP_NAME}(?: (\\d+))? =`, 'g')
  for (const m of text.matchAll(re)) n = Math.max(n, Number(m[1] ?? '1') + 1)
  return n
}

// --- LSDL writes: the ONE sanctioned re-serialization ------------------------

const INDENT_PATTERN = /^\s*/

/**
 * Split a block-span slice into its re-serializable parts: for the fenced
 * shape the fence lines are preserved verbatim as prefix/suffix; `inner` is
 * the JSON text; `contIndent` is the continuation-line indentation the
 * original block was written with.
 */
function blockWrapper(blockText: string): { prefix: string; suffix: string; inner: string; contIndent: string } {
  const lines = blockText.split('\n')
  if (blockText.startsWith('```')) {
    if (lines.length < 3) throw new Error('planWrites: fenced linguisticMetadata block is too short to rewrite')
    const open = lines[0]
    const close = lines[lines.length - 1]
    const inner = lines.slice(1, -1).join('\n')
    return { prefix: `${open}\n`, suffix: `\n${close}`, inner, contIndent: contIndentOf(inner) }
  }
  return { prefix: '', suffix: '', inner: blockText, contIndent: contIndentOf(blockText) }
}

/** Leading whitespace of the first non-blank line after the opening line. */
function contIndentOf(inner: string): string {
  const lines = inner.split('\n')
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue
    const match = INDENT_PATTERN.exec(lines[i])
    return match ? match[0] : ''
  }
  return ''
}

/**
 * Re-encode the parsed JSON in the block's own layout: the original block is
 * `JSON.stringify(raw, null, unit)` with every continuation line prefixed by
 * `prefix` (tabs) — derive both from the original (unit = the non-tab part of
 * the continuation indent, 2 spaces when the block is tab-indented). An
 * unprefixed (single-line) block serializes compact. This is what keeps a
 * value-preserving rewrite byte-identical to the original block.
 */
function serializeJsonBlock(raw: unknown, contIndent: string): string {
  if (contIndent === '') return JSON.stringify(raw)
  const tabs = INDENT_PATTERN.exec(contIndent)![0].match(/^\t*/)![0]
  const unit = contIndent.slice(tabs.length) || '  '
  return JSON.stringify(raw, null, unit)
    .split('\n')
    .map((line, i) => (i === 0 ? line : tabs + line))
    .join('\n')
}

function termJson(value: unknown, file: string): Record<string, unknown> {
  if (
    !isPlainObject(value) ||
    typeof value.name !== 'string' ||
    value.name === '' ||
    typeof value.state !== 'string' ||
    value.state === ''
  ) {
    throw new Error(`planWrites: ${file} — a synonym term must be { name, state, … } with non-empty strings`)
  }
  const body: Record<string, unknown> = { State: value.state }
  if (value.lastModified !== undefined) body.LastModified = value.lastModified
  if (value.type !== undefined) body.Type = value.type
  if (value.weight !== undefined) body.Weight = value.weight
  return { [value.name]: body }
}

/** Is `obj` a table-classified object (its entity binds at table level)? */
function isTableLike(obj: ModelObject): boolean {
  return obj.type === 'table' || obj.type === 'calculationGroup' || obj.type === 'fieldParameter'
}

/** Dot-rule entity key: `<table>.<name>` lowercased; tables are `<name>`. */
function entityKeyFor(obj: ModelObject): string {
  return (isTableLike(obj) ? obj.name : `${obj.table}.${obj.name}`).toLowerCase()
}

function bindingJson(obj: ModelObject): Record<string, unknown> {
  return isTableLike(obj)
    ? { ConceptualEntity: obj.name }
    : { ConceptualEntity: obj.table, ConceptualProperty: obj.name }
}

/**
 * objectId → entity key for one layer, through the ONE shared resolver (AD-8
 * — the binding index's construction, plus the key the index does not carry).
 * First entity wins for a duplicated binding, matching buildBindingIndex.
 */
function resolveEntityKeys(layer: PlanLsdlLayer, model: ModelObject[]): Map<string, string> {
  const byObject = new Map<string, string>()
  if (layer.block === null) return byObject
  const index = buildNameIndex(model)
  for (const [key, entity] of Object.entries(layer.entities)) {
    const binding = entity?.binding
    if (typeof binding !== 'string' || binding === '') continue
    const id = resolveName(index, binding)
    if (id !== undefined && !byObject.has(id)) byObject.set(id, key)
  }
  return byObject
}

function ensureEntities(root: Record<string, unknown>, file: string): Record<string, unknown> {
  if (root.Entities === undefined) root.Entities = {}
  if (!isPlainObject(root.Entities)) throw new Error(`planWrites: ${file} — LSDL Entities is not an object`)
  return root.Entities
}

/**
 * All LSDL records for one culture file fold into ONE block re-serialization:
 * parse the block once from the original text, apply the mutations in journal
 * order, re-encode, and patch the block span only when the encoding differs.
 */
function plansForLsdl(
  file: string,
  recs: FieldJournalRecord[],
  bundle: LayerBundle,
  byId: Map<string, ModelObject>,
  requireObject: (objectId: string) => ModelObject,
  source: FileSource,
  renames: { obj: ModelObject; newName: string }[] = [],
): Patch[] {
  const layer = bundle.lsdl.get(file)
  if (layer === undefined) throw new Error(`planWrites: no LSDL layer for culture file ${JSON.stringify(file)} — pass it via layers.lsdl`)
  if (layer.block === null) throw new Error(`planWrites: ${JSON.stringify(file)} has no linguisticMetadata block to write`)
  const span = layer.block
  const wrapper = blockWrapper(spanText(source.bytes, span))
  let raw: unknown
  try {
    raw = JSON.parse(wrapper.inner)
  } catch (err) {
    throw new Error(`planWrites: ${file} linguisticMetadata JSON failed to re-parse: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!isPlainObject(raw)) throw new Error(`planWrites: ${file} linguisticMetadata JSON is not an object`)

  const byObject = resolveEntityKeys(layer, [...byId.values()])
  const entities = ensureEntities(raw, file)
  for (const rec of recs) {
    if (rec.field === 'customInstructions') {
      if (typeof rec.new !== 'string') throw new Error(`planWrites: ${file} customInstructions must be a string`)
      if (rec.new === '') delete raw.CustomInstructions
      else raw.CustomInstructions = rec.new
      continue
    }
    const obj = requireObject(rec.objectId)
    const resolved = byObject.get(obj.id)
    const entityKey =
      resolved ??
      (() => {
        // Auto-create the bound entity (dot-rule key) when nothing binds it.
        const k = entityKeyFor(obj)
        if (entities[k] !== undefined) {
          throw new Error(`planWrites: ${file} — entity key ${JSON.stringify(k)} already exists but does not bind ${JSON.stringify(obj.name)}`)
        }
        entities[k] = { Definition: { Binding: bindingJson(obj) }, State: 'Generated' }
        byObject.set(obj.id, k)
        return k
      })()
    const entity = entities[entityKey]
    if (!isPlainObject(entity)) throw new Error(`planWrites: ${file} — entity ${JSON.stringify(entityKey)} is not an object`)
    if (rec.field === 'synonyms') {
      if (!Array.isArray(rec.new)) throw new Error(`planWrites: ${file} synonyms must be an array of terms`)
      entity.Terms = rec.new.map((t) => termJson(t, file))
    } else {
      if (typeof rec.new !== 'boolean') throw new Error(`planWrites: ${file} lsdlVisibility must be a boolean`)
      entity.Visibility = { Value: rec.new ? 'Hidden' : 'Visible', State: 'Authored' }
    }
  }

  // Renames: an entity BOUND to a renamed object keeps its Definition.Binding
  // pointed at the OLD name forever unless refreshed here — `resolveEntityKeys`
  // resolved it against the PRISTINE name (that's how it still found the
  // right object), but the persisted JSON string itself must move to the new
  // name. A rename with NO other LSDL edit this session still needs this: it
  // is the ONLY place that ever touches an existing binding string.
  for (const { obj, newName } of renames) {
    const entityKey = byObject.get(obj.id)
    if (entityKey === undefined) continue // nothing in this file binds it
    const entity = entities[entityKey]
    if (!isPlainObject(entity)) continue
    const renamedObj: ModelObject = { ...obj, name: newName }
    entity.Definition = isPlainObject(entity.Definition)
      ? { ...entity.Definition, Binding: bindingJson(renamedObj) }
      : { Binding: bindingJson(renamedObj) }
  }

  const inner = serializeJsonBlock(raw, wrapper.contIndent)
  if (inner === wrapper.inner) return [] // value-preserving: the block is byte-identical, no patch
  return [{ start: span.start, end: span.end, replacement: wrapper.prefix + inner + wrapper.suffix }]
}

// --- field dispatch ----------------------------------------------------------

function plansForField(obj: ModelObject, field: string, rec: FieldJournalRecord, file: FileSource): Patch[] {
  switch (field) {
    case 'description':
      return planDescription(obj, rec.new, file)
    case 'name':
      return planRename(obj, rec.new, file)
    case 'hidden':
      return planVisibility(obj, rec.new, file)
    default:
      throw new Error(`planWrites: unsupported journal field ${JSON.stringify(field)} on object ${JSON.stringify(obj.id)}`)
  }
}
