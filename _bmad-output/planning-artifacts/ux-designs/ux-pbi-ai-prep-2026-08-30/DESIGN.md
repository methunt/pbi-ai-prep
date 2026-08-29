---
name: PBI AI Prep
description: Chromium desktop web app for editing Power BI PBIP/TMDL semantic models — descriptions, AI instructions, synonyms, and lineage — with a byte-faithful save path.
status: final
updated: 2026-08-30
colors:
  background: 'hsl(210 40% 98%)'
  background-dark: 'hsl(222 47% 6%)'
  foreground: 'hsl(222 47% 11%)'
  foreground-dark: 'hsl(210 40% 98%)'
  card: 'hsl(0 0% 100%)'
  card-dark: 'hsl(222 40% 10%)'
  primary: 'hsl(221 83% 53%)'
  primary-dark: 'hsl(217 91% 60%)'
  primary-foreground: 'hsl(210 40% 98%)'
  primary-foreground-dark: 'hsl(0 0% 100%)'
  secondary: 'hsl(220 14% 96%)'
  secondary-dark: 'hsl(217 33% 15%)'
  muted: 'hsl(220 14% 96%)'
  muted-dark: 'hsl(217 33% 15%)'
  muted-foreground: 'hsl(220 9% 46%)'
  muted-foreground-dark: 'hsl(215 20% 65%)'
  accent: 'hsl(199 89% 48%)'
  accent-dark: 'hsl(199 89% 60%)'
  destructive: 'hsl(0 84% 60%)'
  destructive-dark: 'hsl(0 72% 51%)'
  border: 'hsl(220 13% 91%)'
  border-dark: 'hsl(217 33% 18%)'
  input: 'hsl(220 13% 91%)'
  input-dark: 'hsl(217 33% 18%)'
  ring: 'hsl(221 83% 53%)'
  ring-dark: 'hsl(217 91% 60%)'
  blue-50: 'hsl(214 100% 97%)'
  blue-100: 'hsl(214 95% 93%)'
  blue-200: 'hsl(213 97% 87%)'
  blue-500: 'hsl(217 91% 60%)'
  blue-600: 'hsl(221 83% 53%)'
  blue-700: 'hsl(224 76% 48%)'
  sky-500: 'hsl(199 89% 48%)'
  sky-600: 'hsl(200 98% 39%)'
  cyan-500: 'hsl(189 94% 43%)'
  cyan-600: 'hsl(192 91% 36%)'
  emerald-500: 'hsl(160 84% 39%)'
  emerald-600: 'hsl(158 64% 40%)'
  amber-500: 'hsl(38 92% 50%)'
  amber-600: 'hsl(32 95% 44%)'
  rose-500: 'hsl(350 89% 60%)'
typography:
  sans:
    fontFamily: Inter
  mono:
    fontFamily: JetBrains Mono
  display:
    fontFamily: Inter
    fontSize: 38px
  kpi-value:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: '800'
  modal-title:
    fontFamily: Inter
    fontSize: 14.5px
  tab-label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '550'
  button-label:
    fontFamily: Inter
    fontSize: 12.5px
    fontWeight: '550'
    lineHeight: '1'
  field-text:
    fontFamily: Inter
    fontSize: 13px
  chip-text:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
  pill-text:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
  table-head:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: '650'
    letterSpacing: '0.06em'
  table-cell:
    fontFamily: Inter
    fontSize: 13px
  dax-cell:
    fontFamily: JetBrains Mono
    fontSize: 11.5px
  micro-label:
    fontFamily: Inter
    fontSize: 10.5px
    fontWeight: '650'
    letterSpacing: '0.06em'
  tooltip-body:
    fontFamily: Inter
    fontSize: 11.5px
  lineage-node-text:
    fontFamily: Inter
    fontSize: 12px
rounded:
  sm: 6px
  md: 8px
  DEFAULT: 10px
  lg: 10px
  full: 9999px
spacing:
  gutter: 16px
  kpi-padding: 14px
  kpi-gap: 12px
