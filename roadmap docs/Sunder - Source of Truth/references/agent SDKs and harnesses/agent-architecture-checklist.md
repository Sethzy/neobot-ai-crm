# Sunder Agent Architecture — Finalisation Checklist

## Why this file exists
This is a comprehensive, plain-language list of every pattern, decision, and consideration surfaced from the agent harness reference materials in this directory. Each item maps to Sunder's current state and says what it is, what implementing (or explicitly skipping) it would achieve, and where Sunder currently stands.

Cross-referenced against: `agent-harness-is-the-real-product.md`, `context-engineering-landscape.md`, `how-to-be-a-world-class-agentic-engineer.md`, `Harness-Model Coupling — Research and Contingency Plan.md`, and the existing Sunder runner at `src/lib/runner/`.

---

## A) Core Loop Architecture

1. **Single flat loop (while tool_call → execute → append → call again)**
What it is: Every production agent converges on a simple agentic loop — no DAGs, no competing agent personas. The model gets messages+tools, returns text (end) or tool calls (continue).
What this achieves: Simplicity, debuggability, and alignment with how every frontier team ships agents (Claude Code, Cursor, Manus, SWE-Agent, Devin).
Sunder status: Implemented via `streamText()` + `stopWhen: stepCountIs(8)` in `run-agent.ts`. Loop is model-controlled. Aligned.
Sources: Claude Code, Manus, Cursor, SWE-Agent

2. **"Model controls the loop" vs "code controls the model"**
What it is: The model decides when to stop (by emitting text instead of tool calls), not an orchestrator. Harness provides tools and guardrails but does not dictate execution order.
What this achieves: Models perform better when they control their own execution flow rather than being force-marched through predefined steps.
Sunder status: Aligned. `streamText()` with tools — model decides when to call tools and when to respond. No orchestrator logic.
Sources: Anthropic ("the model controls the loop")

3. **maxSteps budget per tier**
What it is: Capping the number of tool-call steps to prevent runaway loops and control costs. Different complexity tiers get different budgets.
What this achieves: Cost control and guardrails against infinite loops. Simpler tasks don't waste tokens on unnecessary iterations.
Sunder status: Currently fixed at `MAX_STEPS_TIER_1 = 8`. Router (LLM-03) is designed to return per-tier maxSteps but not yet implemented. Decision needed: implement router-driven maxSteps per complexity tier.
Sources: Savoir routeQuestion pattern, Anthropic

4. **Serialized execution: one run per thread**
What it is: Only one active run per thread at a time. Messages arriving during an active run are queued (DB-backed) and drained after run completes.
What this achieves: Prevents race conditions, ensures coherent conversation state, avoids double-charging tokens on concurrent runs.
Sunder status: Implemented. `createRun` acquires DB lock; `enqueueMessage` + `drainAndContinue` handles queuing. Stale run cleanup at 15 minutes.
Sources: Sunder architecture decision (original design)

5. **Loop/fixation detection**
What it is: Detecting when the agent enters a repetitive cycle (calling the same tool with same args, generating near-identical outputs) and injecting variation.
What this achieves: Prevents token waste and user frustration from agents stuck in loops.
Sunder status: Not implemented. Currently relies on maxSteps as the only guardrail. Consider: detecting repeated tool calls within a run and either injecting a variation prompt or terminating early with an explanation.
Sources: Manus (structured variation), Cursor (detection)

6. **Linter-gated or validation-gated tool calls**
What it is: SWE-Agent runs a linter after every edit tool call. If the result is invalid, the edit is rejected and the model must retry.
What this achieves: 3% performance improvement on code benchmarks. Prevents cascading errors from malformed outputs.
Sunder status: Not applicable for V1 (no code generation tools). Relevant if Sunder adds code-gen or template-gen capabilities. Note for future.
Sources: SWE-Agent (NeurIPS 2024)

---

## B) Tool Design

7. **Primitives over integrations**
What it is: Provide small, composable tools (read, write, search, list) rather than high-level "do-everything" tools. Claude Code uses ~18 primitives in four categories.
What this achieves: Models compose primitives better than they navigate complex tool APIs. Vercel found that removing 80% of tools improved agent performance (failing → succeeding).
Sunder status: Partially aligned. CRM tools are well-factored (search_contacts, create_contact, update_contact, etc.). Storage tools are primitives (read_file, write_file, list_files). Web tools are primitives (search, scrape). Review: are any tools doing too much? Is any single tool confusing the model?
Sources: Claude Code, Vercel case study, Anthropic

