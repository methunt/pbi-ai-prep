# Review — Stack Version Verification (review-versions)

- **Reviewer lens:** every committed technology is web-researched / reality-checked against the live npm registry and vendor docs as of **2026-08-30** — not asserted from training data.
- **Reviewed:** `ARCHITECTURE-SPINE.md` § Stack (lines 124–137) and § Structural Seed "Operational envelope" (line 153).
- **Method:** live `registry.npmjs.org` dist-tags + per-version manifests (existence, publish dates, dependency graphs), live Tailwind docs, live React Flow layouting guide, GitHub Pages HTTPS docs, MDN File System Access docs, and the live `create-vite` starter templates pulled from unpkg.

---

## Verdict

**CONFIRMED — all seven committed entries are real, current, and correctly characterized as of 2026-08-30.** Every pinned version is byte-for-byte today's npm `latest`. Two findings worth acting on: the TypeScript row ("latest stable") is under-specified and diverges from what the official starter scaffolds, and the superseded React 18 / Vite 6 / elkjs 0.9 standing plan still lives un-updated in the PRD addendum and EXPERIENCE.md.

---

## Per-dependency verification

Evidence basis per row: npm `dist-tags.latest` (queried live 2026-08-30), the published manifest for the pinned version, and vendor documentation where a *fit claim* accompanies the version.

### React — 19.2.8 → **CONFIRMED**

- Registry: `dist-tags.latest = 19.2.8`, published **2026-07-21**. Current stable; React 19.3 exists only as canary/experimental builds (19.3.0-canary-* as recent as 2026-08-28), so 19.2.8 is the newest *stable* line.
- Last React 18 stable remains 18.3.1 (2024-04-26) — over two years old.
- **See "React 19 vs the standing plan's React 18" below for the explicit judgement requested.**

### Vite — 8.2.2 (Rolldown bundler) → **CONFIRMED**

- Registry: `dist-tags.latest = 8.2.2`, published **2026-08-20**.
- **Rolldown claim verified structurally:** the `vite@8.2.2` published manifest lists `rolldown: "~1.2.4"` as a direct dependency (alongside `lightningcss`, `postcss`, `picomatch`, `tinyglobby`). Vite 8 ships Rolldown as the bundler — the parenthetical is accurate, not aspirational.
- Recency note: Vite 8 is a young major (8.0 line mid-2026; 8.1.x June–July 2026; 8.2.0 on 2026-07-30). 8.2.2 is ten days old at authoring. Correct as pinned, but expect rapid patch churn in the first months — the spine's own "SEED — the code owns these once it exists" framing covers this.

### Tailwind CSS — 4.3.3 (CSS-first `@theme`, no `tailwind.config.js`) → **CONFIRMED**

- Registry: `dist-tags.latest = 4.3.3`, published **2026-07-16**.
- **CSS-first claim verified against live Tailwind docs** (tailwindcss.com/docs/theme, docs version banner "v4.3"): theme variables are defined in CSS via the `@theme` directive (`@import "tailwindcss"; @theme { --color-mint-500: ... }`), and `@theme` both stores the token *and* generates the matching utility classes. The entire theming flow documented there is CSS-native; no `tailwind.config.js` appears anywhere in the current theming model.
- Consequence for the spine's `ui/` + DESIGN.md plan: bespoke design tokens map 1:1 onto `@theme` namespaces (`--color-*`, `--radius-*`, `--text-*`) and are consumed as real CSS variables (`var(--color-mint-500)`) — which is exactly what a token-owned visual identity needs.
- Non-issue noted for completeness: a `v3-lts` tag exists (3.4.19) for legacy users; irrelevant here.

### Zustand — 5.0.15 → **CONFIRMED**

- Registry: `dist-tags.latest = 5.0.15`, published **2026-08-13**.
- Peer range: `react >= 18.0.0` — compatible with the spine's React 19.2.8.
- Fits AD-10 (single store owning cross-surface state) as a framework-agnostic store with React bindings; no version-level objection.

### @xyflow/react — 12.11.5 → **CONFIRMED**