components:
  button-base:
    padding: '8px 13px'
    gap: 6px
    font: '{typography.button-label}'
    radius: '{rounded.md}'
    disabled: 'opacity 0.45 · pointer-events none'
  button-sm:
    padding: '6px 10px'
    font-size: 12px
  button-primary:
    background: '{colors.primary}'
    background-hover: '{colors.blue-700}'
    background-hover-dark: '{colors.blue-500}'
    foreground: '{colors.primary-foreground}'
    hover-glow: '0 2px 10px -2px hsl(var(--primary) / 0.5)'
  button-ghost:
    background: transparent
    border: none
  button-outline:
    border: '1px solid {colors.border}'
    hover-border: 'hsl(var(--primary) / 0.5)'
    hover-color: '{colors.primary}'
    hover-background: 'hsl(var(--primary) / 0.04)'
  button-danger:
    background: '{colors.destructive}'
    hover: 'brightness(0.93) + glow'
  chip:
    font: '{typography.chip-text}'
    padding: '5px 11px'
    radius: 7px
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    color: '{colors.muted-foreground}'
    hover-border: 'hsl(var(--primary) / 0.45)'
    on-background: 'hsl(var(--primary) / 0.10)'
    on-border: 'hsl(var(--primary) / 0.45)'
    on-color: '{colors.primary}'
    on-weight: '600'
  field:
    radius: 8px
    font: '{typography.field-text}'
    padding: '8px 11px'
    focus-border: '{colors.ring}'
    focus-ring: '0 0 0 3px hsl(var(--ring) / 0.14)'
  switch:
    track: '40 x 22 · radius 999px'
    track-on: '{colors.primary}'
    knob: '16px · translateX(18px) when on'
  tab:
    font: '{typography.tab-label}'
    padding: '7px 13px'
    radius: '{rounded.md}'
    color: '{colors.muted-foreground}'
    active-background: 'hsl(var(--primary) / 0.10)'
    active-color: '{colors.primary}'
    active-weight: '650'
  pill:
    font: '{typography.pill-text}'
    padding: '2px 8px'
    radius: 9999px
    dot: '5px ::before dot · pill-flat omits it'
  pill-tones:
    pattern: 'background tone / 0.12–0.14 · 1px tone border · fixed per-mode text'
    blue: '{colors.blue-500}'
    sky: '{colors.accent}'
    cyan: '{colors.cyan-500}'
    emerald: '{colors.emerald-500}'
    amber: '{colors.amber-500}'
    slate: 'grey family — {colors.muted-foreground}'
    rose: '{colors.rose-500}'
    text-blue-light: 'hsl(224 76% 42%)'
    text-blue-dark: 'hsl(213 94% 78%)'
    text-sky-light: 'hsl(201 96% 32%)'
    text-sky-dark: 'hsl(198 93% 72%)'
    text-cyan-light: 'hsl(192 82% 30%)'
    text-cyan-dark: 'hsl(187 86% 72%)'
    text-emerald-light: 'hsl(163 88% 26%)'
    text-emerald-dark: 'hsl(152 76% 70%)'
    text-amber-light: 'hsl(26 90% 34%)'
    text-amber-dark: 'hsl(46 96% 72%)'
    text-rose-light: 'hsl(347 77% 42%)'
    text-rose-dark: 'hsl(351 95% 78%)'
  used-pill:
    u0: '0 references — t-blue, the light-blue attention state'
    u1: '1–5 references — t-slate'
    u6: '6+ references — t-slate, weight 650'
    u0-text-light: 'hsl(224 76% 46%)'
    u0-text-dark: 'hsl(213 94% 78%)'
    u6-text-dark: 'hsl(210 40% 88%)'
  kpi-card:
    background: '{colors.card}'
    border: '1px solid {colors.border}'
    radius: 0.875rem
    identity-bar: '2px top gradient bar in the tile hue --k'
    icon-tile: '34px · radius 9px · bg --k / 0.12 · color --k'
    value: '{typography.kpi-value}'
    label: '{typography.micro-label}'
    hover: 'translateY(-2px) · border --k / 0.35 · shadow 0 6px 18px -6px hsl(var(--k) / 0.30)'
  data-grid:
    head: 'sticky z-5 · {typography.table-head} uppercase · 1px bottom border'
    cell: 'height 42px · padding 0 14px · {typography.table-cell} · bottom border {colors.border} / 0.6'
    row-hover: 'bg hsl(var(--primary) / 0.035)'
    row-selected: 'bg hsl(var(--primary) / 0.07)'
    lineage-icon: 'opacity 0 → 1 on row hover'
  editable-cell:
    rename-input: '12px · padding 4px 8px · placeholder rename… · non-empty border hsl(var(--primary) / 0.6)'
    description: 'truncated · max-width 300px · empty = italic amber No description yet'
    dax: '{typography.dax-cell} truncated · empty = — · muted'
  tooltip:
    body: 'bottom-anchored · bg hsl(222 47% 11%) (dark hsl(217 33% 22%)) · radius 8px · padding 9px 11px · {typography.tooltip-body} · 5px arrow'
    dax-variant: 'right-anchored · JetBrains Mono 11px · line-height 1.65 · pre-wrap · max-width 520px · min-width 300px · max-height 320px scroll · arrow hidden'
    trigger: 'cursor-help · opens on hover and keyboard focus'
  action-bar:
    container: 'radius 10px · padding 8px 12px · bg {colors.card} · 1px border hsl(var(--primary) / 0.4) · shadow 0 1px 2px hsl(222 47% 11% / 0.04), 0 1px 3px hsl(222 47% 11% / 0.06)'
    count-pill: 'pill-flat t-blue · mono · N selected'
    outside-pill: 'pill-flat · N outside current filter'
  modal:
    title: '{typography.modal-title}'
    widths: 'delete 560px · pending 600px · rename 720px · set-description 520px'
    delete-icon-tile: 'rose'
    delete-footer: 'bg hsl(var(--secondary) / 0.40) · mono M-step name'
  schema-expander:
    table-row: 'padding 10px 14px · cursor-pointer · hover bg hsl(var(--primary) / 0.035) · chevron rotates 90°'
    status-square: '8px · blue when any field is in the AI schema · muted / 0.45 when none'
    table-pills: 'N fields · N/N in AI (t-cyan all · t-amber some · t-slate none) · N synonyms (t-sky · only when > 0)'
    field-row: 'padding-left 44px · type dot + plain label · name 190px · Used/Unused pill · not reachable where unreachable'
    bulk-chips: 'Include all / Exclude all'
  synonym-chip:
    base: '11.5px · padding 3px 8px · radius {rounded.sm}'
    user: 'tone t-blue'
    generated-suggested-deleted: 'tone t-slate · uppercase 4-letter tag Gene / Sugg / Dele'
    deleted: 'strikethrough'
    remove: '× · aria-label Remove'
    add: 'dashed chip + add · at cap 20 → amber max 20 reached · counter N/20'
    inline: 'first 6 live · +N more expander'
  lineage-node:
    radius: 10px
    font: '{typography.lineage-node-text}'
    hot: 'border hsl(var(--primary) / 0.55) · ring 0 0 0 3px hsl(var(--primary) / 0.12)'
    dim: 'opacity 0.32'
  parse-card:
    content: 'stage list · live counts · progress bar · privacy line Nothing leaves your machine — parsing runs locally.'
    motion: 'discrete stage ticks — no keyframe animation'
  kpi-hues:
    objects: '{colors.blue-500}'
    backlog: '{colors.amber-500}'
    unused: '{colors.rose-500}'
    pending: '{colors.sky-500}'
    coverage: '{colors.emerald-500}'
    ai-reach: '{colors.cyan-500}'
    budget: '{colors.blue-500}'
    synonyms: '{colors.sky-500}'
    excluded: '{colors.amber-500}'
    verified: '{colors.emerald-500}'
  type-dots:
    table: '{colors.muted-foreground}'
    column: '{colors.blue-500}'
    measure: '{colors.emerald-500}'
    calc-col: '{colors.sky-500}'
    calc-group: '{colors.cyan-500}'
    calc-item: '{colors.cyan-500}'
    parameter: '{colors.amber-500}'
