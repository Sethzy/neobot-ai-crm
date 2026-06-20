# Sunder Context Pipeline Redesign — Deep Agents Reference

**Status:** Design doc (reviewed, corrections applied, not yet implemented)
**Date:** 2026-03-23
**Reference codebase:** [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) (local: `/Users/sethlim/Documents/deepagents`)
**Existing Sunder references:**
- `references/compacting/` — 4 docs (Codex patterns, Vercel AI SDK context management)
- `references/prompt-caching/` — 11 docs (Claude Code lessons, Gemini caching, cache-vs-compaction warning)

---

## Executive Summary

Two improvements to Sunder's agent context pipeline, derived from Deep Agents patterns and prompt caching best practices. They must be implemented in order:

1. **Append-only context + pre-stream latency reduction** — stop breaking the cache, cache Composio schemas, slim system reminder
2. **Fraction-based compaction + prompt caching** — smarter compaction trigger, cache the stable prefix

**Core insight:** The priority is **cache stability** over context minimization. Carrying extra tokens is cheap. Breaking the cache is expensive. This is true on both Gemini (75% cached discount, 1hr TTL) and Anthropic (90% cached discount, 5min TTL).

**Critical constraint** (from `references/prompt-caching/09-warning-context-management-vs-prompt-caching.md`):
> "If you're being clever with context, you're probably breaking the cache."

**Production validation** (from `references/prompt-caching/10-portal-one-20k-agents-production-learnings.md`):
> 97% cache hit rate on messages 2-50. 49% of compute is the first message (context rebuild). After that, nearly free.

---

## The Key Decision: Append-Only Context Wins

### The old thinking (context minimization)

Minimize tokens in context at all costs. Truncate tool outputs. Truncate tool args. Keep context lean. This made sense when context windows were 8K-32K tokens and every token was expensive.

### The new thinking (cache stability)

With large context windows and prompt caching:
- Cached tokens cost 25% (Gemini) or 10% (Anthropic) of full price
- Breaking the cache forces a full-price recompute of the entire prefix
- A single cache break costs more than carrying 100KB of extra context for 50 turns

**The math:**
- Carrying 100KB (~25K tokens) for 50 turns at cached price: `25K * 0.25 * 50 = 312K token-equivalents`
- One cache break recomputing 200K tokens: `200K * 1.0 = 200K token-equivalents` (per break)
- Two cache breaks > carrying the extra context for the entire conversation

### What this means for Sunder

**Stop truncating text tool outputs at persistence time.** Our current `truncateOversizedParts()` (5KB threshold) breaks the message cache on every subsequent turn because the LLM provider cached the full version but we send the truncated version next turn.

**Keep artifact handling for multimodal content.** Images and PDFs returned by `read_file` can produce large base64 blobs that should not replay in full on every turn. These still need artifact handling.

**Skip in-flight truncation.** Deep Agents does this for smaller context windows and providers where context is expensive. For our CRM workloads (30-50 turn conversations, ~80-120K tokens total), context pressure is rare. Compaction at 85% handles the edge case.

**Focus on:** append-only text messages, stable prefix, cache hits on every turn, compaction as the sole emergency valve.

### Why we're consciously simpler than Deep Agents here

Deep Agents implements three context management mechanisms: in-flight tool arg truncation, large tool result eviction with previews, and conversation history offloading. This is designed for a world of multiple providers, smaller context windows, and expensive tokens.

We implement two: append-only persistence (for text) with multimodal artifact handling, plus compaction. A typical CRM conversation reaches 80-120K tokens over 50 messages — well below compaction triggers. Truncation would add complexity and break the cache without meaningful benefit.

---

## Part 1: The Dependency Chain

```
Step 1: Append-only context + slim prefix + cached Composio schemas
        (stop breaking cache, reduce latency, settle prefix shape)

Step 2: Fraction-based compaction + prompt caching
        (smarter compaction trigger, cache the now-stable prefix)
```

**Why this order:**
- Step 2 caches whatever prefix shape exists. If you cache first, then restructure the prefix in Step 1, you invalidate the cache.
- Step 1 must settle: what's in the system prompt vs. what's in tool calls, and stop mutating messages.

---

## Part 2: Step 1 — Append-Only Context + Pre-Stream Latency

### 1A. Remove persistence-time truncation for text; keep multimodal artifact handling

