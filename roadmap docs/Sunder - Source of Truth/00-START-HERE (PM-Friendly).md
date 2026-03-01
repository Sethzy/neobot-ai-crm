# Sunder Source of Truth (Start Here)

This folder is the single source of truth for Sunder product development documents.

## Authority Chain (What Wins in Conflicts)

1. **`product-dev/01-App Spec.md`** — the canonical app specification. Wins on product behavior, architecture, phasing, and scope.
2. **`architecture/architecture-decisions-checklist.json`** — 154 approved architecture decisions across 18 categories. Wins on all technical implementation details.
3. **Implementation plan** at `docs/product/plans/` (repo root) — PR-by-PR execution order across 5 phases. Two formats: `2026-03-01-implementation-phasing-plan.md` (prose) and `2026-03-01-implementation-phasing-plan.json` (checkable task list).
4. Everything else is supporting reference material.

## Folder Layout

### `product-dev/`
The app spec. One document that defines what we're building, how it works, and how it gets built.

### `architecture/`
- `architecture-decisions-checklist.json` — 154 decisions across 18 categories (Foundational Infra, LLM Routing, Data, Execution, Runner, Tools, Skills, Triggers, Sessions, Memory, Safety, Connections, Services, UX, Tasklet Alignment, Scaling, Evaluation, Gaps).
- `02b-Infrastructure Blueprint (Tasklet Native).md` — reference doc showing how Tasklet's architecture works. Used for side-by-side comparison, not as Sunder's spec.
- `04-Savoir Extraction Guide.md` — approved code patterns extracted from Vercel's Savoir template.

### `services/`
- `01-Built-In Services (Imported from RE-AI-CRM).md` — detailed service catalog (16 services, integration patterns, API verification notes, code examples).
- `02-Unit Economics Model ($20 Target vs Actual).md` + 3 CSVs — cost model per active user.

### `ux-and-pm/`
- `01-Mission Control UX Spec (Draft).md` — UI behavior draft. Chat is home, Mission Control is control surface.
- `02-PM Product Blueprint (Non-Technical, Diagram Pack).md` — non-technical product narrative with ASCII diagrams for PM/design/GTM alignment.

### `references/`
Raw source materials organized by platform:
- `tasklet/` — 100+ files: core architecture, tools, skills, workflows, system prompts, persistence model.
- `Fintool/` — 14 strategic articles + screenshots (Nicolas Bustamante, Jesse Provo, etc.).
- `claude/` — Claude Code memory system, system prompts, tool definitions, design lessons.
- `openclaw/` — OpenClaw patterns and PM master list.
- `Agents Overview/` — 5-level agent taxonomy, build order checklist, source extracts.
- `Agent SDKs and Harnesses/` — model-harness coupling research.
- `Tool-Infrastructure-Comparison/` — Dorabot vs OpenClaw vs Nanobot tool infra comparison.
- `notion-agents-ux-test-notes.md` — Notion's agent builder UX patterns (competitive research).

### `archive/`
Historical documents from earlier iterations. Kept for context only. Do not use for new decisions.
- Previous v1/v2/v3 app specs (superseded by unified app spec)
- Original infrastructure blueprint (superseded by architecture decisions JSON)
- Tasklet delta register (superseded by architecture decisions JSON)
- Fintool comparison doc (superseded by architecture decisions JSON)
- Legacy Markov chain analysis artifacts

## Recommended Read Order (New Developer)

1. **This file** (you're here)
2. `product-dev/01-App Spec.md` — the full product and architecture spec
3. `architecture/architecture-decisions-checklist.json` — browse decisions by category
4. `docs/product/plans/2026-03-01-implementation-phasing-plan.json` (repo root) — PR execution checklist. See also the `.md` prose version in the same folder.
5. `services/01-Built-In Services (Imported from RE-AI-CRM).md` — service integration details
6. `references/tasklet/README.md` — understand the Tasklet patterns we follow
