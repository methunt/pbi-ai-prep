/*
 * Adopted from pbip-documenter — https://github.com/JonathanJihwanKim/pbip-documenter
 *
 * MIT License. Copyright (c) 2026 Jihwan Kim. See LICENSE in this directory for
 * the full text, which must travel with this file.
 *
 * Maintained here rather than vendored: the report needs parser changes this
 * project owns, and a promise not to change a vendored tree is a promise that
 * has to be broken to ship anything.
 */
/**
 * TMDL Reader — line-by-line state-machine parser for TMDL files.
 *
 * Ported from the borrowed pbip-documenter parser and closed for the write
 * path (AD-2 / AD-3 / FR-5): lineageTag ids (surrogates via the ONE spanDerive
 * helper), queryGroup, perspective membership, changedProperty,
 * functions.tmdl daxFunction objects with verbatim triple-backtick bodies, and
 * declaration / doc-comment / name-token byte spans from the shared emitter.
 *
 * Handles: database.tmdl, model.tmdl, tables/*.tmdl, relationships.tmdl,
 * roles/*.tmdl, expressions.tmdl, functions.tmdl, perspectives/*.tmdl.
 * One ModelObject per declaration that has a vocabulary kind (tables, columns,
 * calculated columns, measures, hierarchies, hierarchy levels, calc groups,
 * calc items, field parameters, dax functions); the remaining files are read
 * so their declarations are validated and their data (relationship endpoints,
 * perspective membership) is attached, not lost.
 *
 * Port fixes, kept deliberately:
 * - Expression continuation is `indent > expressionIndent` — the borrowed
 *   parser assigned `expressionIndent = indent + 1` but tested
 *   `indent > baseIndent`, so every property line after a same-line or fenced
 *   expression was swallowed into the expression text (formatString, isHidden
 *   and lineageTag after a measure body were all lost).
 * - Triple-backtick bodies are captured verbatim between the fences (the
 *   borrowed parser folded the fence lines into the expression and dedented).
 */

import type { BrokenEdge, Edge } from '../domain/graph'
import type { ModelObject, ObjectType } from '../domain/objects'
import { buildNameIndex, resolveName } from '../domain/identity'
import { spanDerive } from '../domain/span'
import { locateDeclaration, locateDocComment, locateNameToken } from './spans'

/** A file that failed to parse: file name, 0-based line (null when unknown), message. */
export interface ParseError {
  file: string
  line: number | null
  message: string
}

/** The reader's output: pristine model objects, relationship edges, and diagnostics. */
export interface TmdlParseResult {
  objects: ModelObject[]
  /** Relationship edges: `from` = feeder-minted relationship node id, `to` = endpoint column id. */
  edges: Edge[]
  /** Endpoints the reader's resolver pass could not resolve (mirrors what buildGraph would mark broken). */
  brokenEdges: BrokenEdge[]
  errors: ParseError[]
}

/*
 * The values a partition may declare after `=` that name its source type rather
 * than open an expression. Anything else after `=` is an expression body.
 */
const PARTITION_SOURCE_TYPES: ReadonlySet<string> = new Set([
  'm',
  'calculated',
  'query',
  'entity',
  'policyRange',
  'calculationGroup',
  'inferred',
])

/** Bare boolean flags a property line may carry alone (no colon, no value). */
const BARE_FLAGS: ReadonlySet<string> = new Set(['isHidden', 'isNameInferred', 'isKey', 'isNullable'])

/** Table-level declaration keywords in `tables/*.tmdl` (first match wins). */
const OBJECT_TYPES = [
  'column',
  'measure',
  'hierarchy',
  'partition',
  'calculationGroup',
  'calculationItem',
  'level',
  'role',
  'refreshPolicy',
] as const

/** Anchored fallback for the expression openers when a fast `startsWith` missed (e.g. `source  =`). */
const EXPR_OPENER = /^(?:expression|source|sourceExpression)\s*=/

/** Marker extended property Power BI writes on a field parameter's hidden reference column. */
const PARAMETER_METADATA = /^extendedProperty\s+ParameterMetadata\b/

/** Canonical (lowercased) lookup key separator; NUL cannot occur in model names. */
const SEP = '\u0000'

const canon = (s: string): string => s.toLowerCase()

/** Blank char within a line's content (content never contains `\n`). */
function isBlankChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r'
}

interface ScannedLine {
  /** Line content without the terminator (CRLF stripped, matching spans.ts). */
  text: string
  trimmed: string
  indent: number
  /** 0-based line index — the same indexing spans.ts's locators take. */
  line: number
}

/**
 * Single offset-tracked line scan: one pass over the text with a running
 * position, no materialized line array. Line indexing matches
 * `text.split('\n')` segments (spans.ts's convention); a `\r` before `\n` is
 * terminator, a lone `\r` is content.
 */
function* scanLines(text: string): Generator<ScannedLine> {
  let pos = 0
  let line = 0
  for (;;) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl
    let content = text.slice(pos, end)
    if (content.length > 0 && content.charCodeAt(content.length - 1) === 13) {
      content = content.slice(0, -1)
    }
    let indent = 0
    while (indent < content.length && isBlankChar(content[indent])) indent++
    yield { text: content, trimmed: content.trim(), indent, line }
    if (nl === -1) break
    pos = nl + 1
    line++
  }
}

/**
 * Extract name from a declaration line: keyword `'Name With Spaces'`,
 * keyword "Name", or nothing (a nameless declaration like `calculationGroup`).
 */
