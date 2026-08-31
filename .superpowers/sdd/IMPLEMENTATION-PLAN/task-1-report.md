# Task 0.1 Report: Vite + React + TS Scaffold

**Status: DONE_WITH_CONCERNS** (all gates pass; 3 minor deviations noted below)
**Commit: `0020824` — `feat: step 6fd1`** (random token from `/dev/urandom`, brief's style)
**Branch: `feat/pbi-ai-prep`** · Working tree clean after commit.

## What was built

1. **Scaffold via temp dir** (controller's ruling): `npm create vite@latest tmp-scaffold -- --template react-ts` (no prompts, Node v24.16.0 / npm 12.0.2). Moved `package.json`, `index.html`, `vite.config.ts`, `tsconfig{,.app,.node}.json`, `src/`, `public/` into repo root; removed `tmp-scaffold/` (its `README.md` and `.oxlintrc.json` were intentionally NOT moved — not in the brief's file list).
2. **`.gitignore` merged, not replaced**: appended the scaffold's entries (logs, `node_modules`, `dist`, editor dirs) after the pre-existing PBI/agent entries; original 6 lines untouched.
3. **`vite.config.ts`**: `base: './'` + `@tailwindcss/vite` plugin (Tailwind v4 canonical wiring; without it the two Tailwind deps from the brief would be dead). No collisions with `_bmad-output/` (nothing there shares paths with scaffold output).
4. **Smoke hook**: `data-testid="app-root"` added to `<div id="root">` in `index.html` (controller ruling — brief said "root in src/main.tsx"; the mount root in HTML is the same DOM node and is present pre-hydration, which is better for Playwright).
5. **Strict TS**: new TS 6.0 create-vite template ships WITHOUT `strict` — added `"strict": true` explicitly to both `tsconfig.app.json` and `tsconfig.node.json`.
6. **`.env.d.ts`** created (`/// <reference types="vite/client" />`).
7. **eslint cutover**: current create-vite ships **oxlint** (`.oxlintrc.json`, `oxlint` devDep, `"lint": "oxlint"`). Brief requires **eslint + eslint-plugin-import** → removed oxlint dep/config, added the two brief deps and a minimal `eslint.config.js` (flat config; `dist`/`node_modules` ignored; `import/order` rule on JS files); `"lint": "eslint ."`.
8. **Versions pinned** with `--save-exact` (same resolved versions as the brief's bare commands; exact specifiers recorded per the "pin EXACT" constraint). `npm rm` effect: oxlint gone; `@vitejs/plugin-react` hoisted 6.1.0 → 6.1.1 (in-range caret bump from scaffold).

## Pinned versions (`npm ls`, all 8 + dev set)

| Package | Version | | Package | Version |
|---|---|---|---|---|
| react | **19.2.8** | | vite | **8.2.2** |
| react-dom | **19.2.8** | | vitest | **4.1.11** |
| @tanstack/react-virtual | **3.14.10** | | tailwindcss | **4.3.3** |
| zustand | **5.0.15** | | @tailwindcss/vite | **4.3.3** |
| @xyflow/react | **12.11.5** | | eslint | **9.39.5** |
| elkjs | **0.12.0** | | eslint-plugin-import | **2.32.0** |
| lucide-react | **1.37.0** | | | |

Scaffold toolchain kept as generated: typescript ~6.0.2, @vitejs/plugin-react ^6.1.0, @types/react ^19.2.18, @types/react-dom ^19.2.4, @types/node ^24.13.3 (package-lock pins exact resolutions).

## Verification

`npm run build` (`tsc -b && vite build`) — **zero errors**:

```
vite v8.2.2 building client environment for production...
✓ 20 modules transformed.
dist/index.html                   0.48 kB │ gzip:  0.31 kB
dist/assets/react-CHdo91hT.svg    4.12 kB │ gzip:  2.06 kB
dist/assets/vite-BF8QNONU.svg     8.70 kB │ gzip:  1.60 kB
dist/assets/hero-CLDdwZDr.png    13.05 kB
dist/assets/index-BeCxL9Ob.css   27.63 kB │ gzip:  6.48 kB
dist/assets/index-B5dghhQw.js   193.36 kB │ gzip: 60.64 kB
✓ built in 303ms
```

Additional checks:
- `dist/index.html` emits **relative** asset URLs (`./assets/…`, `./favicon.svg`) — GitHub Pages ready; `data-testid="app-root"` present in built output.
- `npm run lint` — exit 0, no findings (scoped smoke of the eslint config I added).
- No dev server left running; no background processes started.

## Files changed (19: 18 created + 1 merged)

Created: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.env.d.ts`, `eslint.config.js`, `public/{favicon.svg,icons.svg}`, `src/{main.tsx,App.tsx,App.css,index.css}`, `src/assets/{hero.png,react.svg,vite.svg}`.
Modified: `.gitignore` (merge only — original entries preserved). Untouched: `_bmad-output/`, `.agents/`, `_bmad/`, `_test_pbip_w_ai/`, `mockup/`, `.superpowers/`.

## Self-review findings

- Verified no protected path appears in the commit (`git status` clean, commit file list audited above).
- `main.tsx` unchanged from template — mounts into `#root`, so the testid lands in the runtime DOM without touching React code.
- `erasableSyntaxOnly`/`verbatimModuleSyntax` kept from template; strict added without weakening anything.

## Concerns

1. **`eslint.config.js` is one file beyond the brief's "Files" list** — necessary so the mandated eslint deps aren't a stub; without TS-aware parser (typescript-eslint is outside the allowed dep list), eslint currently covers JS/config files only, not `.ts` sources.
2. **eslint 9.39.5 is deprecation-flagged by npm** ("no longer supported") yet is still what `eslint` resolves to; kept per brief (no version pin given). Revisit if the controller wants a specific major.
3. **`@tanstack/react-virtual`/`vitest`/`lucide-react`/eslint versions were "@latest"** in the brief — exact values above are what latest resolved to on 2026-08-30 and are now hard-pinned in `package.json` + `package-lock.json`.
4. Scaffold demo `App.tsx`/`App.css`/assets kept as generated (scaffold task, not UI task); Tailwind preflight coexists with the demo styles without build impact.