**Current:** Two copies of every tool output are saved:
1. **Supabase Storage** (`agent-files/{clientId}/toolcalls/{toolCallId}/result.json`) — full output via `saveToolcallBlock()`
2. **DB** (`conversation_messages.parts` JSONB) — truncated to 5KB head + `<context-removed>` marker via `truncateOversizedParts()`

**Problem (verified):** The LLM provider caches the full tool output during the current run. Next turn, we load the truncated version from DB. Content mismatch. Cache miss on all messages from that point forward. Traced through four files:
- `run-persistence.ts:127` — calls `truncateOversizedParts()` before DB write
- `toolcall-artifacts.ts:173-178` — replaces output with 5KB head + marker
- `context.ts:211-222` — `buildUiMessageParts()` returns DB parts as-is, no rehydration
- No code in the runner reads full outputs back from Storage to reconstruct them

**Fix:** Remove `truncateOversizedParts()` for text tool outputs. Keep `saveToolcallBlock()` only for multimodal content (images, PDFs) where base64 blobs should not replay in full on every turn. Remove the redundant Storage dual-write for text outputs.

```
BEFORE (run-persistence.ts):
  rawParts = buildAssistantPartsFromSteps(steps)
  saveToolcallBlock(each tool part → Storage)      ← redundant for text
  truncateOversizedParts(rawParts)                  ← breaks cache
  createMessages(truncated parts → DB)

AFTER:
  rawParts = buildAssistantPartsFromSteps(steps)
  saveMultimodalArtifacts(multimodal parts → Storage)  ← images/PDFs only
  createMessages(rawParts → DB)                        ← full text outputs, one write
```

- DB rows get bigger for text outputs, but Postgres handles JSONB blobs fine
- Multimodal content (images, PDFs from `read_file`) still gets artifact handling — these can be megabytes of base64 that shouldn't sit in every message replay
- We're pre-production, no backward compatibility needed

**Files to touch:**
- `src/lib/runner/toolcall-artifacts.ts` — **split this file into two concerns:**
  - **Delete:** `truncateOversizedParts()`, `saveToolcallArtifact()`, `buildContextRemovedMarker()`, `serializeWithSize()`, `TruncateOversizedPartsResult` type
  - **Move to `src/lib/storage/tool-blocks.ts`:** `saveToolcallBlock()`, `serializeToolOutput()` — these serve observability/block storage, not truncation
- `src/lib/runner/run-persistence.ts` — remove `truncateOversizedParts()` call and import. Update `saveToolcallBlock` import path to new module.
- `src/lib/runner/tools/subagents/run-subagent.ts` — update `saveToolcallBlock` import path (line 15) to new module
- `src/lib/runner/compaction.ts` — remove `ARTIFACT_SIZE_THRESHOLD_BYTES` constant
- `src/lib/ai/platform-instructions.ts` — remove `<context-removed>` instructions to the agent
- `src/lib/runner/__tests__/toolcall-artifacts.test.ts` — delete truncation tests, move block storage tests to match new module location
- `src/lib/runner/__tests__/run-persistence.test.ts` — remove text truncation expectations
- `src/lib/storage/agent-paths.ts` — **keep `toModelPath()`** (used in 20+ files for skills, triggers, storage — not artifact-specific)

**Drift from Deep Agents:** Deep Agents stores everything in state (never truncates at persistence, never writes to secondary storage for text). We store full text content in DB and keep artifact handling for multimodal content only. This is **consciously simpler** — Deep Agents has three context mechanisms (truncation + eviction + offloading), we have two (append-only text + multimodal artifacts + compaction).

### 1B. DB-cached connection tool schemas

**Current:** `getActiveConnections()` + `loadActivatedConnectionTools()` blocks pre-stream (~300-500ms per connection). On every run, we call Composio's external API (`getRawComposioTools()`) to fetch tool schemas (parameter types, descriptions) — even though these schemas are static and never change between messages.

The Composio API is only needed for two things:
1. **Schema discovery** — what parameters does `send_email` accept? (static, changes only when Composio updates the tool)
2. **Tool execution** — actually send the email (must call Composio at execution time, always)

We're paying the schema discovery cost on every message. We only need it once.

**Fix:** Cache tool schemas in our DB at activation time. Read from DB on every run. Composio API is only called during tool activation (rare, approval-gated) and tool execution (when the agent actually uses a connection tool).

