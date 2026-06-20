# Codex Memory System — Reference Analysis for Sunder

> **Source:** [openai/codex](https://github.com/openai/codex) (local clone at `/Users/sethlim/Documents/codex`)
> **Feature scope:** Memory system only
> **Date:** 2026-03-06

---

## Part I: Patterns the Codex Codebase Uses

### 1. Two-Phase Background Pipeline

Memory is NOT written inline during conversations. Instead:

- **Phase 1 (extraction):** After a session ends and sits idle (≥6h), a background job sends the raw conversation transcript to a cheap/fast model (`gpt-5.1-codex-mini`, reasoning: Low). It extracts structured JSON: `{ raw_memory, rollout_summary, rollout_slug }`. Up to 8 rollouts processed in parallel.
- **Phase 2 (consolidation):** A single global job spawns a sandboxed sub-agent (using `gpt-5.3-codex`, reasoning: Medium) that reads all Phase 1 outputs and produces/updates the consolidated memory files. Only one Phase 2 runs at a time (DB-locked).

**Why this matters:** The agent never writes memory during conversation. A dedicated background process does all memory writing, using specialized prompts optimized for memory quality.

### 2. Progressive Disclosure File Hierarchy

```
$CODEX_HOME/memories/
  memory_summary.md      ← compact summary, injected into every context (≤5000 tokens)
  MEMORY.md              ← detailed searchable registry (agent can grep)
  raw_memories.md        ← merged Phase 1 outputs (input for Phase 2)
  rollout_summaries/     ← one .md per retained conversation
    2026-02-11T15-35-19-jqmb-some_slug.md
  skills/                ← reusable procedures
    <skill-name>/
      SKILL.md           ← entrypoint with YAML frontmatter
      scripts/           ← optional helper scripts
      templates/         ← optional templates
      examples/          ← optional examples
```

**Key insight:** Only `memory_summary.md` is injected into the system prompt. Everything else is available for the agent to read on-demand via file tools. This keeps context usage minimal while giving the agent access to deep detail.

### 3. Memory Injection via Developer Instructions (Not System Prompt)

Memory is injected into the "developer instructions" section of the context, NOT the system prompt:

```rust
if turn_context.features.enabled(Feature::MemoryTool)
    && turn_context.config.memories.use_memories
    && let Some(memory_prompt) = build_memory_tool_developer_instructions(&codex_home).await
{ developer_sections.push(memory_prompt); }
```

The injected content includes:
- Decision boundary (when to skip vs use memory)
- Memory layout description
- Quick memory pass procedure (5-step, ≤4-6 search steps budget)
- Verification guidance (drift risk vs verification effort)
- Stale memory update requirements (MUST update in same turn)
- Citation requirements (`<oai-mem-citation>` blocks)
- The actual `memory_summary.md` content between `=========` markers

### 4. Agent Reads Memory On-Demand (Not Pre-Loaded)

Only `memory_summary.md` is pre-loaded. The agent decides whether to read `MEMORY.md`, rollout summaries, or skills based on the query. The `read_path.md` template teaches the agent a "quick memory pass":

1. Skim the MEMORY_SUMMARY (already in context)
2. Search MEMORY.md using keywords
3. Open 1-2 most relevant rollout summaries/skills if MEMORY.md points to them
4. Search rollout_path for exact evidence if needed
5. Stop if no hits

### 5. Structured Memory Format (Strict Schema)

**MEMORY.md** uses a strict task-grouped markdown schema:
```markdown
# Task Group: <broad but distinguishable family>
scope: <what this block covers, when to use it>

## Task 1: <description, outcome>
### rollout_summary_files
- <file> (cwd=<path>, rollout_path=<path>, updated_at=<ts>, thread_id=<id>)
### keywords
- <keyword1>, <keyword2>, ...
### learnings
- <specific learnings with evidence>

## General Tips
- <cross-task guidance> [Task 1]
```

**memory_summary.md** uses:
```markdown
## User Profile
<vivid snapshot, ≤500 words>

## General Tips
<durable cross-topic guidance>

## What's in Memory
### <most recent memory day: YYYY-MM-DD>
- <topic>: <keywords>
  - desc: <description>
  - learnings: <recent takeaways>
### <2nd most recent day>
...
### Older Memory Topics
- <topic>: <keywords>
  - desc: <description>
```

### 6. Usage-Based Selection and Forgetting

- Phase 2 ranks memories by `usage_count` first, then recency
- Memories unused for `max_unused_days` (default 30) are dropped
- Citation tracking records which memories the agent actually references
- Selection diff (`added`/`retained`/`removed`) enables incremental updates

### 7. Memory Pollution

Threads using MCP tools or web search can be marked "polluted" and excluded from memory extraction. Prevents hallucinated or externally-sourced content from contaminating memory.

### 8. Secret Redaction

All generated memory content passes through `redact_secrets()` before persistence. Tokens, keys, and passwords are replaced with `[REDACTED_SECRET]`.

### 9. Stale Memory Self-Correction

The `read_path.md` template requires agents to update MEMORY.md in the same turn if stale facts are detected:
> "If any memory fact conflicts with current evidence (repo state, tool output, or user correction), you MUST update memory in the same turn."

### 10. No-Op Gate (Phase 1)

Before extracting memory, Phase 1 applies a signal gate: "Will a future agent plausibly act better because of what I write here?" If not, return empty strings. This prevents noise accumulation.

---

## Part II: Files to Copy and Reference

### A. Templates (COPY — adapt variable names only)

| Codex File | Purpose | Sunder Target | Action |
|---|---|---|---|
| `core/templates/memories/read_path.md` | Read-time instructions injected into system prompt | `src/lib/ai/memory-instructions.ts` | **Copy.** Replace `{{ base_path }}` with Sunder's storage path convention. Remove Codex-specific citation format if not implementing citation tracking. |
| `core/templates/memories/consolidation.md` | Phase 2 consolidation agent prompt (604 lines) | `src/lib/memory/prompts/consolidation-prompt.ts` | **Copy.** This is the core IP — the memory quality rules, MEMORY.md schema, memory_summary.md schema, skills format, and workflow. Adapt `{{ memory_root }}` to Sunder's storage paths. |
| `core/templates/memories/stage_one_system.md` | Phase 1 extraction system prompt (337 lines) | `src/lib/memory/prompts/extraction-prompt.ts` | **Copy.** The signal gate, task outcome triage, rollout_summary format, and raw_memory format are all directly usable. |
| `core/templates/memories/stage_one_input.md` | Phase 1 user message template (11 lines) | `src/lib/memory/prompts/extraction-input.ts` | **Copy verbatim.** Trivial template. |

### B. Architecture (REFERENCE — reimplement in TypeScript)

| Codex File | Purpose | Sunder Equivalent | Action |
|---|---|---|---|
| `core/src/memories/mod.rs` | Constants, layout, metric names | `src/lib/memory/constants.ts` | **Reference.** Add `memory_summary.md`, `MEMORY.md`, `raw_memories.md`, `rollout_summaries/`, `skills/` to constants. |
| `core/src/memories/start.rs` | Pipeline entry point | `src/lib/memory/pipeline/start.ts` | **Reference.** Adapt guard conditions to Sunder (Supabase session, not ephemeral, feature flag). |
| `core/src/memories/phase1.rs` | Per-thread extraction | `src/lib/memory/pipeline/phase1.ts` | **Reference.** Replace Rust concurrency with `Promise.all` + concurrency limiter. Use AI SDK `generateText()` with structured output. |
| `core/src/memories/phase2.rs` | Global consolidation | `src/lib/memory/pipeline/phase2.ts` | **Reference.** Replace sub-agent spawning with a Vercel AI SDK `generateText()` call using the consolidation prompt. |
| `core/src/memories/storage.rs` | Filesystem artifact sync | `src/lib/memory/pipeline/storage.ts` | **Reference.** Adapt from local filesystem to Supabase Storage operations. |
| `core/src/memories/prompts.rs` | Prompt construction | `src/lib/memory/prompts/index.ts` | **Reference.** Port template rendering and token truncation. |
| `core/src/memories/control.rs` | Memory clearing | `src/lib/memory/pipeline/control.ts` | **Reference.** Adapt to Supabase Storage clearing. |
| `core/src/memories/README.md` | Design doc | `docs/reference-analysis/codex-memory-system.md` (this file) | **Already captured here.** |

### C. State Management (REFERENCE — adapt to Supabase)

| Codex File | Purpose | Sunder Equivalent | Action |
|---|---|---|---|
| `state/src/runtime/memories.rs` | SQLite tables + coordination queries | Supabase migration: `memory_stage1_outputs`, `memory_jobs` tables | **Reference.** Port the `stage1_outputs` schema and job coordination queries to Postgres + RLS. |
| `state/migrations/0016_memory_usage.sql` | Usage tracking columns | Supabase migration | **Reference.** Add `usage_count`, `last_usage` columns. |

### D. Testing (REFERENCE)

| Codex File | Purpose | Sunder Equivalent |
|---|---|---|
| `core/src/memories/tests.rs` | Unit tests | `src/lib/memory/pipeline/__tests__/` |
| `core/tests/suite/memories.rs` | Integration tests | `src/lib/memory/pipeline/__tests__/integration.test.ts` |
| `state/src/runtime/memories.rs` (test section) | State DB tests | Supabase migration tests |
| `cli/tests/debug_clear_memories.rs` | CLI clear command test | API route test |

---

## Part III: Where Sunder Drifts Today and Whether to Keep It

### Drift 1: Agent writes memory inline during conversation
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Who writes memory** | Background pipeline (Phase 1 + Phase 2) — agent never writes memory during conversation | Agent writes memory inline via `write_file` during conversation |
| **When memory is written** | After session ends + 6h idle | During the conversation, guided by auto-write rules |

**Verdict: JUSTIFIED DRIFT — keep for now, add pipeline later.**

Reasons to keep:
1. Sunder is a SaaS product with persistent threads, not a CLI tool. Users expect the agent to remember things immediately within the same conversation.
2. Codex's Phase 1/Phase 2 pipeline requires: (a) rollout persistence as JSONL files, (b) a state DB with job coordination, (c) background compute for extraction + consolidation. This is significant infrastructure.
3. Sunder's current inline memory writing works and ships value now.

**Recommended plan:** Keep inline writing for v1. Add the Phase 1 + Phase 2 pipeline as a future enhancement (e.g., a nightly Vercel Cron job that consolidates memory across all threads for a client). This gives both immediacy (inline) and quality (background consolidation).

### Drift 2: Three separate root files (SOUL/USER/MEMORY) vs single hierarchy
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Root files** | `memory_summary.md` (injected) + `MEMORY.md` (searchable) | `SOUL.md` + `USER.md` + `MEMORY.md` (all three injected) |
| **What's injected** | Only `memory_summary.md` (≤5000 tokens) | All three root files (SOUL + USER + MEMORY first 200 lines) |

**Verdict: DRIFT WE SHOULD FIX.**

Codex's approach is better because:
1. **Token efficiency:** Injecting only a compact summary (≤5000 tokens) is far more efficient than injecting three full files. As memory grows, Sunder's approach will bloat the context.
2. **Progressive disclosure:** Codex lets the agent read MEMORY.md on-demand. Sunder dumps everything upfront.
3. **Structured summary:** Codex's `memory_summary.md` has a strict schema (User Profile + General Tips + What's in Memory index). Sunder's three-file system doesn't have this navigational layer.

