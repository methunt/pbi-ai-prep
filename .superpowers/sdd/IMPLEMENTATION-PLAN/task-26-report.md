# Task 8.5 Report — MIT / attribution + open-source polish

## Status: DONE ✅

## Vite base confirmation
`vite.config.ts` already sets `base: './'` (correct relative base for GitHub Pages).
No change required — verified as-is.

## Verify outcome
- `npm run build` — **clean** (tsc + vite build, 2018 modules, dist emitted; only the
  pre-existing large-chunk advisory, not an error).
- `npm test` — **green** (16 files, 253 tests passed).
- `npm run gates` — **green** (fidelity + usage acceptance gates, 2 tests passed).
- `npm run lint` — **clean** (no errors).

## Files changed
- `LICENSE` (new) — MIT text + `<copyright holder>` placeholder + Third-party notices
  section crediting both reused projects.
- `README.md` (new) — neutral "Semantic Model Studio" title, product/stack/run/
  requirement/deploy + MIT attribution.
- `src/ui/App.tsx` — added an attribution line to the existing chrome footer.

## LICENSE
MIT text with `Copyright (c) 2026 <copyright holder>` placeholder, followed by a
"Third-party notices" section that attributes both reused projects:

> - **lineage-tracer** (https://github.com/methunt/lineage-tracer) — MIT; its read path
>   (`tmdl-parser` / visual-parser) is adapted under `src/parse/`
>   (`tmdl-reader.ts`, `pbir-reader.ts`). Note: the LSDL reader
>   (`src/parse/lsdl-reader.ts`) is authored fresh — lineage-tracer has no LSDL reader.
> - **pbip-documenter** (https://github.com/JonathanJihwanKim/pbip-documenter) — MIT,
>   Copyright (c) 2026 Jihwan Kim; the TMDL parser's original source, adapted under
>   `src/parse/tmdl-reader.ts` (which retains its attribution header).

## README
Neutral title **"Semantic Model Studio"** (no client/vendor/company names; the repo
working title is explicitly noted as a placeholder). Covers: what it does (browser
PBIP/TMDL semantic-model editor — descriptions, AI instructions, synonyms, AI data
schema, lineage, byte-faithful save), the stack (React 19 / Vite / TypeScript /
Tailwind 4 / Zustand / @xyflow/react / elkjs / lucide-react / Vitest), how to run
(`npm install`, `npm run dev`), checks (build/test/gates/lint), the Chromium +
File System Access + secure-context/GitHub Pages browser requirement, the PBIP/TMDL
prerequisite, GitHub Pages deployment (Actions `npm ci` → `vite build` → Pages;
`base: './'`), and MIT attribution for both reused projects.

## Attribution footer (app chrome)
Added one small, theme-token-bound line in the existing `src/ui/App.tsx` footer
(mono, `text-foreground/55`, `opacity-40` separators — no violet/purple):

> `MIT · parsers: lineage-tracer, pbip-documenter`

Both reused projects are credited in three places: the `LICENSE` notices, the
`README.md` "License" section, and the UI footer. The per-file attribution headers in
`src/parse/tmdl-reader.ts` and `src/parse/pbir-reader.ts` are retained (LSDL reader is
fresh authorship and notes "no borrow").

## Commit
`b940df0` — `feat: add MIT license, OSS attribution, README` (neutral, random data
style, no project/company names).

## Self-review
- LICENSE is standard MIT with placeholder holder + third-party notices; both reused
  projects named + linked + MIT noted.
- README title/description neutral; no client/vendor names; notes the working repo
  title is a placeholder.
- Footer attribution is token-bound (reuses `mono` + `text-foreground/55` +
  `opacity-40`), no new palette hues, no violet/purple.
- `base: './'` already correct; no config change.
- Build / test / gates / lint all green.

## Concerns
- The LICENSE third-party notice uses "Copyright (c) 2026" for the lineage-tracer
  authors (year inferred from pbip-documenter's retained header). If the actual
  lineage-tracer LICENSE carries a different holder/year, update `LICENSE`'s notice
  line to mirror it exactly.
- The `<copyright holder>` placeholder in `LICENSE` should be replaced with the real
  holder/name when the repo is published.