- Registry: `dist-tags.latest = 12.11.5`, published **2026-08-25** (five days before authoring — freshest pin in the table).
- Peer range: `react >= 17`, `react-dom >= 17` — React 19 compatible. It internally depends on `zustand ^4.4.0` (its own copy; does not conflict with the app's zustand 5).
- Freshness note: 12.11.x is landing patches weekly (12.11.3 → 12.11.4 → 12.11.5 across three August dates). Same "re-verify at scaffold" caveat as Vite.

### elkjs — 0.12.0 → **CONFIRMED**

- Registry: `dist-tags.latest = 0.12.0`, published **2026-07-17**.
- The project awoke from dormancy: 0.9.3 (2024-04) → 0.10.x (2025) → 0.11.x (2026-03) → 0.12.0 (2026-07). The PRD addendum's "elkjs 0.9" is the stale number; the spine's 0.12.0 is the current one.
- **Pairing claim verified against React Flow's own layouting guide** (reactflow.dev/learn/layouting, last updated 2026-08-19): the official library-comparison table lists ELK/elkjs as the option supporting dynamic node sizes, sub-flow layouting, *and* edge routing simultaneously, with a dedicated elkjs example (`/examples/layout/elkjs`). For a lineage canvas with nested/variable-size nodes, elkjs is the documented strongest fit — the pairing is not folk wisdom.

### TypeScript — "latest stable" → **CONFIRMED with a finding (see Tier 1)**

- Registry: `dist-tags.latest = 7.0.2`, published **2026-07-08**. That is what "latest stable" resolves to on 2026-08-30. The spine's wording is accurate as a policy, but "latest stable" is a moving target and — critically — **does not match what the official starter scaffolds** (see starter defaults below). A new major (7.x line began July 2026) also means a young toolchain: bundler `tsc` interop, `@types/*` coverage, and library d.ts maturity against a .0/.2 release deserve a deliberate choice rather than a default.

### Hosting — GitHub Pages (static, HTTPS — secure context for File System Access API) → **CONFIRMED**

- GitHub docs ("Securing your GitHub Pages site with HTTPS"): *GitHub Pages sites created after June 15, 2016, and using `github.io` domains are served over HTTPS automatically*; HTTPS enforcement exists for custom domains too.
- MDN (`showOpenFilePicker` / File System Access family): *"This feature is available only in secure contexts (HTTPS)."*
- The chain therefore holds: `https://<user>.github.io` → secure context → File System Access API available. The spine's parenthetical is factually sound, and the zero-server, static-only envelope (line 153) is consistent with what Pages provides.

---

## Greenfield starter cross-check (explicitly requested)

Live `create-vite@9.2.0` (current latest) templates pulled from unpkg, 2026-08-30:

| Template file | `dependencies` | `devDependencies` |
| --- | --- | --- |
| `template-react-ts` | `react ^19.2.8`, `react-dom ^19.2.8` | `typescript ~6.0.2`, `vite ^8.2.2`, `@vitejs/plugin-react ^6.1.0`, `@types/react ^19.2.18`, `@types/react-dom ^19.2.4`, `@types/node ^24.13.3`, `oxlint ^1.79.0` |
| `template-react` | `react ^19.2.8`, `react-dom ^19.2.8` | `vite ^8.2.2`, `@vitejs/plugin-react ^6.1.0`, `oxlint ^1.79.0` |

**Mismatch analysis against the spine:**

- **React 19.2.8 — exact match.** The current starter scaffolds precisely the version the spine pins. No drift.
- **Vite ^8.2.2 — exact match.**
- **TypeScript ~6.0.2 — mismatch.** The starter pins `~6.0.2` while the spine's "latest stable" resolves to `7.0.2`. Whichever way the team resolves this is fine; leaving it as prose ("latest stable") is what creates the gap. The spine should either pin the number it means (e.g. `~6.0.2` as scaffolded, or `7.0.2` as a deliberate new-major adoption) or state "whatever create-vite scaffolds at project start".
- Incidental (not a spine claim, but useful for the builder): the current template lints with **oxlint**, not ESLint — any plan assuming the ESLint starter default is out of date.

---

## React 19 vs the standing plan's React 18 — justified greenfield choice or risk?

**Judgement: justified, low-risk — with one documentation-debt consequence.**

- The standing plan (PRD `addendum.md` line 11: "Framework | React 18"; line 12 "Build | Vite 6"; line 14 "elkjs 0.9") was set by *reuse necessity*: the Lineage Tracer viewer components (`LineageGraph.jsx`, `SidePanel.jsx`, `GraphNode.jsx`, `store.js`) are React 18-era code, and rewriting ~190 KB of working React was judged not to fit the schedule.
- The spine's memlog records the supersession explicitly ("Supersedes the React 18 / Vite 6 standing plan for this greenfield build; seed only"), and the spine's Stack table carries React 19.2.8 accordingly. Internally the spine is consistent.
- Technical risk of running the reused components under React 19: low. `@xyflow/react@12.11.5` peers `react >= 17` and `zustand@5.0.15` peers `react >= 18` — both ranges admit 19.2.8. The reuse argument was about *not rewriting working components*, not about a hard React 18 API dependency; component code targeting 18 runs under 19 within these peer ranges. Nothing in the spine's architecture (hexagonal core, journal, patch writer) touches React-version-sensitive surface.
- Greenfield justification: 19.2.8 is today's stable, is exactly what the official starter scaffolds, and starting a new app on a two-year-old major would create upgrade debt on day one.
- **The consequence (doc debt, Tier 2 below):** the PRD addendum and EXPERIENCE.md were never updated, so two authority documents still contradict the spine on framework version.

---

## Tiered findings

### Tier 1 — act before implementation starts

1. **TypeScript is committed as prose, not a version, and the two readings disagree.** "Latest stable" = 7.0.2 (published 2026-07-08, a ~7-week-old major); the official create-vite starter pins `~6.0.2`. Scaffold-with-defaults and upgrade-later produce different toolchains depending on when someone acts. Recommend: replace the Stack cell with an explicit pin (`~6.0.2` if scaffold-faithful, `7.0.2` if deliberately adopting the new major) plus a one-line rationale. Everything else in the table is pinned; this is the only row where the spine asks a future reader to guess.

### Tier 2 — consistency debt outside the spine

2. **The superseded stack survives in two authority documents.** PRD `addendum.md` (React 18 / Vite 6 / elkjs 0.9) and `EXPERIENCE.md` line 17 ("A React 18 static app on GitHub Pages") still carry the pre-spine stack. The spine's supersession note resolves the conflict in the spine's favor, but a builder reading PRD-addendum-then-spine meets two different React majors with no pointer at the point of contradiction. Recommend a one-line correction in each (this is ReconcileInputs' territory; noted here only where it intersects version truth).

### Tier 3 — notes, no action required

3. **Fresh-pin churn.** Vite 8.2.2 (2026-08-20), @xyflow/react 12.11.5 (2026-08-25), zustand 5.0.15 (2026-08-13) are all days-to-weeks old at authoring and the 12.11.x/8.2.x lines are patching rapidly. The pins are *correct today* — this is the opposite of a stale-pin finding — but the spine's existing "SEED; the code owns these once it exists" caveat should be honored with a re-verify at scaffold time rather than treated as frozen.
4. **elkjs velocity is new.** Three minors in eleven months after two dormant years — the version is right, but 0.x semver means minor bumps can carry behavior change; keep the layout regression check on the elkjs upgrade path in mind if it moves again mid-build.
5. **Rolldown is now load-bearing, not optional.** With Vite 8, the bundler is Rolldown in the default package (no separate `rolldown-vite` install). Any build quirk previously blamed on esbuild/rollup has a new addressing scheme; nothing in the spine depends on bundler identity, so this is informational.

---

## Corrected-verdict table (the compact form requested)

| Spine pin | Web-verified current (2026-08-30) | Verdict |
| --- | --- | --- |
| React 19.2.8 | 19.2.8 (`latest`, 2026-07-21) | **Confirmed** |
| Vite 8.2.2 (Rolldown) | 8.2.2 (`latest`, 2026-08-20); manifest deps include `rolldown ~1.2.4` | **Confirmed** — Rolldown claim accurate |
| Tailwind CSS 4.3.3 (CSS-first `@theme`, no config js) | 4.3.3 (`latest`, 2026-07-16); live v4.3 docs confirm CSS-first `@theme` | **Confirmed** |
| Zustand 5.0.15 | 5.0.15 (`latest`, 2026-08-13); peers `react >= 18` | **Confirmed** |
| @xyflow/react 12.11.5 | 12.11.5 (`latest`, 2026-08-25); peers `react >= 17` | **Confirmed** |
| elkjs 0.12.0 | 0.12.0 (`latest`, 2026-07-17); React Flow docs endorse ELK for node layout + edge routing | **Confirmed** — pairing claim accurate |
| TypeScript "latest stable" | resolves to 7.0.2 (2026-07-08); starter scaffolds ~6.0.2 | **Corrected** — pin an explicit version (Tier 1) |
| GitHub Pages (HTTPS secure context) | github.io auto-HTTPS (post-2016-06-15); FSA requires secure context (MDN) | **Confirmed** |
| *(cross-check)* create-vite starter | create-vite 9.2.0 → react ^19.2.8, vite ^8.2.2, typescript ~6.0.2, oxlint | React/Vite match spine exactly; TS and linter differ from spine assumptions |

**Versions the spine got wrong: none.** One row (TypeScript) is accurate-but-under-specified and should be pinned; the starter's `~6.0.2` is the only live discrepancy with the spine's stated policy.