**What to do:**
- Add `memory_summary.md` as the single injected file (like Codex)
- Keep SOUL.md, USER.md, MEMORY.md as readable files (agent can open on-demand)
- Stop injecting all three into every context
- Use Codex's `memory_summary.md` format (User Profile + General Tips + What's in Memory)

### Drift 3: No structured memory format
| Aspect | Codex | Sunder Today |
|---|---|---|
| **MEMORY.md format** | Strict schema: `# Task Group` → `scope:` → `## Task N` → `### rollout_summary_files` → `### keywords` → `### learnings` | Freeform agent-written markdown |

**Verdict: DRIFT WE SHOULD FIX.**

Codex's structured format exists because:
1. It makes memory **searchable** via grep (keywords section)
2. It preserves **provenance** (which conversation produced which learning)
3. It enables **incremental updates** (add/remove specific task sections)
4. It supports **retrieval** (the agent can quickly find relevant blocks)

**What to do:** Adopt Codex's MEMORY.md schema. Adapt the template — replace "rollout_summary_files" with "source_threads" (pointing to thread IDs), keep keywords and learnings sections. Include the schema rules in the system prompt's `<memory-system>` section.

### Drift 4: No memory read-path instructions
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Read-time behavior** | 168-line `read_path.md` template teaching the agent when/how to use memory, verification heuristics, stale update rules, citation format | Simple 24-line `<memory-system>` section with auto-write rules |

