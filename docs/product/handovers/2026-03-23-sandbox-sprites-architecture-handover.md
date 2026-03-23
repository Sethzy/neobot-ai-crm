# Sandbox Architecture Handover — Sprites (Fly.io) + Claude Code CLI

**Date:** 2026-03-23
**Context:** We've redesigned the sandbox execution layer from ephemeral Vercel Sandboxes to persistent Sprites (Fly.io) with Claude Code CLI running inside. This handover gives you full context to review the architecture and execute PRs 52-54.

---

## TL;DR

Sunder's agent needs to write and run code for two things: spreadsheet analysis and web page generation. Instead of building custom code orchestration, we delegate these tasks to Claude Code (a full coding agent) running inside a persistent Fly.io Sprite. The Sprite auto-sleeps when idle and wakes in <1 second, so users can iterate ("now break it down by region", "swap the hero photo") without re-uploading data or losing context.

**One sentence:** The outer agent (Gemini Flash) handles business logic; Claude Code inside a Sprite handles coding tasks.

---

## Why This Architecture

### The Problem We're Solving

Sunder's runner is a business orchestrator — it does CRM lookups, memory reads, approval gates, etc. It's not a coding agent. When a user says "analyze this spreadsheet" or "build me a showcase page," the runner needs to hand that off to something that can write code, debug errors, and iterate.

### Why Not Vercel Sandbox (The Previous Design)

The v1 design used ephemeral Vercel Sandboxes: boot from snapshot → run Claude Code → destroy. This fails for iterative workflows:

1. **Users iterate 3-4 times per task.** Each iteration would mean booting a new sandbox, re-uploading data, re-installing dependencies, and losing all context from the previous run.
2. **The runner isn't a coding agent.** If pandas throws an error, the runner would have to parse the error, generate a fix, and retry — that's building a coding agent from scratch.
3. **Claude Code already does this.** It handles error recovery, file management, and multi-step code tasks autonomously.

The old design doc is preserved at `docs/product/designs/sandbox-skill-execution-v1-vercel-DEPRECATED.md`.

### Why Sprites (Fly.io)

- **Persistent VMs with auto-sleep/wake** — no idle compute cost between iterations, wakes in <1 second
- **Claude Code pre-installed** — no boot-time install step (all Sprites come with Claude CLI, Python, Node, Go, etc.)
- **Preview URLs out of the box** — port 8080 auto-exposes
- **~300ms transactional checkpoints** — safety net before risky operations
- **Fly.io is established** — running Firecracker at scale for years, well-funded
- **$30 free credits** to prototype

### The Pattern: Agent-in-Sandbox

