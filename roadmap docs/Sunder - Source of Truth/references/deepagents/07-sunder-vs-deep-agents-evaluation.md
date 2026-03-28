# Sunder vs LangChain Deep Agents — Full Objective Evaluation

> Comprehensive cross-reference of Sunder's agent architecture against LangChain
> Deep Agents. Based on reading both codebases. Evaluated 2026-03-25.

Legend: ✅ Fully implemented — ⚠️ Partial — ❌ Missing — 🔄 Different approach — ➕ Sunder-only

---

## Part 1: Where Sunder Matches or Exceeds Deep Agents

### 1. Core Orchestration Loop — ✅ Matched

Both follow the same pattern: acquire lock → load state → build context → call model → execute tools → persist → continue.

Sunder's `run-agent.ts` is a clean, linear 360-line function. Deep Agents uses a LangGraph `CompiledStateGraph` with middleware composition. Both are solid. Sunder's is more readable; Deep Agents' is more extensible.

**Grade**: Even.

---

### 2. Approval / Human-in-the-Loop — ✅ Sunder ahead

| Aspect | Deep Agents | Sunder |
|--------|------------|--------|
| Mechanism | `interrupt_on` parameter, in-memory checkpointing | DB-backed `approval_events` table |
| Persistence | Lost on process restart | Survives restarts, browser refresh, sessions |
| Multi-channel | No | Yes — web + Telegram inline keyboards |
| Granularity | Per-tool-name boolean | Two-tier safety model (internal auto-run, external gated) |
| Agent awareness | No visibility into pending approvals | System-reminder includes `pending_approval_count` |

Deep Agents' approach is simpler but fragile — it requires an in-memory checkpointer (`MemorySaver`). Ours is production-grade.

**Grade**: Sunder significantly ahead.

---

### 3. Context Assembly — ✅ Sunder ahead

Deep Agents: System prompt → middleware injects memory/skills/todos.

Sunder: 7 explicit layers with conditional feature prompts, CRM vocabulary injection, and a structured system-reminder XML block with live stats (open todos, pending approvals, active triggers, connection toolkits, days since signup).

More granular, more informative to the model, and the conditional inclusion (only inject browser prompt if browser is configured) keeps token cost proportional to enabled features.

**Grade**: Sunder ahead.

---

### 4. Progressive Disclosure (Skills) — ✅ Matched

Both: scan frontmatter at startup, load full SKILL.md on demand.

Sunder adds HTML-escaping of skill content to prevent prompt injection. Deep Agents does not.

**Grade**: Even (slight Sunder edge on security).

---

### 5. Subagent Isolation — ✅ Matched

Both: stateless, single-message return, fresh context, filesystem access preserved.

Sunder: More granular tool restrictions (no browser, connections, triggers, send_message). Deep Agents: Custom subagent configs with `subagents` parameter.

Deep Agents also supports **async remote subagents** via LangGraph deployments — the main agent doesn't block. Sunder's subagents are synchronous.

**Grade**: Even. Different strengths (Sunder: tighter safety; DA: async remote execution).

---

### 6. Memory System — ✅ Sunder ahead

| Aspect | Deep Agents | Sunder |
|--------|------------|--------|
| Format | Single `AGENTS.md` file | 3 root files (SOUL/USER/MEMORY) + topic files |
| Structure | Freeform markdown | Role-separated (personality vs. user profile vs. notebook) |
| Overflow handling | None (file grows unbounded) | MEMORY.md capped at 200 lines with warning |
| Topic files | No | Yes — preferences, patterns, decisions, growth-plan |
| Bootstrap | Manual seeding | Auto-bootstrap on first run with templates |
| Security guidance | "Never store credentials" in prompt | Same, plus memory content doesn't affect tool permissions |

Sunder's structured memory with overflow management is more mature. Deep Agents' single-file approach is simpler but doesn't scale.

**Grade**: Sunder ahead.

---

### 7. Two-Tier Safety Model — ✅ Matched

Both implement the same principle: internal work auto-runs, external/destructive actions gated. Sunder's approval persistence and multi-channel delivery make it more production-ready (covered in #2).

**Grade**: Even on principle, Sunder ahead on implementation.

---

### 8. Sandbox Execution — ✅ Sunder ahead

Both use sandbox-as-tool (credentials on host, sandbox is callable).