function extractName(line: string, keyword: string): string {
  const afterKeyword = line.slice(keyword.length).trim()
  const eqIndex = afterKeyword.indexOf('=')
  const nameStr = eqIndex >= 0 ? afterKeyword.slice(0, eqIndex).trim() : afterKeyword
  const quotedMatch = /^'([^']+)'/.exec(nameStr)
  if (quotedMatch) return quotedMatch[1]
  return nameStr.split(/\s/)[0] || nameStr
}

/**
 * One declaration awaiting emission: its line, name, doc comment, properties,
 * changedProperty entries, and the raw lines of its expression (if any).
 */
interface Pending {
  kind: (typeof OBJECT_TYPES)[number] | 'table' | 'function'
  name: string
  line: number
  description: string | null
  properties: Record<string, string>
  changedProperty: string[]
  expressionLines: string[]
  /** The expression was delimited by triple backticks — body is verbatim, fences excluded. */
  fenced: boolean
  hadExpression: boolean
}

/** Detect object type from a table-body declaration line. */
function detectObjectType(line: string): (typeof OBJECT_TYPES)[number] | null {
  for (const type of OBJECT_TYPES) {
    if (line === type || line.startsWith(type + ' ') || line.startsWith(type + '\t')) return type
  }
  return null
}

/** Text after the first `=` on a line, trimmed. */
function afterEq(line: string): string {
  const eq = line.indexOf('=')
  return eq === -1 ? '' : line.slice(eq + 1).trim()
}


function newPending(kind: Pending['kind'], line: string, lineNumber: number, description: string | null): Pending {
  return {
    kind,
    name: extractName(line, kind === 'function' ? 'function' : kind),
    line: lineNumber,
    description,
    properties: {},
    changedProperty: [],
    expressionLines: [],
    fenced: false,
    hadExpression: false,
  }
}

/**
 * Fold a pending expression into its final text. Fenced bodies are verbatim:
 * the exact source lines between the fences, terminators normalized to `\n`
 * (final terminator omitted). Unfenced bodies keep the borrowed parser's
 * common-indentation cleanup.
 */
function expressionText(pending: Pending): string | null {
  if (pending.expressionLines.length === 0) return null
  if (pending.fenced) return pending.expressionLines.join('\n')
  const nonEmpty = pending.expressionLines.filter((l) => l.trim() !== '')
  if (nonEmpty.length === 0) return null
  let minIndent = Infinity
  for (const l of nonEmpty) {
    let i = 0
    while (i < l.length && isBlankChar(l[i])) i++
    if (i < minIndent) minIndent = i
  }
  const cleaned = pending.expressionLines.map((l) => {
    if (l.trim() === '') return ''
    let i = 0
    while (i < l.length && isBlankChar(l[i])) i++
    return l.slice(Math.min(minIndent, i))
  })
  while (cleaned.length > 0 && cleaned[0].trim() === '') cleaned.shift()
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].trim() === '') cleaned.pop()
  return cleaned.length === 0 ? null : cleaned.join('\n')
}

/** A parsed table: scalars plus its pending children, before object emission. */
interface TableParse {
  name: string
  line: number
  description: string | null
  isHidden: boolean
  lineageTag: string | undefined
  changedProperty: string[]
  queryGroup: string | undefined
  isAutoDate: boolean
  isCalcGroup: boolean
  isFieldParameter: boolean
  /** NAMEOF tuples of a field-parameter table (edge seeds for `fieldParam`). */
  fieldParamItems: FieldParameterItems['items'] | null
  /** Calculated-partition source texts of a non-parameter table (edge seeds for `calcObject`). */
  calculatedSources: string[]
  columns: Pending[]
  measures: Pending[]
  hierarchies: Pending[]
  levels: Pending[]
  partitions: Pending[]
  calcGroup: Pending | undefined
  calcItems: Pending[]
}

/** A field parameter's rows, or null when the table is not one (ported from the borrowed parser). */
interface FieldParameterItems {
  items: { caption: string | null; targetTable: string | null; targetName: string; order: number | null; group: string | null }[]
  markerColumn: string | null
}

/**
 * A table is a field parameter when it carries the ParameterMetadata marker
 * column or its calculated partition body holds NAMEOF tuples — the two
 * signals can appear alone. Ported from the borrowed readFieldParameter.
 */
function readFieldParameter(table: TableParse): FieldParameterItems | null {
  const marker = table.columns.find((c) => c.properties.hasParameterMetadata === 'true')
  const bodies = table.partitions
    .filter((p) => p.properties.type === 'calculated' || p.properties.type === undefined)
    .map((p) => expressionText(p) ?? '')
  const items = bodies.flatMap(readFieldParameterItems)
  if (!marker && items.length === 0) return null
  return { items, markerColumn: marker ? marker.name : null }
}

/**
 * The NAMEOF tuples in a field parameter body. Both the three- and
 * four-element tuple widths occur, the reference's table name may be quoted
 * or bare, and a measure reference may omit the table entirely — so the
 * pattern stays wide. Ported from the borrowed readFieldParameterItems.
 */
