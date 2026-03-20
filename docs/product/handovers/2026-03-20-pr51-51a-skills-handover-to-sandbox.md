# PR 51 + 51a Skills System — Handover to Sandbox Dev

**Date:** 2026-03-20
**Context:** PR 51 (instruction skills backend) and PR 51a (frontend skills page) are implemented on local `main`. This handover explains what was built so the sandbox dev has full context before starting `analyze_spreadsheet` and `publish_artifact`.

---

## What Was Built

### PR 51: Instruction Skills (Backend)

Users get 7 pre-installed RE workflow skills. The agent discovers them, loads them on demand, and follows their instructions using existing tools. No sandbox involved — these are pure instruction files.

**How it works:**

```
Session starts → assembleContext() → loadSystemPromptState()
  → bootstrapSkills()       seeds 7 defaults to Supabase Storage (first login only)
  → discoverUserSkills()    lists {clientId}/skills/, parses YAML frontmatter
  → buildSystemPrompt()     injects <available-skills> block (~200 tokens)

User says "prep me for my call with David Tan"
  → model scans <available-skills>, matches "call-prep"
  → calls read_file("/agent/skills/call-prep/SKILL.md")
  → follows the workflow: search_crm → web_search → generate prep brief
```

**Key files:**

| File | What it does |
|---|---|
| `src/lib/runner/skills/skill-templates.ts` | All skill content as string constants (7 defaults + 2 system skills). Also exports `isDefaultSkillSlug()`, `getDefaultSkillContent()`. **Single source of truth** — no `.md` files on disk. |
| `src/lib/runner/skills/discover-skills.ts` | `parseFrontmatter()` (real YAML via `yaml` package), `discoverUserSkills()`, `getSkillContent()`, `validateSkillContent()`, `SkillMetadata` and `SkillDetail` types. |
| `src/lib/runner/skills/skill-bootstrap.ts` | `bootstrapSkills()` — seeds defaults from string constants to Supabase Storage. Process-cached, idempotent, mirrors `bootstrapMemoryFiles()` error semantics. |
| `src/lib/runner/skills/system-skills.ts` | System skill fallback for `read_file`. Now reads from `SYSTEM_SKILL_CONTENT` string constants (no `readFile` from disk). Synchronous. |
| `src/lib/runner/context.ts` | Modified — `loadSystemPromptState()` calls `discoverUserSkills()`, passes results to `buildSystemPrompt()`. Both `assembleContext()` and `assembleSystemOnly()` get skills (main runner + subagents). |
| `src/lib/ai/system-prompt.ts` | Modified — added `<custom-skills>` instruction block telling the model how to use skills. |
| `src/lib/storage/agent-files.ts` | Modified — `assertWritable()` allows writes to `skills/{slug}/*` but blocks `skills/system/*` and `skills/connections/*`. |
| `src/lib/memory/bootstrap.ts` | Modified — calls `bootstrapSkills()` at the end of `bootstrapMemoryFiles()`. |

**Storage layout:**

```
Supabase Storage: agent-files bucket
{clientId}/
├── SOUL.md, USER.md, MEMORY.md, memory/    ← existing
└── skills/
    ├── system/           ← read-only, served from string constants (fallback in read_file)
    ├── connections/      ← read-only, per-connection skill files (existing system)
    ├── call-prep/        ← user skill (bootstrapped default, editable)
    │   └── SKILL.md
    ├── daily-briefing/   ← user skill
    │   └── SKILL.md
    ├── draft-outreach/   ← user skill
    ├── pipeline-review/  ← user skill
    ├── listing-analysis/ ← user skill
    ├── call-summary/     ← user skill
    └── market-briefing/  ← user skill
```

**Critical pattern — no filesystem reads at runtime:**

All bundled skill content is inlined in `skill-templates.ts` as TypeScript string constants. This was learned the hard way — `readFile` + `__dirname` breaks in Next.js bundles because webpack compiles routes into `.next/server/` where `.md` files don't exist. Same pattern as `src/lib/memory/templates.ts`. See `docs/product/handovers/2026-03-19-pr51-skill-bundling-fix.md` for the full bug trace.

### PR 51a: Frontend Skills Page

Users manage skills through the UI. Chat shows when a skill is active.

**What it does:**

| Feature | Route / File |
|---|---|
| Skills list page | `app/(dashboard)/skills/page.tsx` — server component, calls `discoverUserSkills()` |
| Skill editor | `app/(dashboard)/skills/[slug]/page.tsx` + `skill-editor-form.tsx` — textarea with save + reset |
| Server actions | `src/lib/runner/skills/skill-actions.ts` — `saveSkillContent()` (validates frontmatter), `resetSkillToDefault()` (returns content for explicit state update) |
| Sidebar nav | `src/components/layout/app-sidebar.tsx` — "Skills" replaces "Mission Control" in AGENT section |
| Chat badge | `src/components/chat/message-bubble.tsx` — `extractSkillSlug()` detects `tool-read_file` parts matching `/agent/skills/{slug}/SKILL.md`, renders Badge |

**Key design decisions:**

- Frontmatter validation on save — rejects empty name/description, prevents bricking a skill
- Reset-to-default gated to `DEFAULT_SKILL_SLUGS` only — custom skills show no reset button
- Reset updates `useState` explicitly (`setContent(result.content)`) — doesn't rely on `router.refresh()`
- Chat badge excludes `system/` and `connections/` skill reads — only user instruction skills
- `validateSkillContent()` lives in `discover-skills.ts` (not the `"use server"` file) to avoid Next.js sync-export constraint
- Writes go through `createAgentFileClient().uploadFile()` — same `assertWritable` guard as the agent

---

## What the Sandbox Dev Needs to Know

### The design doc

