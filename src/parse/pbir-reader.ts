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
 * PBIR Reader — extracts field-usage edges from report visual definitions.
 *
 * Ported from the borrowed VisualParser's read path (queryState projections,
 * fieldParameters, sortDefinition, filterConfig, and the alias-aware deep
 * search over visual objects) and reduced from a usage map to dependency
 * edges: every binding resolves through the ONE shared name resolver (AD-6)
 * and becomes either a visual→object edge for buildGraph or a broken
 * reference attributed to its visual (FR-7). Resolution keys on the binding's
 * underlying Entity/Property model path — never on the visual-local
 * displayName an author may rename per visual (that rides along as display
 * metadata only).
 *
 * Attribution rule (load-bearing): a projection well driven by a field
 * parameter carries `fieldParameters[].parameterExpr` — its SourceRef.Entity
 * names the param TABLE while its Property merely restates the identity
 * column. The binding attributes to the param TABLE object, never the
 * identity column, so the visual reaches the wrapped columns transitively
 * (paramTable→column edges come from the TMDL reader's NAMEOF pass).
 */

import type { Edge, EdgeKind } from '../domain/graph'
import type { ModelObject } from '../domain/objects'
import { buildNameIndex, resolveName } from '../domain/identity'
import type { NameIndex } from '../domain/identity'

/** One visual field binding: the authored model path, its resolution, and the visual-local caption. */
export interface VisualBinding {
  /** Feeder-minted visual node id — the edge's `from`; not a model object (buildGraph minted-source rule). */
  visualId: string
  /** The binding's underlying model path, e.g. `Sales[Region]` or `'Field Slices'[Field Slices]`. */
  field: string
  /** Resolved model object id; absent exactly when `broken`. */
  objectId?: string
  /** True when the ref resolved to no model object — attributed to its visual, never an edge. */
  broken: boolean
  /**
   * Caption the report author gave this binding in THIS visual (visual-local, may differ from
   * the model name). Display metadata only — never passed to the resolver.
   */
  displayName?: string
  /** True when the binding came from a fieldParameters/parameterExpr signal (param-table attribution). */
  viaParameter?: boolean
}

/** One frozen verified-answer definition (FR-18): a question-to-visual pair authored in Power BI. */
export interface VerifiedAnswer {
  /** The definitions/<guid> folder id this definition lives under. */
  guid: string
  /** The primary trigger prompt (the question shown in the rail). */
  prompt: string
  /** The visual type the definition fixes, when decodable from the cache key. */
  visualType?: string
  /** Additional trigger prompts beyond the primary. */
  otherPrompts: number
}

/** The PBIR reader's output: per-visual bindings, ready edges, broken refs, and parse diagnostics. */
export interface ReportParse {
  /** One entry per unique (visual, field) binding, resolved or broken. */
  visualEdges: VisualBinding[]
  /** Resolved bindings as visual-kind edges, ready to feed buildGraph. */
  edges: Edge[]
  /** Refs that resolved to nothing, attributed to their visual (mirrors the broken:true entries). */
  broken: { visual: string; field: string }[]
  /** visual.json files that failed to parse; the visual is skipped, never silently dropped. */
  errors: { file: string; message: string }[]
  /** Frozen question-to-visual pairs (FR-18), parsed from VerifiedAnswers/definitions. */
  verifiedAnswers: VerifiedAnswer[]
}

/** One collected reference, pre-resolution; `displayName` rides along as display metadata. */
interface FieldRef {
  kind: 'column' | 'measure' | 'hierarchy'
  table: string
  name: string
  viaParameter: boolean
  displayName?: string
}

/** A visual.json path, rooted anywhere (`definition/pages/…` or report-rooted `pages/…`). */
const VISUAL_PATH = /(^|\/)pages\/[^/]+\/visuals\/[^/]+\/visual\.json$/
/** A frozen verified-answer definition under `VerifiedAnswers/definitions/<guid>/definition.json`. */
const VERIFIED_PATH = /VerifiedAnswers\/definitions\/[^/]+\/definition\.json$/

/** Depth guard for the object deep-search: a measure inside dynamic text sits ~14 levels down. */
const MAX_DEPTH = 40

/** byType kinds a field parameter's table object can carry (TMDL reader emits 'fieldParameter'). */
const PARAM_TABLE_TYPES: readonly string[] = ['table', 'fieldParameter']

/** Canonical key separator (identity.ts convention); NUL cannot occur in model names. */
const SEP = '\u0000'

/** Shared immutable empty alias scope for expressions outside any From-bearing subquery. */
const NO_ALIASES: ReadonlyMap<string, string> = new Map()

/** The only edge kind this feeder emits (graph contract). */
const VISUAL: EdgeKind = 'visual'

/** Type guards over untrusted JSON — preserve narrowing without unchecked casts. */
const isStr = (v: unknown): v is string => typeof v === 'string'
const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Parse a Report definition tree into visual→object field-usage.
 *
 * `reportFiles` maps project-relative POSIX paths to file text (the caller's
 * report file map). `objects` is the pristine model the shared resolver
 * indexes — the same ModelObject[] the TMDL reader produced.
 *
 * Returns `null` when `reportFiles` is null or empty: NO Report folder means
 * usage is UNAVAILABLE (FR-7), which is a different state than "available,
 * zero bindings" (a non-empty map without visual.json yields an empty
 * ReportParse, not null).
 */