**Before (every message):**
```
getActiveConnections()                        50ms  (Supabase)
loadActivatedConnectionTools()                300-500ms (Composio API) ← fetches static schemas
```

**After (every message):**
```
getActiveConnections()                        50ms  (Supabase, now includes schemas)
loadActivatedConnectionTools()                ~0ms  (reads schemas from DB row)
```

**At tool activation time (rare):**
```
manage_activated_tools_for_connections()
  → getRawComposioTools()                     300ms (Composio API, same as today)
  → persist schemas to connections.tool_schemas  ← NEW: save instead of discard
```

**What stays the same:**
- Tool names (`conn_abc123__send_email`)
- Tool input schemas (same JSON, just read from DB instead of API)
- Tool execution (still calls `composio.tools.execute()` at runtime)
- Connection management tools (create, delete, reauthorize)
- OAuth flow, approval gates, prefixing — all identical
- **User-facing activation UX is unchanged.** User asks to connect Gmail → OAuth → approval card → tools activated. The only backend difference: `manage_activated_tools_for_connections` now saves the tool schemas to DB in the same write that saves `activated_tools`. The approval card, the "Granted" flow, the `conn_xxx__gmail_search_threads` tool names — all identical. The tool set grows on activation (one cache break during onboarding setup, self-heals on next turn).

**Why this also helps caching:** For our MVP (Google Calendar, Gmail, Google Drive), connections are set up once during onboarding. The tool set doesn't change between turns, so tool definitions in the cached prefix are stable. Cache hits automatically. The only scenario that breaks the cache: user goes to Settings mid-conversation and activates/deactivates a tool. For 3 Google connections, this won't happen in practice.

**Composio docs note:** Composio's official pattern is `session.tools()` on every request — they don't prescribe caching. But their docs also say "optimize performance through caching transformed tools whenever possible." Our caching is a straightforward optimization for serverless where the external API round-trip is on the critical path.

**Migration:**
```sql
ALTER TABLE connections ADD COLUMN tool_schemas JSONB DEFAULT '{}';
```

**Files to touch:**
- `src/lib/runner/tools/connections/manage-tools.ts` — persist `tool_schemas` alongside `activated_tools` on activation
- `src/lib/composio/activated-tools.ts` — read schemas from DB row instead of calling `getRawComposioTools()`
- DB migration — add `tool_schemas JSONB` column to `connections` table

### 1C. Slim system reminder + move to message

**Current:** `buildSystemReminder()` fetches full connection details including skill file content (~300-800ms). The entire system reminder is embedded in the system prompt string.

**Two problems:**
1. **Latency:** Connection skill content fetching is slow
2. **Cache breaking:** System reminder includes `Current time: ...` which changes every turn. Since it's in the system prompt, the system prompt hash changes every turn. Cache miss every turn.

**Fix:**
1. System reminder includes only counts and names (fast, ~100ms)
2. System reminder moves from system prompt to a `<system-reminder>` message appended after the cache boundary

**This follows the pattern from `references/prompt-caching/01-thariq-claude-code-prompt-caching-lessons.md`:**
> Never edit the system prompt. Use `<system-reminder>` messages instead.

**Dependency on Part 2B:** Moving the system reminder to a message only delivers cache benefits if Gemini explicit `CachedContent` is implemented (Part 2B). With explicit caching, the system instruction is cached independently from messages — so a changing timestamp in a message doesn't affect the system prompt cache. With implicit prefix caching only, the timestamp change in the first message would break the message prefix cache every turn, negating the benefit. **Part 1C delivers its latency win immediately (slim to counts only) but its caching win requires Part 2B.**

**Implementation note (spike needed):** AI SDK supports system messages in the messages array, but the SDK recommends the separate `system` field because not all providers support multiple system messages. Gemini specifically doesn't support a `system` role in messages — only in the dedicated system instruction field. The system reminder should be injected as a `user` message with `<system-reminder>` tags, not a system message. Verify this works cleanly with Gemini before committing.

**Files to touch:**
- `src/lib/runner/system-reminder.ts` — remove `getConnectionSkillContent()` calls, slim to counts only
- `src/lib/runner/context.ts` — inject system reminder as a message, not part of system prompt string
- `src/lib/ai/system-prompt.ts` — remove system reminder from system prompt layers

### 1D. Stable tool definitions

**Current:** Tool set can vary between runs (Composio tools added/removed, CRM config tools conditionally included).

