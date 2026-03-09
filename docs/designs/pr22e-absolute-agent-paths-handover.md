# Handover: PR 22e — Absolute Agent Paths (`/agent/` prefix)

## Context

We're aligning Sunder's agent tools with Tasklet (our reference product). During a tool-by-tool comparison, we discovered that Tasklet uses absolute `/agent/`-prefixed paths everywhere the model sees a file path, while Sunder uses workspace-relative paths (`memory/MEMORY.md`, `vault/doc.pdf`). This causes occasional model confusion and wasted tool calls.

We designed a model-boundary-only refactor: change paths **only where the LLM sees them**. Internal storage, DB, frontend, and API routes stay relative. A thin `toStoragePath()`/`toModelPath()` conversion layer at the tool boundary handles translation.

## What was produced

Three artifacts need review:

### 1. Design doc
**File:** `docs/designs/absolute-agent-paths.md`

Covers the problem, approach (model-boundary translation only), scoped file list (~9 files in scope, ~15 explicitly out of scope), implementation details for the utility module + each tool change, backwards compatibility strategy, and Tasklet developer confirmation notes.

**Review focus:**
- Is the scope correct? Are there model-facing surfaces we missed?
- Is the backwards-compatibility strategy (permissive pass-through for relative paths) sound?
- Does the out-of-scope list make sense? (No DB migration, no frontend changes, no API route changes)

### 2. v2 plan entry
**File:** `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`

PR 22e added after PR 22d in Phase 2. 8 tasks, 11 test criteria. Changelog entry added. `estimatedPRs` bumped to 37.

**Review focus:**
- Is Phase 2 the right placement? (It's a prerequisite for nothing, but improves all subsequent model interactions)
- Are the 8 tasks the right granularity?
- Are the test criteria sufficient?

### 3. TDD tasklist
**File:** `docs/tasks/2026-03-09-absolute-agent-paths-tasklist.md`

8 tasks, each with TDD flow (write failing test → verify fail → implement → verify pass → commit). Includes concrete test code snippets and implementation guidance for every file.

**Review focus:**
- Are the test cases sufficient? Missing edge cases?
- Do the code snippets accurately reflect the current codebase? (Cross-reference with the actual source files listed below)
- Is the commit granularity right? (One commit per task, 8 total)

## Key source files to cross-reference

| File | Role in refactor |
|------|-----------------|
| `src/lib/storage/agent-paths.ts` | **New.** `AGENT_ROOT`, `toStoragePath()`, `toModelPath()` |
| `src/lib/runner/tools/storage/index.ts` | `read_file` + `write_file` descriptions, execute handlers strip prefix. `search_knowledge` results prefixed. |
| `src/lib/ai/system-prompt.ts` | All path references get `/agent/` prefix |
| `src/lib/runner/system-reminder.ts` | Skill path construction in connection listing |
| `src/lib/runner/tools/connections/manage-tools.ts` | Skill file hint in response |
| `src/lib/runner/tools/connections/create-connection.ts` | Skill file reference in tool description |
| `src/lib/runner/tools/triggers/setup-trigger.ts` | Strip `/agent/` from `instruction_path` before DB insert |
| `src/lib/runner/tools/triggers/manage-triggers.ts` | Prefix `/agent/` on `instruction_path` in responses |
| `src/lib/runner/tools/subagents/run-subagent.ts` | Strip `/agent/` from `path` before downloading instruction file |

## Key design decisions already made

1. **Permissive for v1** — `toStoragePath()` passes through relative paths unchanged. No strict mode yet.
2. **`search_knowledge` results include `/agent/` prefix** — model can feed results directly to `read_file`.
3. **No DB migration** — DB stores relative paths. Conversion happens at tool boundary only.
4. **No `/tmp/` path space yet** — Tasklet has `/tmp/` for ephemeral sandbox scratch. Deferred until sandbox lands (Phase 3+ PR 42b).
5. **Examples in param descriptions** — Every path param must include concrete examples (e.g., `"(e.g., '/agent/memory/MEMORY.md' or '/agent/vault/')"`). Tasklet dev confirmed these do heavy lifting for model pattern-matching.

## Authority chain reminder

1. **v2 plan JSON** — wins on scope and phasing
2. **App Spec** — product vision (v2 plan wins on conflicts)
3. **Arch Decisions JSON** — technical rationale (v2 plan wins on conflicts)
4. **Tasklet reference** — default patterns when v2 plan is silent