function readFieldParameterItems(body: string): FieldParameterItems['items'] {
  if (!body || !/\bNAMEOF\s*\(/i.test(body)) return []
  const TUPLE = new RegExp(
    [
      /\(\s*"((?:[^"]|"")*)"\s*,/, // caption
      // reference: 'Quoted'[name], Bare[name], or [name] on its own
      /\s*NAMEOF\s*\(\s*(?:'([^']+)'|([^'[\s,()]+))?\s*\[([^\]]+)\]\s*\)/,
      /(?:\s*,\s*(-?\d+))?/, // order
      /(?:\s*,\s*"((?:[^"]|"")*)")?/, // group caption
    ]
      .map((r) => r.source)
      .join(''),
    'gi',
  )
  const text = (s: string | undefined): string | null => (s == null ? null : s.replace(/""/g, '"'))
  const items: FieldParameterItems['items'] = []
  for (const m of body.matchAll(TUPLE)) {
    items.push({
      caption: text(m[1]),
      targetTable: m[2] || m[3] || null,
      targetName: m[4],
      order: m[5] != null ? parseInt(m[5], 10) : null,
      group: text(m[6]),
    })
  }
  return items
}

/**
 * Parse one `tables/*.tmdl` into a TableParse (no spans, no emission — a
 * malformed declaration surfaces when the emitter runs on it). State machine
 * ported from the borrowed parser with the expression-continuation fix.
 */
