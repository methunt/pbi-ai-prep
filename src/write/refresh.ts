// Task 4.3 — post-save refresh: the ONE post-save owner (AD-5).
// Pure leaf (AD-1): imports only domain/span, domain/objects, and the 4.1
// patch engine; never touches fs, the browser, or state/.
//
// PINNED CONTRACT (AD-5): on a successful write the orchestrator commits, per
// written file, `originalText <- written bytes`, shifts that file's stored
// spans by the applied patch deltas, and marks touched lazy layers
// `parseState = 'stale'` (re-parse on next request). The critical bar: a
// second in-session save does not false-conflict and a second in-session
// rename targets the CURRENT span, not a stale one.
//
// - applyRefresh returns the written text (the definitive new content) plus
//   the file's span set remapped by the applied patch deltas. It does NOT
//   write to disk.
// - Patches are the orchestrator's applied Patch[] — the SAME array that
//   produced `writtenText` via applyPatches. The refresh NEVER diffs written
//   vs prior text or re-derives the delta by re-serialization (that is not
//   byte-faithful). When `patches` is omitted but the text changed, refresh
//   throws rather than emit silently wrong spans.
// - Span remap is the monotone boundary shift: every patch contributes a byte
//   delta (replacementLen - removedLen) to all content that follows it. A
//   span's START boundary counts insertions AT the boundary; its END boundary
//   counts insertions strictly BEFORE it, so a span that ends exactly where an
//   insertion lands does NOT shift (half-open: the inserted bytes are outside
//   the span). A span that shares any byte with a replacement/deletion span is
//   INVALID (set to null): its content changed, so the orchestrator must
//   re-derive it (the renamed/edited object). Pure insertions never invalidate.
// - markLayersStale returns a NEW layers container, marking every lazy layer
//   whose data references a touched file as `parseState = 'stale'`; the input
//   layers are never mutated.

import type { SourceSpans } from '../domain/objects'
import type { Span } from '../domain/span'
import { byteLen } from '../domain/span'
import { applyPatches } from './patch-engine'
import type { Patch } from './patch-engine'

/** One object's span set after refresh; `null` = the object re-derives it (AD-5). */
export interface RefreshedSpans {
  declaration: Span | null
  name: Span | null
  docComment?: Span | null
}

/** A file's span set: objectId → refreshed spans (null = must be re-derived). */
export type RefreshedFileSpans = Record<string, RefreshedSpans>

export interface RefreshResult {
  /** The written bytes — the definitive new file content. */
  text: string
  /** The file's spans remapped by the patch deltas; null marks a re-derive. */
  spans: RefreshedFileSpans
}

/** A lazy layer (AD-7): status-only parseState plus its parsed data. */
export interface LayerLike {
  parseState: 'idle' | 'parsing' | 'ready' | 'error' | 'stale'
  data?: unknown
}

/** Byte delta of one patch: replacement length minus the removed original span. */
function deltaOf(p: Patch): number {
  return byteLen(p.replacement) - (p.end - p.start)
}

/** Split patches into replacements/deletions and pure insertions. */
interface ShiftModel {
  /** Replacements/deletions (end > start), ascending by start, tie ascending by end. */
  nonIns: Patch[]
  /** Pure insertions (start === end), ascending by point. */
  ins: Patch[]
}

function buildShiftModel(patches: Patch[]): ShiftModel {
  const nonIns: Patch[] = []
  const ins: Patch[] = []
  for (const p of patches) {
    if (p.end === p.start) ins.push(p)
    else nonIns.push(p)
  }
  nonIns.sort((a, b) => a.start - b.start || a.end - b.end)
  ins.sort((a, b) => a.start - b.start)
  return { nonIns, ins }
}

/**
 * Output offset of original byte `x` when `x` survives, for a span's START
 * boundary (insertions AT x count: they land before the span's first byte).
 * Throws when `x` sits strictly inside a replaced region (a deleted byte) —
 * unreachable for a valid (non-overlapping) span, kept as an invariant guard.
 */
function startPos(m: ShiftModel, x: number): number {
  let delta = 0
  for (const p of m.nonIns) {
    if (p.end <= x) {
      delta += deltaOf(p)
    } else if (p.start < x) {
      throw new Error(`refresh: offset ${x} falls inside a replaced region [${p.start},${p.end})`)
    } else {
      break
    }
  }
  for (const p of m.ins) {
    if (p.start <= x) delta += byteLen(p.replacement)
  }
  return x + delta
}

/**
 * Output offset of the boundary just after original byte `x` (the span's END
 * boundary — insertions AT x do NOT count, they land after the span's last
 * byte). Same invariant guard as `startPos`.
 */
