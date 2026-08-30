// Task 3.3 — LSDL reader + binding index. Authored fresh (no borrow: the
// lineage-tracer has no LSDL reader). Pure (AD-3): no fs, no browser.
//
// Reads the `linguisticMetadata` expression embedded in a culture file
// (`definition/cultures/<lcid>.tmdl`) and splits its JSON into the sections
// downstream consumers need. Two real shapes are supported:
//   - unfenced — the repo's reference model: an indented JSON object written
//     directly as the expression value, followed by `contentType: json`
//   - fenced — the same JSON wrapped in TMDL triple-backtick expression fences
// The reader only RECORDS byte spans into the original text (FR-6/FR-23): it
// never rewrites the block or the contentType line; rename planning consumes
// the binding index, never text search (AD-8).
//
// Resolution policy: every entity's `Definition.Binding` (ConceptualEntity +
// optional ConceptualProperty) is expressed as a canonical `[Table].[Column]`
// (or table-level `[Table]`) reference and resolved through the ONE shared
// resolver. An unresolved binding is a dangling one: the entity is retained in
// the split AND flagged in `lsdl.dangling` — never silently dropped (FR-6).

import type { ModelObject } from '../domain/objects'
import type { Span } from '../domain/span'
import { byteLen } from '../domain/span'
import { buildNameIndex, resolveName } from '../domain/identity'

/** One synonym/phrase entry of an entity's `Terms[]`. */
export interface LSdlTerm {
  name: string
  /** The term's state: `Generated`, `Suggested`, or `Deleted` (tombstoned). */
  state: string
  type?: string
  weight?: number
  lastModified?: string
}

/** An entity's `Visibility` (`{ Value, State }`); absent → null. */
export interface LSdlVisibility {
  value?: string
  state?: string
}

/** One LSDL entity under `Entities`, reduced to the fields consumers need. */
export interface LSdlEntity {
  /** Entity key in the LSDL JSON, e.g. `metrics.last_refreshed`. */
  key: string
  /** Canonical model reference: `[Table].[Column]`, table-level `[Table]`, or `''` when unbound. */
  binding: string
  /** The entity's top-level `State` (e.g. `Generated`); `''` when absent. */
  state: string
  visibility: LSdlVisibility | null
  terms: LSdlTerm[]
  semanticType?: string
}

/** A binding that names a model object that does not exist — retained + flagged (FR-6). */
export interface LSdlDangling {
  binding: string
  /** The culture file the stale binding lives in. */
  file: string
  /** Byte span of the linguisticMetadata block in the culture text. */
  span: Span
  state: string
}

/** The reader's output for one culture file. */
export interface LSDL {
  /** Project-relative culture file path, derived from the `cultureInfo <lcid>` line. */
  file: string
  customInstructions: string
  entities: Record<string, LSdlEntity>
  /** Raw parsed `Relationships` section; null when absent. */
  relationships: unknown
  /** Raw parsed `Agents` section; null when absent. */
  agents: unknown
  /** Byte span of the linguisticMetadata block in the culture text; null when absent. */
  block: Span | null
  /** 0-based line index of the `contentType: json` line; null when absent. */
  contentTypeLine: number | null
  /** Populated by `buildBindingIndex`; empty before that call. */
  dangling: LSdlDangling[]
}

/** One bound model object: where it lives and the LSDL entity's state. */
export interface LSDLBindingEntry {
  file: string
  span: Span
  state: string
}

/** objectId → the bound object's file/declaration span + the LSDL entity's state (AD-8). */
export type LSDLBindingIndex = Map<string, LSDLBindingEntry>

interface Line {
  text: string
  trimmed: string
  /** Char (UTF-16 code unit) offset of the line's first character. */
  charStart: number
  /** UTF-8 byte offset of the line's first character (the Span convention). */
  byteStart: number
}

/** One offset-tracked scan of the culture text; line indices match `split('\n')`. */
function scanLines(text: string): Line[] {
  const lines: Line[] = []
  let pos = 0
  let byte = 0
  for (;;) {
    const nl = text.indexOf('\n', pos)
    const raw = text.slice(pos, nl === -1 ? text.length : nl)
    const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    lines.push({ text: content, trimmed: content.trim(), charStart: pos, byteStart: byte })
    if (nl === -1) break
    byte += byteLen(raw) + 1
    pos = nl + 1
  }
  return lines
}

