// AD-1 guard: src/domain/ is a pure leaf.
// Replaces the TS-scoped eslint rules (espree cannot execute no-restricted-* on
// TypeScript without a parser, and typescript-eslint is outside the dep
// whitelist), so the gate runs as a headless unit test instead of lint.
// Scope: no imports from parse/, write/, fs/, state/, ui/, worker/, ai/;
// no references to window, document, or the File System Access API pickers.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DOMAIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'domain')

// Layer segment after any prefix (start of specifier, ../.., any '/'), optional
// explicit src/ segment, layer name bounded by '/' or end. Depth-independent.
const BANNED_IMPORT = /(?:^|\/|(?:\.\.\/)+)(?:src\/)?(?:parse|write|fs|state|ui|worker|ai)(?:\/|$)/
const BANNED_GLOBAL = /\b(window|document|showDirectoryPicker|showOpenFilePicker|showSaveFilePicker)\b/
const IMPORT_SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g

function domainFiles(): string[] {
  if (!existsSync(DOMAIN_DIR)) return []
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.ts')) found.push(full)
    }
  }
  walk(DOMAIN_DIR)
  return found.sort()
}

// Blank out // and /* */ comments so prose (e.g. "parses a document") cannot
// trip the global check. Commented-out imports are correctly ignored too.
function codeLines(src: string): string[] {
  const lines: string[] = []
  let inBlock = false
  for (const raw of src.split(/\r?\n/)) {
    let text = ''
    let rest = raw
    while (rest.length > 0) {
      if (inBlock) {
        const end = rest.indexOf('*/')
        if (end === -1) rest = ''
        else {
          inBlock = false
          rest = rest.slice(end + 2)
        }
      } else {
        const lineComment = rest.indexOf('//')
        const blockStart = rest.indexOf('/*')
        if (lineComment !== -1 && (blockStart === -1 || lineComment < blockStart)) {
          text += rest.slice(0, lineComment)
          rest = ''
        } else if (blockStart !== -1) {
          text += rest.slice(0, blockStart)
          const end = rest.indexOf('*/', blockStart + 2)
          if (end === -1) {
            inBlock = true
            rest = ''
          } else rest = rest.slice(end + 2)
        } else {
          text += rest
          rest = ''
        }
      }
    }
    lines.push(text)
  }
  return lines
}

function scan(matcher: (line: string) => string | null): string[] {
  const violations: string[] = []
  for (const file of domainFiles()) {
    const rel = relative(DOMAIN_DIR, file).split(sep).join('/')
    codeLines(readFileSync(file, 'utf8')).forEach((text, i) => {
      const hit = matcher(text)
      if (hit !== null) violations.push(`src/domain/${rel}:${i + 1} ${hit}`)
    })
  }
  return violations
}

const scanImports = (): string[] =>
  scan((line) => {
    for (const spec of line.matchAll(IMPORT_SPEC)) {
      if (BANNED_IMPORT.test(spec[1]!)) return `imports '${spec[1]}' (banned sibling layer)`
    }
    return null
  })

const scanGlobals = (): string[] =>
  scan((line) => {
    const hit = BANNED_GLOBAL.exec(line)
    return hit ? `references '${hit[1]}' (browser/File System Access API)` : null
  })

describe('AD-1: src/domain is a pure leaf', () => {
  it('imports nothing from parse/, write/, fs/, state/, ui/, worker/ or ai/', () => {
    const violations = scanImports()
    expect(violations, `${violations.length} AD-1 import violation(s):\n${violations.join('\n')}`).toEqual([])
  })

  it('references no window/document/File System Access API globals', () => {
    const violations = scanGlobals()
    expect(violations, `${violations.length} AD-1 global violation(s):\n${violations.join('\n')}`).toEqual([])
  })
})