`docs/product/designs/sandbox-skill-execution.md` — read this end-to-end. It covers:
- Two tools: `analyze_spreadsheet` + `publish_artifact`
- Two snapshots: `snap_excel` (Python + LibreOffice + xlsx skill) + `snap_artifact` (Node + Vite + React template)
- Vercel Sandbox snapshots API
- Claude Code CLI inside sandbox with `--dangerously-skip-permissions`
- User skill files loaded at runtime from Supabase Storage
- Full execution flows, cost model, security model, reference repos

### How sandbox skills relate to instruction skills

Instruction skills (PR 51) and sandbox skills are **separate systems** that share storage:

```
Instruction skills (PR 51):           Sandbox skills (design doc):
  Agent reads SKILL.md                  Sandbox reads SKILL.md
  Uses existing tools (CRM, search)     Claude Code CLI writes + runs code
  No sandbox, ~free                     Vercel Sandbox, ~$0.10-0.60/invocation
  read_file loads the skill             Skill files copied into sandbox filesystem

Both store user preferences at:
  {clientId}/skills/re-analyst/SKILL.md
  {clientId}/skills/frontend-design/SKILL.md
```

The user's `re-analyst/SKILL.md` is the same file in both systems. When the instruction skill system handles a simple question ("what's my net yield benchmark?"), it uses the file via `read_file`. When the sandbox handles a spreadsheet analysis, the same file is downloaded from Storage and written into the sandbox filesystem before Claude Code CLI runs.

### What's already available for sandbox work

| Need | Status |
|---|---|
| `discoverUserSkills()` | Done — reusable for listing skills to load into sandbox |
| `getSkillContent()` | Done — loads full SKILL.md content from Storage |
| `parseFrontmatter()` | Done — real YAML parser (`yaml` package) |
| `createAgentFileClient()` | Exists — for uploading output files back to Storage |
| `isDefaultSkillSlug()` | Done — for identifying bundled defaults |
| Storage path conventions | Established — `{clientId}/skills/{slug}/SKILL.md` |
| Write boundary | Done — user skills writable, system/connection read-only |
| `skill-templates.ts` pattern | Established — if sandbox needs bundled content, inline as strings |

### What the sandbox dev builds (NOT done yet)

1. `@vercel/sandbox` integration — `Sandbox.create()`, `runCommand()`, snapshots
2. Snapshot build scripts — `scripts/build-snapshot-excel.ts`, `scripts/build-snapshot-artifact.ts`
3. `analyze_spreadsheet` tool — in `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts`
4. `publish_artifact` tool — in `src/lib/runner/tools/sandbox/publish-artifact.ts`
5. Anthropic xlsx skill content inlined (from `/Users/sethlim/Downloads/xlsx/`) — follow the `skill-templates.ts` pattern
6. Pre-scaffolded React template for artifact publishing

### Reference repos

| Repo | What to take |
|---|---|
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | `@vercel/sandbox` API, `Sandbox.create()`, `runCommand()`, agent CLI inside sandbox, snapshot workflow |
| [firecrawl/open-lovable](https://github.com/firecrawl/open-lovable) | Sandbox provider interface, Vite scaffolding, live preview |
| [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) | DCF model skill — gold standard for financial analysis skill structure |

### Test coverage (48 backend + 30 chat = 78 tests)

All in `src/lib/runner/skills/__tests__/` and `src/components/chat/message-bubble.test.tsx`. QA scenarios in `docs/qa/25-instruction-skills.md` (28 scenarios).

---

## Files Changed (complete list)

**Created:**
- `src/lib/runner/skills/skill-templates.ts` — bundled content + helpers
- `src/lib/runner/skills/discover-skills.ts` — discovery + parsing + validation
- `src/lib/runner/skills/skill-bootstrap.ts` — onboarding seeding
- `src/lib/runner/skills/skill-actions.ts` — server actions (save, reset)
- `src/lib/runner/skills/__tests__/skill-templates.test.ts`
- `src/lib/runner/skills/__tests__/discover-skills.test.ts`
- `src/lib/runner/skills/__tests__/skill-actions.test.ts`
- `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`
- `src/lib/runner/skills/__tests__/skill-integration.test.ts`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/skills/[slug]/page.tsx`
- `app/(dashboard)/skills/[slug]/skill-editor-form.tsx`
- `docs/product/designs/instruction-skills.md`
- `docs/product/designs/sandbox-skill-execution.md`
- `docs/qa/25-instruction-skills.md`

**Modified:**
- `src/lib/runner/context.ts` — skill discovery in `loadSystemPromptState()`
- `src/lib/ai/system-prompt.ts` — `<custom-skills>` instruction block
- `src/lib/runner/skills/system-skills.ts` — uses string constants, now synchronous
- `src/lib/storage/agent-files.ts` — `assertWritable()` allows user skill writes
- `src/lib/memory/bootstrap.ts` — calls `bootstrapSkills()`
- `src/components/layout/app-sidebar.tsx` — Skills replaces Mission Control
- `src/components/chat/message-bubble.tsx` — skill badge
- `src/components/chat/message-bubble.test.tsx` — badge tests
- `src/components/layout/app-sidebar.test.tsx` — Mission Control → Skills
- `src/clients/skill-registry.ts` — deprecated (docgen, replaced by sandbox)
- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json` — PR 51 + 51a added

**Deleted:**
- `src/lib/runner/skills/bundled-skill-files.ts` — failed import.meta.url approach
- `src/lib/runner/skills/__tests__/bundled-skill-files.test.ts`
- `src/lib/runner/skills/defaults/` — all `.md` files (content now in `skill-templates.ts`)
- `src/lib/runner/skills/system/` — all `.md` files (content now in `skill-templates.ts`)
- `app/(dashboard)/mission-control/page.tsx`
