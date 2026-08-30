// Domain spans: half-open UTF-8 byte ranges and surrogate id derivation.
// Pure leaf (AD-1): no imports beyond language built-ins; TextEncoder is a
// global in Node and the browser.

/**
 * Half-open range over UTF-8 byte offsets into a file's original text.
 * `end` is exclusive; zero length denotes an insertion point.
 */
export interface Span {
  start: number
  end: number
}

const encoder = new TextEncoder()

/** UTF-8 byte length of `s`. */
export function byteLen(s: string): number {
  return encoder.encode(s).length
}

/**
 * Deterministic surrogate object id for objects lacking a lineageTag (AD-2):
 * `<uri-escaped file>#<start>-<end>` over the declaration span. `file` is the
 * project-relative POSIX path, `encodeURIComponent`-escaped so a literal `#`
 * or `%` in the path cannot corrupt the single `#` delimiter;
 * `decodeURIComponent` of the id's file part restores the path exactly.
 * Same file+span always yields the same id; ids are minted once by the reader.
 */
export function spanDerive(file: string, span: Span): string {
  return `${encodeURIComponent(file)}#${span.start}-${span.end}`
}