8. **Lean tools with no overlap**
What it is: "If a human engineer cannot say which tool to use in a given situation, neither can the model." Each tool should be self-contained and unambiguous.
What this achieves: Reduces tool selection confusion. Models waste fewer steps calling the wrong tool.
Sunder status: Audit needed. Check for overlap between `search_contacts` vs general search, between `create_interaction` vs `update_contact`, etc. Ensure tool descriptions are crisp and unambiguous.
Sources: Anthropic

9. **Tool count management**
What it is: Every tool definition consumes context window tokens. More tools = more noise = worse performance.
What this achieves: Keeping total tool definitions lean preserves attention budget for actual conversation and task completion.
Sunder status: Currently ~17 tools (10 CRM + 3 storage + 2 web + knowledge base tools). This is reasonable. Monitor as tools grow — Vercel's inflection point was at very high tool counts. Consider: lazy loading (see item 17) if tool count grows past ~25.
Sources: Vercel (145K → 67K tokens by removing tools), Cursor (46.9% reduction via lazy loading)

10. **Tool naming with consistent prefixes**
What it is: Manus uses `browser_*`, `shell_*`, `file_*` prefixes. Enables group-level operations (masking, categorization).
What this achieves: Model can reason about tool categories. Enables future lazy loading or gating by prefix.
Sunder status: Partially aligned. CRM tools are named individually (search_contacts, create_deal), not prefixed (crm_search_contacts). Storage tools follow this too (read_file, not storage_read_file). Decision: adopt `crm_*`, `storage_*`, `web_*` prefixes, or leave as-is? Consider cost of migration vs future benefits.
Sources: Manus

11. **Gating tools by phase/context**
What it is: Not all tools are needed for all tasks. Write tools can be gated behind environment variables, user permissions, or task phase.
What this achieves: Reduces risk of accidental mutations. Follows principle of least privilege.
Sunder status: Implemented. Write tools gated by `RUNNER_ENABLE_CRM_WRITE_TOOLS` env var. System prompt requires user confirmation before CRM writes (interim SAFETY-02 pattern until mechanical approval gate in PR 33).
Sources: Sunder architecture (existing)

---

## C) Context Engineering

12. **System prompt: the Goldilocks zone**
What it is: Anthropic found two failure modes — over-engineered prompts (2K+ words of if-else logic) and vague prompts ("be helpful"). The sweet spot: organized sections, canonical examples, let the model handle edge cases.
What this achieves: Higher instruction adherence without brittleness. Models handle novel situations better when given principles + examples vs exhaustive rules.
Sunder status: Current system prompt is 48 lines, ~400 tokens. It's in the "just right" zone for current scope. Phase 2 will add the 7-layer system prompt (SOUL, USER, MEMORY layers). Risk: ensure Phase 2 expansion doesn't push into "too specific" territory. Test with canonical examples rather than exhaustive rules.
Sources: Anthropic ("Effective Context Engineering")