**Rule (from `references/prompt-caching/09-warning-context-management-vs-prompt-caching.md`):**
> Don't add/remove tools mid-conversation. The cache break costs more than the inefficiency of unused tools.

**Fix:** Keep all tools in every request. For tools that are conditionally available (browser, market data), include them in the tool definitions always but have them return an error if not configured. The tool set hash stays stable.

**Files to touch:**
- `src/lib/runner/tools/tool-registry.ts` — always include all tools, use runtime checks instead of conditional registration

### Expected result (Step 1)

```
AFTER STEP 1:
  markStaleRunsFailed        100-200ms
  createRun                  100-300ms
  createMessages             100ms
  Phase A (parallel):
    loadCrmConfig            100-200ms
  assembleContext:
    bootstrapMemoryFiles     0ms (warm)
    loadMemoryContext         400-600ms
    discoverUserSkills       100-300ms
    buildSlimSystemReminder  100-200ms  (was 300-800ms)
    fetchCompactionState     50-100ms
    loadThreadHistory        200-500ms
  createRunnerTools          100-150ms
  ─────────────────────────────────────
  TOTAL: ~1.2-2s (down from 2.5-4s)

  Cache behavior: append-only text messages, stable tool set,
  system reminder in message not system prompt.
  Expected cache hit rate on turns 2+: high (prefix stable).
```

---

## Part 3: Step 2 — Fraction-Based Compaction + Prompt Caching

### 2A. Fraction-Based Compaction Trigger

#### Deep Agents Reference

**File:** `libs/deepagents/deepagents/middleware/summarization.py`
**Function:** `compute_summarization_defaults()` (line 163)

```python
# With model profile (max_input_tokens known):
trigger = ("fraction", 0.85)   # compact at 85% of context window
keep = ("fraction", 0.10)      # keep last 10% of context

# Without model profile (fallback):
trigger = ("tokens", 170000)   # fixed token count
keep = ("messages", 6)         # keep last 6 messages
```

#### Sunder Implementation

**Current:** Fixed message count: `COMPACTION_MESSAGE_THRESHOLD = 80`, `COMPACTION_KEEP_RECENT = 30`.

**Proposed:** Fraction-based, using token count from previous run's response metadata.

Gemini returns `usage.promptTokenCount` in every API response. AI SDK exposes this via `result.usage.promptTokens` in the `onFinish` callback. We persist this on the run row.

```typescript
// In finalizeRun (onFinish callback):
const promptTokens = result.usage?.promptTokens ?? 0
await updateRun(supabase, runId, { prompt_tokens: promptTokens })

// In maybeCompactThread:
const lastRun = await getLastCompletedRun(supabase, threadId)
const promptTokens = lastRun?.prompt_tokens ?? 0
const maxInputTokens = MODEL_CONTEXT_WINDOWS[modelId]

if (promptTokens >= maxInputTokens * COMPACTION_TRIGGER_FRACTION) {
  // Trigger compaction
}
```

**Constants (matching Deep Agents defaults):**

```typescript
/** Fraction of context window that triggers compaction. Deep Agents default: 0.85 */
const COMPACTION_TRIGGER_FRACTION = 0.85

/** Fraction of context window to keep after compaction. Deep Agents default: 0.10 */
const COMPACTION_KEEP_FRACTION = 0.10

/** Fallback: fixed token count if model profile unavailable. Deep Agents default: 170000 */
const COMPACTION_TRIGGER_TOKENS_FALLBACK = 170_000

/** Fallback: keep last N messages. Deep Agents default: 6 */
const COMPACTION_KEEP_MESSAGES_FALLBACK = 6

/** Known context windows for our models */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  "google/gemini-3-flash": 1_000_000,
  "google/gemini-2.5-flash-lite": 1_000_000,
}
```

**Drift from Deep Agents:**
- Deep Agents reads `model.profile["max_input_tokens"]` at runtime. We use a static lookup table. Justified — AI SDK doesn't expose model profiles.
- Deep Agents triggers mid-loop (before the model call). We trigger post-run (after `finalizeRun`). Justified — serverless can't interrupt `streamText()`. This means if a conversation is at 84% and a turn pushes it to 88%, the current run sees 88% context with no compaction. Compaction fires after finalization, so the *next* run benefits, not the current one. At 1M tokens, getting from 84% to overflow in one turn would require a ~160K token message — unrealistic for CRM workloads.
- Deep Agents uses live token count. We use the previous run's `promptTokens`. Combined with post-run firing, compaction is effectively two steps behind reality. This is acceptable at 1M tokens where the 85% trigger is 850K — the gap between "actual usage" and "last measured usage" is at most one turn's worth of tokens (~2-5K). **If we add smaller model tiers in the future, this assumption should be revisited.**