function endPos(m: ShiftModel, x: number): number {
  let delta = 0
  for (const p of m.nonIns) {
    if (p.end <= x) {
      delta += deltaOf(p)
    } else if (p.start < x) {
      throw new Error(`refresh: offset ${x} falls inside a replaced region [${p.start},${p.end})`)
    } else {
      break
    }
  }
  for (const p of m.ins) {
    if (p.start < x) delta += byteLen(p.replacement)
  }
  return x + delta
}

/** Does `s` share any byte with a replacement/deletion region? (half-open overlap) */
function overlapsAny(s: Span, m: ShiftModel): boolean {
  for (const p of m.nonIns) {
    if (s.start < p.end && s.end > p.start) return true
  }
  return false
}

function shiftSpan(s: Span, m: ShiftModel): Span | null {
  if (overlapsAny(s, m)) return null // caller re-derives it (AD-5)
  return { start: startPos(m, s.start), end: endPos(m, s.end) }
}

function shiftSourceSpans(spans: SourceSpans, m: ShiftModel): RefreshedSpans {
  const declaration = shiftSpan(spans.declaration, m)
  const name = shiftSpan(spans.name, m)
  const out: RefreshedSpans = { declaration, name }
  if (spans.docComment !== undefined) out.docComment = shiftSpan(spans.docComment, m)
  return out
}

/**
 * Post-save refresh for one written file (the ONE owner, AD-5).
 *
 * `file` is the project-relative POSIX path (bookkeeping for the error paths;
 * the shift math is over byte offsets, so it is not otherwise consulted).
 * `writtenText` is the definitive new content — returned as `text`. `priorText`
 * and `priorSpans` are the snapshot taken when the file was last read; `patches`
 * are the orchestrator's applied patches (must be the array that produced
 * `writtenText` via applyPatches). The returned spans are remapped; overlapping
 * spans are null so the orchestrator re-derives the touched object's spans.
 * Inputs are never mutated.
 */
export function applyRefresh(
  file: string,
  writtenText: string,
  priorSpans: Record<string, SourceSpans>,
  priorText: string,
  patches: Patch[] = [],
): RefreshResult {
  // Guard: the patch array must actually reproduce `writtenText`. Missing
  // patches on a changed file produce silently wrong spans — refuse instead.
  if (patches.length > 0 || writtenText !== priorText) {
    const expected = applyPatches(priorText, patches)
    if (expected !== writtenText) {
      throw new Error(
        `applyRefresh: writtenText is not applyPatches(priorText, patches) for ${file}`,
      )
    }
  }

  const model = buildShiftModel(patches)
  const spans: RefreshedFileSpans = {}
  for (const [objectId, s] of Object.entries(priorSpans)) {
    spans[objectId] = shiftSourceSpans(s, model)
  }
  return { text: writtenText, spans }
}

/**
 * Does `data` reference any touched file as a `file` string? A bounded breadth-
 * first walk over the layer's parsed data (the LSDL layer carries a `file`;
 * report/lineage data reference files inside their entries) — scans at most a
 * fixed budget of nodes so a large layer never stalls a save.
 */
function dataTouchesFile(data: unknown, touched: ReadonlySet<string>): boolean {
  if (data === null || typeof data !== 'object') return false
  const stack: unknown[] = [data]
  const seen = new Set<unknown>()
  let budget = 40_000
  while (stack.length > 0 && budget-- > 0) {
    const el = stack.pop()!
    if (el === null || typeof el !== 'object') continue
    if (seen.has(el)) continue
    seen.add(el)
    if (Array.isArray(el)) {
      for (const item of el) stack.push(item)
      continue
    }
    const rec = el as Record<string, unknown>
    const f = rec['file']
    if (typeof f === 'string' && touched.has(f)) return true
    for (const v of Object.values(rec)) {
      if (v !== null && typeof v === 'object') stack.push(v)
    }
  }
  return false
}

/**
 * Mark every touched lazy layer stale (AD-5/AD-7): the returned container is
 * NEW — layers whose parsed data references a touched file get
 * `parseState = 'stale'`, all others keep their state. Never mutates `layers`.
 */
export function markLayersStale(
  layers: Record<string, LayerLike>,
  touchedFiles: Iterable<string> | string,
): Record<string, LayerLike> {
  const touched = typeof touchedFiles === 'string' ? new Set([touchedFiles]) : new Set(touchedFiles)
  const out: Record<string, LayerLike> = {}
  for (const [name, layer] of Object.entries(layers)) {
    out[name] = dataTouchesFile(layer.data, touched)
      ? { ...layer, parseState: 'stale' }
      : { ...layer }
  }
  return out
}