function parseTable(text: string, lineBox: { line: number }): TableParse {
  const table: TableParse = {
    name: '',
    line: -1,
    description: null,
    isHidden: false,
    lineageTag: undefined,
    changedProperty: [],
    queryGroup: undefined,
    isAutoDate: false,
    isCalcGroup: false,
    isFieldParameter: false,
    fieldParamItems: null,
    calculatedSources: [],
    columns: [],
    measures: [],
    hierarchies: [],
    levels: [],
    partitions: [],
    calcGroup: undefined,
    calcItems: [],
  }
  let state: 'IDLE' | 'TABLE_BODY' | 'PROPERTIES' | 'EXPRESSION' = 'IDLE'
  let current: Pending | null = null
  let pendingDescription: string | null = null
  let baseIndent = 0
  let expressionIndent = 0
  let inBacktickBlock = false
  // An annotation or extended property whose value is a block: everything
  // indented under it belongs to that value, not to the object.
  let skipBlockIndent: number | null = null

  for (const l of scanLines(text)) {
    lineBox.line = l.line
    const { trimmed, indent } = l

    if (skipBlockIndent !== null) {
      if (trimmed !== '' && indent > skipBlockIndent) continue
      skipBlockIndent = null
    }

    /*
     * Triple-backtick blocks. A fence may open on a line of its own or at the
     * end of the declaration that introduces it. Open and close are tracked
     * separately (borrowed fix); the body is captured verbatim, fences
     * excluded, and a closing fence ends the expression.
     */
    if (inBacktickBlock) {
      if (trimmed === '```') {
        inBacktickBlock = false
        if (state === 'EXPRESSION') state = 'PROPERTIES'
      } else if (state === 'EXPRESSION' && current) {
        current.expressionLines.push(l.text)
      }
      continue
    }
    if (trimmed === '```') {
      inBacktickBlock = true
      if (state === 'EXPRESSION' && current) current.fenced = true
      continue
    }

    // Description comments (/// lines); regular comments and blanks are skipped.
    if (trimmed.startsWith('///')) {
      const descText = trimmed.slice(3).trim()
      pendingDescription = pendingDescription === null ? descText : pendingDescription + '\n' + descText
      continue
    }
    if (trimmed.startsWith('//') || trimmed === '') continue

    // Top-level: table declaration.
    if (indent === 0 && trimmed.startsWith('table')) {
      table.name = extractName(trimmed, 'table')
      table.line = l.line
      if (pendingDescription !== null) {
        table.description = pendingDescription
        pendingDescription = null
      }
      state = 'TABLE_BODY'
      baseIndent = 0
      continue
    }

    // Object headers at indent level 1 (typically a single tab).
    if (state !== 'IDLE' && indent > 0 && indent <= 4) {
      const objectType = detectObjectType(trimmed)
      if (objectType) {
        collectPending(table, current)
        current = newPending(objectType, trimmed, l.line, pendingDescription)
        pendingDescription = null
        baseIndent = indent

        if (trimmed.includes('=')) {
          const value = afterEq(trimmed)
          /*
           * `partition X = calculated` declares a source *type*, not an
           * expression. Kept to partitions and the known keywords: a one-word
           * value after `=` is a legitimate expression anywhere else.
           */
          if (objectType === 'partition' && PARTITION_SOURCE_TYPES.has(value)) {
            current.properties.type = value
            state = 'PROPERTIES'
            continue
          }
          current.hadExpression = true
          if (value.endsWith('```')) {
            current.fenced = true
            inBacktickBlock = true
          } else if (value) current.expressionLines.push(value)
          state = 'EXPRESSION'
          expressionIndent = indent + 1
          continue
        }
        state = 'PROPERTIES'
        continue
      }
    }

    // Inside expression: continues while deeper than the introducing line.
    if (state === 'EXPRESSION') {
      if (indent > expressionIndent || trimmed === '') {
        if (current) current.expressionLines.push(l.text)
        continue
      }
      // Expression ended — process this line as a property.
      state = 'PROPERTIES'
    }

    if (state === 'PROPERTIES' || state === 'TABLE_BODY') {
      // changedProperty (write-path marker): deeper indent → the open object,
      // otherwise the table (a table-level marker may follow a partition block).
      if (trimmed.startsWith('changedProperty')) {
        const value = afterEq(trimmed)
        if (value) {
          if (current && indent > baseIndent && current.kind !== 'calculationGroup') {
            current.changedProperty.push(value)
          } else {
            table.changedProperty.push(value)
          }
        }
        continue
      }

      // Bare boolean flags (no colon, no value) — e.g. isHidden.
      if (indent > baseIndent && BARE_FLAGS.has(trimmed)) {
        if (current) {
          current.properties[trimmed] = 'true'
        } else if (trimmed === 'isHidden') {
          table.isHidden = true
        }
        continue
      }

      // `key: value` property lines — the hot path.
      if (indent > baseIndent && trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':')
        const key = trimmed.slice(0, colonIndex).trim()
        const value = trimmed.slice(colonIndex + 1).trim()
        if (current) {
          current.properties[key] = value
        } else if (key === 'isHidden') {
          table.isHidden = value === 'true'
        } else if (key === 'lineageTag') {
          table.lineageTag = value
        }
        continue
      }

      // Annotation or extendedProperty blocks (block values swallow their lines).
      if (indent > baseIndent && (trimmed.startsWith('annotation') || trimmed.startsWith('extendedProperty'))) {
        if (current && trimmed.startsWith('annotation PBI_ResultType =')) {
          current.properties.pbiResultType = afterEq(trimmed).replace(/^['"]|['"]$/g, '')
        }
        if (current && PARAMETER_METADATA.test(trimmed)) {
          current.properties.hasParameterMetadata = 'true'
        }
        if (trimmed.endsWith('=')) skipBlockIndent = indent
        continue
      }

      // `source =` / `expression =` opens an expression block.
      if (
        indent > baseIndent &&
        trimmed.includes('=') &&
        (trimmed.startsWith('expression =') ||
          trimmed.startsWith('source =') ||
          trimmed.startsWith('sourceExpression =') ||
          EXPR_OPENER.test(trimmed))
      ) {
        const value = afterEq(trimmed)
        if (current) {
          current.hadExpression = true
          if (value.endsWith('```')) {
            current.fenced = true
            inBacktickBlock = true
          } else if (value) current.expressionLines.push(value)
        }
        state = 'EXPRESSION'
        expressionIndent = indent + 1
        continue
      }

      // Expression start on a bare `=` property line.
      if (current && indent > baseIndent && trimmed.startsWith('=')) {
        const value = trimmed.slice(1).trim()
        current.hadExpression = true
        if (value) current.expressionLines.push(value)
        state = 'EXPRESSION'
        expressionIndent = indent + 1
        continue
      }
    }
  }
  collectPending(table, current)

  for (const partition of table.partitions) {
    if (partition.properties.queryGroup) table.queryGroup = partition.properties.queryGroup
  }
  const fieldParameter = readFieldParameter(table)
  table.isFieldParameter = fieldParameter !== null
  table.fieldParamItems = fieldParameter?.items ?? null
  table.calculatedSources = table.partitions
    .filter((p) => p.properties.type === 'calculated')
    .map((p) => expressionText(p) ?? '')
    .filter((source) => source !== '')
  table.isCalcGroup = table.calcGroup !== undefined
  table.isAutoDate = table.name.startsWith('LocalDateTable_') || table.name.startsWith('DateTableTemplate_')

  return table
}

/** File the pending declaration into its table bucket (ported _finishCurrentObject). */
function collectPending(table: TableParse, pending: Pending | null): void {
  if (!pending) return
  switch (pending.kind) {
    case 'column':
      table.columns.push(pending)
      break
    case 'measure':
      table.measures.push(pending)
      break
    case 'hierarchy':
      table.hierarchies.push(pending)
      break
    case 'level':
      table.levels.push(pending)
      break
    case 'partition':
      table.partitions.push(pending)
      break
    case 'calculationGroup':
      table.calcGroup = pending
      break
    case 'calculationItem':
      table.calcItems.push(pending)
      break
    default:
      break // refreshPolicy and role carry no model object
  }
}

/**
 * Emit one ModelObject for a pending declaration. Id = lineageTag, else the
 * surrogate minted once by the SINGLE spanDerive helper over the declaration
 * span. Spans come from the shared emitter; a malformed declaration throws
 * there and the caller reports ParseError{file, line} for it.
 */
function emitPending(
  pending: Pending,
  type: ObjectType,
  tableName: string,
  file: string,
  text: string,
  fields: { dax?: string; hidden?: boolean; isFieldParameter?: boolean; queryGroup?: string },
): ModelObject {
  const declarationSpan = locateDeclaration(text, pending.line)
  const nameSpan = locateNameToken(text, pending.line)
  const docCommentSpan = locateDocComment(text, declarationSpan.start)

  const object: ModelObject = {
    id: pending.properties.lineageTag ?? spanDerive(file, declarationSpan),
    type,
    name: pending.name,
    table: tableName,
    file,
    declarationSpan,
    nameSpan,
    hidden: fields.hidden ?? false,
    isFieldParameter: fields.isFieldParameter ?? false,
  }
  if (pending.description !== null) object.description = pending.description
  if (docCommentSpan) object.docCommentSpan = docCommentSpan
  if (fields.dax !== undefined) object.dax = fields.dax
  if (pending.properties.displayFolder) object.displayFolder = pending.properties.displayFolder
  if (pending.changedProperty.length > 0) object.changedProperty = [...pending.changedProperty]
  if (fields.queryGroup) object.queryGroup = fields.queryGroup
  const ordinal = pending.properties.ordinal
  if (ordinal !== undefined && ordinal !== '') object.ordinal = parseInt(ordinal, 10)
  return object
}

/** Edge seeds collected per table: NAMEOF tuples and calculated sources. */
interface EdgeSeeds {
  paramTables: { id: string; items: FieldParameterItems['items'] }[]
  calcTables: { id: string; sources: string[] }[]
}

/** Emit the table object and all its children for one parsed table. */
function emitTable(
  table: TableParse,
  file: string,
  text: string,
  objects: ModelObject[],
  errors: ParseError[],
  seeds: EdgeSeeds,
): void {
  const emit = (
    pending: Pending,
    type: ObjectType,
    fields: { dax?: string; hidden?: boolean; isFieldParameter?: boolean; queryGroup?: string },
    parent = table.name,
  ): ModelObject | undefined => {
    try {
      const object = emitPending(pending, type, parent, file, text, fields)
      objects.push(object)
      return object
    } catch (err) {
      errors.push({ file, line: pending.line, message: errorMessage(err) })
      return undefined
    }
  }

  const tableObject = emit(
    {
      kind: 'table',
      name: table.name,
      line: table.line,
      description: table.description,
      properties: table.lineageTag ? { lineageTag: table.lineageTag } : {},
      changedProperty: table.changedProperty,
      expressionLines: [],
      fenced: false,
      hadExpression: false,
    },
    // A table containing a calculationGroup block is classified as a
    // calculation group; a field-parameter table IS the parameter entity
    // (AD-6 fieldParam edges emanate from it; Task 1.1 §8.2).
    table.isCalcGroup ? 'calculationGroup' : table.isFieldParameter ? 'fieldParameter' : 'table',
    { hidden: table.isHidden, isFieldParameter: table.isFieldParameter, queryGroup: table.queryGroup },
    // The table's own object carries no parent table.
    '',
  )
  if (tableObject) {
    // A field parameter's partition body feeds `fieldParam` edges only — its
    // NAMEOF tuples are the wrap edges, never calcObject sources.
    if (table.isFieldParameter && table.fieldParamItems && table.fieldParamItems.length > 0) {
      seeds.paramTables.push({ id: tableObject.id, items: table.fieldParamItems })
    } else if (table.calculatedSources.length > 0) {
      seeds.calcTables.push({ id: tableObject.id, sources: table.calculatedSources })
    }
  }
  for (const column of table.columns) {
    emit(
      column,
      column.hadExpression ? 'calculatedColumn' : 'column',
      {
        dax: expressionText(column) ?? undefined,
        hidden: column.properties.isHidden === 'true',
        isFieldParameter: column.properties.hasParameterMetadata === 'true',
      },
    )
  }
  for (const measure of table.measures) {
    emit(measure, 'measure', {
      dax: expressionText(measure) ?? undefined,
      hidden: measure.properties.isHidden === 'true',
    })
  }
  for (const hierarchy of table.hierarchies) {
    emit(hierarchy, 'hierarchy', { hidden: hierarchy.properties.isHidden === 'true' })
  }
  for (const level of table.levels) {
    emit(level, 'hierarchyLevel', {})
  }
  for (const item of table.calcItems) {
    emit(item, 'calculationItem', { dax: expressionText(item) ?? undefined })
  }
}

/** Parse one functions.tmdl into daxFunction pendings. */
function parseFunctions(text: string, lineBox: { line: number }): Pending[] {
  const functions: Pending[] = []
  let current: Pending | null = null
  let pendingDescription: string | null = null
  let state: 'IDLE' | 'PROPERTIES' | 'EXPRESSION' = 'IDLE'
  let expressionIndent = 0
  let inBacktickBlock = false

  for (const l of scanLines(text)) {
    lineBox.line = l.line
    const { trimmed, indent } = l

    if (inBacktickBlock) {
      if (trimmed === '```') {
        inBacktickBlock = false
        if (state === 'EXPRESSION') state = 'PROPERTIES'
      } else if (state === 'EXPRESSION' && current) {
        current.expressionLines.push(l.text)
      }
      continue
    }
    if (trimmed === '```') {
      inBacktickBlock = true
      if (state === 'EXPRESSION' && current) current.fenced = true
      continue
    }
    if (trimmed.startsWith('///')) {
      const descText = trimmed.slice(3).trim()
      pendingDescription = pendingDescription === null ? descText : pendingDescription + '\n' + descText
      continue
    }
    if (trimmed.startsWith('//') || trimmed === '') continue

    if (indent === 0 && trimmed.startsWith('function')) {
      if (current) functions.push(current)
      current = newPending('function', trimmed, l.line, pendingDescription)
      pendingDescription = null
      if (trimmed.includes('=')) {
        const value = afterEq(trimmed)
        current.hadExpression = true
        if (value.endsWith('```')) {
          current.fenced = true
          inBacktickBlock = true
        } else if (value) current.expressionLines.push(value)
        state = 'EXPRESSION'
        expressionIndent = indent + 1
      } else {
        state = 'PROPERTIES'
      }
      continue
    }

    if (current && state === 'EXPRESSION') {
      if (indent > expressionIndent || trimmed === '') {
        current.expressionLines.push(l.text)
        continue
      }
      state = 'PROPERTIES'
    }

    if (current && state === 'PROPERTIES' && indent > 0) {
      if (trimmed.startsWith('changedProperty')) {
        const value = afterEq(trimmed)
        if (value) current.changedProperty.push(value)
        continue
      }
      if (trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':')
        current.properties[trimmed.slice(0, colonIndex).trim()] = trimmed.slice(colonIndex + 1).trim()
        continue
      }
      if (trimmed.startsWith('=')) {
        const value = trimmed.slice(1).trim()
        current.hadExpression = true
        if (value) current.expressionLines.push(value)
        state = 'EXPRESSION'
        expressionIndent = indent + 1
        continue
      }
    }
  }
  if (current) functions.push(current)
  return functions
}