Sunder's Sprite system adds:
- **Per-thread session persistence** (same Sprite across follow-up calls for iterative refinement)
- **Skill-aware sandboxing** (Claude Code inside Sprite auto-reads user skill files)
- **Multi-phase artifact publishing** (loop preview → signed URL → download)
- **Domain-specific templates** (property showcases, spreadsheet analysis)

Deep Agents provides generic `execute()` with provider abstraction (Modal, Daytona, Runloop). More flexible but less opinionated.

**Grade**: Sunder ahead for production use. Deep Agents ahead for provider flexibility.

---

### 9. Filesystem Isolation — ✅ Sunder ahead

Deep Agents: `virtual_mode=True` flag on FilesystemBackend. Easy to forget. LocalShellBackend grants unrestricted host shell access (dangerous).

Sunder: No local filesystem at all. All operations go through Supabase Storage API with RLS + `clientId` scoping. Inherently more secure — there's no "forget to set a flag" footgun.

**Grade**: Sunder ahead.

---

### 10. Retry / Resilience — ✅ Now matched

Deep Agents: 6 retries with exponential backoff (configured on model).

Sunder: Now `maxRetries: 6` on `streamText()` (just added). Plus tool-level retries on vault sync (3 attempts, exponential backoff). Plus stale run cleanup before each new run.

**Grade**: Even.

---

## Part 2: Where Deep Agents Is Ahead

### 11. Token Budgeting — Two-Tier Truncation — ⚠️ Deep Agents ahead

Deep Agents has a **two-tier** approach before full summarization:

1. **Tier 1 — Arg truncation**: At 85% context, truncate `write_file`/`edit_file` string arguments in old messages to 20 chars. Cheap, preserves message structure.
2. **Tier 2 — Full summarization**: If still over limit, partition + offload + LLM-summarize.

Sunder goes straight to full compaction at 85%. No intermediate step.

**Impact**: With Gemini's 1M context window, this rarely matters. It would matter more with smaller models or tool-heavy autonomous work.

**Grade**: Deep Agents ahead (minor).

---

### 12. Post-Compaction History Recovery — ❌ Deep Agents ahead

Deep Agents: Saves old messages to `/conversation_history/{thread_id}.md` before summarization. Summary includes the file path so the agent can `read_file` to recover details.

Sunder: Old messages exist in DB but agent has no tool to retrieve them post-compaction.

**Impact**: Low in practice — our 30-message preservation + structured 4-section summary covers most needs. Users can scroll up in the UI for verbatim history.

**Grade**: Deep Agents ahead (minor).

---

### 13. Todo Status Tracking — ⚠️ Deep Agents ahead

| Aspect | Deep Agents `write_todos` | Sunder `manage_todo` / `list_todo` |
|--------|--------------------------|-------------------------------------|
| Status model | `pending` → `in_progress` → `completed` | No status field |
| Context visibility | Full todo list always in context (middleware) | Only count shown; agent must call `list_todo` |
| Operation model | Full list replacement (atomic) | Individual add/update/delete (batch) |
| Persistence | Ephemeral (session state) | DB-backed (survives runs) |
| Middleware enforcement | Rejects parallel `write_todos` calls | None |
| UI rendering | Spinner with `activeForm` text | Count in system reminder only |

Deep Agents' status tracking gives the model structured feedback on its own progress. Ours is a flat scratchpad — the model can't see "3 of 7 done" at a glance.

However, our DB persistence means todos survive across runs (useful for multi-session workflows). Theirs are session-only.

**Grade**: Deep Agents ahead on within-run planning; Sunder ahead on cross-run persistence.

---

### 14. Middleware Composition — 🔄 Deep Agents architecturally different

Deep Agents: Middleware stack is a first-class concept. TodoList, Filesystem, Summarization, PromptCaching, Skills, Memory — all composed via ordered middleware chain. Custom middleware via `@wrap_tool_call`. Clean separation of concerns.

Sunder: No middleware abstraction. Everything is procedural in `run-agent.ts` and `context.ts`. Works fine but harder to extend — adding a new cross-cutting concern (e.g., tool call logging, cost tracking) requires touching the main loop.

**Impact**: Matters for extensibility and clean architecture. Doesn't matter for current feature set.

**Grade**: Deep Agents ahead architecturally. Sunder's approach is simpler and fine for a single-product codebase.

---

### 15. Prompt Caching — ❌ Not applicable (but noteworthy)

Deep Agents: `AnthropicPromptCachingMiddleware` applied after all other middleware. Carefully ordered to avoid cache invalidation.