export function parseReport(
  reportFiles: Map<string, string> | null,
  objects: ModelObject[],
): ReportParse | null {
  if (reportFiles === null || reportFiles.size === 0) return null
  const index = buildNameIndex(objects)
  const result: ReportParse = { visualEdges: [], edges: [], broken: [], errors: [], verifiedAnswers: [] }
  const paths = [...reportFiles.keys()]
    .filter((p) => VISUAL_PATH.test(p.replace(/\\/g, '/')))
    .sort()
  for (const path of paths) {
    let json: unknown
    try {
      json = JSON.parse(reportFiles.get(path) as string)
    } catch (err) {
      result.errors.push({
        file: path,
        message: err instanceof Error ? err.message : String(err),
      })
      continue
    }
    collectVisual(path, json, index, result)
  }
  collectVerifiedAnswers(reportFiles, result)
  return result
}

/** Mint the visual node id, collect every binding of one visual.json, resolve each. */
function collectVisual(path: string, json: unknown, index: NameIndex, result: ReportParse): void {
  if (!isRec(json)) return
  const container = path.replace(/\\/g, '/').slice(0, -'/visual.json'.length)
  // Node id: the visual's own `name` (stable across canvas edits), else the
  // container path. The `visual:` prefix keeps feeder-minted ids out of the
  // lineageTag/surrogate-GUID namespace that model object ids live in.
  const visualId = `visual:${isStr(json.name) && json.name !== '' ? json.name : container}`
  const visual = isRec(json.visual) ? json.visual : undefined
  const query = isRec(visual?.query) ? visual.query : undefined

  const refs = new Map<string, FieldRef>()
  extractQueryState(query?.queryState ?? json.queryState, refs)
  extractSortDefinition(query?.sortDefinition, refs)
  // filterConfig sits at the visual-container top level in schema 2.x; tolerate
  // the visual-level position older shapes used.
  extractFilterConfig(
    isRec(json.filterConfig) ? json.filterConfig : isRec(visual?.filterConfig) ? visual.filterConfig : undefined,
    refs,
  )
  searchFields(visual?.objects, refs)
  searchFields(visual?.visualContainerObjects, refs)

  for (const ref of refs.values()) {
    const field = renderRef(ref.table, ref.name)
    const binding: VisualBinding = { visualId, field, broken: false }
    if (ref.displayName !== undefined) binding.displayName = ref.displayName
    if (ref.viaParameter) binding.viaParameter = true
    const objectId = ref.viaParameter
      ? resolveParamTable(index, ref.table)
      : resolveName(index, ref.name, ref.table)
    if (objectId === undefined) {
      binding.broken = true
      result.broken.push({ visual: visualId, field })
    } else {
      binding.objectId = objectId
      result.edges.push({ from: visualId, to: objectId, kind: VISUAL })
    }
    result.visualEdges.push(binding)
  }
}