/** A parsed relationship (only the endpoint data the edge builder consumes). */
interface RelationshipParse {
  file: string
  text: string
  line: number
  fromTable: string | null
  fromColumn: string | null
  toTable: string | null
  toColumn: string | null
}

/**
 * Parse relationships.tmdl. A column reference like "'Table Name'.Column" or
 * "Table.Column" splits at the dot outside any quotes, and both sides
 * unquote (ported _parseColumnRef).
 */
function parseColumnRef(value: string): { table: string | null; column: string } {
  const unquote = (s: string): string => {
    const t = s.trim()
    return t.startsWith("'") && t.endsWith("'") && t.length > 1 ? t.slice(1, -1) : t
  }
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") depth ^= 1
    else if (value[i] === '.' && !depth) {
      return { table: unquote(value.slice(0, i)), column: unquote(value.slice(i + 1)) }
    }
  }
  return { table: null, column: unquote(value) }
}

function parseRelationships(file: string, text: string, lineBox: { line: number }): RelationshipParse[] {
  const relationships: RelationshipParse[] = []
  let current: RelationshipParse | null = null

  for (const l of scanLines(text)) {
    lineBox.line = l.line
    const { trimmed, indent } = l
    if (indent === 0 && trimmed.startsWith('relationship')) {
      if (current) relationships.push(current)
      current = {
        file,
        text,
        line: l.line,
        fromTable: null,
        fromColumn: null,
        toTable: null,
        toColumn: null,
      }
      continue
    }
    if (current && indent > 0 && trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':')
      const key = trimmed.slice(0, colonIndex).trim()
      const value = trimmed.slice(colonIndex + 1).trim()
      if (key === 'fromColumn') {
        const parts = parseColumnRef(value)
        current.fromTable = parts.table
        current.fromColumn = parts.column
      } else if (key === 'toColumn') {
        const parts = parseColumnRef(value)
        current.toTable = parts.table
        current.toColumn = parts.column
      }
    }
  }
  if (current) relationships.push(current)
  return relationships
}