Sunder: Uses Gemini (no prompt caching mechanism). Not a gap — it's a model choice. If we ever switch to Anthropic models, we'd need to implement this.

**Grade**: N/A.

---

### 16. Eval Framework — ❌ Deep Agents significantly ahead

Deep Agents has a comprehensive eval suite in `libs/evals/`:
- File operations, memory, summarization, subagents, HITL, skills
- Complex multi-turn benchmarks (BFCL, TAU2 airline dialogue)
- LangSmith integration for trace capture and scoring
- Parameterized by model (test across providers)
- Harbor wrapper for standardized eval runs

Sunder: QA scenarios run against the chat API + Langfuse trace analysis. Useful but not systematic evals against ground-truth benchmarks.

**Impact**: High for model migration confidence, regression detection, and measuring improvements. Deep Agents can prove their summarization doesn't lose information; we can't.

**Grade**: Deep Agents significantly ahead.

---

### 17. MCP Server Integration — ❌ Deep Agents ahead

Deep Agents: Full MCP (Model Context Protocol) support — discovers `.mcp.json` configs, supports stdio/sse/http transports, trust management, auto-loads MCP tools.

Sunder: No MCP support. External integrations via Composio OAuth (which is arguably more user-friendly for non-technical users, but less flexible for developers).

**Grade**: Deep Agents ahead on developer extensibility. Sunder ahead on end-user experience (OAuth flow vs. MCP config files).

---

### 18. Unicode Security — ❌ Deep Agents ahead (niche)

Deep Agents: `unicode_security.py` detects homoglyph attacks in URLs (e.g., replacing `a` with Cyrillic `а`). Marks dangerous characters in output.

Sunder: No unicode security checks.

**Impact**: Low for our use case (advisory sales, not security-critical browsing). But it's a nice defense-in-depth measure.

**Grade**: Deep Agents ahead (minor, niche).

---

## Part 3: Sunder-Only Capabilities (No Deep Agents Equivalent)

### ➕ CRM System

Full multi-entity CRM with unified search, create, update, delete, link, interactions, tasks. Custom field merging (JSONB shallow-merge). Dynamic vocabulary configuration. Duplicate detection. Setup mode for live schema editing.

Deep Agents has no CRM concept.

---

### ➕ Autopilot / Trigger System

CRON schedules, webhooks, RSS polling. Per-trigger instruction files. Timezone-aware scheduling. Pulse-based background work. Queue-aware concurrency with fire-and-forget semantics for pulses.

Deep Agents has no autonomous trigger system.

---

### ➕ OAuth Connection Management (Composio)

3000+ integrations. Dynamic tool loading at runtime. Connection lifecycle management. Per-action enable/disable. Multi-tenant credential scoping.

Deep Agents uses MCP (developer-facing, config-file-based). No OAuth flow for end users.

---

### ➕ Market Data & Property Listings

Singapore-specific CEA agents, transactions, HDB resale, URA private residential. Stats mode with aggregation. 99.co and PropertyGuru search integration. Domain-specific — no equivalent in a general-purpose framework.

---

### ➕ Queue Batching & Drain

Intelligent message coalescing during active runs. File attachments force batch boundaries. Ordered re-queuing. This solves a real production problem (rapid-fire user messages during agent execution).

Deep Agents has no queue system in its core library.

---

### ➕ Multi-Channel Delivery

Telegram with inline approval keyboards. WhatsApp (pending). Channel-aware formatting. Callback parsing for approval continuations.

Deep Agents is CLI/API only. No channel delivery.

---

### ➕ Billing / Message Quota

Per-plan monthly quotas. Atomic consumption with rollback on failure. Approval continuations exempt from quota. Stripe integration.

Deep Agents has no billing concept.

---

### ➕ Dynamic CRM Mode Switching

Live toggle between chat mode and CRM setup mode. Agent guides user through vocabulary customization without leaving the conversation.

---

### ➕ Spec View Rendering

RFC 6902 JSON Patches inline in agent responses. Parsed into structured UI components. Enables rich inline views (deal cards, contact profiles) without separate API calls.

Deep Agents has no equivalent inline UI rendering.

---

## Part 4: Summary Scorecard

### Shared Capabilities (apples-to-apples)