**Files to touch:**
- `src/lib/runner/compaction.ts` — replace message-count trigger with fraction-based
- `src/lib/runner/run-persistence.ts` — persist `prompt_tokens` on run row
- `src/types/database.ts` — add `prompt_tokens` column to `runs` table
- Migration: `ALTER TABLE runs ADD COLUMN prompt_tokens INTEGER`

### 2B. Prompt Caching

#### Deep Agents Reference

**File:** `libs/deepagents/deepagents/graph.py` (lines 295-297)

```python
# Comment (line 295-296):
# Caching + memory after all other middleware so memory updates don't
# invalidate the Anthropic prompt cache prefix.
deepagent_middleware.append(
    AnthropicPromptCachingMiddleware(unsupported_model_behavior="ignore")
)
```

**How AnthropicPromptCachingMiddleware works:** It adds `cache_control: {type: "ephemeral"}` to `model_settings`. Anthropic's `ChatAnthropic._get_request_payload()` then places this marker on the **last eligible content block** in the message list. Anthropic caches everything from the start of the request up to that marker. On the next turn, if that prefix is identical, cache hit.

**How Deep Agents orders caching vs memory:** Caching middleware runs BEFORE memory middleware (line 297 vs 299). This means:
- The cache breakpoint is set on messages before memory is injected
- Memory updates happen after the cache boundary
- Memory changes do NOT invalidate the cached prefix

#### For Gemini (Our Model)

Gemini supports two caching mechanisms:
1. **Implicit caching** — automatic prefix matching, 75% discount. Minimum threshold: **1,024 tokens** (not 32K — updated per current Gemini docs).
2. **Explicit caching** — create a `CachedContent` object with a TTL, reference it in requests. Requires lifecycle management (`createCachedContent` call).

**Spike needed before implementation:** Verify which mechanism works with our setup:
1. Does Gemini implicit caching give us hits automatically with a stable system prompt?
2. If we need explicit caching, what's the `createCachedContent` lifecycle via AI SDK?
3. Does AI SDK's `providerOptions.google.cachedContent` reference an existing cache, or create one?

#### Sunder Implementation

**What goes in the cached prefix (system prompt):**

```
STABLE PREFIX (cached, same every turn):
  Layer 1: Platform instructions
  Layer 2: Core agent instructions
  Layer 3: Browser/market prompts (always included, runtime check if not configured)
  Layer 4: CRM config vocabulary
  Layer 5: User skills listing
  Tool definitions (all tools, always the same set)

AFTER CACHE BOUNDARY (changes per turn, small):
  Memory context (SOUL.md, USER.md, MEMORY.md) — injected as message
  System reminder message (<system-reminder> with time, counts)
  Compaction summary (if thread previously compacted)
  Conversation messages (append-only)
```

**Key decisions:**
- **Memory OUTSIDE cached prefix** — follows Deep Agents ordering exactly. Memory updates (a few times per conversation) don't break the system prompt cache. This is a correction from the earlier draft which put memory inside the prefix.
- All tools always included — no conditional tool registration, tool set hash is stable
- System reminder as message, not in system prompt — timestamp changes don't break system prompt cache
- Compaction summary as message — it changes when compaction fires, shouldn't be in the cached system prompt

**Drift from Deep Agents:**
- Deep Agents uses Anthropic implicit prefix matching with `cache_control` breakpoints. We use Gemini caching (implicit or explicit — spike needed). Different mechanism, same ordering principle.
- Deep Agents places caching as middleware. We configure via `providerOptions` on `streamText()`. Different API surface, same result.

**Files to touch:**
- `src/lib/ai/gateway.ts` — add caching configuration
- `src/lib/runner/run-agent.ts` — add cache config to `streamText()`
- `src/lib/runner/context.ts` — split system prompt into cached prefix + dynamic tail. Memory moves from system prompt to message.
- `src/lib/ai/system-prompt.ts` — remove memory and system reminder from prompt layers. Ensure stable layers only.

---

## Part 4: What We Cut (and Why)

### Deep Agents patterns we're NOT adopting