/** One perspective membership record from perspectives/*.tmdl. */
interface PerspectiveMember {
  perspective: string
  table: string
  name: string
  kind: 'table' | 'column' | 'measure' | 'hierarchy'
}

function parsePerspective(text: string, lineBox: { line: number }): { name: string; members: Omit<PerspectiveMember, 'perspective'>[] } | null {
  let name: string | null = null
  let currentTable: string | null = null
  const members: Omit<PerspectiveMember, 'perspective'>[] = []

  for (const l of scanLines(text)) {
    lineBox.line = l.line
    const { trimmed, indent } = l
    if (trimmed === '' || trimmed.startsWith('//')) continue
    if (indent === 0 && trimmed.startsWith('perspective')) {
      name = extractName(trimmed, 'perspective')
      currentTable = null
      continue
    }
    if (name === null) continue
    if (indent === 1 && trimmed.startsWith('perspectiveTable')) {
      currentTable = extractName(trimmed, 'perspectiveTable')
      if (currentTable) members.push({ table: currentTable, name: currentTable, kind: 'table' })
      continue
    }
    if (currentTable && indent === 2) {
      if (trimmed.startsWith('perspectiveColumn')) {
        members.push({ table: currentTable, name: extractName(trimmed, 'perspectiveColumn'), kind: 'column' })
      } else if (trimmed.startsWith('perspectiveMeasure')) {
        members.push({ table: currentTable, name: extractName(trimmed, 'perspectiveMeasure'), kind: 'measure' })
      } else if (trimmed.startsWith('perspectiveHierarchy')) {
        members.push({ table: currentTable, name: extractName(trimmed, 'perspectiveHierarchy'), kind: 'hierarchy' })
      }
    }
  }
  return name === null ? null : { name, members }
}

/**
 * Validate declaration lines of files that carry no object vocabulary
 * (expressions.tmdl, roles/*.tmdl): a malformed name token throws here and is
 * reported as ParseError instead of passing silently (FR-5 error path).
 */
function validateDeclarations(text: string, keywords: readonly string[], lineBox: { line: number }): void {
  for (const l of scanLines(text)) {
    lineBox.line = l.line
    const { trimmed } = l
    if (trimmed === '' || trimmed.startsWith('///') || trimmed.startsWith('//')) continue
    for (const keyword of keywords) {
      if (trimmed === keyword || trimmed.startsWith(keyword + ' ') || trimmed.startsWith(keyword + '\t')) {
        locateNameToken(text, l.line)
        break
      }
    }
  }
}

/** The prefix-bucketed file index, built in ONE pass over the input map. */
interface FileIndex {
  tables: { file: string; text: string }[]
  functions: { file: string; text: string }[]
  relationships: { file: string; text: string }[]
  perspectives: { file: string; text: string }[]
  expressions: { file: string; text: string }[]
  roles: { file: string; text: string }[]
}

/**
 * Classify every input file once. Paths may be definition-rooted
 * (`tables/Sales.tmdl`) or project-rooted (`X.SemanticModel/definition/
 * tables/Sales.tmdl`); the bucket key is the path after the LAST
 * `definition/` segment. Files with no reader vocabulary (database.tmdl,
 * model.tmdl, cultures, report files) are tolerated and skipped.
 */
