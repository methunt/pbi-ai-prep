// Task 3.1 — source-span emitter for the TMDL adapter.
// Adapter layer (the AD-1 guard scans src/domain only): imports domain/span only.
//
// PINNED CONVENTIONS (consumed by the 3.2 TMDL reader and the 4.2 write planner):
// - Lines are 0-based, matching `text.split('\n')` indexing; the empty phantom
//   segment after a trailing newline is addressable as a zero-length span.
// - Line spans are half-open over UTF-8 BYTE offsets (TextEncoder — a multi-byte
//   char counts > 1 byte, never JS string indices) and INCLUDE the line
//   terminator (`\r\n` or `\n`) when present; a final line without a terminator
//   ends at the text's byte length. A block therefore composes and deletes as
//   [first line start .. last line end] with no leftover blank line.
// - Name-token spans cover the token exactly as written — quotes or brackets
//   included (`"Name"`, `'Name'`, `[Name]`) or a bare identifier.

import { byteLen } from '../domain/span'
import type { Span } from '../domain/span'

/** One source line: byte range including its terminator, plus the content. */
interface LineEntry {
  /** Byte offset of the line's first byte. */
  byteStart: number
  /** Byte offset one past the line's last byte (terminator included). */
  byteEnd: number
  /** Line content without the terminator. */
  content: string
}

/**
 * Line table for `text`, one entry per `text.split('\n')` segment, byte offsets
 * accumulated in a single pass. A `\r` immediately before `\n` counts as part
 * of the terminator (CRLF); a lone `\r` is content. Pure per call — inputs are
 * small TMDL sources.
 */
function lineTable(text: string): LineEntry[] {
  const lines: LineEntry[] = []
  let byteStart = 0
  let i = 0
  for (;;) {
    const nl = text.indexOf('\n', i)
    const crlf = nl > i && text.charCodeAt(nl - 1) === 13 // 13 === '\r'
    const contentEnd = nl === -1 ? text.length : crlf ? nl - 1 : nl
    const content = text.slice(i, contentEnd)
    const termBytes = nl === -1 ? 0 : crlf ? 2 : 1
    const byteEnd = byteStart + byteLen(content) + termBytes
    lines.push({ byteStart, byteEnd, content })
    if (nl === -1) break
    byteStart = byteEnd
    i = nl + 1
  }
  return lines
}

/** Blank char within a line (line content never contains `\n`). */
function isBlankChar(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r'
}

/**
 * End index (exclusive, JS string) of a quoted token opening at `open`.
 * A doubled quote (`''` or `""`) is an escaped quote, per TMDL name escaping.
 */
function scanQuoted(s: string, open: number): number {
  const quote = s[open]
  for (let i = open + 1; i < s.length; i++) {
    if (s[i] !== quote) continue
    if (s[i + 1] === quote) {
      i++
      continue
    }
    return i + 1
  }
  throw new Error(`unterminated quoted name: ${JSON.stringify(s)}`)
}

/** End index (exclusive, JS string) of a `[...]` token opening at `open`. */
function scanBracketed(s: string, open: number): number {
  const close = s.indexOf(']', open + 1)
  if (close === -1) throw new Error(`unterminated bracketed name: ${JSON.stringify(s)}`)
  return close + 1
}

/** End index (exclusive, JS string) of a bare identifier starting at `open`. */
function scanBare(s: string, open: number): number {
  let i = open
  while (i < s.length && !isBlankChar(s[i]) && s[i] !== '=') i++
  return i
}

/**
 * UTF-8 byte offset of the JS string index `charIndex` within `text`
 * (multi-byte chars count > 1 byte). `charIndex` must land on a code-point
 * boundary (a surrogate-pair half yields replacement bytes). O(charIndex): the
 * locators accumulate byte offsets line-locally instead of re-encoding the
 * whole text per token.
 */
export function byteOffsetAt(text: string, charIndex: number): number {
  return byteLen(text.slice(0, charIndex))
}

/**
 * Byte span of declaration line `line` (0-based), terminator included.
 * Throws RangeError when `line` is out of range.
 */
export function locateDeclaration(text: string, line: number): Span {
  const lines = lineTable(text)
  if (!Number.isInteger(line) || line < 0 || line >= lines.length) {
    throw new RangeError(`line ${line} out of range: 0..${lines.length - 1}`)
  }
  return { start: lines[line].byteStart, end: lines[line].byteEnd }
}

/** Indentation prefix (leading whitespace) of a line's content. */
function indentOf(content: string): string {
  let i = 0
  while (i < content.length && isBlankChar(content[i])) i++
  return content.slice(0, i)
}

/**
 * Byte span of the contiguous `///` doc-comment lines immediately above the
 * declaration line containing `declStart` (a byte offset as produced by
 * `locateDeclaration(...).start`), terminator included — so the span ends
 * exactly at the declaration start. `undefined` when the line immediately
 * above is not a `///` line at the declaration's exact indentation; the run
 * stops at any line that is blank, non-`///`, or differently indented — a
 * `///` line deeper than the declaration sits inside a body/expression and
 * must never be captured as a doc comment. Indentation before `///` is part
 * of the span. Throws RangeError when `declStart` is outside the text.
 */
export function locateDocComment(text: string, declStart: number): Span | undefined {
  const lines = lineTable(text)
  const total = lines[lines.length - 1].byteEnd
  if (!Number.isInteger(declStart) || declStart < 0 || declStart > total) {
    throw new RangeError(`declStart ${declStart} out of range: 0..${total}`)
  }
  // The line containing declStart: the last line starting at or before it.
  let decl = 0
  while (decl + 1 < lines.length && lines[decl + 1].byteStart <= declStart) decl++
  const declIndent = indentOf(lines[decl].content)
  let top = decl - 1
  while (
    top >= 0 &&
    indentOf(lines[top].content) === declIndent &&
    lines[top].content.trimStart().startsWith('///')
  ) top--
  if (top + 1 >= decl) return undefined
  return { start: lines[top + 1].byteStart, end: lines[decl - 1].byteEnd }
}

/**
 * Byte span of the object's name token within declaration line `declLine`
 * (0-based): the first token after the leading keyword — `"Name"`, `'Name'`,
 * `[Name]`, or a bare identifier — quotes/brackets included, half-open over
 * UTF-8 byte offsets. A bare token ends at whitespace or `=`. Throws
 * RangeError when `declLine` is out of range and Error when the line carries
 * no declaration or no name token.
 */
export function locateNameToken(text: string, declLine: number): Span {
  const lines = lineTable(text)
  if (!Number.isInteger(declLine) || declLine < 0 || declLine >= lines.length) {
    throw new RangeError(`line ${declLine} out of range: 0..${lines.length - 1}`)
  }
  const content = lines[declLine].content
  let i = 0
  while (i < content.length && isBlankChar(content[i])) i++
  if (i >= content.length) throw new Error(`no declaration on line ${declLine}`)
  while (i < content.length && !isBlankChar(content[i])) i++ // leading keyword
  while (i < content.length && isBlankChar(content[i])) i++
  if (i >= content.length) throw new Error(`no name token on line ${declLine}`)
  const tokenEnd =
    content[i] === '"' || content[i] === "'"
      ? scanQuoted(content, i)
      : content[i] === '['
        ? scanBracketed(content, i)
        : scanBare(content, i)
  const start = lines[declLine].byteStart + byteLen(content.slice(0, i))
  return { start, end: start + byteLen(content.slice(i, tokenEnd)) }
}