/** Scan report file entries for frozen verified-answer definitions (FR-18). */
function collectVerifiedAnswers(reportFiles: Map<string, string>, result: ReportParse): void {
  const paths = [...reportFiles.keys()]
    .filter((p) => VERIFIED_PATH.test(p.replace(/\\/g, '/')))
    .sort()
  for (const path of paths) {
    let json: unknown
    try {
      json = JSON.parse(reportFiles.get(path) as string)
    } catch {
      continue // an unparsable verified-answer definition is skipped, never fatal
    }
    if (!isRec(json)) continue
    const guid = path.replace(/\\/g, '/').split('/').slice(-2)[0] ?? ''
    const prompts = Array.isArray(json.triggerPrompts)
      ? json.triggerPrompts.filter(isRec).map((t) => (isStr(t.prompt) ? t.prompt : ''))
      : []
    const firstPrompt = prompts.find((p) => p !== '') ?? ''
    if (firstPrompt === '') continue // a definition with no prompt is not a usable pair
    const cache = isRec(json.sourceMetadata)
      ? isRec(json.sourceMetadata.visualMetadata)
        ? isRec(json.sourceMetadata.visualMetadata.cache)
          ? json.sourceMetadata.visualMetadata.cache.key
          : undefined
        : undefined
      : undefined
    const answer: VerifiedAnswer = {
      guid,
      prompt: firstPrompt,
      otherPrompts: Math.max(0, prompts.length - 1),
    }
    if (isStr(cache)) {
      const visualType = decodeCacheVisualType(cache)
      if (visualType !== undefined) answer.visualType = visualType
    }
    result.verifiedAnswers.push(answer)
  }
}

/** Decode the visual type out of a verified-answer cache key (base64 → percent → JSON → visualType). */
function decodeCacheVisualType(cacheKey: string): string | undefined {
  try {
    const decoded = decodeURIComponent(atob(cacheKey))
    const match = /"visualType":"([^"]+)"/.exec(decoded)
    return match === null ? undefined : match[1]
  } catch {
    return undefined
  }
}

/** Extract field references from every well of a queryState (Values, Rows, …). */
function extractQueryState(queryState: unknown, refs: Map<string, FieldRef>): void {
  if (!isRec(queryState)) return
  for (const well of Object.values(queryState)) {
    if (!isRec(well)) continue
    // A well driven by a field parameter binds the PARAMETER: its projections
    // merely restate the identity column that parameterExpr points at. Record
    // only the parameter binding (attributed to the param table) and skip the
    // restatements — one binding, one edge.
    const params = Array.isArray(well.fieldParameters) ? well.fieldParameters : []
    if (params.length > 0) {
      for (const fp of params) {
        if (isRec(fp)) extractParameterExpr(fp.parameterExpr, refs)
      }
      continue
    }
    if (Array.isArray(well.projections)) {
      for (const proj of well.projections) extractProjection(proj, refs)
    }
  }
}

/**
 * One fieldParameters entry: parameterExpr mirrors a Column|Measure expression
 * whose SourceRef.Entity names the param table. Recorded with viaParameter so
 * the binding attributes there instead of the identity column (the Property).
 */
function extractParameterExpr(expr: unknown, refs: Map<string, FieldRef>): void {
  if (!isRec(expr)) return
  const isColumn = isRec(expr.Column)
  if (!isColumn && !isRec(expr.Measure)) return
  const path = exprPath(isColumn ? expr.Column : expr.Measure, NO_ALIASES)
  if (path !== undefined) {
    record(refs, isColumn ? 'column' : 'measure', path.table, path.name, undefined, true)
  }
}

/** Projections (and sort/filter entries, which share the `{ field }` shape). */
function extractProjection(proj: unknown, refs: Map<string, FieldRef>): void {
  if (!isRec(proj) || !isRec(proj.field)) return
  const field = proj.field
  // Surface the author's visual-local caption verbatim; it is never the key.
  const displayName = isStr(proj.displayName) && proj.displayName !== '' ? proj.displayName : undefined
  if (isRec(field.Column) || isRec(field.Measure)) {
    const isColumn = isRec(field.Column)
    const path = exprPath(isColumn ? field.Column : field.Measure, NO_ALIASES)
    if (path !== undefined) {
      record(refs, isColumn ? 'column' : 'measure', path.table, path.name, displayName, false)
    }
    return
  }
  if (isRec(field.Hierarchy)) {
    const node = field.Hierarchy
    const sourceRef = isRec(node.Expression) ? node.Expression.SourceRef : undefined
    const table =
      sourceRef !== undefined && isRec(sourceRef) && isStr(sourceRef.Entity) && sourceRef.Entity !== ''
        ? sourceRef.Entity
        : undefined
    if (table !== undefined && isStr(node.Hierarchy) && node.Hierarchy !== '') {
      record(refs, 'hierarchy', table, node.Hierarchy, displayName, false)
    }
  }
}

/** visual.query.sortDefinition.sort[] name their field directly. */
function extractSortDefinition(sortDefinition: unknown, refs: Map<string, FieldRef>): void {
  if (!isRec(sortDefinition) || !Array.isArray(sortDefinition.sort)) return
  for (const item of sortDefinition.sort) {
    if (isRec(item)) extractProjection(item, refs)
  }
}