function buildFileIndex(files: Map<string, string>): FileIndex {
  const index: FileIndex = { tables: [], functions: [], relationships: [], perspectives: [], expressions: [], roles: [] }
  for (const [file, text] of files) {
    let rel = file
    const cut = file.lastIndexOf('/definition/')
    if (cut >= 0) rel = file.slice(cut + '/definition/'.length)
    else if (file.startsWith('definition/')) rel = file.slice('definition/'.length)
    if (rel.startsWith('tables/')) index.tables.push({ file, text })
    else if (rel === 'functions.tmdl') index.functions.push({ file, text })
    else if (rel === 'relationships.tmdl') index.relationships.push({ file, text })
    else if (rel.startsWith('perspectives/')) index.perspectives.push({ file, text })
    else if (rel === 'expressions.tmdl') index.expressions.push({ file, text })
    else if (rel.startsWith('roles/')) index.roles.push({ file, text })
  }
  const byPath = (a: { file: string }, b: { file: string }): number => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  index.tables.sort(byPath)
  index.functions.sort(byPath)
  index.relationships.sort(byPath)
  index.perspectives.sort(byPath)
  index.expressions.sort(byPath)
  index.roles.sort(byPath)
  return index
}
/**
 * Clean DAX by removing block comments, line comments and double-quoted
 * string literals, so bracket references inside literals are not extracted
 * (ported _cleanDAX).
 */
function cleanDax(dax: string): string {
  let cleaned = dax.replace(/\/\*[\s\S]*?\*\//g, '')
  cleaned = cleaned.replace(/\/\/.*/g, '')
  cleaned = cleaned.replace(/"[^"]*"/g, '""')
  return cleaned
}

/**
 * Bare `[Name]` references — a measure or a row-context column; the shared
 * resolver decides (ported _extractMeasureRefs, lookbehind + prefix checks
 * kept so qualified `'T'[C]` / `T[C]` / `.C` forms are not double-counted).
 */
function extractBareRefs(dax: string): string[] {
  const refs = new Set<string>()
  const pattern = /(?<!'[^']*)\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(dax)) !== null) {
    const beforeBracket = dax.substring(Math.max(0, match.index - 1), match.index)
    if (beforeBracket !== '.' && !/\w/.test(beforeBracket) && beforeBracket !== "'") {
      refs.add(match[1].trim())
    }
  }
  return [...refs]
}

/** Qualified `Table[Column]` / `'Table Name'[Column]` references (ported _extractColumnRefs). */
function extractQualifiedRefs(dax: string): { table: string; column: string }[] {
  const refs: { table: string; column: string }[] = []
  const seen = new Set<string>()
  const pattern = /(?:'([^']+)'|(\w+))\[([^\]]+)\]/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(dax)) !== null) {
    const table = match[1] || match[2]
    const column = match[3].trim()
    const key = `${table}|${column}`
    if (!seen.has(key)) {
      seen.add(key)
      refs.push({ table, column })
    }
  }
  return refs
}

/**
 * Model edges for the graph (AD-6): measure→object from measure DAX,
 * calcObject→source from calculated column/table expressions, calcItem→DAX
 * references, fieldParam→NAMEOF column, function→body references. Every
 * reference resolves through the ONE shared resolver; a reference resolving
 * to nothing stays in the edge as a resolved-by-name attempt (`[Name]` /
 * `Table[Name]`) for buildGraph and is mirrored in brokenEdges — attributed
 * to its source, never dropped silently. Identical (from,to,kind) triples
 * deduplicate.
 */
