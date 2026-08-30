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
import type { FieldJournalRecord, JournalRecord } from '../domain/journal'

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
): Map<string, { patches: Patch[] }> {
  const bundle = readLayers(layers)
  const { edits, deletes } = foldJournal(journal)
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
  const lsdlRecords = new Map<string, FieldJournalRecord[]>()
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
    }
  }

  // Deletes: block span-deletes, whole-table-file empties, and — for source
  // columns — the per-table PBIPreAI_RemoveUnusedCols M step (one step per
  // table no matter how many columns died).
  const columnDeletes = new Map<string, ModelObject[]>()
  for (const objectId of deletes) {
    const obj = requireObject(objectId)
    if (obj.type === 'column') {
      const bucket = columnDeletes.get(obj.file)
      if (bucket) bucket.push(obj)
      else columnDeletes.set(obj.file, [obj])
      continue
    }
    add(obj.file, plansForDelete(obj, fileOf(obj.file)))
  }
  for (const [file, cols] of columnDeletes) {
    add(file, plansForColumnDeletes(cols, fileOf(file)))
  }

  // LSDL: all records for one culture file fold into ONE re-serialization of
  // the enclosed JSON block (the single exception to never-re-serialize).
  for (const [file, recs] of lsdlRecords) {
    add(file, plansForLsdl(file, recs, bundle, byId, requireObject, fileOf(file)))
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

// --- source-column deletes: the fresh final M step ---------------------------

const M_STEP_NAME = 'PBIPreAI_RemoveUnusedCols'

const M_STEP_LINE = /^\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.]*))\s*=/
const M_STEP_REF = /^(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_.]*)$/

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
  const partition = findMPartition(file.lines)
  const stepIndent = indentOf(partition.lastStep.line.content)
  const columns = cols.map((c) => mString(c.name)).join(', ')
  const stepLine = `${stepIndent}${M_STEP_NAME} = Table.RemoveColumns(${mStepRef(partition.lastStep.name, partition.lastStep.quoted)}, {${columns}})`
  const stepEol = lineEol(partition.lastStep.line)
  const at = file.lines[partition.inIdx].byteStart
  return [
    // The fresh final step, inserted directly before the `in` line.
    { start: at, end: at, replacement: `${stepLine}${stepEol}` },
    // The `in` result retargeted to the new step (steps themselves untouched).
    {
      start: partition.result.contentStart,
      end: partition.result.line.byteStart + byteLen(partition.result.line.content),
      replacement: M_STEP_NAME,
    },
  ]
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
