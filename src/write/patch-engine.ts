// Task 4.1 — byte-faithful patch engine: the write phase's core.
// Pure leaf (AD-1): imports nothing; TextEncoder/TextDecoder are globals in
// Node and the browser (same convention as domain/span).
//
// PINNED CONTRACT (consumed by the 4.2 write planner):
// - Patch {start, end, replacement}: half-open range over UTF-8 BYTE offsets
//   into the ORIGINAL text; start === end is a pure insertion point.
// - applyPatches applies patches DESCENDING by start (ties descending end) in
//   one pass, so every offset refers to the original text no matter what
//   order patches arrive in; unmodified bytes are copied verbatim.
// - Overlapping patches (sharing >= 1 byte) throw: overlapping spans are a
//   planner bug, never a fallback. An insertion point strictly inside a
//   replaced span throws too — the byte it targets is deleted, so the edit is
//   ambiguous. Insertions AT a span's start/end boundary are legal and land
//   adjacent to the replacement (before it at the start, after it at the end).
// - Replacements are literal text, inserted verbatim (never re-serialized
//   from an AST); '' deletes the span.
// - Empty patch list → identity: the original string is returned untouched.
// - Two insertions at the same byte both apply; under sequential descending
//   application the later-listed one lands first (leftmost) in the output.

export interface Patch {
  /** Inclusive start byte offset into the original text. */
  start: number
  /** Exclusive end byte offset; `start === end` marks an insertion point. */
  end: number
  /** Literal replacement text; '' deletes the span. */
  replacement: string
}

/** Concatenate byte arrays into one freshly allocated buffer. */
function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Apply `patches` to `originalText` byte-faithfully: the original text is
 * encoded exactly once, patches splice byte slices at their offsets, and the
 * result is decoded once — a multi-byte char before a patch can never shift
 * the patch's byte offset.
 */
export function applyPatches(originalText: string, patches: Patch[]): string {
  if (patches.length === 0) return originalText

  const encoder = new TextEncoder()
  const bytes = encoder.encode(originalText)
  // Descending start, ties descending end — the order patches are applied in.
  // Array#sort is stable, so equal (start, end) patches keep their input order.
  const sorted = [...patches].sort((a, b) => b.start - a.start || b.end - a.end)

  // Validate ranges and reject conflicts in one descending pass. Walking
  // descending, every previously applied non-empty patch starts at or after
  // the current one, so the most recent one has the smallest start — the only
  // one the current patch can reach into.
  let applied: Patch | undefined // most recent byte-owning (non-empty) patch
  let insertion: number | undefined // most recent insertion point seen
  for (const p of sorted) {
    if (
      !Number.isInteger(p.start) ||
      !Number.isInteger(p.end) ||
      p.start < 0 ||
      p.end < p.start ||
      p.end > bytes.length
    ) {
      throw new RangeError(
        `patch [${p.start}, ${p.end}) is not a half-open byte range within the ${bytes.length}-byte text`,
      )
    }
    if (p.end > p.start) {
      if (applied !== undefined && p.end > applied.start) {
        throw new Error(
          `overlapping patches: [${applied.start}, ${applied.end}) and [${p.start}, ${p.end}) share at least one byte`,
        )
      }
      if (insertion !== undefined && insertion > p.start && p.end > insertion) {
        throw new Error(
          `insertion at byte ${insertion} falls strictly inside replaced span [${p.start}, ${p.end})`,
        )
      }
      applied = p
    } else {
      insertion = p.start
    }
  }

  // Splice in one pass over the sorted patches, emitting segments tail-first:
  // the untouched bytes after each patch, then its replacement bytes. Walking
  // descending keeps every slice address valid in the ORIGINAL byte buffer.
  const parts: Uint8Array[] = []
  let pos = bytes.length
  for (const p of sorted) {
    parts.push(bytes.subarray(p.end, pos))
    parts.push(encoder.encode(p.replacement))
    pos = p.start
  }
  parts.push(bytes.subarray(0, pos))
  parts.reverse()
  return new TextDecoder().decode(concatBytes(parts))
}