---

# PBI AI Prep — Design Spine

## Brand & Style

PBI AI Prep is a precision instrument for BI developers editing production semantic models. Its users describe tables, tune Copilot instructions, and trace lineage in files that ship to clients and get reviewed through `git diff`. The visual language is therefore a tool's language: data-dense, keyboard-first, quiet chrome around loud information. Nothing decorates; everything states.
Visual reference: [mockups/index.html](mockups/index.html) — the approved mockup, promoted verbatim. Where this spine and the mockup disagree, the spine wins.

The palette is **locked: blue family only — zero violet, zero fuchsia.** One blue family carries identity, selection, and attention; a small set of utility hues (amber, rose, emerald, slate) carries meaning, never mood. Color in this product is semantic: amber flags backlog and warnings, rose is reserved for destructive actions and broken references, emerald marks completed parse stages, grey states neutral facts. The tool surfaces facts, never a safety verdict — so no color ever judges the user's model.

The system is bespoke Tailwind 4 (no component kit). The frontmatter tokens are the CSS custom properties the mockup defines; opacity compositions reference them exactly as the mockup does — `hsl(var(--primary) / α)`, `hsl(var(--k) / α)` — so they adapt per mode. Dark mode is a user-initiated class toggle (`localStorage 'theme'`), never OS-driven. The product is Chromium desktop only, and says so in its footer.

## Colors

Values below are the exact HSL triplets from the mockup's CSS variables (light `:root` / dark `.dark`). Where the source names hex anchors, they are cited.

