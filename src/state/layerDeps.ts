// Layer deps derivation (Task 6.4 / AD-7) — how a surface resolves the lazy
// layer inputs the broker forwards to the parse worker.
//
// The broker's `requestLayer('lsdl'|'report'|'lineage', deps)` needs the
// culture file text and the report file map. Both are derived from the loaded
// project's `files` slice (the fs walk in src/fs/load.ts stores EVERY text file
// the picker saw, TMDL and report JSON alike). `cultureText` is the single
// culture `.tmdl`'s text (the LSDL layer parses one culture file); `reportFiles`
// carries every report-facing `.json` (the report reader filters by path).
//
// Pure read-only derivation: no fs, no broker, no store mutation.

import type { ProjectResult } from './store'

/** A culture file path, project-relative (any depth): `…/definition/cultures/<lcid>.tmdl`. */
const CULTURE_PATH_RE = /(^|\/)definition\/cultures\/[^/]+\.tmdl$/

/** Report-facing files the report/lineage reader cares about are JSON. */
const REPORT_JSON_RE = /\.json$/i

/**
 * The culture file's text for the `lsdl` layer (the LSDL reader parses one
 * culture file and derives its `file` from the `cultureInfo` line). Picks the
 * first culture `.tmdl` in path order; `undefined` when the project has none
 * (the LSDL layer then reads an empty culture, never errors).
 */
export function deriveCultureText(project: ProjectResult): string | undefined {
  const paths = Object.keys(project.files)
    .filter((p) => CULTURE_PATH_RE.test(p))
    .sort()
  return paths.length > 0 ? project.files[paths[0]]?.text : undefined
}

/**
 * The report file map (project-relative path → text) for the `report`/`lineage`
 * layers. Every `.json` file the walk captured rides along; the report reader
 * filters to `visual.json` + VerifiedAnswers `definition.json` by path.
 */
export function deriveReportFiles(project: ProjectResult): Map<string, string> {
  const out = new Map<string, string>()
  for (const [path, record] of Object.entries(project.files)) {
    if (REPORT_JSON_RE.test(path) && typeof record.text === 'string') {
      out.set(path, record.text)
    }
  }
  return out
}
