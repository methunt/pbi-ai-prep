// Task 2.3 — the ONE shared name→id resolver (AD-6).
// Pure leaf (AD-1): imports only a type from domain/objects; no browser, FS, or FSA.
//
// Every edge feeder resolves model references through buildNameIndex + resolveName;
// no feeder keeps its own name→id mapping. Names are compared case-insensitively
// (DAX reference semantics) via lowercased canonical keys. A name appearing in
// more than one scope is ambiguous and needs a table hint (or a fully-qualified
// reference) — otherwise resolution returns undefined rather than guessing.

import type { ModelObject } from './objects'

/** Key separator for composite canonical keys; NUL cannot occur in model names. */
const SEP = '\u0000'

/** Canonical lookup key: case-insensitive per DAX reference semantics. Used at 5 sites that must fold identically. */
const canon = (s: string): string => s.toLowerCase()

/** Strip one surrounding bracket pair: `[Amount]` → `Amount` (bracket-only refs are bare names). */
function unbracket(s: string): string {
  return s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s
}

/** Record `id` under `key`, creating the bucket on first sight; duplicate ids never multiply. */
function pushId(map: Map<string, string[]>, key: string, id: string): void {
  const ids = map.get(key)
  if (ids === undefined) map.set(key, [id])
  else if (!ids.includes(id)) ids.push(id)
}

/**
 * Precomputed lookup tables over the model. Keys are canonical (lowercased):
 * - `byName`: bare name → ids sharing it (spans tables; ambiguous when >1).
 * - `byTable`: `table|name` → ids, for hint- or FQ-scoped resolution.
 * - `byType`: `type|table|name` → ids, for type-aware feeders (brief step 1).
 */
export interface NameIndex {
  byName: ReadonlyMap<string, string[]>
  byTable: ReadonlyMap<string, string[]>
  byType: ReadonlyMap<string, string[]>
}

/**
 * Index every object by bare name, by (table, name), and by (type, table, name).
 * Objects with no name are skipped. Does not mutate `objects`.
 */
export function buildNameIndex(objects: ModelObject[]): NameIndex {
  const byName = new Map<string, string[]>()
  const byTable = new Map<string, string[]>()
  const byType = new Map<string, string[]>()
  for (const obj of objects) {
    if (!obj.name) continue
    const name = canon(obj.name)
    pushId(byName, name, obj.id)
    pushId(byTable, canon(obj.table) + SEP + name, obj.id)
    pushId(byType, canon(obj.type) + SEP + canon(obj.table) + SEP + name, obj.id)
  }
  return { byName, byTable, byType }
}

/** Split a reference into its table scope (when fully qualified) and bare name. */
function parseRef(name: string): { table?: string; bare: string } {
  const s = name.trim()
  if (!s) return { bare: '' }
  // Quoted-table forms: 'Table.Name' | 'Table'[Name] | 'Table'.[Name] | 'Table'.Name
  if (s.startsWith("'")) {
    const close = s.indexOf("'", 1)
    if (close === -1) return { bare: s } // unterminated quote — unresolvable as written
    const table = s.slice(1, close)
    const rest = s.slice(close + 1)
    const inner = rest.startsWith('.') ? rest.slice(1) : rest
    const bare = unbracket(inner)
    if (bare) return { table, bare }
    // Dot inside the quotes — 'Table.Name' (or a bare quoted 'Name').
    const dot = table.indexOf('.')
    if (dot !== -1) return { table: table.slice(0, dot), bare: table.slice(dot + 1) }
    return { bare: table }
}
  // Bracketed-table forms: [Table].[Name] | [Table]Name
  if (s.startsWith('[')) {
    const close = s.indexOf(']', 1)
    if (close === -1) return { bare: s }
    const table = s.slice(1, close)
    const rest = s.slice(close + 1)
    const inner = rest.startsWith('.') ? rest.slice(1) : rest
    const bare = unbracket(inner)
    if (bare) return { table, bare }
    return { bare: table } // [Name] alone — a bare-name (e.g. DAX measure) reference
  }
  // Bare-table form: Table[Name]
  const bracket = s.indexOf('[')
  if (bracket !== -1 && s.endsWith(']')) {
    return { table: s.slice(0, bracket), bare: s.slice(bracket + 1, -1) }
  }
  return { bare: s }
}

/**
 * Resolve `name` to the single object id, or `undefined`.
 *
 * - Fully-qualified forms: `[Table].[Name]`, `Table[Name]`, `'Table.Name'`
 *   (also `'Table'[Name]` / `'Table'.[Name]`); a bracket-only `[Name]` is a
 *   bare-name reference. An embedded table scopes resolution and takes
 *   precedence over `tableHint`.
 * - With an effective table (hint or embedded), only (table, name) is
 *   consulted: a miss stays undefined — no cross-table fallback.
 * - Without one, the bare name must be globally unique; more than one match
 *   is ambiguous → undefined.
 */
export function resolveName(
  index: NameIndex,
  name: string,
  tableHint?: string,
): string | undefined {
  const { table, bare } = parseRef(name)
  const effectiveTable = table || tableHint || undefined
  if (effectiveTable) {
    const ids = index.byTable.get(canon(effectiveTable) + SEP + canon(bare))
    return ids?.length === 1 ? ids[0] : undefined
  }
  const ids = index.byName.get(canon(bare))
  return ids?.length === 1 ? ids[0] : undefined
}