- **Background (`hsl(210 40% 98%)` / dark `hsl(222 47% 6%)`)** is the canvas. **Foreground (`hsl(222 47% 11%)` / dark `hsl(210 40% 98%)`)** is body ink. Near-neutral, slightly cool; the grid sits directly on it.
- **Card (`hsl(0 0% 100%)` / dark `hsl(222 40% 10%)`)** lifts every container: KPI cards, modals, chips, tooltips' triggers, the action bar, lineage nodes.
- **Primary (`hsl(221 83% 53%)` — blue-600 `#2563EB`; dark `hsl(217 91% 60%)` — blue-500 `#3B82F6`)** is the brand anchor: primary buttons, active tabs and chips, selection tints, focus ring, the header logo gradient, and the u0 used-count attention state. Never used for errors or warnings.
- **Secondary / Muted (`hsl(220 14% 96%)` / dark `hsl(217 33% 15%)`)** are quiet fills: modal footers, hover wells, disabled-adjacent surfaces.
- **Muted-foreground (`hsl(220 9% 46%)` / dark `hsl(215 20% 65%)`)** is secondary text: labels, placeholders, the t-slate pill tone, used counts at 1–5.
- **Accent (`hsl(199 89% 48%)` — sky-500 `#0EA5E9`; dark `hsl(199 89% 60%)`)** is the second identity hue: logo gradient tail, t-sky tone, synonym-count pills.
- **Destructive (`hsl(0 84% 60%)` / dark `hsl(0 72% 51%)`)** is the only red. Delete buttons, the delete dialog's icon tile and 'Breaks:' lines. It never means 'error information' — errors are named in text.
- **Border / Input (`hsl(220 13% 91%)` / dark `hsl(217 33% 18%)`)** draw every container and table rule at 1px. Table cell rules render the same token at 60% opacity.
- **Ring (`hsl(221 83% 53%)` / dark `hsl(217 91% 60%)`)** is the focus token: `:focus-visible` outline and the 3px field-focus halo at 14% opacity.
- **Identity step tokens** stay constant across modes and feed per-tile/per-tone hues: blue-50 `hsl(214 100% 97%)`, blue-100 `hsl(214 95% 93%)`, blue-200 `hsl(213 97% 87%)`, blue-500 `hsl(217 91% 60%)`, blue-600 `hsl(221 83% 53%)`, blue-700 `hsl(224 76% 48%)`; sky-500 `hsl(199 89% 48%)`, sky-600 `hsl(200 98% 39%)`; cyan-500 `hsl(189 94% 43%)`, cyan-600 `hsl(192 91% 36%)`; emerald-500 `hsl(160 84% 39%)`, emerald-600 `hsl(158 64% 40%)`; amber-500 `hsl(38 92% 50%)`, amber-600 `hsl(32 95% 44%)`; rose-500 `hsl(350 89% 60%)`. The source documents dark counterparts for the five identity hues as the next-lighter step: primary → blue-500 `#3B82F6`, sky-500 → sky-400 `#38BDF8`, cyan-500 → cyan-400 `#22D3EE`, emerald-600 → emerald-400 `#34D399`, amber-500 → amber-400 `#FBBF24`.
- **Delegated exact values, transcribed** — the mockup-fixed values this spine previously deferred to source. **KPI tile hues** `{components.kpi-hues}` — Description & Update: Objects blue-500, Backlog amber-500, Unused rose-500, Pending sky-500, Coverage emerald-500; Prep for AI: AI reach cyan-500, Budget blue-500, Synonyms sky-500, Excluded amber-500, Verified emerald-500. **Type-dot hues** `{components.type-dots}` — Table muted-foreground, Column blue-500, Measure emerald-500, Calc col sky-500, Calc group cyan-500, Calc item cyan-500, Parameter amber-500. **Fixed pill-tone text** (light / dark): t-blue `hsl(224 76% 42%)` / `hsl(213 94% 78%)`; t-sky `hsl(201 96% 32%)` / `hsl(198 93% 72%)`; t-cyan `hsl(192 82% 30%)` / `hsl(187 86% 72%)`; t-emerald `hsl(163 88% 26%)` / `hsl(152 76% 70%)`; t-amber `hsl(26 90% 34%)` / `hsl(46 96% 72%)`; t-rose `hsl(347 77% 42%)` / `hsl(351 95% 78%)`; t-slate stays token-driven (muted-foreground on secondary). **Used-pill text**: u0 light `hsl(224 76% 46%)` / dark `hsl(213 94% 78%)`; u6 dark `hsl(210 40% 88%)` (light = foreground).