**Verdict: DRIFT WE SHOULD FIX.**

Codex's read-path instructions are critical for memory quality:
1. **Decision boundary:** Skip memory for trivial queries, use by default for workspace queries
2. **Quick memory pass:** Structured 5-step procedure with budget (≤4-6 search steps)
3. **Verification guidance:** When to verify vs trust memory
4. **Stale memory update rules:** MUST update in same turn when stale detected
5. **Citation requirements:** Enables usage tracking

**What to do:** Copy `read_path.md` almost verbatim into the system prompt. Remove the citation format (unless implementing citation tracking). Adapt paths to Sunder's storage convention.

### Drift 5: No signal gate / quality filtering
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Signal quality** | Explicit no-op gate: "Will a future agent plausibly act better?" High-signal criteria defined. | No signal gate. Agent writes based on auto-write rules. |

**Verdict: DRIFT WE SHOULD FIX.**

Without a signal gate, Sunder's memory will accumulate noise. The auto-write rules ("write immediately when user states a lasting preference") are a good start but don't filter for signal quality.

**What to do:** Add Codex's high-signal memory criteria and no-op gate language to the `<memory-system>` section. Copy the "What counts as high-signal memory" section from the consolidation prompt.

### Drift 6: No usage tracking or forgetting
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Memory lifecycle** | Usage-based ranking, `max_unused_days` eviction, selection diff for incremental updates | Memory only grows, never shrinks |