| Pattern | Why we're skipping it |
|---------|----------------------|
| **In-flight tool arg truncation** | Deep Agents truncates old `write_file`/`edit_file` args before each LLM call. This saves tokens but breaks the message cache every turn (the keep window slides, changing the prefix). For our CRM workloads (30-50 turns, 80-120K tokens), context pressure is rare. Cache stability matters more than context minimization. |
| **Large tool result eviction** | Deep Agents evicts large tool results to `/large_tool_results` with previews. We handle multimodal content (images/PDFs) with artifact storage but keep text outputs full in DB for cache stability. |
| **`compact_conversation` agent tool** | Defer to post-launch, measure first. If cache hit rates are high and compaction rarely fires, it's unnecessary. If `browse_website`-heavy sessions hit compaction regularly, the manual tool becomes valuable. Deep Agents gates it at 50% eligibility. |
| **Summary history via `read_file`** | Nice-to-have but not blocking. Our 4-section structured summary preserves enough. |
| **CompositeBackend** | Single storage target. Revisit when sandbox execution lands. |
| **Middleware abstraction** | Same 7 concerns, procedural assembly is simpler for our scale. |

### The reasoning

Deep Agents targets multiple providers including Anthropic (200K context, 5-min cache TTL, 25% write surcharge). In that environment:
- Context windows are tight — truncation buys real runway
- Cache writes are expensive — smaller payloads = cheaper cold writes
- Cache expires fast — intermittent users pay cold-write costs frequently

For our CRM assistant, whether on Gemini or Anthropic:
- Conversations are 30-50 turns (~80-120K tokens) — well below compaction triggers
- Append-only maximizes cache hit rate within a session
- Compaction handles the rare long conversation

**The KISS principle:** append-only text messages + multimodal artifact handling + fraction-based compaction + prompt caching. Simple mechanisms, high cache hit rate.

---

## Part 5: Non-Obvious Patterns Worth Adopting Later

These are documented for future reference but NOT part of the current implementation scope.

### 5A. General-Purpose Subagent (Context Isolation)

**Deep Agents pattern:** Always includes a "general-purpose" subagent that's a clone of the parent. Used for context isolation — heavy research runs in the subagent's context window, returns a concise summary.

**Sunder status:** Our `run_subagent` requires an instruction file path. Used for cron/trigger workflow execution, not ad-hoc delegation.

**Future work:** Allow `run_subagent` to accept an inline prompt for ad-hoc context isolation.

**Deep Agents reference:** `libs/deepagents/deepagents/middleware/subagents.py` line 271

### 5B. Summary Message Tagging

**Deep Agents pattern:** Summary messages tagged with `lc_source="summarization"` so they're filtered from subsequent compaction input (no "summaries of summaries").

**Sunder status:** We store compaction summary in DB columns. No tagging.

**Future work:** Tag summary messages to exclude from future compaction.

**Deep Agents reference:** `libs/deepagents/deepagents/middleware/summarization.py` lines 398-460

### 5C. Per-Subagent Compaction

**Deep Agents pattern:** Each subagent gets its own compaction middleware.

**Future work:** If subagents get heavier (sandbox execution), add independent compaction.

**Deep Agents reference:** `libs/deepagents/deepagents/graph.py` lines 244-254

### 5D. Non-Destructive Compaction via Events

**Deep Agents pattern:** Compaction tracked via `_summarization_event` in private state. Messages are not deleted — the event records a cutoff index and a summary message. The effective message list is reconstructed from the event on each turn. This is non-destructive: the full history remains in state, only the view changes.

**Sunder status:** We store compaction state on the thread row and filter messages by timestamp boundary. Similar intent, different mechanism.

**Deep Agents reference:** `libs/deepagents/deepagents/middleware/summarization.py` lines 101-152

---

## Part 6: File Inventory

### Deep Agents Files to Reference

| File | What to copy | Lines |
|------|-------------|-------|
| `libs/deepagents/deepagents/middleware/summarization.py` | Fraction-based trigger defaults | 163-199 |
| `libs/deepagents/deepagents/graph.py` | Cache placement ordering: caching BEFORE memory | 295-299 |
| `libs/deepagents/deepagents/middleware/memory.py` | Memory injection AFTER cache boundary | 306-320 |
| `tests/unit_tests/middleware/test_summarization_factory.py` | Test for fraction-based defaults | 23-31 |

### Sunder Files to Touch

**Step 1 (Append-only + Latency):**

