---
date: 2026-04-14
topic: multi-agent-architecture
---

# Multi-Agent Architecture

## Problem Frame

Sunder's managed agent is a generalist with 40+ tools registered against a single agent definition. Two independent improvements emerge from studying specialist multi-agent architectures:

1. **Router/specialist pattern** — a coordinator agent delegates to pre-declared specialist agents, each with a minimal, task-focused tool set. Specialists are less distracted, have less context noise, and can run in parallel. Anthropic Managed Agents supports this natively via `callable_agents` on the agent definition, but it is currently **Research Preview** (access-gated).

2. **Memory consolidation** — per-client memory files (SOUL.md, USER.md, MEMORY.md, memory/*.md) accumulate noise over time. A nightly background agent pass curates these files: merging duplicates, promoting/demoting tiers, and applying decay. This is **buildable today** with no platform gating.

The goal is to design both now so we can ship memory consolidation immediately and implement the router pattern the moment multi-agent goes GA.

---

## Part A: Router / Specialist Pattern

### How Managed Agents Multi-Agent Works

- **`callable_agents`** — a list of pre-declared agent IDs registered on the orchestrator's agent definition at creation/update time. Not dynamic.
- **Runtime delegation** — the orchestrator decides at runtime when to delegate. Specialist threads spin up server-side; each runs in its own context-isolated session thread with its own conversation history.
- **Shared container** — all threads share the same filesystem/container within a session. Context is isolated, files are not.
- **One level deep** — orchestrator → specialists only. Specialists cannot call sub-specialists.
- **Each specialist** gets its own agent config: model, system prompt, tools, MCP servers, skills.

### Requirements

- R1. The Sunder agent definition is updated to declare `callable_agents` for each specialist defined below, once multi-agent is available.
- R2. The main Sunder agent acts as coordinator: it delegates well-scoped sub-tasks but continues to handle general conversation and routing decisions.
- R3. Specialists are pre-created as separate Anthropic agent definitions and stored in the agent registry. Adding a new specialist = creating a new agent definition + registering it on the coordinator.
- R4. Each specialist is minimal: it receives only the tools its task domain requires. No specialist has access to the full 40+ tool set.

### Specialist Taxonomy (v1)

| Specialist | Trigger signal | Tools included |
|---|---|---|
| **CRM Specialist** | Create/update/search people, companies, deals, tasks | CRM tools only (create, update, search, delete, link) |
| **Research Specialist** | "Look up X", "Find info on Y", web research requests | web search, web scrape, browse website |
| **Drafting Specialist** | Draft emails, messages, summaries | storage read (for context), send message, ask user question |
| **Meeting Specialist** | Meeting prep, briefing, recording review | search meetings, storage read, CRM read |
| **Automation Specialist** | Set up triggers, automations | trigger tools, manage active triggers |

### Success Criteria (Part A)

- Coordinator delegates cleanly to specialist threads for recognized task types
- Each specialist thread completes its sub-task and returns result to coordinator
- Generalist fallback: coordinator handles tasks that don't map cleanly to a specialist without breaking
- Zero regression in current agent behavior for existing workflows

### Scope Boundaries (Part A)

- **Not in scope:** Dynamic tool subsetting at runtime (Anthropic constraint: specialists must be pre-declared)
- **Not in scope:** Specialists calling sub-specialists (one level deep only per platform constraint)
- **Not in scope:** Per-user specialist customization (v1 is a fixed specialist taxonomy)
- **Blocked on:** Anthropic Research Preview access. Design is complete; implementation waits on GA.

---

## Part B: Memory Consolidation

### Problem

Memory files grow without curation. Duplicate entries accumulate, stale facts persist, and important corrections get buried. The files are the compounding data moat — their quality directly affects agent output quality.

### Memory Tier Model

Align with the existing Sunder memory file structure:

| Tier | Files | Decay | What lives here |
|---|---|---|---|
| **Short-term** | `memory/*.md` | Fast | Recent context, transient facts, in-progress work |
| **Long-term** | `MEMORY.md` | Slow | Established patterns, past interactions, key decisions |
| **Permanent** | `SOUL.md`, `USER.md` | None | Core identity, stable preferences, corrections |

Corrections (e.g., "don't do X, do Y instead") are weighted heavily — they must survive consolidation unless explicitly overridden.

### Consolidation Approaches (decide in planning)

**Option A — Single-agent pass (simpler, cheaper)**
One agent reviews all memory files per client, applies consolidation rules (merge duplicates, promote/demote tiers, mark stale), and writes updated files. Lower token cost, faster to ship.

**Option B — Three-agent panel (richer curation)**
- **Consolidator** — proposes changes: deletions, merges, promotions
- **Adversarial** — argues for keeping flagged memories; surfaces edge cases
- **Judge** (Opus) — breaks ties; renders final decision

Option B more closely mirrors how humans forget productively. Option A is the practical v1.

### Requirements

- R5. A nightly consolidation job runs per active client. Triggered by existing cron infrastructure (Trigger.dev).
- R6. The consolidation agent reads all memory files for the client (SOUL.md, USER.md, MEMORY.md, memory/*.md).
- R7. The agent applies at minimum: duplicate merging, tier promotion/demotion, stale-memory flagging.
- R8. Corrections (identified by segment or pattern) are never deleted unless explicitly superseded by a newer correction on the same topic.
- R9. The consolidation job writes updated files back to Supabase Storage. No external writes — purely internal to the client's memory directory.
- R10. Consolidation runs when the client is inactive (no active session threads). Avoid write conflicts.
- R11. The consolidation approach (single-agent vs. three-agent) is chosen during planning based on cost estimates for the typical client memory footprint.

### Success Criteria (Part B)

- Memory file size stabilizes over time rather than growing unboundedly
- Corrections survive consolidation; stale transient facts do not
- No data loss: consolidated files are a strict improvement on the originals
- Consolidation completes within a reasonable time per client (target: under 2 minutes for typical memory footprint)

### Scope Boundaries (Part B)

- **Not in scope:** User-facing memory browser or edit UI
- **Not in scope:** Manual consolidation trigger (nightly only for v1)
- **Not in scope:** Cross-client memory (each client's memory is private)
- **Not in scope:** Memory decay scoring (v1 uses recency + access count heuristics only)

---

## Key Decisions

- **Design now, implement on GA:** Router pattern architecture is locked in. Implementation waits on Anthropic multi-agent GA, not on further ideation.
- **Specialists are pre-declared, not dynamic:** Anthropic Managed Agents `callable_agents` are set at agent definition time. This is a platform constraint, not a design choice.
- **Memory consolidation is independent:** Ships before and independently of the router pattern.
- **Corrections are heavyweight:** In both the router pattern and memory consolidation, user corrections (explicit negative feedback) are treated as highest-priority signals and preserved aggressively.

## Dependencies / Assumptions

- Multi-agent (Part A): Anthropic Research Preview access required. Apply at: `https://claude.com/form/claude-managed-agents`
- Memory consolidation (Part B): Existing Trigger.dev cron infrastructure is sufficient. No new infrastructure needed.
- Memory consolidation assumes per-client memory files are consistently structured (SOUL.md, USER.md, MEMORY.md, memory/*.md).

## Outstanding Questions

### Resolve Before Planning (Part A)

- [Affects R1][User decision] Have we applied for Managed Agents Research Preview access? If not, what's the timeline to do so?

### Deferred to Planning

- [Affects R3][Technical] Where do specialist agent IDs live in the registry? Extend `skill-registry.json` or a new `agent-registry.json`?
- [Affects R3][Technical] What is the create-agent script pattern for specialists — separate YAML configs per specialist?
- [Affects R5][Technical] How does the nightly job discover active clients to consolidate? Query `thread_queue_records` for recent activity?
- [Affects R10][Technical] How to detect and respect active session state before writing memory files? Check session status via Managed Agents API?
- [Affects R11][Needs research] What is the typical token cost of a single-agent consolidation pass vs. three-agent panel for a representative memory footprint?

## Next Steps

Resolve Before Planning is non-empty (R1 blocker on multi-agent access request). For Part B (memory consolidation), no blockers remain.

→ `/plan` for memory consolidation (Part B) can proceed immediately
→ Resume `/ideate` or `/plan` for router pattern (Part A) after Research Preview access is confirmed
