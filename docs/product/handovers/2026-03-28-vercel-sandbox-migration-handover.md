# Handover: Vercel Sandbox Migration — Review Before Tasklist

**Date:** 2026-03-28
**From:** Design session (brainstorming → design doc → reference repo analysis)
**To:** Next dev session
**Goal:** Review all materials for consistency and completeness, then generate a tasklist for execution.

---

## What Was Done

A full design session produced three artifacts for migrating Sunder from Sprites (Fly.io) + nested Claude Code agent to Vercel Sandbox + `bash-tool`:

### Artifact 1: Design Doc v2
**Path:** `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md`

The complete design covering:
- Problem statement (one-sandbox-per-client bottleneck, nested agent complexity, vendor dependency)
- Architecture (ephemeral Vercel Sandbox, `bash-tool` for the bash tool, no nested agent)
- Data flow with complete rental yield analysis example
- File I/O model (Supabase Storage ↔ sandbox, explicit upload/download)
- Skills in sandbox (SKILL.md + reference files pre-loaded for scripts to read)
- Golden snapshot (pre-built with Python + Node + LibreOffice)
- System prompt block (verbatim, ready to copy)
- Migration path (what dies, stays, adapts, new)
- Unresolved questions (6 items)
- Deliberate deviations from Tasklet, bash-tool full stack, and Fintool

### Artifact 2: Reference Repos Analysis
**Path:** `roadmap docs/Sunder - Source of Truth/references/vercel-bash/01-vercel-sandbox-reference-repos-analysis.md`

Deep analysis of three official Vercel repos (cloned locally):
- `bash-tool` — every export, interface, default, file loading logic, sandbox wrapper, skills system
- `call-summary-agent-with-sandbox` — complete data flow, the exact `createBashTool` call, file pre-loading pattern, agent wiring
- `oss-data-analyst` — sandbox creation, tool mixing, cleanup pattern

Includes:
- 6 drift points documented with reasons and resolutions
- Implementation checklist (files to create, modify, delete)
- Code to copy verbatim (3 specific source → target mappings)
- What NOT to copy (10 items with reasons)

### Artifact 3: Design Doc v1 (deprecated)
**Path:** `docs/plans/2026-03-28-vercel-sandbox-migration-design.md`

Original design with custom `run_command` tool. Superseded by v2 which uses `bash-tool` instead. Kept for reference — contains useful background research on Tasklet patterns, Fintool architecture, and the decision history.

### Supporting Context
- `roadmap docs/Sunder - Source of Truth/references/vercel-bash/00-skills-in-bash-tool.md` — earlier skills research
- Local repo clones at `/Users/sethlim/Documents/bash-tool`, `/Users/sethlim/Documents/call-summary-agent-with-sandbox`, `/Users/sethlim/Documents/oss-data-analyst`

---

## What Needs Review

Before generating a tasklist, the next dev should verify:

### 1. Path consistency — KNOWN ISSUE

The design doc v2 uses `/workspace` as the base path throughout (system prompt, examples, migration notes). However, `bash-tool` defaults to `/vercel/sandbox/workspace` when it detects a Vercel Sandbox instance (see `bash-tool/src/tool.ts` lines 15-16, 50-54).

**Action needed:** Either:
- (a) Update the design doc to use `/vercel/sandbox/workspace` everywhere, OR
- (b) Pass `destination: "/workspace"` to `createBashTool` to override the default

Option (b) is simpler — one param, done. But verify that `/workspace` exists and is writable in Vercel Sandbox. The oss-data-analyst uses `destination: "./semantic"` (relative path) which suggests custom destinations work fine.

### 2. Sandbox creation with golden snapshot

The design doc says:
```typescript
Sandbox.create({ source: { type: "snapshot", snapshotId: GOLDEN_SNAPSHOT_ID } })
```

Verify this API shape matches the current `@vercel/sandbox` stable SDK. The reference repos don't use snapshots — they create fresh sandboxes every time. The snapshot API was documented in the Vercel Sandbox docs research but should be tested.

### 3. Output file extraction

The design says "extract files from `/workspace/output/` before `sandbox.stop()`." Neither reference repo does output file extraction — the call-summary-agent returns `result.text`, the oss-data-analyst returns structured data via `FinalizeReport`.

Sunder needs file extraction (the agent generates `.xlsx` files). The mechanism (`sandbox.readFileToBuffer()` → upload to Supabase Storage) is straightforward but not demonstrated in any reference repo. This needs to be designed in the tasklist — likely a cleanup function that:
1. Runs `ls /vercel/sandbox/workspace/output/` via bash
2. Downloads each file via the sandbox's `readFile`
3. Uploads to Supabase Storage
4. Returns download URLs

### 4. `context.json` assembly

The design says conversation data (CRM results, market data) is serialized to `input/context.json` in the `files` Record. But the question is: **when is the `files` Record built?**

The call-summary-agent builds it in `prepareCall` (before the LLM loop). The oss-data-analyst builds it before `streamText()`. Both have static input data.