| # | Capability | Deep Agents | Sunder | Winner |
|---|-----------|-------------|--------|--------|
| 1 | Core loop | Clean, middleware-composed | Clean, procedural | Even |
| 2 | Approvals / HITL | In-memory checkpoint | DB-backed, multi-channel, async | **Sunder** |
| 3 | Context assembly | Middleware-injected | 7 explicit layers + system-reminder | **Sunder** |
| 4 | Skills (progressive disclosure) | Standard | Standard + HTML escaping | Even |
| 5 | Subagents | Sync + async remote | Sync only, tighter restrictions | Even |
| 6 | Memory | Single AGENTS.md, no cap | 3 root files + topic files, 200-line cap | **Sunder** |
| 7 | Safety model | interrupt_on per tool | Two-tier (internal/external) | Even |
| 8 | Sandbox | Provider-agnostic (Modal/Daytona/etc.) | Sprite with session persistence | **Sunder** (production) |
| 9 | Filesystem isolation | virtual_mode flag | No local FS, all via RLS API | **Sunder** |
| 10 | Retry / resilience | 6 retries, exponential backoff | 6 retries (now), stale run cleanup | Even |
| 11 | Token budgeting | Two-tier (arg truncation + summarization) | Single-tier (summarization only) | **Deep Agents** |
| 12 | Post-compaction history | Offloaded to file, recoverable | DB-only, no agent access | **Deep Agents** |
| 13 | Todo / planning tool | Statuses, full context visibility | DB-backed scratchpad, count only | **Deep Agents** (within-run) |
| 14 | Middleware / extensibility | First-class middleware chain | Procedural (simpler, less extensible) | **Deep Agents** |
| 15 | Prompt caching | Anthropic-optimized | N/A (Gemini) | N/A |
| 16 | Eval framework | Comprehensive (BFCL, TAU2, LangSmith) | QA scenarios + Langfuse | **Deep Agents** |
| 17 | External integrations | MCP servers (developer-facing) | Composio OAuth (user-facing) | Context-dependent |
| 18 | Unicode security | Homoglyph detection | None | **Deep Agents** |
| 19 | Compaction quality | Default LangChain summary prompt | Structured 4-section handoff | **Sunder** |
| 20 | Tool prompt quality | Good (docstrings with guidance) | Good (JSDoc with when-to-use) | Even |

### Tally

- **Sunder ahead**: 6 (approvals, context, memory, sandbox, FS isolation, compaction quality)
- **Deep Agents ahead**: 5 (token budgeting, post-compaction recovery, todo statuses, middleware, evals)
- **Even**: 7
- **N/A or context-dependent**: 2

### Sunder-Only Capabilities (no DA equivalent)

CRM system, autopilot/triggers, OAuth connections (3000+), market data, queue batching, multi-channel delivery, billing/quota, CRM mode switching, spec view rendering.

---

## Part 5: Honest Assessment

**What Deep Agents does better** (worth learning from):

1. **Eval framework** — This is the biggest real gap. We can't systematically prove our agent works correctly across scenarios. Deep Agents can run BFCL benchmarks, test summarization fidelity, and measure tool selection accuracy. We should build this.

2. **Middleware composition** — Not urgent, but if we keep adding cross-cutting concerns (cost tracking, rate limiting, audit logging), the procedural approach will get messy. Worth considering if `run-agent.ts` grows past ~500 lines.

3. **Two-tier truncation** — Cheap optimization that buys headroom before full compaction. Easy to implement: clip large tool args in old messages before checking if summarization is needed.

4. **Todo status model** — Adding `status` to our existing `manage_todo` tool and injecting the full list (not just count) into context would improve multi-step planning visibility. Small change, decent payoff.

**What Sunder does better** (keep doing):

1. **Production hardening** — DB-backed approvals, queue batching, quota enforcement, stale run cleanup, multi-channel delivery. These are the boring things that make a product work. Deep Agents is a framework; we're a product.

2. **Structured memory** — 3-file separation (personality / user profile / working notebook) with overflow into topic files is more thoughtful than a single AGENTS.md.

3. **Domain depth** — CRM, market data, property listings, autopilot triggers. This isn't framework work — it's product differentiation.

4. **Compaction quality** — Our 4-section structured handoff (User Instructions / Workflow / Resources / Current Focus) is more reliable than a generic summary prompt.

**Overall**: Sunder is a **more production-ready product** built on patterns that align with Deep Agents' recommendations. Deep Agents is a **more extensible framework** with better developer tooling (evals, middleware, MCP). The architectures are fundamentally similar — the differences are in where each invested depth.
