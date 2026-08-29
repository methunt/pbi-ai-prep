---
title: "Product Brief: PBI AI Prep"
status: ready-for-review
created: 2026-08-28
updated: 2026-08-28
---

# Product Brief: PBI AI Prep

## Executive Summary

PBI AI Prep is a zero-install web tool that opens a Power BI PBIP project folder from local disk, lists every model object in one editable grid, and writes renames, descriptions, synonyms, and AI instructions straight back into the TMDL files. Nothing uploads anywhere. It is a React app built with Vite and served as static files from GitHub Pages; the browser does the parsing and the writing through the File System Access API.

Preparing a semantic model for Copilot is now a documented, checklist-driven job: business-friendly names, a description on every visible object, synonyms, AI instructions, a trimmed AI data schema. The tooling to do that work is worse than the guidance. Power BI Desktop's "Prep data for AI" dialog handles one field at a time and demands a running Desktop instance; Tabular Editor bulk-edits descriptions but needs a Windows install and does not author the linguistic schema (LSDL) at all. Nothing writes the LSDL blob and the table metadata in the same pass, and nothing does it without an install.

The gap is verified: the two existing browser-based PBIP tools ([PBIP Documenter](https://jonathanjihwankim.github.io/pbip-documenter/), PBIP Lineage Explorer) use the same File System Access technique but are read-only viewers. This project makes that technique write, and reuses their MIT-licensed read path rather than rewriting it.

## The Problem

A BI developer told to "make the model Copilot-ready" faces a 2,000-object model and a per-field dialog.

**Descriptions are the bulk of the work and the worst-supported.** Every visible table, column, and measure wants a description, front-loaded with disambiguation because Copilot reads only the first 200 characters. Humans read the rest, so the editor allows up to 500 and shows where the 200-character cutoff falls. In Power BI Desktop this means selecting an object, finding the properties pane, typing, repeating. Two thousand times.

**The AI-specific artifacts live elsewhere.** AI instructions, synonyms, and the AI data schema selection are not table metadata — they sit in a single JSON blob inside `definition/cultures/en-US.tmdl`. Editing them means either the Desktop dialog or hand-editing a 24,000-line TMDL file. There is no middle path.

**Install friction blocks the obvious answer.** Tabular Editor is the standard tool for bulk metadata work, and on a locked-down corporate laptop it is not installable without a ticket. Semantic Link Labs needs a Python or Fabric runtime. Every capable tool assumes privileges many analysts do not have.

**Models ship unprepared.** Copilot then reads `TR_AMT` literally, picks the wrong measure, and users conclude the AI does not work.

## The Solution

Open a folder. Get a grid. Edit. Save.

**Three tabs, matching how the work splits.**

*Description & Update* — one row per model object: table, column, calculated column, field parameter, measure, calculation group. Columns for current name, new name, description, and DAX expression (read-only, for context when writing a description). Sortable, filterable, keyboard-navigable. Empty descriptions surface first, because that is the backlog.

*Prep for AI* — the LSDL surface. Edit the AI instructions text against the 10,000-character budget. Manage synonyms per object. Toggle which objects the AI data schema exposes. View existing Verified Answers and their trigger prompts.

*Relationships* — the model as a canvas. Star-schema layout with field-parameter and calculation-group tables marked distinctly, tables expanding to their columns, and click-through in both directions: pick a column and everything off its path dims, showing the measures and visuals that depend on it; pick a visual and walk back to the columns feeding it. Read-only. It belongs here because a description is easier to write when you can see what a field joins to and where it is used.

**Writes land in place.** The File System Access API gives readwrite access to the picked folder; `createWritable()` swaps files atomically, so a half-written TMDL is not a failure mode. Changes appear as a normal Git diff for review before publishing.

**AI assistance is optional and yours.** No LLM by default and no key bundled. Paste your own OpenAI-compatible key and the tool can draft descriptions in bulk or propose AI instructions from the model shape. Requests go browser-to-provider; the key sits in your browser and nowhere else.

## What Makes This Different

**Zero install, so it works where the alternatives cannot.** No admin rights, no MSI, no Python. That is the entire reason this exists and the only moat that matters — and not a technical one: the File System Access API is public.

**One pass across both metadata layers.** Table TMDL and culture LSDL edited in the same session, from the same grid. Every other tool does one or the other.

**Bulk where incumbents are single-object.** The Prep data for AI dialog is a form. This is a spreadsheet.

**Overlap with Semanticus is real.** [Semanticus Studio](https://semanticus.com.au) already ships AI-readiness scoring with categories, findings, and safe-fix automation — and gates the good parts behind Pro. This project is free, open source, and narrower: it edits, it does not score. The differentiation is price, openness, and scope, not capability.

**Microsoft overlap risk is bounded but not zero.** TMDL View on the web only reaches cloud-hosted Fabric models, never local disk, so it cannot replace this. The Desktop Prep data for AI dialog does write the same artifacts — if Microsoft ships a bulk grid, the descriptions half of this tool loses most of its reason to exist.

## Who This Serves

**The BI developer inheriting a model.** Owns a 2,000-object model built before anyone cared about Copilot. Needs to fill hundreds of descriptions this week. Success is finishing in an afternoon instead of a fortnight, and seeing the diff before it goes anywhere near production.

**The analyst on a locked-down laptop.** Cannot install Tabular Editor. Today the answer is "raise a ticket" or "do it in Desktop, slowly." Success is doing real bulk metadata work with only a browser.

**The consultant working across many client models.** Different tenants, different machines, no install rights anywhere. Success is a bookmark that works everywhere.

**Secondarily, the author.** This is a portfolio project. Success partly means the code and the architecture are worth showing.

## Success Criteria

1. A 2,000-object model loads and renders a responsive grid in under 5 seconds.
2. Round-trip integrity: opening a PBIP, saving with no edits, produces a byte-identical folder. `lineageTag` GUIDs, annotations, CRLF endings, and tab indentation survive untouched. This is the correctness bar — a tool that breaks report bindings is worse than no tool.
3. A model edited here opens cleanly in Power BI Desktop with every change present.
4. Filling 100 descriptions takes under 10 minutes with keyboard navigation.
5. Community signal: the repo gets used by someone other than the author. [ASSUMPTION] No numeric target set.

## Scope

**In, first version:**
- Folder open via File System Access API; PBIP with PBIR report format only
- Parse `definition/tables/*.tmdl` into a flat object grid — tables, columns, calculated columns, measures, field parameters, calculation groups, hierarchies
- Edit and write names and descriptions (`///` doc comments, matching Power BI's own convention), allowing up to 500 characters with the 200-character Copilot cutoff marked
- Edit and write the LSDL blob: `CustomInstructions` with a live 10,000-character counter, synonyms (`Terms`), and AI-schema visibility (`Visibility.Value`) per entity
- Read-only view of Verified Answers and their trigger prompts
- Read-only relationship and lineage diagram: star-schema layout, field-parameter and calculation-group marking, column-to-visual impact tracing
- Optional BYOK, OpenAI-compatible, off by default
- Byte-fidelity round-trip guard as an automated check

**Explicitly out:**
- Firefox and Safari. No directory picker exists there; the product mandates Chromium. Detect and say so plainly rather than half-supporting it.
- Legacy `model.bim` / TMSL models, and PBIP projects on the older report format. PBIR or unsupported.
- Writing Verified Answers. They are on disk under `VerifiedAnswers/definitions/<guid>/` with visual bindings and theme metadata — authoring those correctly is a report-layer problem, not a metadata problem.
- Live XMLA connections, publishing, refresh. This tool touches files. Publishing and refreshing stay the user's job in Power BI — and are required for LSDL changes to reach Copilot.
- Readiness scoring, BPA rules, grading. Semanticus does that. [ASSUMPTION] Deliberately ceded, not deferred.
- DAX editing. The grid shows expressions for context; it does not accept edits to them.

**Delivery basis:** the 2–4 day target holds because both halves of the read side already exist under MIT licence. [PBIP Documenter](https://github.com/JonathanJihwanKim/pbip-documenter) parses `database.tmdl`, `model.tmdl`, `tables/*.tmdl`, `relationships.tmdl`, `roles/*.tmdl`, `expressions.tmdl`, and PBIR visual JSON. [Lineage Tracer](https://github.com/methunt/lineage-tracer) — the author's own project — vendors those parsers, reshapes their output into a node/edge graph, and ships the whole viewer: canvas, expandable nodes, path dimming, per-node detail panel with DAX and visual usage, search, and report page layout. The remaining work is the write path: byte-exact TMDL serialisation, the LSDL blob, the editable grid, a readwrite file layer to replace Lineage Tracer's read-only one, and the BYOK calls.

## Vision

Bookmark it, open a model folder, and the model is AI-ready — from any machine, with no install and no upload.

Nearer term, the same primitives extend to a diff preview before writing, a `///`-description generator that reads the DAX to draft its own first pass, translation-culture editing, and templates that carry a house style for descriptions across many models. Further out, if the File System Access API ships beyond Chromium, the platform constraint disappears and the tool becomes simply "the web editor for Power BI model metadata."