/** filterConfig.filters[] carry their field directly. */
function extractFilterConfig(filterConfig: unknown, refs: Map<string, FieldRef>): void {
  if (!isRec(filterConfig) || !Array.isArray(filterConfig.filters)) return
  for (const filter of filterConfig.filters) {
    if (isRec(filter)) extractProjection(filter, refs)
  }
}

/**
 * Depth-first sweep over visual objects (conditional formatting, container
 * objects, dynamic text): any Column|Measure expression node at any depth
 * contributes its binding. Arrays recurse element-wise; a `From` list seen on
 * the way down extends the alias scope for its subtree, shadowing outer ones
 * (which is what a nested subquery reusing an alias name means).
 */
function searchFields(objects: unknown, refs: Map<string, FieldRef>): void {
  const search = (
    node: unknown,
    depth: number,
    aliases: ReadonlyMap<string, string>,
  ): void => {
    if (depth > MAX_DEPTH) return
    if (Array.isArray(node)) {
      for (const item of node) search(item, depth + 1, aliases)
      return
    }
    if (!isRec(node)) return
    let scope: ReadonlyMap<string, string> = aliases
    if (Array.isArray(node.From)) {
      const next = new Map(aliases)
      for (const from of node.From) {
        if (isRec(from) && isStr(from.Name) && isStr(from.Entity)) next.set(from.Name, from.Entity)
      }
      scope = next
    }
    const isColumn = isRec(node.Column)
    if (isColumn || isRec(node.Measure)) {
      const path = exprPath(isColumn ? node.Column : node.Measure, scope)
      if (path !== undefined) {
        record(refs, isColumn ? 'column' : 'measure', path.table, path.name, undefined, false)
      }
    }
    for (const value of Object.values(node)) {
      if (isRec(value) || Array.isArray(value)) search(value, depth + 1, scope)
    }
  }
  search(objects, 0, NO_ALIASES)
}

/**
 * The underlying model path of a Column|Measure expression: the SourceRef's
 * Entity — or its From-alias, resolved through the enclosing scope — plus the
 * Property. THIS, never the visual-local displayName, is the resolution key.
 */
function exprPath(
  node: unknown,
  aliases: ReadonlyMap<string, string>,
): { table: string; name: string } | undefined {
  if (!isRec(node)) return undefined
  const sourceRef = isRec(node.Expression) ? node.Expression.SourceRef : undefined
  if (!isRec(sourceRef)) return undefined
  const table =
    isStr(sourceRef.Entity) && sourceRef.Entity !== ''
      ? sourceRef.Entity
      : isStr(sourceRef.Source)
        ? aliases.get(sourceRef.Source)
        : undefined
  if (table === undefined) return undefined
  const name = isStr(node.Property) && node.Property !== '' ? node.Property : undefined
  return name === undefined ? undefined : { table, name }
}

/**
 * Resolve the param TABLE behind a fieldParameters binding: the binding's
 * SourceRef.Entity names the parameter table, whose object is emitted with
 * type 'fieldParameter' (TMDL reader) — or plain 'table' in hand-built models.
 * Type-aware lookup over the ONE shared index (byType, empty parent table) —
 * never a private name→id map (AD-6). Zero or several candidates → undefined:
 * broken, never guessed (a bare-name lookup would be ambiguous with the
 * identity column, which shares the table's name by PBIR convention).
 */
function resolveParamTable(index: NameIndex, entity: string): string | undefined {
  const ids: string[] = []
  for (const type of PARAM_TABLE_TYPES) {
    for (const id of index.byType.get(`${type.toLowerCase()}${SEP}${SEP}${entity.toLowerCase()}`) ?? []) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids.length === 1 ? ids[0] : undefined
}

/** Record one reference, first-write-wins on the (kind, table, name) key (borrowed dedup). */
function record(
  refs: Map<string, FieldRef>,
  kind: FieldRef['kind'],
  table: string,
  name: string,
  displayName: string | undefined,
  viaParameter: boolean,
): void {
  const key = `${kind}|${table}|${name}`
  if (refs.has(key)) return
  const ref: FieldRef = { kind, table, name, viaParameter }
  if (displayName !== undefined) ref.displayName = displayName
  refs.set(key, ref)
}

/** DAX-ish display form; the table is quoted only when it contains non-word characters. */
function renderRef(table: string, name: string): string {
  return `${/^[A-Za-z0-9_]+$/.test(table) ? table : `'${table}'`}[${name}]`
}
