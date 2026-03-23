# Sunder vs Deep Agents Agent Architecture Audit

Date: 2026-03-23

Scope: compare Sunder's current agent runtime against the open-source LangChain Deep Agents repo at `/Users/sethlim/Documents/deepagents`, with a bias toward convergence. The default assumption in this audit is that drift is bad unless there is a clear product or runtime reason for it.

Primary Deep Agents references:

- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/graph.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/summarization.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/subagents.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/backends/protocol.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/backends/composite.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/deepagents/middleware/memory.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/test_subagents.py`
- `/Users/sethlim/Documents/deepagents/libs/deepagents/tests/unit_tests/middleware/test_summarization_middleware.py`

Primary Sunder references:

- `src/lib/runner/run-agent.ts`
- `src/lib/runner/run-autopilot.ts`
- `src/lib/runner/context.ts`
- `src/lib/runner/compaction.ts`
- `src/lib/runner/run-persistence.ts`
- `src/lib/runner/tool-registry.ts`
- `src/lib/runner/tools/subagents/run-subagent.ts`
- `src/lib/runner/tools/utility/todo.ts`
- `src/lib/approvals/continue-after-approval.ts`
- `app/api/chat/route.ts`
- `docs/product/plans/2026-03-05-implementation-phasing-plan-v2.json`
- `roadmap docs/Sunder - Source of Truth/architecture/architecture-decisions-checklist.json`
- `roadmap docs/Sunder - Source of Truth/references/tasklet/tasklet tools/built-in/v2/06-run_subagent.md`

## Executive Summary

Deep Agents is a credible reference implementation for agent harness design. After auditing both codebases, Sunder does not look fundamentally mis-architected. The broad shape is right: stateless model/tool loop, persisted thread state, file-based context recovery, subagents, and one-run-per-thread serialization.

The main unjustified drifts are narrower than expected:

1. Sunder duplicated orchestration into `runAgent()` and `runAutopilot()` instead of keeping one composition root.
2. Sunder compacts after the run, not before the next model call.
3. Sunder subagents are not fully isolated because they share the parent thread's todo scratchpad.
4. Sunder deliberately structures its prompt for cache stability but does not actually implement prompt caching.
5. Sunder's approval follow-up model is intentional, but the current persistence order is weaker than it should be.

Everything else that differs materially from Deep Agents is mostly justified by Sunder's actual product constraints: multi-tenancy, RLS, serverless concurrency, Tasklet-style filesystem workflows, triggers/autopilot, and channel integrations.

## Deep Agents Reference Patterns

These are the patterns Deep Agents is clearly opinionated about.

### 1. Middleware-first composition

`create_deep_agent()` is the composition root. It assembles the base middleware stack, merges user middleware, then delegates the actual loop to LangChain/LangGraph `create_agent()`. The core idea is that cross-cutting behavior should be middleware, not hand-written control flow.

### 2. Explicit middleware order

The base stack order is deliberate:

- todos
- optional skills
- filesystem
- subagents
- summarization
- tool-call patching
- optional async subagents
- user middleware
- prompt caching
- optional memory
- optional human-in-the-loop

This matters because policy, context shaping, and state mutation all live in a predictable composition order.

### 3. Compaction before the next model call

Deep Agents treats compaction as a model-context concern, not a post-run cleanup task.

- Auto-compaction is token/fraction based.
- Old messages are summarized before the next model invocation.
- Evicted raw history is archived to `/conversation_history/{thread_id}.md`.
- There is also a manual `compact_conversation` tool.

### 4. Subagents are isolated one-shot workers

Deep Agents' `task` tool launches ephemeral subagents with isolated state.

- Parent state is filtered before invocation.
- `messages`, `todos`, `structured_response`, `skills_metadata`, and `memory_contents` are excluded from child input/output.
- The parent gets back only the child's final message plus allowed state updates.

### 5. Files are a primary context substrate

Deep Agents consistently pushes large or durable context into files:

- large tool results
- compacted conversation history
- AGENTS.md memory
- filesystem workspace state

This keeps the live model context slimmer and more recoverable.

### 6. Backend abstraction is first-class

Deep Agents has a `BackendProtocol`, thread-scoped state backends, persistent store backends, and `CompositeBackend` path routing. The important pattern is not Python specifically; it is that workspace behavior is abstracted behind a stable interface.

### 7. Prompt caching is treated as part of the harness

Prompt caching is not an optional optimization bolted on later. It is part of the default middleware stack, and the stack ordering is designed to preserve a stable cache prefix.

### 8. HITL is declarative interrupt configuration

Deep Agents uses declarative `interrupt_on` tool config and LangGraph checkpoints, not app-owned approval rows plus manual reruns.

### 9. Session persistence is graph/checkpointer-native

Deep Agents assumes checkpointed session state is part of the runtime. This fits CLI and LangGraph-native deployments well.

## Where Sunder Already Aligns Well

These areas do not look wrong.

### Stateless loop with persisted state

Sunder's `runAgent()` shape is directionally correct: acquire per-thread run lock, persist inbound turn, assemble context, build tools, call the model, persist the result, then continue or compact. That is a reasonable serverless equivalent of Deep Agents' orchestrator loop.

### File-based context recovery

Sunder's `toolcall-artifacts.ts` always persists tool-call args/results and replaces oversized inline payloads with `<context-removed>` recovery markers. This is strongly aligned with Deep Agents' large-result offload pattern.

### Filesystem-style working set

Sunder's `/agent/` model-facing path space over Supabase Storage is aligned with the same general idea: the agent works through files, not through opaque internal objects.

### Per-thread serialization is stronger for serverless SaaS

Deep Agents' session model is fine for LangGraph/CLI. Sunder's DB-backed `create_run_if_idle`, `thread_queue_records`, and `drain_thread_queue` are more appropriate for concurrent Vercel Functions.

### Memory is richer, not sloppier

Deep Agents loads `AGENTS.md`. Sunder loads `SOUL.md`, `USER.md`, `MEMORY.md`, and topic files in a way that is more product-specific and still conceptually aligned with filesystem-first memory.

## Likely Incorrect Drifts

These are the places where Sunder appears to have drifted in a way that is probably worse than the Deep Agents pattern.

### 1. Runner composition drift: duplicated orchestration instead of one composition root

Deep Agents has one graph assembler in `graph.py`. Sunder splits the runtime across `run-agent.ts` and `run-autopilot.ts`.

Why this looks wrong:

- The v2 source of truth says interactive and trigger execution should share the same runner shape.
- Sunder now has duplicated orchestration logic for lock handling, context assembly, tool registry construction, Composio loading, model invocation, and finalization.
- This creates policy drift. Example: autopilot safety rules live mostly in prompt text, while the actual tool surface still comes from the standard registry.

Assessment: this is not necessary drift. It should converge toward one pipeline with mode-specific adapters.

### 2. Compaction drift: compaction happens after the run, not before context pressure

Deep Agents compacts before the next model call using token-aware thresholds. Sunder compacts after `finalizeRun()` on a simple message-count rule (`COMPACTION_MESSAGE_THRESHOLD = 80`, keep recent `30`).

Why this looks wrong:

- Compaction cannot protect the model call that already happened.
- The trigger condition is message count, not token pressure.
- There is no manual compaction tool.
- Sunder stores a summary on `conversation_threads`, but it does not archive evicted raw conversation into a first-class workspace file like Deep Agents does.
- Sunder's own architecture decision says compaction should be provider-native first, with `prepareStep` fallback if needed. Current `prepareStep` only disables tools on the last step.

Assessment: this is a real harness gap, not a justified product drift.

### 3. Subagent isolation drift: todo scratchpad leaks across parent and child

Deep Agents explicitly excludes parent `todos` from subagent state. Sunder's `run_subagent` path builds subagent tools with the parent `threadId`, and `agent_todo` is thread-scoped.

Why this looks wrong:

- `createSubagentTool()` calls `createRunnerTools(..., threadId, { isSubagent: true, ... })`.
- `createRunnerTools()` passes that same `threadId` into utility tools.
- `createTodoTools()` reads and writes `agent_todo` rows by `client_id + thread_id`.
- Result: the child shares the same todo scratchpad as the parent even though the subagent is supposed to be an isolated worker.

Assessment: this is likely an implementation mistake. Shared client memory is intentional; shared per-thread todo scratchpad is not.

### 4. Prompt caching drift: Sunder prepared for caching but never turned it on

Deep Agents always includes prompt caching middleware. Sunder's `context.ts` explicitly keeps skills in a "stable prefix zone for LLM cache-friendliness", but the runtime never enables provider-level prompt caching.

Why this looks wrong:

- The code already pays the complexity cost of cache-aware prompt assembly.
- The benefit is currently zero.
- Deep Agents treats this as harness baseline, not a later optimization.

Assessment: this is unjustified drift and a straightforward convergence target.

### 5. Approval implementation weakness: persistence order is weaker than the chosen model

This is not a strategic drift question. Sunder intentionally chose a follow-up-run approval model instead of LangGraph interrupts. That choice is valid for this stack.

The issue is narrower: `finalizeRun()` persists the assistant message first and only then inserts `approval_events`.

Why this looks wrong:

- If approval row creation fails, the thread can contain an approval-looking assistant turn without a durable approval record.
- Deep Agents avoids this class of inconsistency by making interrupt state part of checkpointed runtime state.

Assessment: keep the follow-up-run model, but harden the persistence order or transaction boundary.

## Necessary or Justified Drift

These differences from Deep Agents are reasonable and should not be treated as harness mistakes.

### 1. Multi-tenancy, RLS, and tenant-scoped tool closures

Deep Agents assumes a single-user agent runtime. Sunder is a multi-tenant SaaS with RLS and per-client storage prefixes. This is required drift.

### 2. DB-backed thread locking and queueing

Deep Agents' checkpoint/session model is a good LangGraph pattern. Sunder's DB-backed per-thread lock plus queue is the correct serverless pattern for Vercel Functions and concurrent inbound channels.

### 3. Tasklet-style `run_subagent` instruction files

Deep Agents uses a named `task` registry. Sunder intentionally follows the Tasklet `run_subagent(path, payload)` pattern from the source-of-truth references. This is a real drift, but it is intentional and justified.

### 4. Product memory system

Deep Agents' memory layer is generic. Sunder's `SOUL.md` / `USER.md` / `MEMORY.md` filesystem memory is product-specific and correct for the business.

### 5. Triggers, autopilot, connections, and channels

Deep Agents is an agent harness. Sunder is a product. Trigger execution, proactive pulses, Composio connections, Telegram/WhatsApp, approvals UI, onboarding, and billing are outside Deep Agents' intended scope.

### 6. Follow-up-run approvals instead of checkpoint resume

Deep Agents' checkpointed interrupt model is cleaner as infrastructure. Sunder's source of truth explicitly chose in-thread approval cards plus a follow-up run rather than pause-and-resume. For this stack, that is acceptable.

### 7. Supabase Storage instead of Deep Agents-style backends

The storage substrate difference is justified. What is not justified is how fragmented Sunder's internal storage abstractions currently are. The runtime can keep Supabase Storage while still adopting a cleaner internal backend/workspace interface.

## What Sunder Should Not Copy

Not every Deep Agents pattern should be imported.

### LangGraph checkpoint/session model

Useful in LangGraph-native deployments, but not better than Sunder's DB-backed thread/run model for multi-tenant serverless web + channel traffic.

### Local-shell and local-filesystem assumptions

Deep Agents explicitly warns that some backends are convenience features, not security boundaries. Those patterns are not relevant to Sunder's hosted SaaS core.

## Recommended Convergence Order

If Sunder wants to move closer to the Deep Agents harness shape without rewriting the stack, the order should be:

1. Collapse `runAgent()` and `runAutopilot()` into one runner pipeline with mode-specific flags.
2. Move compaction to the pre-model path and make it token-aware. Add a manual compaction tool.
3. Give subagents isolated scratchpad state instead of sharing the parent thread's todo rows.
4. Turn on prompt caching for the stable-prefix prompt shape Sunder already builds.
5. Introduce a small internal backend/workspace interface so memory files, agent files, toolcall artifacts, and compacted history are composed through one abstraction instead of several ad hoc helpers.

## Bottom Line

Deep Agents validates the broad direction of Sunder's harness more than it invalidates it.

The main conclusion is not "rewrite Sunder around Deep Agents." The main conclusion is:

- Sunder's overall serverless SaaS architecture is defensible.
- Sunder has a small number of real harness drifts that should be corrected.
- The highest-value convergence targets are composition, compaction, subagent isolation, and prompt caching.

That is a much narrower and more actionable conclusion than "our agent architecture is wrong."