| File | Change |
|------|--------|
| `src/lib/runner/toolcall-artifacts.ts` | Remove `truncateOversizedParts()`. Narrow `saveToolcallBlock()` to multimodal content only. |
| `src/lib/runner/run-persistence.ts` | Remove `truncateOversizedParts()` call. Keep `saveToolcallBlock()` for multimodal only. |
| `src/lib/runner/tools/subagents/run-subagent.ts` | Update `saveToolcallBlock` import (line 15) — this file depends on it |
| `src/lib/runner/__tests__/toolcall-artifacts.test.ts` | Update tests for narrowed scope |
| `src/lib/runner/__tests__/run-persistence.test.ts` | Remove text truncation expectations |
| `src/lib/runner/compaction.ts` | Remove `ARTIFACT_SIZE_THRESHOLD_BYTES` constant |
| `src/lib/ai/platform-instructions.ts` | Remove `<context-removed>` instructions for text outputs |
| `src/lib/runner/tools/connections/manage-tools.ts` | Persist `tool_schemas` alongside `activated_tools` on activation |
| `src/lib/composio/activated-tools.ts` | Read schemas from DB row instead of calling `getRawComposioTools()` |
| DB migration | `ALTER TABLE connections ADD COLUMN tool_schemas JSONB DEFAULT '{}'` |
| `src/lib/runner/tools/tool-registry.ts` | Always include all core tools, no conditional registration |
| `src/lib/runner/system-reminder.ts` | Slim to counts only, remove connection skill content |
| `src/lib/runner/context.ts` | Inject system reminder as a message, not system prompt |
| `src/lib/ai/system-prompt.ts` | Remove system reminder from prompt layers |

**Step 2 (Compaction + Caching):**

| File | Change |
|------|--------|
| `src/lib/runner/compaction.ts` | Replace message-count trigger with fraction-based |
| `src/lib/runner/run-persistence.ts` | Persist `prompt_tokens` from `onFinish` |
| `src/types/database.ts` | Add `prompt_tokens` to `runs` table |
| DB migration | `ALTER TABLE runs ADD COLUMN prompt_tokens INTEGER` |
| `src/lib/ai/gateway.ts` | Add caching configuration (after spike) |
| `src/lib/runner/run-agent.ts` | Add cache config to `streamText()` (after spike) |
| `src/lib/runner/context.ts` | Move memory from system prompt to message (after cache boundary) |
| `src/lib/ai/system-prompt.ts` | Remove memory from prompt layers. Stable layers only. |

---

## Part 7: Drift Summary

| Pattern | Deep Agents | Sunder | Drift | Reason |
|---------|-------------|--------|-------|--------|
| Compaction trigger | Fraction-based (`model.profile`) | Fraction-based (static lookup + previous run tokens) | Minor | AI SDK doesn't expose model profiles |
| Compaction timing | Mid-loop (middleware) | Post-run (`finalizeRun`) | Yes | Serverless can't interrupt `streamText()` |
| Token counting | Live count | Previous run's `promptTokens` | Yes | One-turn lag, prevents blocking current run |
| Tool arg truncation | In-flight truncation of `write_file`/`edit_file` before each LLM call | **Not adopted** | Yes — consciously simpler | CRM workloads don't hit context pressure. Truncation breaks message cache every turn (keep window slides). Cache stability > context minimization for our use case. |
| Large tool result eviction | Evicts to `/large_tool_results` with previews | Multimodal artifacts only (images/PDFs). Text outputs kept full in DB. | Yes — consciously simpler | Text outputs are small enough for CRM. Multimodal content still needs handling. |
| Persistence truncation | N/A (in-memory state, never persists truncated) | **Removing** text truncation. Was breaking cache by saving truncated version to DB while LLM saw full version. | Aligning | We were drifting by truncating at persistence. Removing this aligns with their principle: LLM should always see consistent content. |
| Prompt caching | `AnthropicPromptCachingMiddleware` — `cache_control` breakpoint on last message | Gemini caching (implicit or explicit — spike needed) | Yes | Different provider. Same ordering principle. |
| Cache ordering | Caching BEFORE memory (line 297 vs 299 in `graph.py`) | Same — memory moves outside cached prefix, injected as message after cache boundary | None | Following Deep Agents ordering exactly. (Corrected from earlier draft which put memory inside prefix.) |
| Memory placement | Memory injected AFTER caching middleware (`MemoryMiddleware` at line 299) | Memory injected as message after cache boundary | None | Same principle, different mechanism. |
| Tool set stability | Compile-once, static tool set | Always include all tools, no conditional registration | None | Same principle |
| System reminder | N/A (no equivalent) | Move from system prompt to message | N/A | Follows Claude Code pattern (doc 01) |
| Connection loading | Compile-time tool registration | DB-cached schemas, loaded from Supabase instead of Composio API | Minor | Serverless can't compile once. DB cache eliminates external API from hot path. |
| PatchToolCalls | `PatchToolCallsMiddleware` fixes dangling tool calls (AIMessage with tool_calls but no ToolMessage) | **Not needed** | N/A | AI SDK's `onFinish` only receives complete steps. Half-finished tool calls are never persisted to DB, so there are no dangling tool calls to patch on subsequent loads. **Edge case:** if a Vercel Function times out (60s) mid-tool-execution, the run fails entirely via `recordFailedRun` and no partial message is persisted. If this assumption changes (e.g., longer timeouts, partial persistence), revisit. |

