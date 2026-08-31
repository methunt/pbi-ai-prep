// Task 5.1 — src/fs/load.ts pure helpers (FR-2 hardening).
//
// The browser-only FSA path is covered by tests/e2e/README.md (manual
// Chromium smoke). The pure helpers exported from load.ts — `sniffProjectShape`,
// `summarizeWalk`, `hasSemanticModel` — are testable headlessly here.
//
// Under test:
//   - PBIP folder sniff accepts/rejects by immediate-subdir shape
//   - Walk summary counts files and names top-level dirs
//   - Semantic-model check accepts definition/model.tmdl and definition/database.tmdl
import { describe, expect, it } from 'vitest'
import { hasSemanticModel, sniffProjectShape, summarizeWalk } from '../../src/fs/load'

describe('sniffProjectShape (FR-2 early sniff)', () => {
  it('accepts when the picked root itself ends in .SemanticModel (drill-in pattern)', () => {
    expect(sniffProjectShape('MyModel.SemanticModel', [])).toEqual({ looksLikePbip: true })
  })

  it('accepts a PBIP folder with one *.SemanticModel immediate child', () => {
    const r = sniffProjectShape('MyProject', ['MyModel.SemanticModel', 'MyModel.Report'])
    expect(r.looksLikePbip).toBe(true)
  })

  it('accepts a PBIP folder where only some children are .SemanticModel (mixed)', () => {
    const r = sniffProjectShape('MyProject', ['docs', 'MyModel.SemanticModel', '.vs'])
    expect(r.looksLikePbip).toBe(true)
  })

  it('rejects a folder with no .SemanticModel child and a non-.SemanticModel root', () => {
    const r = sniffProjectShape('Downloads', ['report.pdf', 'photo.jpg', 'data'])
    expect(r.looksLikePbip).toBe(false)
    expect(r.error).toMatch(/does not look like a Power BI project/)
    expect(r.error).toMatch(/\*\.SemanticModel/)
  })

  it('rejects when the suffix appears only deeper than the immediate children', () => {
    // A folder that contains a .SemanticModel nested two levels deep should NOT
    // pass — the picker lands on the PBIP folder, and PBIP requires the
    // .SemanticModel to be an immediate child.
    const r = sniffProjectShape('MyProject', ['nested', 'docs'])
    expect(r.looksLikePbip).toBe(false)
  })

  it('matches the suffix case-sensitively (real Power BI uses .SemanticModel verbatim)', () => {
    const r = sniffProjectShape('MyProject', ['MyModel.semanticmodel'])
    expect(r.looksLikePbip).toBe(false)
  })

  it('accepts when the picked root itself ends in .Report (drill-in, report-only)', () => {
    expect(sniffProjectShape('MyModel.Report', [])).toEqual({ looksLikePbip: true })
  })

  it('accepts a PBIP folder whose only PBIP child is a .Report directory (no model)', () => {
    const r = sniffProjectShape('MyProject', ['docs', 'MyModel.Report'])
    expect(r.looksLikePbip).toBe(true)
  })

  it('accepts when both .SemanticModel AND .Report are present (the common case)', () => {
    const r = sniffProjectShape('MyProject', ['MyModel.SemanticModel', 'MyModel.Report', 'docs'])
    expect(r.looksLikePbip).toBe(true)
  })
})

describe('summarizeWalk (FR-2 shape report)', () => {
  it('lists top-level subfolders and counts .tmdl + .json files at any depth', () => {
    const summary = summarizeWalk([
      { name: 'MyModel.SemanticModel', kind: 'directory', path: 'MyModel.SemanticModel' },
      { name: 'MyModel.Report', kind: 'directory', path: 'MyModel.Report' },
      { name: 'model.tmdl', kind: 'file', path: 'MyModel.SemanticModel/definition/model.tmdl' },
      { name: 'database.tmdl', kind: 'file', path: 'MyModel.SemanticModel/definition/database.tmdl' },
      { name: 'report.json', kind: 'file', path: 'MyModel.Report/report.json' },
    ])
    expect(summary).toMatch(/2 \.tmdl files/)
    expect(summary).toMatch(/1 \.json files/)
    expect(summary).toMatch(/MyModel\.SemanticModel/)
    expect(summary).toMatch(/MyModel\.Report/)
  })

  it('handles an empty walk gracefully', () => {
    const summary = summarizeWalk([])
    expect(summary).toMatch(/0 \.tmdl/)
    expect(summary).toMatch(/no top-level subfolders/)
  })

  it('ignores subdirs nested below the first path segment', () => {
    // Only the top-level entries (no `/` in path) are named as dirs.
    const summary = summarizeWalk([
      { name: 'MyModel.SemanticModel', kind: 'directory', path: 'MyModel.SemanticModel' },
      { name: 'definition', kind: 'directory', path: 'MyModel.SemanticModel/definition' },
    ])
    expect(summary).toMatch(/MyModel\.SemanticModel/)
    expect(summary).not.toMatch(/\bdefinition\b/)
  })
})

describe('hasSemanticModel (FR-2 definition check)', () => {
  it('accepts a model.tmdl at the right path', () => {
    const files = new Map<string, string>([
      ['MyModel.SemanticModel/definition/model.tmdl', ''],
      ['MyModel.SemanticModel/definition/database.tmdl', ''],
    ])
    expect(hasSemanticModel(files)).toBe(true)
  })

  it('accepts a database.tmdl without a model.tmdl', () => {
    const files = new Map<string, string>([['MyModel.SemanticModel/definition/database.tmdl', '']])
    expect(hasSemanticModel(files)).toBe(true)
  })

  it('rejects a model.tmdl NOT under a definition/ folder (wrong path)', () => {
    const files = new Map<string, string>([['MyModel.SemanticModel/model.tmdl', '']])
    expect(hasSemanticModel(files)).toBe(false)
  })

  it('rejects when no model.tmdl or database.tmdl is present at all', () => {
    const files = new Map<string, string>([
      ['MyModel.SemanticModel/definition/tables/Sales.tmdl', ''],
      ['MyModel.Report/report.json', '{}'],
    ])
    expect(hasSemanticModel(files)).toBe(false)
  })

  it('accepts model.tmdl at the root level (older PBIP layout with no SemanticModel subfolder)', () => {
    const files = new Map<string, string>([['definition/model.tmdl', '']])
    expect(hasSemanticModel(files)).toBe(true)
  })
})