Sunder's data is dynamic — the agent gathers CRM results and market data during the same `streamText()` run, then needs that data in the sandbox. This means the sandbox can't be created before `streamText()` starts (the data doesn't exist yet). The sandbox must be created **lazily, mid-run**, after the agent has gathered data and before it calls `bash`.

**Options:**
- (a) Create sandbox lazily on first `bash` call, serialize all prior tool results into `context.json` at that point
- (b) Create sandbox at the start of the run with empty `context.json`, let the agent write data via `bash({ command: "cat > input/context.json << 'EOF'..." })`
- (c) Create sandbox at the start, use a two-phase approach: agent gathers data → runner pauses → builds files → creates bash tool → agent continues with bash available

Option (a) is cleanest. The tool registry would need to support lazy initialization — the bash tool isn't available until it's first called, at which point the handler creates the sandbox and bash-tool instance.

### 5. Lazy bash tool initialization

Related to #4. In the reference repos, `createBashTool` is called during setup (before the agent loop). In Sunder, we want to call it lazily (first time the agent needs bash). This means:

- The `bash` tool needs to be registered in the tool registry at the start of the run (so the LLM knows it exists)
- But `createBashTool` can't be called yet (no sandbox, no files)
- On first invocation, the handler creates the sandbox, builds the files, calls `createBashTool`, and delegates to the real bash tool

This is a wrapper pattern. Verify that AI SDK's `tool()` supports this (the `execute` function can do async setup on first call). The reference repos don't demonstrate this — they always create the sandbox eagerly.

### 6. Skill files in sandbox — which ones?

The design says "the active skill's full directory" gets pre-loaded. But how does the tool handler know which skill is active? The agent reads skills via `read_file` during the run. The tool handler would need to track which skill SKILL.md was read and load that skill's directory into the sandbox.

**Options:**
- (a) Load ALL client skills into the sandbox (simple but wasteful if there are many)
- (b) Track which skill the agent read via `read_file` and only load that one
- (c) Let the agent specify which skill to load via a parameter on the first `bash` call

Option (a) is simplest for v1. Client skills are small (a few KB each). Loading all of them is cheap.

### 7. Dependencies and versions

Verify compatible versions:
- `bash-tool` requires `ai` ^6.0.0 as peer dep — Sunder uses AI SDK v6 ✓
- `bash-tool` requires `@vercel/sandbox` * as optional peer dep — need to install
- Check if `bash-tool` v1.3.15 is latest stable
- Check if `@vercel/sandbox` v1.0.4 (used by call-summary-agent) or v1.1.1 (used by oss-data-analyst) is appropriate

---

## Decision Log (from design session)

These decisions were made during brainstorming and should NOT be re-opened unless new information surfaces:

1. **Vercel Sandbox over Sprites** — parallel execution (2,000 concurrent vs 1-per-client) + platform consolidation
2. **No nested agent** — Tasklet + Fintool both confirm: direct tools on main agent, no agent-in-sandbox nesting
3. **`bash-tool` over custom `run_command`** — battle-tested Vercel package, handles truncation + hooks + sandbox wrapping
4. **Only `bash` tool exposed** — no `readFile`/`writeFile` from bash-tool (conflicts with existing Supabase tools)
5. **No `createSkillTool`** — skills in Supabase, not local filesystem; existing discovery works
6. **No beta persistence** — stable SDK only; sandbox is ephemeral, state in Supabase
7. **Golden snapshot** — pre-built with Python + Node + LibreOffice; ~0.4s boot
8. **`context.json` for data passing** — gathered tool results serialized into sandbox filesystem
9. **`finally` block for cleanup** — more reliable than `onFinish`
10. **Per-run ephemeral sandbox** — not per-client persistent; matches Fintool/Tasklet pattern

---

## How to Proceed

1. **Read the design doc v2** — this is the spec. Everything the implementation needs is there.
2. **Read the reference repos analysis** — this tells you which files to look at in the local clones, what to copy, and what to skip.
3. **Resolve the 7 review items above** — especially #1 (path), #4 (context.json timing), and #5 (lazy init).
4. **Generate a tasklist** following the standard format (`docs/product/tasks/`). The design doc Section 10 (Migration Path) has the file-level breakdown. The reference analysis Section 6 has the implementation checklist.

---

## File Index

| File | What |
|---|---|
| `docs/plans/2026-03-28-vercel-sandbox-migration-design-v2.md` | **The spec.** Read this first. |
| `docs/plans/2026-03-28-vercel-sandbox-migration-design.md` | Deprecated v1. Background research + decision history. |
| `roadmap docs/.../references/vercel-bash/01-vercel-sandbox-reference-repos-analysis.md` | **The reference.** File-level analysis of all three repos. |
| `roadmap docs/.../references/vercel-bash/00-skills-in-bash-tool.md` | Earlier skills research. |
| `/Users/sethlim/Documents/bash-tool` | Local clone — read `src/tool.ts`, `src/tools/bash.ts`, `src/sandbox/vercel.ts` |
| `/Users/sethlim/Documents/call-summary-agent-with-sandbox` | Local clone — read `lib/tools.ts`, `lib/sandbox-context.ts`, `lib/agent.ts` |
| `/Users/sethlim/Documents/oss-data-analyst` | Local clone — read `src/lib/tools/sandbox.ts`, `src/lib/tools/shell.ts`, `src/lib/agent.ts` |