**Summary:** 4 justified drifts (serverless runtime, different provider, unnecessary truncation for CRM, unnecessary eviction for text). 2 corrections from earlier draft (memory placement, cache ordering). The rest is aligned.

---

## Part 8: Testing Checklist

- [ ] **Text truncation removed** — verify text tool outputs saved in full to DB (no `<context-removed>` markers for text)
- [ ] **Multimodal artifacts preserved** — verify images/PDFs from `read_file` still get artifact handling
- [ ] **Subagent still works** — verify `run-subagent.ts` compiles after `saveToolcallBlock` changes
- [ ] **Append-only messages** — verify LLM sees identical message content on turn N and turn N+1
- [ ] **Cache stability** — verify system prompt is identical across consecutive turns (no timestamp, no tool set changes, no memory in system prompt)
- [ ] **Memory after cache boundary** — verify memory content is in a message, not the system prompt
- [ ] **System reminder as message** — verify system reminder content is in a message, not the system prompt
- [ ] **Stable tool set** — verify all tools are registered on every run (no conditional inclusion)
- [ ] **DB-cached connection schemas** — verify `loadActivatedConnectionTools()` reads from DB row, not Composio API
- [ ] **Schema persistence on activation** — verify `manage_activated_tools_for_connections` saves schemas to `tool_schemas` column
- [ ] **Connection tools work with cached schemas** — verify agent can call `conn_abc__send_email` using DB-cached schemas
- [ ] **Fraction-based compaction trigger** — verify 85% threshold computation with known model
- [ ] **Fraction-based fallback** — verify fixed token/message fallback when model unknown
- [ ] **browse_website output monitoring** — track output sizes in production. This is the highest-volume tool and most likely to drive compaction. If outputs routinely exceed 30KB, consider output capping in the tool's `outputDescription` parameter.
- [ ] **Prompt cache hits** — monitor `cache_read_input_tokens` vs `cache_creation_input_tokens` in production
- [ ] **Cache hit rate target** — 95%+ on turns 2-50

**Implementation spikes (before Step 2B):**
- [ ] **Gemini implicit caching** — verify automatic cache hits with stable system prompt
- [ ] **System-reminder-as-message** — verify AI SDK + Gemini handles system messages in message array
- [ ] **Explicit caching lifecycle** — if implicit insufficient, verify `createCachedContent` flow via AI SDK

**Deep Agents test files to reference:**
- `tests/unit_tests/middleware/test_summarization_factory.py` — fraction-based defaults test

---

## Part 9: Monitoring

Treat cache hit rate as an operational metric (from `references/prompt-caching/10-portal-one-20k-agents-production-learnings.md`):

- Track `cache_read_input_tokens` / total input tokens per turn
- Alert if cache hit rate drops below 90%
- When cache breaks, investigate: timestamp in system prompt? Tool set change? Message mutation? Memory update?
- Log per-run: `prompt_tokens`, `cache_read_tokens`, `cache_write_tokens`

Expected cost structure after implementation:
- Turn 1: Full cache write (system prompt + tools). Most expensive turn.
- Turn 2+: Cache hit on system prompt + tools prefix. Memory + messages appended after boundary.
- Only ~3K tokens uncached per turn (memory context + system reminder + new message).
- ~97% cache hit rate by token volume on turns 2-50 (matches Portal One data).