This is "Pattern 1" per [Harrison Chase's taxonomy](https://blog.langchain.com/the-two-patterns-by-which-agents-connect-sandboxes/). The coding agent runs *inside* the sandbox. The outer agent is just a thin orchestrator that creates the Sprite, writes data in, and reads results out.

Reference implementation: [diggerhq/opencomputer](https://github.com/diggerhq/opencomputer) — same pattern, different infra. Their [Building Open Lovable Part 1](https://opencomputer.dev/guides/building-open-lovable-part-1) blog post is the clearest explanation of why this pattern works.

---

## What Gets Built (PRs 52-54)

### PR 52: `analyze_spreadsheet` (Foundation + Excel Tool)

Installs `@fly/sprites@0.0.1-rc37` SDK (pin prerelease — stable lacks filesystem/services/policy), builds the Sprites client wrapper, creates the `sprite_sessions` DB table, and implements the `analyze_spreadsheet` tool.

**User uploads xlsx → agent produces Excel financial model with live formulas**

Flow:
```
User uploads deals.xlsx + "compare these 3 condos"
  → Runner calls analyze_spreadsheet tool
  → Tool calls getOrCreateSprite(clientId) — wakes existing or creates new
  → Writes skill files + uploaded data into Sprite filesystem
  → sprite.execFile('claude', ['--dangerously-skip-permissions', '-p', task, '--max-turns', '20'], { env })
  → Claude Code writes Python, creates Excel model, runs recalc.py
  → Tool reads output.xlsx from Sprite, uploads to Supabase Storage
  → Returns download URL + summary
  → Sprite auto-sleeps (ready for "now add a sensitivity table")
```

**Key files created:**
| File | What |
|---|---|
| `src/lib/sandbox/sprites-client.ts` | `getOrCreateSprite()` — wake/create lifecycle |
| `src/lib/sandbox/sprite-session.ts` | DB tracking layer for `sprite_sessions` table |
| `src/lib/sandbox/run-claude-in-sprite.ts` | Claude CLI execution + output reading |
| `src/lib/sandbox/skill-loader.ts` | Download user skill files from Supabase Storage |
| `src/lib/sandbox/types.ts` | SpriteSession, SpriteResult types |
| `src/lib/runner/tools/sandbox/analyze-spreadsheet.ts` | Tool definition |
| `supabase/migrations/xxx_create_sprite_sessions.sql` | New table |

**Env vars:** `SPRITES_TOKEN`, `ANTHROPIC_API_KEY`

### PR 53: `publish_artifact` (Web Page Generation)

Builds on PR 52's Sprite infra. Agent generates React property showcase pages with live preview URLs.

**Runner gathers data → Claude Code builds React app → user sees live preview → iterates**

Flow:
```
User: "Make a showcase page for the 42 Noriega listing"
  → Runner gathers data FIRST (CRM lookup, web search, photo scraping — no Sprite)
  → Runner calls publish_artifact tool
  → Tool writes property data + photos + skill files into Sprite
  → Claude Code copies pre-scaffolded template, customizes it, starts dev server
  → Preview URL on port 8080 (must set auth to public via updateURLSettings)
  → Returns live preview URL to user
  → User: "swap the hero photo" → same Sprite, Claude Code modifies code
  → User: "ship it" → Claude Code builds static HTML → uploaded to Supabase Storage
```

**Key files created:**
| File | What |
|---|---|
| `src/lib/sandbox/run-claude-for-artifact.ts` | Artifact-specific prompt building + `isFollowUp`/`shipIt` modes |
| `src/lib/sandbox/templates/property-showcase/` | Pre-scaffolded Vite + React + Tailwind template |
| `src/lib/runner/tools/sandbox/publish-artifact.ts` | Tool definition |
| `scripts/build-sprite-template-artifact.sh` | Template setup script |

### PR 54: Cheap Model Routing via OpenRouter

Swaps Claude Sonnet inside the Sprite for cheap models (MiniMax, Kimi, Gemini Flash) via OpenRouter. **10-50x cost reduction.** Zero code changes to Claude Code CLI — just env var swaps.

```
ANTHROPIC_BASE_URL=https://openrouter.ai/api/v1 \
ANTHROPIC_API_KEY=sk-or-... \
claude -p "..." --model minimax/minimax-m1
```

Claude Code thinks it's talking to Anthropic but it's hitting OpenRouter → MiniMax. NanoClaw validated this pattern in production (see `roadmap docs/.../nanoclaw-dorabot/nanoclaw-overview.md`).

---

## SDK Gotchas (from verification)

A dev reviewed the Sprites SDK against official docs. Full findings: `docs/product/references/sprites-sdk-verification.md`. Key takeaways:

1. **Use `execFile()`, not `exec()`** — `exec()` splits on whitespace, breaking quoted prompts. Always use `sprite.execFile('claude', [...args], { env })`.
2. **Pin `@fly/sprites@0.0.1-rc37`** — stable `0.0.1` lacks `filesystem()`, `createService()`, and `updateNetworkPolicy()`. rc37 has everything.
3. **Node 24+ required** — both stable and rc37. Set in Vercel Project Settings and local `.nvmrc`.
4. **`client.sprite(name)` is just a handle** — doesn't create. Use `client.createSprite(name)` for creation.
5. **Preview URLs are private by default** — must call `sprite.updateURLSettings({ auth: 'public' })`.
6. **Use Services for dev servers, not sessions** — sessions die on hibernation, Services auto-restart.
7. **Pass API keys per-command** — via `execFile()`'s `env` option, not written to disk.
8. **Read URL from `sprite.url`** — don't hardcode `.sprites.dev` or `.sprites.app`.
9. **Sleeping = no compute cost, storage still bills** — pennies, but not literally $0.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Sandbox provider | Sprites (Fly.io) | Persistent VMs, auto-sleep, Claude Code pre-installed, Fly.io reliability |
| Agent inside sandbox | Claude Code CLI | Runner is a business orchestrator, not a coding agent. Delegate coding to a purpose-built coding agent. |
| Persistent sessions | Per-client Sprite, auto-sleep/wake | Users iterate 3-4 times. Re-booting each time wastes time and loses context. Auto-sleep = zero idle cost. |
| Two tools, one provider | `analyze_spreadsheet` + `publish_artifact` on Sprites | Different runtimes but same lifecycle model. Cleaner tool descriptions for the model. |
| Multi-turn via filesystem | Same Sprite, files persist | Claude Code re-reads existing files on each invocation. No need for session memory — the code IS the context. |
| Cheap models via OpenRouter | `ANTHROPIC_BASE_URL` env var swap | Zero code changes. 10-50x cost reduction. NanoClaw-validated pattern. |

---

## Read These First

**Essential (read in order):**

1. **Design doc:** `docs/product/designs/sandbox-skill-execution.md` — full architecture, flows, security model, cost model, decision log
2. **PR 52 tasklist:** `docs/product/tasks/2026-03-20-pr52-sandbox-excel-analysis-tasklist.md` — step-by-step implementation with tests
3. **PR 53 tasklist:** `docs/product/tasks/2026-03-20-pr53-sandbox-artifact-publishing-tasklist.md`
4. **PR 54 tasklist:** `docs/product/tasks/2026-03-20-pr54-sandbox-openrouter-model-routing-tasklist.md`

**Context (skim as needed):**

5. **Skills handover:** `docs/product/handovers/2026-03-20-pr51-51a-skills-handover-to-sandbox.md` — what the skill system provides (PR 52/53 build on it)
6. **Sprites SDK:** `@fly/sprites` npm package — [docs](https://docs.sprites.dev), [GitHub](https://github.com/superfly/sprites-js), [API reference](https://sprites.dev/api)
7. **OpenComputer blog post:** [Building Open Lovable Part 1](https://opencomputer.dev/guides/building-open-lovable-part-1) — same pattern, clearest explanation
8. **Sandbox references:** `roadmap docs/Sunder - Source of Truth/references/sandboxes/` — vendor comparisons, assembly pattern research, architecture articles

**Deprecated (for historical context only):**

9. **Old design doc:** `docs/product/designs/sandbox-skill-execution-v1-vercel-DEPRECATED.md` — original Vercel Sandbox approach

---

## How It Fits Into the Codebase

### Builds On (Don't Modify)

| Existing System | How Sandbox Uses It |
|---|---|
| Supabase Storage (`agent-files` bucket) | Skill files stored per-client, same as memory files |
| `toStoragePath()` / `toModelPath()` | Skill paths follow `/agent/skills/` convention |
| `createRunnerTools()` factory | Two new tools added to registry |
| Tool response shape `{ success, ... }` | Both tools return same shape |
| `loadMemoryContext()` pattern | `loadSkillFilesForSandbox()` follows same download pattern |
| System prompt tool guidance | Both tools get descriptions in system prompt |
| `discoverUserSkills()` from PR 51 | Skill file discovery and loading |

### Does NOT Change

- Runner loop (`streamText()` + `maxSteps`)
- CRM tools, memory tools, connection tools
- Context assembly (`assembleContext()`)
- Thread queue / concurrency model
- Approval system
- Chat API route

### New Directory

```
src/lib/sandbox/
├── sprites-client.ts              — SpritesClient wrapper, getOrCreateSprite()
├── sprite-session.ts              — DB tracking (sprite_sessions table)
├── run-claude-in-sprite.ts        — Claude CLI execution + output reading
├── run-claude-for-artifact.ts     — Artifact-specific prompt + modes
├── skill-loader.ts                — Download skill files from Supabase Storage
├── types.ts                       — SpriteSession, SpriteResult types
└── __tests__/

src/lib/runner/tools/sandbox/
├── analyze-spreadsheet.ts         — analyze_spreadsheet tool
├── publish-artifact.ts            — publish_artifact tool
└── __tests__/

src/lib/sandbox/templates/
└── property-showcase/             — Pre-scaffolded React template

scripts/
└── build-sprite-template-artifact.sh
```

---

## Open Questions for Reviewer

1. ~~**One Sprite or two per client?**~~ **RESOLVED — One default Sprite per thread.** No custom templates. Default Sprite has Python + Node + Claude Code pre-installed. Additional deps installed on first use, persist across hibernation.

2. **Structured event streaming:** Currently we get raw stdout from Claude Code CLI. OpenComputer's SDK gives structured events (`assistant/text`, `tool_use`, `turn_complete`). Do we need this for the chat UI, or is milestone-based progress ("Analyzing...", "Building...", "Done!") sufficient for v1?

3. **Sprite kill policy:** Design says 24h inactivity timeout. Is that right, or should it be shorter (save cost) or longer (better UX for users who come back next day)?

4. **Security review needed:** The Sprite gets `ANTHROPIC_API_KEY` (or OpenRouter key). Network egress is allowlisted to `api.anthropic.com` + package registries. Is this sufficient isolation? See design doc §9.

5. **Cost model validation:** Design estimates ~$0.06-0.31 per iteration, ~$0.24-1.24 per 4-iteration session. Does this align with Sprites pricing? Worth running a real test with $30 free credits.

---

## Quick Start for Reviewer

```bash
# 1. Read the design doc
cat docs/product/designs/sandbox-skill-execution.md

# 2. Read the PR 52 tasklist (foundation)
cat docs/product/tasks/2026-03-20-pr52-sandbox-excel-analysis-tasklist.md

# 3. Check the Sprites SDK
npm info @fly/sprites

# 4. Browse the reference implementation
open https://opencomputer.dev/guides/building-open-lovable-part-1

# 5. Check the old design for context on what changed
cat docs/product/designs/sandbox-skill-execution-v1-vercel-DEPRECATED.md
```