13. **Information layering (multi-layer system prompt)**
What it is: Claude Code loads six layers at session start: org policies, project CLAUDE.md, user settings, MEMORY.md, session history, git state. Each layer has a clear responsibility.
What this achieves: Structured context that the model can reason about. Different layers update at different cadences. Separates "who am I" from "what do I know" from "what's happening now."
Sunder status: Phase 2 (PRs 13-19a) will implement the 7-layer prompt: identity, personality, client knowledge (SOUL.md, USER.md), accumulated memory (MEMORY.md, memory/*.md), session context, and tool state. Currently a flat string. This is the highest-impact Phase 2 deliverable for agent quality.
Sources: Claude Code, Sunder App Spec

14. **System reminders injected after tool calls**
What it is: Claude Code appends fixed text after every tool execution result. These "system reminders" reinforce behavioral instructions at high-attention positions.
What this achieves: Higher behavioral adherence than system-prompt-only instructions because reminders repeat with every call, landing in the high-attention end-of-context zone.
Sunder status: Not implemented. Consider: injecting a short reminder after each tool result (e.g., "Remember: always ask before CRM writes. Be concise."). Vercel AI SDK supports middleware or onStepFinish hooks that could inject these. High-value, low-effort.
Sources: Claude Code (reverse-engineered)

15. **Progressive disclosure / just-in-time retrieval**
What it is: Agent discovers context incrementally instead of loading everything upfront. Skills, memories, and knowledge are fetched on-demand when the model detects relevance.
What this achieves: 26x token efficiency improvement (Claude-Mem: 25K tokens at 0.8% relevance → 955 tokens at 100%). Prevents "lost in the middle" degradation. Keeps context small and high-signal.
Sunder status: Not implemented yet. Phase 2 memory system should be designed with this in mind. Don't dump all of SOUL.md + USER.md + MEMORY.md + every memory/*.md into every context. Instead: load core identity always, search memory on-demand based on conversation topic. Consider a `recall_memory` tool the model can invoke.
Sources: Claude Code (SKILL.md), Cursor (lazy loading), Claude-Mem study

16. **Lazy tool loading**
What it is: Only tool names are pre-loaded into context. Full tool definitions (with parameter schemas and descriptions) are fetched on-demand when the model decides to use a tool.
What this achieves: Cursor measured 46.9% token reduction in A/B tests.
Sunder status: Not implemented. Not critical at current tool count (~17). Becomes relevant if tool count grows past ~25 or if memory layers significantly expand context size. Vercel AI SDK may not natively support this — would need custom middleware. Park for now, implement if token budget becomes tight.
Sources: Cursor

17. **Filesystem as extended memory**
What it is: Large observations, plans, and intermediate results are written to files. Only lightweight references stay in context. Agent reads back on demand.
What this achieves: Extends effective context well beyond the model's window. Enables long-running tasks that span multiple context windows.
Sunder status: Storage tools exist (read_file, write_file, list_files) writing to Supabase Storage. Phase 2 memory system will use this pattern (SOUL.md, USER.md, MEMORY.md as files). Aligned directionally. Consider: should the agent write intermediate work products (research summaries, plans) to files during complex tasks?
Sources: Manus, Cursor, Anthropic

18. **Observation compression / context compaction**
What it is: As context grows, older tool results are summarized or truncated. Claude Code auto-summarizes at 95% capacity. SWE-Agent collapses all but last 5 observations to one line each.
What this achieves: Prevents context overflow. Keeps recent information in the high-attention zone while preserving essential history.
Sunder status: Not implemented. Currently loads full thread history from DB. For short conversations this is fine. Risk: long-running threads (20+ messages with tool calls) will hit context limits. Decision needed: implement conversation trimming or summarization. Options: (a) cap at last N messages, (b) LLM-summarize older history, (c) Cursor's pattern of saving full history to file + summarizing in context.
Sources: Anthropic (compaction at 95%), SWE-Agent (collapse to 1 line), OpenAI (trimming + summarization)

19. **Chat history as recoverable file**
What it is: Cursor saves full conversation history to a file before summarizing. Agent can restore any lost detail by reading the file.
What this achieves: Lossy compression becomes lossless. Agent never permanently loses context — it just needs to look it up.
Sunder status: Thread history is already persisted in Supabase (`conversation_messages` table). The pattern is naturally available — if compaction is implemented, the full history remains queryable. Consider: giving the agent a `search_thread_history` tool for finding older context.
Sources: Cursor

---

## D) Planning and Coherence

20. **No-op planning tool (TodoWrite / todo.md)**
What it is: A tool that does nothing functionally except force the agent to articulate and track its plan. Claude Code's TodoWrite and Manus's todo.md are both purely context-engineering tricks.
What this achieves: Keeps the agent on course over long trajectories. LangChain calls it out as the key pattern for preventing drift in multi-step tasks.
Sunder status: Not implemented. Consider: adding a `update_plan` tool for complex multi-step requests. The tool would write a plan to context (or a file), keeping the agent's current objective in the high-attention zone. Most valuable for Phase 2 autopilot tasks that span multiple tool calls.
Sources: Claude Code (TodoWrite), Manus (todo.md), LangChain (Deep Agents)

21. **Attention manipulation through recitation**
What it is: Manus rewrites and re-reads todo.md every step, placing the current objective in the high-attention zone (end of context). Counteracts "lost in the middle."
What this achieves: Agent maintains coherence over 20+ step trajectories. The objective never drifts into the low-attention middle zone.
Sunder status: Not implemented. Related to item 20. If a planning tool is added, consider having it re-inject the plan summary into the context at each step. This is especially important for autopilot tasks (Phase 3+).
Sources: Manus, Liu et al. (TACL 2024 — "Lost in the Middle")

22. **Progress files for long-running tasks**
What it is: Anthropic's long-running agent pattern: an initializer agent writes a progress file (feature list, current status, what's done, what's next). Coding agent reads and updates it each session.
What this achieves: Coherence across multiple context windows. The agent always knows where it left off.
Sunder status: Not applicable for current interactive chat. Becomes relevant for Phase 3+ autopilot tasks that may span multiple runs or context windows. Consider: a `run_progress` record in the DB or a progress file in Supabase Storage for multi-step workflows.
Sources: Anthropic ("Effective Harnesses for Long-Running Agents")

23. **Feature list in JSON (not Markdown)**
What it is: Anthropic found models are less likely to inappropriately modify structured JSON compared to Markdown. Feature lists, plans, and progress tracking work better in JSON format.
What this achieves: Lower accidental modification rate. More deterministic plan tracking.
Sunder status: Not applicable yet. Note for when implementing progress/plan tracking in Phase 2+: prefer JSON or structured formats for machine-readable plans.
Sources: Anthropic

---

## E) Error Handling and Robustness

24. **Errors preserved in context, not cleaned**
What it is: When a tool call fails, the error message stays in the conversation history. The model sees what went wrong and learns not to repeat it.
What this achieves: Implicit belief updating. Agents make fewer repeated mistakes when they can see their own failures. Cleaning errors breaks this feedback loop.
Sunder status: Aligned. Failed tool calls return `{ success: false, error: "..." }` which persists in the message stream. The model sees these errors. No cleaning happens.
Sources: Manus (core differentiator), Anthropic, SWE-Agent

25. **Stale run cleanup**
What it is: Detecting runs that have been "active" for too long (crashed, timed out) and marking them failed so the thread isn't permanently locked.
What this achieves: Self-healing. No manual intervention needed for zombie runs.
Sunder status: Implemented. `markStaleRunsFailed(supabase, { threadId, staleMinutes: 15 })` runs at the start of every `runAgent()` call.
Sources: Sunder architecture (existing)

26. **Structured variation against fixation**
What it is: Using different serialization templates and phrasing across iterations to prevent the model from falling into rigid, repetitive patterns.
What this achieves: Breaks fixation loops where the model keeps trying the same failing approach.
Sunder status: Not implemented. Related to item 5 (loop detection). If fixation is detected, inject a variation prompt ("Try a different approach. Consider..."). Low priority for V1 — maxSteps cap is the current safety net.
Sources: Manus

27. **Graceful degradation on model/gateway failure**
What it is: When the primary model is unavailable, fallback to an alternative model automatically.
What this achieves: Uptime. Users don't experience outages due to provider issues.
Sunder status: Architecture decision LLM-04 specifies fallback chains via `providerOptions: { gateway: { models: [...] } }`. Implementation status: check if fallback chains are wired in `gateway.ts`.
Sources: Sunder arch decision LLM-04, Vercel AI Gateway

---

## F) Memory and Personalization

28. **Per-client memory files (SOUL.md, USER.md, MEMORY.md)**
What it is: Persistent files that accumulate knowledge about each client over time. SOUL = agent personality, USER = client preferences and context, MEMORY = learned facts from interactions.
What this achieves: Compounding value. The agent gets better the longer a client uses it. This is Sunder's primary long-term differentiator.
Sunder status: Phase 2 (PRs 13-19a). Schema exists in Supabase Storage. Implementation is next up. Key design decisions: how does the agent decide what to write to memory? How often does it consolidate? What's the read strategy (progressive disclosure vs dump-all)?
Sources: Sunder App Spec, Claude Code (MEMORY.md pattern)

29. **State-based memory vs retrieval-based memory**
What it is: OpenAI distinguishes two approaches. Retrieval-based: search past interactions as documents. State-based: structured fields with precedence (latest input → session → global defaults). State-based supports belief updates over fact accumulation.
What this achieves: More reliable personalization. State-based memory handles contradictions better (user changes preference → old preference is overwritten, not accumulated alongside).
Sunder status: Design decision needed for Phase 2. The file-based approach (SOUL.md, USER.md, MEMORY.md) is closer to state-based — the agent overwrites/updates files, not appends-only. Ensure the memory system supports belief updates, not just fact accumulation.
Sources: OpenAI ("Context Engineering for Personalization")

30. **Memory read strategy: progressive disclosure**
What it is: Don't load all memory into every conversation. Load core identity always, search/retrieve specific memories based on conversation topic.
What this achieves: Avoids context bloat from irrelevant memories. The agent only pays attention to relevant context.
Sunder status: Design decision needed for Phase 2. Proposal: always load SOUL.md (agent identity, ~200 tokens). Load USER.md summary (client profile, ~500 tokens). Search MEMORY.md + memory/*.md on-demand based on conversation keywords. Provide a `recall_memory` tool for the agent to pull specific memories.
Sources: Claude Code (SKILL.md on-demand), Claude-Mem (26x efficiency gain)

31. **Memory write: when does the agent decide to remember?**
What it is: The agent needs a trigger to write new memories — either explicit ("remember this") or implicit (detecting noteworthy facts during conversation).
What this achieves: Growing the knowledge base without requiring user action.
Sunder status: Design decision needed for Phase 2. Options: (a) explicit tool — model calls `save_memory` when it learns something worth remembering, (b) post-run extraction — a separate cheap model scans completed conversations for memorable facts, (c) hybrid. Recommendation: start with (a) explicit tool, iterate to (b) if coverage is insufficient.
Sources: OpenAI (state-based memory), Windsurf (cross-session observations), Devin (Knowledge Management System)

32. **Memory consolidation: preventing bloat and contradictions**
What it is: Over time, memories accumulate, contradict each other, and become stale. Periodic consolidation merges, deduplicates, and updates memories.
What this achieves: Keeps memory high-signal. Prevents the "26,000 line CLAUDE.md" failure mode described in the agentic engineering guide.
Sunder status: Design decision needed for Phase 2. Consider: weekly or on-threshold consolidation runs using a cheap model to merge memory files. Flag contradictions for user resolution.
Sources: "How to be a world-class agentic engineer" (clean up rules/skills), OpenAI (state-based consolidation)

---

## G) Context Window Economics

33. **KV-cache optimization (append-only context)**
What it is: Cached tokens cost ~10x less than uncached (Manus: $0.30/MTok vs $3/MTok). Keeping the context prefix stable enables cache hits. Even reordered JSON keys invalidate the cache.
What this achieves: Major cost reduction for multi-step runs. Each tool call step reuses the cached prefix.
Sunder status: Partially aligned by default — `streamText()` with appended tool results is naturally append-only within a single run. System prompt is stable. Risk areas: if system prompt changes mid-conversation (e.g., injecting dynamic user context), cache may be invalidated. Ensure the system prompt prefix is stable across steps within a run.
Sources: Manus

34. **Don't modify tool definitions mid-run**
What it is: Adding/removing tools between steps invalidates the KV-cache for all subsequent tokens. Manus uses logit masking (all tools loaded, constrain outputs) instead.
What this achieves: Preserved KV-cache = lower cost per step.
Sunder status: Aligned. Tools are loaded once at run start and don't change during the run. No dynamic tool loading/unloading mid-run.
Sources: Manus

35. **Token budget awareness**
What it is: Dex Horthy's "40% rule" — push past 40% of the model's input capacity and you enter the "dumb zone" where signal-to-noise degrades.
What this achieves: Practical upper bound for context engineering. Helps decide when to compaction vs when to start a new context.
Sunder status: Not monitored. Consider: logging input token count per run and tracking what percentage of context window is consumed. Set alerts if runs consistently exceed 40% of model capacity. This becomes critical as memory layers are added in Phase 2.
Sources: Horthy ("12 Factor Agents")

36. **Token tracking and cost attribution**
What it is: Tracking tokens consumed per run, per client, per model tier.
What this achieves: Cost visibility. Enables per-client cost ceilings and model tier optimization.
Sunder status: Partially implemented. `completeRun` records `tokensIn` and `tokensOut` per run. Consider: aggregating to per-client-per-day totals for cost monitoring against the <$20/user/month ceiling (arch decision).
Sources: Sunder architecture decisions

---

## H) Model Routing

37. **Cheap classifier for routing**
What it is: A fast, cheap model (Gemini Flash Lite) classifies every inbound message by complexity and selects the appropriate model tier.
What this achieves: ~60-70% of messages routed to cheapest tier. Only complex requests hit expensive models.
Sunder status: Architecture decision LLM-03 approved. Not yet implemented — currently all messages go to Tier 1 (Gemini 3 Flash). Phase 2 should implement the router.
Sources: Savoir routeQuestion, Sunder arch decision LLM-03

38. **Unidirectional routing (classifier picks, model is unaware)**
What it is: Sunder deliberately chose unidirectional routing — the classifier picks the tier, and the LLM doesn't know what tier it's on. Tasklet's bidirectional approach (LLM can request escalation) was explicitly rejected.
What this achieves: Predictable costs. No risk of LLM over-escalating on subjective complexity.
Sunder status: Architecture decision made (LLM-03). Aligned. Note: if quality issues emerge with unidirectional routing, revisiting bidirectional is a documented option.
Sources: Sunder arch decision LLM-03 (Tasklet delta)

39. **Model-specific harness tuning**
What it is: Cursor tunes tool names, prompt instructions, and behavioral guidance per model. OpenAI Codex models get shell-oriented tool names; Claude models get different reasoning formats.
What this achieves: Maximizes each model's strengths. Models behave differently and respond to different prompt patterns.
Sunder status: Not implemented. All models currently get the same system prompt and tool definitions. Low priority for V1 where almost everything runs on Gemini Flash. Becomes relevant if multiple model tiers are active and quality varies between them.
Sources: Cursor

---

## I) Multi-Agent Patterns

40. **Sub-agents for isolated tasks**
What it is: Spawning a child agent with its own context window for specific subtasks. Results are returned to the parent. Prevents "context pollution."
What this achieves: Complex tasks don't bloat the main conversation context. Sub-agents can be specialized.
Sunder status: Not implemented. Not needed for V1 workloads. Consider for Phase 3+ autopilot tasks: e.g., a "research agent" sub-agent that searches and summarizes, returning a clean result to the main agent.
Sources: Claude Code (Task tool), Replit (3-agent architecture), LangChain (isolate context)

41. **Initializer/coding agent split**
What it is: Anthropic's pattern for long-running agents: first session sets up environment, writes progress file. Subsequent sessions make incremental progress.
What this achieves: Clean separation between setup and execution. Progress tracking persists across sessions.
Sunder status: Not applicable for V1 interactive chat. Relevant for Phase 3+ autonomous workflows.
Sources: Anthropic ("Effective Harnesses for Long-Running Agents")

42. **Adversarial agent pattern for verification**
What it is: Use sycophancy deliberately — one agent finds issues (biased to find), another disproves them (biased to disprove), a referee scores. Exploits each agent's tendency to please.
What this achieves: Near-flawless verification through structured disagreement.
Sunder status: Not applicable for V1. Interesting pattern for future quality assurance on agent outputs (e.g., verifying CRM data accuracy, validating research summaries).
Sources: "How to be a world-class agentic engineer"

---

## J) Safety and Approval

43. **Two-tier safety model (internal auto-runs, external requires approval)**
What it is: Internal work (CRM reads, memory updates, research) runs automatically. External-facing actions (sending emails, making calls, publishing) require user approval.
What this achieves: Users trust the agent because high-risk actions are gated. Low-risk work runs in the background without friction.
Sunder status: Architecture decision SAFETY-02. Interim implementation via system prompt instructions ("always ask before CRM writes"). Mechanical approval gate planned for PR 33. Phase 1 scope: all CRM writes require confirmation. Phase 3+: actual external actions (email, WhatsApp) will need the mechanical gate.
Sources: Sunder App Spec, architecture decisions

44. **Approval gate: prompt-based vs mechanical**
What it is: Current approach is prompt-based (system prompt tells the model to ask). Future approach should be mechanical (harness-level gate that blocks tool execution until user confirms).
What this achieves: Prompt-based can be circumvented by model behavior changes. Mechanical gates are deterministic and unfoolable.
Sunder status: Prompt-based interim in place. PR 33 will implement the mechanical gate. Non-negotiable for external-facing actions.
Sources: Sunder architecture decisions

---

## K) Session and Task Management

45. **Separate research from implementation**
What it is: Don't ask the agent to research options AND implement in the same context. Research fills context with alternatives that pollute implementation. Use separate sessions.
What this achieves: Cleaner context for implementation. Higher quality outputs because the agent isn't distracted by rejected alternatives.
Sunder status: Not explicitly enforced. Consider: for Phase 2+ complex tasks, implementing a research-then-implement pattern where research results are saved to a file, and implementation starts with a fresh context that reads only the chosen approach.
Sources: "How to be a world-class agentic engineer"

46. **Task completion criteria (tests, screenshots, contracts)**
What it is: Agents don't naturally know when a task is "done." Defining explicit completion criteria (tests pass, screenshot matches, checklist complete) prevents premature termination and stub implementations.
What this achieves: Deterministic task completion. Users can trust that "done" means done.
Sunder status: Not applicable for V1 interactive chat (user determines completion). Relevant for Phase 3+ autopilot tasks. Consider: when autopilot runs a multi-step workflow, define a completion contract (all CRM fields populated, briefing file written, summary posted).
Sources: "How to be a world-class agentic engineer"

47. **New session per task (not long-running sessions)**
What it is: Instead of running one 24-hour session that accumulates context from unrelated tasks, start a fresh session for each discrete task.
What this achieves: Clean context per task. No cross-contamination. Better agent performance.
Sunder status: Naturally aligned. Each thread is a separate conversation. Each run starts with a fresh `assembleContext()` call. Autopilot tasks (Phase 3+) should follow the same pattern — one thread per task, not one mega-thread.
Sources: "How to be a world-class agentic engineer"

---

## L) Harness-Model Coupling and Future-Proofing

48. **Vercel AI SDK is correct for V1/V2 workloads**
What it is: Sunder's current workloads (CRM, chat, briefings, document handling) don't require native agent SDK harnesses. The harness-model coupling problem only matters for coding/iteration-heavy tasks.
What this achieves: Simpler architecture, one fewer vendor dependency, full alignment with Vercel ecosystem.
Sunder status: Confirmed. Research complete. No action needed for V1/V2.
Sources: Harness-Model Coupling research doc

49. **Harness patterns are implementable in AI SDK**
What it is: Progress files, incremental work, git checkpoints, browser testing, initializer/coding splits — all Anthropic's long-running agent patterns are prompt and tool patterns, not SDK-locked features.
What this achieves: 80% of native harness benefits with 0% of the complexity.
Sunder status: Aligned. If quality issues emerge on specific tasks, implement harness PATTERNS within Vercel AI SDK first (progress files, planning tools) before reaching for native SDKs.
Sources: Harness-Model Coupling research doc

50. **Two-layer stack trigger conditions**
What it is: Adopt Claude Agent SDK (or Codex) only when Sunder needs: custom code generation, multi-step code-test-fix loops, tasks exceeding a single context window, or demonstrable quality gaps >10%.
What this achieves: Clear decision criteria that prevent premature complexity.
Sunder status: Trigger conditions defined. None currently met. Watch for: users requesting custom automation requiring code generation, quality complaints on artifact generation, tasks failing due to context limits.
Sources: Harness-Model Coupling research doc

51. **Plan for the harness to get simpler, not more complex**
What it is: The teams shipping the best agents keep simplifying. Manus has been rewritten five times; each rewrite removed things. If your harness is getting more complex while models improve, something is wrong.
What this achieves: Sustainable architecture. Complexity budget spent on product features, not scaffolding.
Sunder status: Principle to hold. As models improve, actively look for harness code to remove. The system prompt guardrails (item 43) should become unnecessary as mechanical gates replace them. Custom error handling may become unnecessary as models handle errors better natively.
Sources: Manus, Anthropic, "agent-harness-is-the-real-product.md"

---

## M) Observability and Evaluation

52. **Run-level telemetry**
What it is: Logging model, tokens, step count, duration, and status for every run.
What this achieves: Cost monitoring, quality debugging, performance optimization.
Sunder status: Implemented. `completeRun()` records model, tokensIn, tokensOut, stepCount, status. Consider: adding run duration and per-step breakdown.
Sources: Sunder architecture (existing)

53. **Context window utilization tracking**
What it is: Monitoring what percentage of the context window each run uses.
What this achieves: Early warning for context pressure. Informs when to implement compaction or memory trimming.
Sunder status: Not implemented. Add token counting for the assembled context (system + messages + tool definitions) before each model call. Log as a percentage of model capacity.
Sources: Horthy ("40% rule"), general best practice

54. **Harness quality evaluation**
What it is: No standard benchmarks exist for comparing harness designs. Cursor's 46.9% token reduction is one of the few published numbers.
What this achieves: Data-driven harness improvements rather than guesswork.
Sunder status: Not implemented. Consider: A/B testing system prompt variations, tool configurations, and context assembly strategies. Measure: task success rate, token usage, user satisfaction, step count per task type.
Sources: Industry open question

55. **Regression detection (harness bugs)**
What it is: Anthropic shipped a harness bug on Jan 26, 2026 that measurably dropped benchmark performance. The fix was a harness rollback, not a model change.
What this achieves: Harness changes can silently degrade agent quality. Need regression tests.
Sunder status: Not implemented. Consider: a small set of canonical test conversations that are re-run after harness changes. Check that the agent still handles the "golden path" scenarios correctly (CRM lookup, contact creation with approval, multi-step research).
Sources: Anthropic (Jan 26 incident), Harness-Model Coupling research doc

---

## N) CLAUDE.md / Agent Configuration as a Product

56. **CLAUDE.md as a logical directory, not a dumping ground**
What it is: Treat the agent's configuration as a nested directory of "where to find context given a scenario and an outcome." Keep it as barebones as possible — only IF-ELSE routing to relevant context files.
What this achieves: The agent loads only relevant context for each task. No bloat from irrelevant rules.
Sunder status: Apply this principle to the system prompt design in Phase 2. The 7-layer prompt should route to specific context (SOUL.md, USER.md, relevant memory files) rather than inlining everything. The system prompt says "what you are and where to find more," not "everything you need to know."
Sources: "How to be a world-class agentic engineer"

57. **Rules and skills as iteratively-added preferences**
What it is: Start barebones. Add rules when the agent does something wrong. Add skills when a repeatable recipe is needed. Clean up periodically when rules contradict or accumulate.
What this achieves: The agent's behavior converges toward user preferences over time. Organic, not pre-engineered.
Sunder status: Aligns with Sunder's memory system design. Client-specific rules and preferences should accumulate in USER.md through conversation, not be pre-configured.
Sources: "How to be a world-class agentic engineer"

---

## O) Immediate Action Items (Priority Order)

### P0 — Before Phase 2 Implementation
- [ ] **Item 13:** Design the 7-layer system prompt architecture with progressive disclosure in mind
- [ ] **Item 15:** Design memory read strategy (always-load core vs on-demand search)
- [ ] **Item 28-32:** Make all Phase 2 memory system design decisions (write triggers, consolidation, belief updates)
- [ ] **Item 18:** Design context compaction strategy for long threads

### P1 — During Phase 2 Implementation
- [ ] **Item 14:** Add system reminders after tool calls (high value, low effort)
- [ ] **Item 20:** Add a planning/scratchpad tool for complex multi-step requests
- [ ] **Item 30:** Implement `recall_memory` tool for on-demand memory retrieval
- [ ] **Item 37:** Implement model routing (routeQuestion pattern per LLM-03)

### P2 — Quality Improvements
- [ ] **Item 5:** Add loop/fixation detection
- [ ] **Item 8:** Audit tools for overlap and ambiguity
- [ ] **Item 35:** Add token budget monitoring (40% rule)
- [ ] **Item 53:** Add context window utilization tracking
- [ ] **Item 55:** Create harness regression tests

### P3 — Future / When Triggered
- [ ] **Item 10:** Evaluate consistent tool name prefixes
- [ ] **Item 16:** Lazy tool loading (if tool count exceeds ~25)
- [ ] **Item 39:** Model-specific prompt tuning (if multi-tier routing is active)
- [ ] **Item 40:** Sub-agent architecture (for Phase 3+ autopilot)
- [ ] **Item 50:** Two-layer stack evaluation (if trigger conditions are met)

---

## References

All patterns in this document are sourced from:
1. `agent-harness-is-the-real-product.md` — Harness architecture survey across Claude Code, Cursor, Manus, SWE-Agent, Devin
2. `context-engineering-landscape.md` — Context engineering techniques from Manus, Cursor, Anthropic, OpenAI, Google, LangChain
3. `how-to-be-a-world-class-agentic-engineer.md` — Practitioner guide on agentic workflow principles
4. `Harness-Model Coupling — Research and Contingency Plan.md` — SDK coupling analysis and two-layer stack contingency
5. Sunder architecture decisions: `architecture-decisions-checklist.json`
6. Sunder runner implementation: `src/lib/runner/`
