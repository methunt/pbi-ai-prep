# Semantic Model Studio

A browser-based editor for **Power BI PBIP / TMDL semantic models** — a text-based
form of a Power BI model. It reads a project's TMDL definitions, lets you curate the
material downstream AI tools rely on (descriptions, AI instructions, synonyms, an AI
data schema and lineage), and saves your edits back **byte-faithfully** so the project
opens unchanged in Power BI.

The working repo name is a placeholder; the product is described neutrally here and no
client or vendor name appears in the project title or commit messages.

## What it does

- **Open a PBIP/TMDL project folder** with the browser's File System Access API (one
  gesture grants read/write). Sensitive system roots are refused.
- **Read the model** — every table, column, measure, calculated column, hierarchy,
  calc group/item, field parameter, expression and DAX function in the model, plus
  relationships, perspectives, roles and linguistic metadata.
- **Curate descriptions** — a searchable, virtualised grid of every object with a
  "no description yet" backlog, usage and coverage KPIs, and bulk edits.
- **Prep for AI** — AI instructions, synonyms, an AI data schema, and verified-answer
  hints assembled into a machine-readable export.
- **Lineage** — an interactive graph of direct/transitive usage across the model
  (which objects are unused, which are referenced where), including the semantics of
  `functions.tmdl` DAX functions.
- **Byte-faithful save** — edits are written back atomically so the file's text is
  untouched outside the scoped change.

This is a static, client-side app: the model never leaves your browser.

## Stack

- **React 19** + **Vite** + **TypeScript** + **Tailwind CSS 4**
- **Zustand** (client state), **@xyflow/react** + **elkjs** (lineage graph)
- **lucide-react** icons; **Vitest** for tests

## Requirements

- A **Chromium-based** desktop browser (Chrome or Edge). Firefox/Safari do not expose
  the File System Access API.
- A **secure context** — `localhost` or HTTPS. GitHub Pages serves over HTTPS, so the
  deployed app works; a plain `http://<lan-ip>` page will not offer the folder pick.

## Prerequisite: a PBIP/TMDL model

Pick a folder containing a Power BI **PBIP / TMDL** semantic model project (a
`.SemanticModel` folder with `definition/*.tmdl` and `.pbip`/`.pbir` files). The
editors read that project, so there must be one on disk to open.

## Run it

```sh
npm install
npm run dev      # start the Vite dev server
```

Then open the printed `http://localhost:5173` URL in Chrome/Edge.

## Checks

```sh
npm run build    # type-check + production build
npm test         # run the Vitest suite (253 tests)
npm run gates    # run the fidelity + usage acceptance gates
npm run lint     # eslint over the repo
```

## Deploy to GitHub Pages

The Vite config uses `base: './'`, so the build is relative and works under a
GitHub Pages subpath. A typical Actions workflow:

1. On push to the deploy branch, `npm ci` (install exact `package-lock.json` deps).
2. `npm run build` — produces `dist/`.
3. Publish `dist/` to Pages (e.g. `actions/deploy-pages` with `upload-pages-artifact`,
   or `peaceiris/actions-gh-pages` targeting `gh-pages`).

Because `base: './'` is relative, assets resolve correctly regardless of the
`/owner/repo/` subpath.

## License

MIT. See [LICENSE](./LICENSE). This project's read path is adapted from two
MIT-licensed open-source projects; both are credited in the LICENSE notices and
in the app's footer:

- **lineage-tracer** — its TMDL/visual read path is adapted under `src/parse/`.
- **pbip-documenter** — its TMDL parser is the original source of
  `src/parse/tmdl-reader.ts`, which retains its attribution header.