function buildModelEdges(
  objects: ModelObject[],
  nameIndex: ReturnType<typeof buildNameIndex>,
  seeds: EdgeSeeds,
  edges: Edge[],
  brokenEdges: BrokenEdge[],
): void {
  const seen = new Set<string>()
  const emitRef = (from: string, table: string | null, name: string, kind: Edge['kind']): void => {
    if (!name) return
    const resolved = table ? resolveName(nameIndex, name, table) : resolveName(nameIndex, name)
    const to = resolved ?? (table ? `${table}[${name}]` : `[${name}]`)
    const key = `${from}\u0000${to}\u0000${kind}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, kind })
    if (!resolved) brokenEdges.push({ from, to, kind })
  }
  const emitDax = (from: string, dax: string, kind: Edge['kind']): void => {
    const cleaned = cleanDax(dax)
    for (const name of extractBareRefs(cleaned)) emitRef(from, null, name, kind)
    for (const ref of extractQualifiedRefs(cleaned)) emitRef(from, ref.table, ref.column, kind)
  }

  for (const object of objects) {
    if (!object.dax) continue
    if (object.type === 'measure') emitDax(object.id, object.dax, 'measure')
    else if (object.type === 'calculatedColumn') emitDax(object.id, object.dax, 'calcObject')
    else if (object.type === 'calculationItem') emitDax(object.id, object.dax, 'calcItem')
    else if (object.type === 'daxFunction') emitDax(object.id, object.dax, 'function')
  }
  // Calculated-table sources feed calcObject from the table object.
  for (const seed of seeds.calcTables) {
    for (const source of seed.sources) emitDax(seed.id, source, 'calcObject')
  }
  // Field-parameter NAMEOF tuples feed fieldParam from the param table object.
  for (const seed of seeds.paramTables) {
    for (const item of seed.items) emitRef(seed.id, item.targetTable, item.targetName, 'fieldParam')
  }
}




function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Parse a TMDL definition tree: one ModelObject per declaration with a
 * vocabulary kind, relationship edges at column-level endpoints, perspective
 * membership attached, and per-file error isolation — a file that fails to
 * parse yields a ParseError naming file and line while the rest still load.
 */
export function parseTmdlProject(files: Map<string, string>): TmdlParseResult {
  const objects: ModelObject[] = []
  const edges: Edge[] = []
  const brokenEdges: BrokenEdge[] = []
  const errors: ParseError[] = []
  const index = buildFileIndex(files)
  const lineBox = { line: -1 }

  // Tables: parse all, emit sorted by table name (borrowed ordering).
  const tableParses: { table: TableParse; file: string; text: string }[] = []
  for (const entry of index.tables) {
    try {
      tableParses.push({ table: parseTable(entry.text, lineBox), file: entry.file, text: entry.text })
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }
  tableParses.sort((a, b) => a.table.name.localeCompare(b.table.name))
  const seeds: EdgeSeeds = { paramTables: [], calcTables: [] }
  for (const { table, file, text } of tableParses) emitTable(table, file, text, objects, errors, seeds)

  // Functions → daxFunction objects (verbatim triple-backtick bodies).
  for (const entry of index.functions) {
    try {
      for (const fn of parseFunctions(entry.text, lineBox)) {
        try {
          objects.push(
            emitPending(fn, 'daxFunction', '', entry.file, entry.text, {
              dax: expressionText(fn) ?? undefined,
            }),
          )
        } catch (err) {
          errors.push({ file: entry.file, line: fn.line, message: errorMessage(err) })
        }
      }
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }

  // Declarations without an object vocabulary are still validated (FR-5 error path).
  for (const entry of index.expressions) {
    try {
      validateDeclarations(entry.text, ['expression'], lineBox)
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }
  for (const entry of index.roles) {
    try {
      validateDeclarations(entry.text, ['role', 'tablePermission'], lineBox)
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }

  // Relationship edges: from = feeder-minted relationship node id, to = each
  // endpoint column id (both columns receive the in-edge — the shape that
  // reproduces the fixture's expected-usage.json and buildGraph's
  // feeder-minted-source rule). Endpoints resolve through the ONE shared
  // resolver; an endpoint resolving to nothing stays a resolved-by-name
  // attempt (Table[Column]) for buildGraph and is mirrored in brokenEdges.
  const relationships: RelationshipParse[] = []
  for (const entry of index.relationships) {
    try {
      relationships.push(...parseRelationships(entry.file, entry.text, lineBox))
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }
  if (
    relationships.length > 0 ||
    seeds.paramTables.length > 0 ||
    seeds.calcTables.length > 0 ||
    objects.some((o) => o.dax !== undefined)
  ) {
    const nameIndex = buildNameIndex(objects)
    for (const rel of relationships) {
      let relNode = ''
      try {
        relNode = spanDerive(rel.file, locateDeclaration(rel.text, rel.line))
      } catch (err) {
        errors.push({ file: rel.file, line: rel.line, message: errorMessage(err) })
        continue
      }
      for (const [tableRef, columnRef] of [
        [rel.fromTable, rel.fromColumn],
        [rel.toTable, rel.toColumn],
      ] as const) {
        const resolved = tableRef && columnRef ? resolveName(nameIndex, columnRef, tableRef) : undefined
        const to = resolved ?? (tableRef && columnRef ? `${tableRef}[${columnRef}]` : '')
        const edge: Edge = { from: relNode, to, kind: 'relationship' }
        edges.push(edge)
        if (!resolved) brokenEdges.push({ from: relNode, to, kind: 'relationship' })
      }
    }

    // Model edges (AD-6): measure→object, calcObject→source, calcItem→DAX,
    // fieldParam→NAMEOF column, function→body — all resolved through the same
    // shared resolver, deduplicated, unresolved references attributed broken.
    buildModelEdges(objects, nameIndex, seeds, edges, brokenEdges)
  }


  // Perspective membership: attach after all objects exist.
  const memberships: PerspectiveMember[] = []
  for (const entry of index.perspectives) {
    try {
      const parsed = parsePerspective(entry.text, lineBox)
      if (parsed) {
        for (const member of parsed.members) memberships.push({ perspective: parsed.name, ...member })
      }
    } catch (err) {
      errors.push({ file: entry.file, line: lineBox.line >= 0 ? lineBox.line : null, message: errorMessage(err) })
    }
  }
  if (memberships.length > 0) attachMembership(memberships, objects)

  return { objects, edges, brokenEdges, errors }
}

/**
 * Attach perspective names to the objects they include. Membership is a
 * field, not an edge, so this scopes by (table, name) over a local
 * case-insensitive bucket keyed like the shared index — ambiguous or missing
 * members are skipped, never guessed.
 */
function attachMembership(members: PerspectiveMember[], objects: ModelObject[]): void {
  const byScope = new Map<string, ModelObject[]>()
  for (const object of objects) {
    if (!object.name) continue
    const key = canon(object.table) + SEP + canon(object.name)
    const bucket = byScope.get(key)
    if (bucket) bucket.push(object)
    else byScope.set(key, [object])
  }
  const TABLE_KINDS: ReadonlySet<string> = new Set(['table', 'fieldParameter', 'calculationGroup'])
  const KIND_FILTERS: Record<PerspectiveMember['kind'], ReadonlySet<string>> = {
    table: TABLE_KINDS,
    column: new Set(['column', 'calculatedColumn']),
    measure: new Set(['measure']),
    hierarchy: new Set(['hierarchy']),
  }
  for (const member of members) {
    const key = canon(member.kind === 'table' ? '' : member.table) + SEP + canon(member.name)
    const bucket = byScope.get(key)
    if (!bucket) continue
    const allowed = KIND_FILTERS[member.kind]
    const matches = bucket.filter((o) => allowed.has(o.type))
    if (matches.length !== 1) continue // missing or ambiguous — skip, never guess
    const target = matches[0]
    if (target.perspectiveMembership) target.perspectiveMembership.push(member.perspective)
    else target.perspectiveMembership = [member.perspective]
  }
}