**Verdict: JUSTIFIED DRIFT — defer to pipeline phase.**

Usage tracking and forgetting are Phase 2 pipeline features. They require background processing and DB-backed tracking. Not feasible to implement with inline memory writing alone.

**What to do:** Defer. When adding the consolidation pipeline, implement usage tracking.

### Drift 7: No secret redaction
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Secrets** | `redact_secrets()` applied to all generated memory | No redaction |

**Verdict: DRIFT WE SHOULD FIX.**

Agents can inadvertently save API keys, passwords, or tokens mentioned in conversation. A redaction step is a safety requirement.

**What to do:** Add a `redactSecrets()` utility that scans memory content before writes. Can be as simple as regex-based pattern matching for common secret formats. Add the instruction "never store tokens/keys/passwords; replace with [REDACTED]" to the `<memory-system>` section.

### Drift 8: Supabase Storage vs local filesystem
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Storage** | Local filesystem (`$CODEX_HOME/memories/`) | Supabase Storage (`agent-files` bucket) |

**Verdict: JUSTIFIED DRIFT — keep.**

Codex is a CLI tool; local filesystem is natural. Sunder is a multi-tenant SaaS; Supabase Storage is the correct choice. This drift is a platform constraint, not a design choice.

### Drift 9: Topic files vs skills system
| Aspect | Codex | Sunder Today |
|---|---|---|
| **Organized memory** | `skills/` directory with YAML-frontmatter SKILL.md + scripts/templates/examples | `memory/` directory with 4 pre-seeded topic files |

**Verdict: PARTIAL DRIFT — adopt skills later, keep topics for now.**

Codex's skills system is powerful but designed for a developer tool (reusable procedures for coding tasks). Sunder's domain (real estate CRM) may benefit more from the topic-file approach for now. However, the skills pattern could be valuable later for things like "how to do a listing presentation" or "standard follow-up sequence".

**What to do:** Keep the topic files. Add the skills directory structure as a future enhancement when the product matures enough to have repeatable agent procedures.

---

## Part IV: Recommended Implementation Order

### Phase A: Immediate (system prompt improvements — no infrastructure)
1. **Copy `read_path.md` into system prompt** — Add decision boundary, quick memory pass, verification guidance, stale update rules
2. **Copy high-signal criteria** — Add "What counts as high-signal memory" and no-op gate language
3. **Add secret redaction instruction** — "Never store tokens/keys/passwords; replace with [REDACTED]"
4. **Adopt structured MEMORY.md format** — Add the Task Group schema to system prompt instructions

### Phase B: Medium-term (add `memory_summary.md` layer)
1. **Create `memory_summary.md`** — Add to bootstrap, seed with User Profile + General Tips + What's in Memory sections
2. **Inject only `memory_summary.md`** — Stop injecting all three root files; inject summary only + teach agent to read others on-demand
3. **Update system prompt** — Include the `memory_summary.md` content between markers (like Codex does)
4. **Add `redactSecrets()` utility** — Apply before all memory writes

### Phase C: Future (background consolidation pipeline)
1. **Add `memory_stage1_outputs` and `memory_jobs` tables** — Port Codex's state DB schema to Supabase
2. **Implement Phase 1 extraction** — Vercel Cron job that processes idle threads
3. **Implement Phase 2 consolidation** — Single consolidated run using Codex's consolidation prompt
4. **Add usage tracking** — Track which memories the agent reads/cites
5. **Add forgetting** — Evict unused memories after N days

---

## Part V: Key Codex Files Quick Reference

For anyone implementing the above, these are the files to have open:

| Priority | File | What to look at |
|---|---|---|
| **P0** | `core/templates/memories/read_path.md` | Read-time instructions — copy into system prompt |
| **P0** | `core/templates/memories/consolidation.md` | MEMORY.md schema, memory_summary.md schema, quality rules |
| **P0** | `core/templates/memories/stage_one_system.md` | Signal gate, high-signal criteria, task outcome triage |
| **P1** | `core/src/memories/prompts.rs` | How templates are rendered, token truncation logic |
| **P1** | `core/src/memories/storage.rs` | File sync patterns, naming conventions |
| **P1** | `core/src/memories/README.md` | Architecture overview, phase split rationale |
| **P2** | `core/src/memories/phase1.rs` | Extraction pipeline, concurrency, structured output parsing |
| **P2** | `core/src/memories/phase2.rs` | Consolidation pipeline, sub-agent spawning, heartbeat |
| **P2** | `state/src/runtime/memories.rs` | DB schema, job coordination, selection queries |
| **P2** | `core/src/memories/tests.rs` | Test patterns, mocking strategy |