Semantic discipline: amber means *attention/backlog* (Backlog KPI, 'No description yet', cascade-wave warnings, the 20-synonym cap) — never decoration. Rose means *destructive or broken* (delete, 'Breaks:', the Unused filter chip's dot). Emerald means *completed/verified* (parse check dots). Blue means *primary, selection, or zero-reference attention*. Grey means *fact* — used counts 1–5 are grey on purpose; volume is not virtue.

Two 'Unused' appearances coexist by design: the used-count **pill** for zero references is the blue attention state (FR-9), while the **'Unused' filter chip** carries a rose dot (mockup). Different components; both canonical.

Load-bearing text combinations — foreground on background and card, primary-foreground on primary, muted-foreground on card, and each pill tone's fixed text on its tone fill — target WCAG 2.1 AA (≥ 4.5:1); large figures ({typography.kpi-value}) target ≥ 3:1.

## Typography

**Inter** (400/500/600/700/800) is the only sans; **JetBrains Mono** (400/500/600) is the only mono. Body enables Inter's `cv11` and `ss01` features; mono contexts enable `tnum` and `zero`; anything that aligns numerically (KPI values, counters, the pager, Used pills) uses tabular numerals.

The ramp, smallest to largest: micro-label `{typography.micro-label}` (10.5px w650 uppercase, 0.06em tracking) for KPI labels and field captions; table-head `{typography.table-head}` (same treatment, sticky) for grid headers; pill `{typography.pill-text}` 11px w600; chip 12px w500; button 12.5px w550 line-height 1; tab and table-cell and field 13px; lineage node 12px; DAX cell `{typography.dax-cell}` 11.5px mono; modal title 14.5px; KPI value 26px w800; display (landing h1) 38px.

Rules: uppercase exists only at the micro-label/table-head scale — never in body copy or headings. JetBrains Mono is for DAX expressions, mono counters, file facts (`UTF-8 · CRLF`, M-step names like `PBIPreAI_RemoveUnusedCols`), and object names in dialogs — never for prose. Sanctioned exception: the `CustomInstructions` directive editor renders in JetBrains Mono (13px) — instructions are machine-read text, not prose. No font outside these two families, no weight outside the loaded sets.

## Layout & Spacing

Spacing inherits the **Tailwind 4 default scale with zero overrides**. The named tokens in frontmatter record the recurring usages: page gutter `{spacing.gutter}` (`px-4`), KPI card padding `{spacing.kpi-padding}` (`p-3.5`), KPI row gap `{spacing.kpi-gap}` (`gap-3`).

The app is three full-screen sections: landing → parse → app shell. The shell is a fixed **52px header** (logo tile, project chip + 'live' pill, nav tablist with mono counts, pending chip, primary Save, ghost theme toggle), a scrolling main region per tab, and a **32px footer** (`chromium · file-system-access · TMDL 4.2.0 · UTF-8 · CRLF · v1.0.0`). Split views use fixed side rails: instructions editor `[1fr_300px]`, lineage canvas `[1fr_290px]`. Every container is bounded by a 1px `{colors.border}` rule — depth comes from borders and tone, not from margins of shadow. Table cells are 42px tall with a bottom rule at 60% border opacity; the custom scrollbar is 9px with a 5px-radius thumb. The grid virtualises at any size — 2,000 rows is the baseline, not the stress case.

Landing and parse geometry: the landing centers a **max-w 1080px** container on a **`1.15fr / .85fr` split** (pitch column | open panel) with a 24px gap; the parse screen centers a single **420px-wide card at `p-7`** (28px padding). Progress on both screens is the four-stage stepper + bar only — **no spinner**: the mockup's dual-arc spinner mark and its in-progress ring spin are banned with the keyframes (see Elevation).

## Elevation & Depth

Two shadow tokens, tinted with foreground ink:

- **elev** — `0 1px 2px hsl(222 47% 11% / 0.04), 0 1px 3px hsl(222 47% 11% / 0.06)` — chips, action bar, resting cards.
- **elev-lg** — `0 4px 6px -1px hsl(222 47% 11% / 0.07), 0 10px 24px -4px hsl(222 47% 11% / 0.10)` — modals and scrims. Dark mode swaps the tint to pure black at higher opacities (0.3/0.35 for elev, 0.4/0.5 for elev-lg) and adds a wider `0 12px 28px -4px` layer on elev-lg.

Sanctioned micro-interactions, and the only ones: **KPI hover** (`translateY(-2px)`, border in the tile hue at 35%, colored shadow `0 6px 18px -6px hsl(var(--k) / 0.30)`) and **150ms transition-colors** on hoverable chrome. The primary button's hover glow (`0 2px 10px -2px hsl(var(--primary) / 0.5)`) is part of the mockup's locked button spec.

Banned everywhere: **backdrop-filter**, **radial gradients**, **keyframe animations**, **card glows** (ambient halos behind cards). Progress and state changes communicate through discrete state — stage ticks, check dots, bar fill, border and tint changes — not motion. Linear gradients are permitted only as identity marks — the header logo tile (135°, primary → sky-500), the KPI cards' 2px top bar, and the landing hero's gradient word (`background-clip: text`, 100°, primary → cyan-500) — plus one functional exception: **progress-bar fills** (90°, blue-500 → primary). No other gradient use.

## Shapes

The system is **1px borders and a 6–14px radius band**. `--radius` is `0.625rem` (10px); the scale derives from it — `{rounded.lg}` = 10px, `{rounded.md}` = radius − 2px = 8px, `{rounded.sm}` = radius − 4px = 6px — with `{rounded.full}` (9999px) reserved for pills and the switch track.

Component radii inside the band: synonym chips 6px (`{rounded.sm}`), chips 7px, buttons and fields 8px (`{rounded.md}`), KPI icon tiles 9px, lineage nodes and the action bar 10px, cards 12px (0.75rem), KPI cards 14px (0.875rem). Nothing is sharper than 6px or rounder than 14px except two sanctioned exceptions: the pill/full 9999px, and the **AI-instructions editor card + verified-answers card at 16px (1rem — user-approved above the band)**. Edges stay crisp: a 1px border on every container, and imagery/gradients clip to their container's radius (the logo tile, KPI top bars).

## Components

Control micro-states — the precision layer, exact from the mockup: ghost hover fills secondary with foreground text; chip hover shifts text to foreground (border already primary/45); tab hover fills secondary and darkens text; outline buttons rest on card fill; the sorted grid header takes a primary tint with an 8px arrow at .75 opacity; the header project chip is a borderless secondary-fill variant truncating at 190px; pending-row field pills are flat t-blue; placeholders render muted-foreground at 80%; scrollbar thumbs hover to muted-foreground/45; switch knobs carry a `0 1px 3px` black/30 shadow; `:focus-visible` outlines take a 6px radius around the 2px ring at 2px offset; tooltips shadow `0 8px 20px -6px` black/35 and float 8px above the trigger at z-60; deleted synonyms hold opacity .6; expanded schema bodies fill secondary/25. Per-control transitions run 110–150ms in the mockup; this spine normalizes to 150ms.

- **Button** — base `{components.button-base}`: 12.5px w550, 8×13 padding, `{rounded.md}`, inline-flex with 6px gap; `button-sm` at 6×10/12px. Variants: **primary** `{components.button-primary}` (hover to blue-700, dark blue-500, plus the sanctioned glow); **ghost** (transparent, no border — theme toggle, Clear, Cancel, Keep editing); **outline** `{components.button-outline}`; **danger** `{components.button-danger}` (destructive fill, hover brightness 0.93 + glow — delete only). Disabled: opacity 0.45, pointer-events none.
- **Chip** — `{components.chip}`: filter chips ('All 209', 'Empty 180', 'Unused 24') and micro-actions. `.on` state fills primary/10% with primary text w600. Dots inside chips use tone colors (amber for Empty, rose for Unused).
- **Field** — `{components.field}`: text inputs, search, rename inputs. Focus draws the ring border plus a 3px halo at 14%.
- **Switch** — `{components.switch}`: 40×22 track, 16px knob traveling 18px. Carries `role="switch"` + `aria-checked` + an accessible label ('AI include') — the spine fixes what the mockup left implicit.
- **Tab** — `{components.tab}`: header nav tabs and the two Prep-for-AI sub-tabs. Active tab fills primary/10%. Header tabs carry mono counts ('209') or pills ('54/209') where the mockup shows them. The 11.5px muted sub-tab hint swaps with the active sub-tab: 'Grounding rules Copilot reads before every answer.' (AI instructions) ↔ 'Choose what Copilot can reach, field by field, and teach it your terms.' (AI schema & synonyms).
- **Pill** — `{components.pill}`: 11px w600, 2×8 padding, full radius, 5px leading dot (`pill-flat` omits it). Seven tones `{components.pill-tones}` — t-blue, t-sky, t-cyan, t-emerald, t-amber, t-slate, t-rose — each a 12–14% tone fill (t-amber 14%, the rest 12%), 1px tone border, and a fixed per-mode text value, transcribed exactly in §Colors and tokenized as `{components.pill-tones.text-sky-light}` etc. Tone meanings: t-cyan fully-included tables, t-amber partially-included, t-sky synonym counts, t-slate neutral states, t-rose broken/destructive.
- **Used-count pill** — `{components.used-pill}`: the inverted scale. **u0** (0 references) is the blue attention state — *unused is the thing this tab wants you to see*. **u1** (1–5) is grey t-slate. **u6** (6+) is grey t-slate at w650. Never a heat scale; never green.
- **KPI card** — `{components.kpi-card}`: card fill, 1px border, 14px radius, the **2px top gradient bar in the tile's own hue — the card's identity signature** — a 34px icon tile, `{typography.kpi-value}` figure, `{typography.micro-label}` label, and a one-line plain-English definition. Tile→hue assignments are fixed, `{components.kpi-hues}`: Description & Update — Objects blue, Backlog amber, Unused rose, Pending sky, Coverage emerald; Prep for AI — AI reach cyan, Budget blue, Synonyms sky, Excluded amber, Verified emerald. Hover is the sanctioned lift.
- **Data grid** — `{components.data-grid}`: sticky uppercase header, 42px cells, row hover at primary/3.5%, selected rows at primary/7%, lineage icon fading in on row hover. Columns in PRD order: checkbox, lineage icon, type (colored dot + plain label, no background — dot hues fixed per type, `{components.type-dots}`), parent table, name, rename-to input, Used, description, DAX. Tables are first-class rows; hidden objects carry a visible marker (see EXPERIENCE.md).
- **Editable cell** — `{components.editable-cell}`: rename input (12px, placeholder 'rename…', non-empty border primary/60%); description cell truncated at 300px with the italic-amber 'No description yet' empty state; DAX cell in truncated mono with '—' when empty.
- **Tooltip** — `{components.tooltip}`: dark bottom-anchored body with 5px arrow; DAX variant is a right-anchored scrollable mono pane with the arrow hidden. Used-pill content: 'No downstream references of any kind' / 'N dependents · direct D · transitive T · leaf L'. Triggers open on hover **and keyboard focus**.
- **Action bar** — `{components.action-bar}`: floating bar (card fill, primary/40% border, elev shadow, 10px radius) with the flat mono t-blue 'N selected' pill, the 'N outside current filter' pill, the seven actions, and Clear. Appears only when a selection exists.
- **Modal** — `{components.modal}`: scrim + card, Escape and click-outside to close, 14.5px title. Widths: delete 560px, pending 600px, rename 720px, set-description 520px. The delete dialog carries the rose icon tile and the mono M-step footer; **its title states the fact — 'These N object(s) have no downstream references.' when the selection is clean, 'N of M selected object(s) are still referenced.' when any are — and the confirm button reads 'Remove N objects', growing with the wave checkbox.**
- **Schema expander** — `{components.schema-expander}`: collapsible table rows (chevron rotating 90°, 8px status square: blue when any field is in the AI schema, muted/45% when none), tone pills for field/synonym totals, per-field rows with type dot, name, Used/Unused pill, 'not reachable' where applicable, and Include all / Exclude all chips.
- **Synonym chip** — `{components.synonym-chip}`: state-labelled chips — User (t-blue); Generated/Suggested/Deleted (t-slate, uppercase 4-letter tags 'Gene'/'Sugg'/'Dele'); Deleted renders strikethrough. '×' remove with aria-label 'Remove'; dashed '+ add' chip; 20-live cap with 'N/20' counter and the amber 'max 20 reached' state; first 6 inline, '+N more' expander.
- **Lineage node** — `{components.lineage-node}`: absolute card, 10px radius, 12px text, **150px wide, with an 8px rounded-sm type dot, a mono meta line, and a flat type pill**. Focused node gets the primary/55% border + 3px primary/12% ring (`.hot`); off-path nodes dim to 0.32 opacity (`.dim`). Distinct marks for field-parameter and calculation-group tables; inactive relationships visually distinguished (per mockup source).
- **Parse card** — `{components.parse-card}`: 'Preparing your model', live counts ('0/30 tables · 0/209 objects'), the four-stage list (Definition tree, Model objects, Lineage graph, Report layer) with emerald check dots, progress bar, and the privacy line. Stages tick discretely — no animation.
- **Landing screen** — the product's only self-statement; two columns on the landing grid (1080px max-w, 1.15fr/.85fr — see Layout & Spacing). Left column, top to bottom:
    - **Brand lockup** — 36px gradient logo tile + wordmark **'PBI AI Prep'** (15px extrabold tracking-tight on landing; 13.5px bold in the header) over the tagline **'Semantic model studio'** (10px w600, 0.14em uppercase, muted-foreground).
    - **Hero headline** — 'Make your Power BI model AI-ready in one pass.' at `{typography.display}` (38px/1.1, extrabold, −0.02em tracking) with **'AI-ready' as a 100° primary → cyan-500 `background-clip: text` gradient word** (sanctioned linear-gradient exception — see Elevation).
    - **Narrative paragraph** — 14.5px relaxed muted-foreground, max-width 52ch: 'Bulk-edit descriptions, write the Copilot instructions your business actually speaks, and see what every field touches — straight from a folder on your disk. Nothing uploaded. Nothing installed.'
    - **Feature cards** — three 12px cards at p-3.5 with 28px rounded-lg icon tiles on hue/12 fills: **Bulk descriptions** — 'Type down 2,000 rows. Keyboard only.' (blue-500/12 fill, primary glyph); **Copilot instructions** — 'Synonyms, AI schema, 10k budget.' (cyan-500/12, cyan-600 glyph); **Real lineage** — 'Every edge. Find what nothing uses.' (sky-500/12, sky-600 glyph). Titles 12.5px semibold, bodies 11.5px muted.
    - **Trust row** — 11.5px muted-foreground items with emerald-500 check glyphs: '100% local parsing' · 'Byte-exact TMDL' · 'Reviewable Git diff'.
    - **Capability badge (supported state)** — emerald tile: bg emerald-500/9%, 1px emerald-500/24% border, 10px radius, p-3; emerald-600 check glyph + 12.5px semibold emerald-600 title 'Chrome 122 — fully supported'; 11.5px muted body 'File System Access API available. Edits save directly to disk.'
    - **Recent-project card** — full-width card, p-3, 32px rounded-lg icon tile (first card: blue-500/12 fill with primary glyph; the rest: secondary fill with muted-foreground glyph), 12.5px semibold truncated name, 11px mono meta 'N tables · N objects · relative time' ('30 tables · 209 objects · 4m ago'), trailing muted chevron; hover border primary/45.
- **Pager** — 28×28px buttons (min-width 28px, 0 7px padding), 7px radius, 12px w600 muted-foreground; hover fills secondary with foreground text; current page = primary/10 fill + primary text + 1px primary/35 border; disabled opacity .35, cursor not-allowed; '…' ellipsis dots muted 12px. Footer 'Showing X–Y of Z' at 11.5px muted with the figures in foreground weight, tabular numerals.
- **Lineage edges & canvas** — active edges: 1.8px solid primary at 75% opacity with an auto-oriented 9×9 arrowhead marker filled primary at .75; inactive edges: border-colored 1.6px dashed (4·3), no arrowhead. Canvas floor is the dot-grid: 1px primary/13% dots on a 22px grid (`.dots`). Bottom-left legend card: bg card/85%, 1px border, rounded-lg, px-2.5 py-1.5, 10.5px muted entries with 8px rounded-sm dots — column blue-500 · measure emerald-500 · visual cyan-500 · calc group sky-500. Toolbar: 'Focused' chip (muted label + mono semibold foreground object name) beside the trailing 11.5px muted note 'Column-level · upstream + downstream'.
- **Lineage side panel** — 'Selected' header (mono bold object name, flat type pill, flat Used pill) above the dependency list: label groups 'Downstream · N' / 'Upstream · N'; rows pair a 6px type-colored dot with the object name and a right-aligned 10.5px muted tag — direct / transitive / leaf (downstream) or rel key (upstream); long groups truncate behind '+ N more'; a Description block carries the object's description in 12px muted. Footer: full-width 'Select & return to grid' outline button.
- **Verified-answers rail** — header 'Verified answers' (13px bold) + 'N · read-only' (11px muted); rows: 12.5px semibold question over a 10.5px muted line holding a flat t-cyan pill naming the visual type (barChart / lineChart / table / gauge) and '+N prompts'; footer 'Authored in Power BI. Shown here so instructions do not contradict them.' This card and the AI-instructions editor card render at the sanctioned 16px radius (see Shapes).
- **Progress bar** — 6px tall, full-radius track on `{colors.secondary}`; fill = 90° linear-gradient blue-500 → primary, width easing 400ms. One spec shared by the parse card, the Coverage and AI-reach KPI cards and their inline mini-bars, and the Budget gauge. Gradient fills are whitelisted for progress bars only (see Elevation).

## Do's and Don'ts

| Do | Don't |
|---|---|
| Keep the palette blue-family — blues, plus amber/rose/emerald/slate utility tones | Introduce violet or fuchsia anywhere (locked palette) |
| Invert the used-count scale: u0 blue attention, u1 grey, u6 grey strong | Render used counts as a heat scale or success gradient |
| Give every KPI card its 2px top identity bar in a fixed tile hue | Ship a KPI card without its identity hue, or randomize hues between renders |
| Draw depth with 1px `{colors.border}` rules and tone | Use backdrop-filter, radial gradients, keyframe animations, or card glows |
| Limit motion to KPI hover shadow + 150ms transition-colors | Add spinners, fades, or entrance animations (even for parse progress) |
| Pair every core token with its `-dark` value; toggle by user choice only | Follow `prefers-color-scheme` or ship a token without a dark pair |
| Use tabular numerals for every aligned figure | Set counters, pills, or the pager in proportional digits |
| Reserve rose for destructive and broken-reference semantics | Use rose for emphasis, or amber as decoration |
| Set DAX, counters, and file facts in JetBrains Mono | Set prose or headings in mono |
| Mark object types with a colored dot + plain label | Use filled type badges or background color behind type text |
| Keep radii inside the 6–14px band (pill + sanctioned 16px exceptions) | Mix sharp corners, 2px borders, or oversized rounding |
| State errors in text naming file, value, expectation | Introduce a new semantic color for errors |