function fail(file: string, detail: string): never {
  throw new Error(`LSDL ${file}: ${detail}`)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

/** `cultureInfo en-US` → `definition/cultures/en-US.tmdl`; generic label when absent. */
function cultureFileLabel(lines: Line[]): string {
  const m = /^cultureInfo\s+(.+)$/.exec(lines[0]?.trimmed ?? '')
  return m ? `definition/cultures/${m[1].trim()}.tmdl` : 'cultureInfo'
}

/** Byte offset of the first `}` closing the JSON object opened at `open` (string-aware). */
function findJsonEnd(text: string, open: number): number {
  let depth = 0
  let inString = false
  let esc = false
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** Byte offset of the first byte of `text` at char index `idx` within `line`. */
function byteAt(line: Line, idx: number): number {
  return line.byteStart + byteLen(line.text.slice(0, idx))
}

/** UTF-8 byte offset of char offset `charIdx` in `text`, located via the line scan. */
function byteOfChar(lines: Line[], charIdx: number): number {
  let i = 0
  while (i + 1 < lines.length && lines[i + 1].charStart <= charIdx) i++
  const line = lines[i]
  return line.byteStart + byteLen(line.text.slice(0, charIdx - line.charStart))
}

function emptyLSDL(file: string): LSDL {
  return {
    file,
    customInstructions: '',
    entities: {},
    relationships: null,
    agents: null,
    block: null,
    contentTypeLine: null,
    dangling: [],
  }
}

/** Reduce one raw LSDL entity JSON value to the fields consumers need. */
function toEntity(key: string, raw: Record<string, unknown>): LSdlEntity {
  const def = isPlainObject(raw.Definition) ? raw.Definition : {}
  const binding = isPlainObject(def.Binding) ? def.Binding : {}
  const entity = str(binding.ConceptualEntity) ?? ''
  const property = str(binding.ConceptualProperty)
  const vis = isPlainObject(raw.Visibility) ? raw.Visibility : null
  const out: LSdlEntity = {
    key,
    binding: entity ? (property ? `[${entity}].[${property}]` : `[${entity}]`) : '',
    state: str(raw.State) ?? '',
    visibility: vis ? { value: str(vis.Value), state: str(vis.State) } : null,
    terms: Array.isArray(raw.Terms)
      ? raw.Terms.filter(isPlainObject).map((t) => {
          const name = Object.keys(t)[0] ?? ''
          const detail = isPlainObject(t[name]) ? t[name] : {}
          const term: LSdlTerm = { name, state: str(detail.State) ?? '' }
          const type = str(detail.Type)
          const lastModified = str(detail.LastModified)
          if (type !== undefined) term.type = type
          if (lastModified !== undefined) term.lastModified = lastModified
          if (typeof detail.Weight === 'number') term.weight = detail.Weight
          return term
        })
      : [],
  }
  const semanticType = str(raw.SemanticType)
  if (semanticType !== undefined) out.semanticType = semanticType
  return out
}

/**
 * Parse one culture file's text into an LSDL (pure: no fs). No
 * `linguisticMetadata` property → an EMPTY LSDL, not an error. A JSON block
 * that fails to parse or is never closed → a legible Error naming the culture
 * file. The block and contentType line are only located — never rewritten.
 */
export function parseLSDL(cultureText: string): LSDL {
  const lines = scanLines(cultureText)
  const file = cultureFileLabel(lines)

  const opener = lines.findIndex((l) => /^linguisticMetadata\s*=/.test(l.trimmed))
  if (opener === -1) return emptyLSDL(file)

  // Expression value on the `=` line: a fence, an inline `{`, or nothing (JSON starts below).
  const eqRest = lines[opener].trimmed.slice(lines[opener].trimmed.indexOf('=') + 1).trim()
  const fenced = eqRest.startsWith('```')

  if (fenced) {
    const openerFence = lines[opener].text.indexOf('```')
    const closer = lines.findIndex((l, i) => i > opener && l.trimmed === '```')
    if (closer === -1) fail(file, 'linguisticMetadata fenced block is not terminated')
    const closerFence = lines[closer].text.indexOf('```')
    // JSON extraction runs in char space; the recorded spans are byte offsets.
    const parsed = parseJsonOr(
      file,
      cultureText.slice(lines[opener].charStart + openerFence + 3, lines[closer].charStart + closerFence),
    )
    return splitSections(
      file,
      parsed,
      { start: byteAt(lines[opener], openerFence), end: byteAt(lines[closer], closerFence) + 3 },
      lines,
      byteAt(lines[closer], closerFence) + 3,
    )
  }

  // Unfenced: the JSON object is the expression value (same line or an indented block below).
  let openLine = -1
  let openIdx = -1
  if (eqRest.startsWith('{')) {
    openLine = opener
    openIdx = lines[opener].text.indexOf('{')
  } else {
    for (let i = opener + 1; i < lines.length; i++) {
      const trimmed = lines[i].trimmed
      if (trimmed === '' || trimmed.startsWith('//')) continue
      if (trimmed.startsWith('{')) {
        openLine = i
        openIdx = lines[i].text.indexOf('{')
        break
      }
      break // expression value that is not a JSON object — no parseable LSDL
    }
  }
  if (openLine === -1) return emptyLSDL(file)

  const openChar = lines[openLine].charStart + openIdx
  const closeChar = findJsonEnd(cultureText, openChar)
  if (closeChar === -1) fail(file, 'linguisticMetadata JSON block is not terminated')
  const blockStart = byteAt(lines[openLine], openIdx)
  const blockEnd = byteOfChar(lines, closeChar)
  const parsed = parseJsonOr(file, cultureText.slice(openChar, closeChar))
  return splitSections(file, parsed, { start: blockStart, end: blockEnd }, lines, blockEnd)
}

/** Split the parsed block JSON into the sections the LSDL interface exposes. */
function splitSections(
  file: string,
  parsed: unknown,
  block: Span,
  lines: Line[],
  blockEndByte: number,
): LSDL {
  const json = isPlainObject(parsed) ? parsed : null
  if (json === null) fail(file, 'linguisticMetadata JSON is not an object')

  const entities: Record<string, LSdlEntity> = {}
  const rawEntities = isPlainObject(json.Entities) ? json.Entities : {}
  for (const [key, raw] of Object.entries(rawEntities)) {
    if (isPlainObject(raw)) entities[key] = toEntity(key, raw)
  }

  // 0-based index of the line holding the block end, then the trailing contentType line.
  let endLine = 0
  while (endLine < lines.length && lines[endLine].byteStart < blockEndByte) endLine++
  let contentTypeLine: number | null = null
  for (let i = endLine; i < lines.length; i++) {
    if (lines[i].trimmed.startsWith('contentType:')) {
      contentTypeLine = i
      break
    }
  }

  return {
    file,
    customInstructions: str(json.CustomInstructions) ?? '',
    entities,
    relationships: json.Relationships ?? null,
    agents: json.Agents ?? null,
    block,
    contentTypeLine,
    dangling: [],
  }
}

/** JSON.parse or a legible Error naming the culture file (fail legibility). */
function parseJsonOr(file: string, jsonText: string): unknown {
  try {
    return JSON.parse(jsonText)
  } catch (err) {
    fail(file, `linguisticMetadata JSON — ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Map every LSDL entity binding to a model object id through the ONE shared
 * resolver (AD-8: rename planning reads this index, never text search). An
 * unresolvable binding is retained in `lsdl.entities` and flagged in
 * `lsdl.dangling` (FR-6) — never dropped. Re-runs are idempotent: the flag
 * list is rebuilt, never accumulated. Returns an empty index for an empty
 * (no linguisticMetadata) LSDL.
 */
export function buildBindingIndex(lsdl: LSDL, objects: ModelObject[]): LSDLBindingIndex {
  lsdl.dangling.length = 0
  const index: LSDLBindingIndex = new Map()
  if (lsdl.block === null) return index

  const nameIndex = buildNameIndex(objects)
  const byId = new Map(objects.map((o) => [o.id, o]))
  for (const entity of Object.values(lsdl.entities)) {
    if (!entity.binding) continue
    const id = resolveName(nameIndex, entity.binding)
    if (id === undefined) {
      lsdl.dangling.push({ binding: entity.binding, file: lsdl.file, span: lsdl.block, state: entity.state })
      continue
    }
    if (index.has(id)) continue // two entity keys binding the same object: first wins, deterministic
    const obj = byId.get(id)
    if (obj === undefined) continue // unreachable: resolveName only returns indexed ids
    index.set(id, { file: obj.file, span: obj.declarationSpan, state: entity.state })
  }
  return index
}
