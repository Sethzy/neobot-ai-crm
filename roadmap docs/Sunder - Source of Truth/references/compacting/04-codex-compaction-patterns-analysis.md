# Codex CLI Compaction — Pattern Analysis for Sunder Refactoring

**Source repo:** https://github.com/openai/codex (cloned at `/Users/sethlim/Documents/codex`)
**Date:** 2026-03-06

---

## 1. Architecture Overview

Codex uses a **two-path compaction system** with a shared core algorithm:

```
                         ┌─────────────────────┐
                         │   Auto-compact       │
                         │   trigger check      │
                         │   (token threshold)  │
                         └─────────┬────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
           ┌───────▼────────┐           ┌────────▼─────────┐
           │  LOCAL PATH    │           │  REMOTE PATH     │
           │  (non-OpenAI)  │           │  (OpenAI models) │
           │                │           │                  │
           │  compact.rs    │           │ compact_remote.rs│
           └───────┬────────┘           └────────┬─────────┘
                   │                             │
                   │  LLM call with              │  POST /responses/compact
                   │  SUMMARIZATION_PROMPT        │  (encrypted blob back)
                   │                             │
                   └──────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │  SHARED POST-PROCESSING    │
                    │                            │
                    │  1. Collect user messages   │
                    │  2. Build compacted history │
                    │  3. Inject initial context  │
                    │  4. Replace session history │
                    │  5. Recompute token usage   │
                    └────────────────────────────┘
```

### Key insight for Sunder

The local path is what matters for us. We don't use OpenAI models, so the remote
encrypted-blob path is irrelevant. **The local path is a clean, well-tested pattern
we can port directly to TypeScript.**

---

## 2. Reference Files

### Files to copy/adapt directly

| Codex File | Purpose | Sunder Equivalent |
|---|---|---|
| `core/templates/compact/prompt.md` | Compaction prompt template | New: `src/lib/runner/compaction-prompt.ts` |
| `core/templates/compact/summary_prefix.md` | Handoff prefix prepended to summary | Same file |
| `core/src/compact.rs` (lines 1–270) | Core local compaction logic | Refactor: `src/lib/runner/compaction.ts` |
| `core/src/compact.rs` (lines 440–1008) | Unit tests | New: `src/lib/runner/__tests__/compaction.test.ts` |
| `core/src/tasks/compact.rs` | Task routing (local vs remote) | N/A (we only need local) |

### Files to reference but not copy

| Codex File | Purpose | Why reference-only |
|---|---|---|
| `core/src/compact_remote.rs` | Remote/encrypted compaction | We don't use OpenAI models |
| `core/src/codex.rs:5381-5470` | Auto-compact trigger logic | We need the trigger pattern but our runner loop is different |
| `core/src/context_manager/` | Token estimation, history management | Our context assembly is different (5-layer) |

---

## 3. Patterns to Adopt

### Pattern 1: Compaction Prompt (copy exactly)

**File:** `core/templates/compact/prompt.md`

```
You are performing a CONTEXT CHECKPOINT COMPACTION. Create a handoff summary for
another LLM that will resume the task.

Include:
- Current progress and key decisions made
- Important context, constraints, or user preferences
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work.
```

**Current Sunder:** Our `CRM_COMPACTION_INSTRUCTIONS` is a domain-tuned variant. We
should **keep our CRM instructions AND add the Codex prompt as the base**, appending
our CRM-specific preservation rules.

### Pattern 2: Summary Prefix / Handoff Prompt (copy exactly)

**File:** `core/templates/compact/summary_prefix.md`

```
Another language model started to solve this problem and produced a summary of its
thinking process. You also have access to the state of the tools that were used by
that language model. Use this to build on the work that has already been done and
avoid duplicating work. Here is the summary produced by the other language model,
use the information in this summary to assist with your own analysis:
```

**Current Sunder:** We have NO handoff prefix. The summary is injected raw into
context layer 4. **This is the biggest gap.** Without a handoff prefix, the model
doesn't know the summary came from a prior compaction pass — it just sees a blob of
text with no framing.

### Pattern 3: Summary = `SUMMARY_PREFIX + "\n" + model_output` (copy exactly)

```typescript
// Codex pattern (compact.rs:194)
const summaryText = `${SUMMARY_PREFIX}\n${modelOutput}`;
```

The summary is always stored as `prefix + "\n" + raw_summary`. This lets you detect
summary messages later:

```typescript
// Codex pattern (compact.rs:269-271)
function isSummaryMessage(message: string): boolean {
  return message.startsWith(`${SUMMARY_PREFIX}\n`);
}
```

**Current Sunder:** We store `summaryText` without any prefix. No way to distinguish
a summary from a regular message.

### Pattern 4: Collect User Messages, Discard Everything Else (copy exactly)

```typescript
// Codex pattern (compact.rs:253-267)
function collectUserMessages(items: ResponseItem[]): string[] {
  return items
    .filter(item => item.role === "user" && !isSummaryMessage(item.content))
    .map(item => item.content);
}
```

**Key insight:** When compacting, Codex does NOT keep assistant messages, tool calls,
or tool results in the compacted history. It keeps:
1. **User messages** (up to a token budget) — because these represent the actual tasks
2. **The summary** (which captures everything else) — assistant reasoning, tool usage, decisions

**Current Sunder:** We send ALL messages (user + assistant + tool) to the summarizer,
then store only the summary. We don't preserve original user messages alongside the
summary. This means the model loses the exact user instructions after compaction.

### Pattern 5: Token-Budgeted User Message Retention (copy exactly)

```typescript
// Codex pattern (compact.rs:337-390)
const COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000;

function buildCompactedHistory(
  initialContext: ResponseItem[],
  userMessages: string[],
  summaryText: string,
  maxTokens = COMPACT_USER_MESSAGE_MAX_TOKENS,
): ResponseItem[] {
  const history = [...initialContext];
  const selected: string[] = [];
  let remaining = maxTokens;

  // Walk user messages in REVERSE (newest first)
  for (const message of [...userMessages].reverse()) {
    if (remaining === 0) break;
    const tokens = approxTokenCount(message);
    if (tokens <= remaining) {
      selected.push(message);
      remaining -= tokens;
    } else {
      selected.push(truncateText(message, remaining));
      break;
    }
  }
  selected.reverse();

  // Add selected user messages
  for (const msg of selected) {
    history.push({ role: "user", content: msg });
  }

  // Add summary as last item (always last!)
  history.push({ role: "user", content: summaryText || "(no summary available)" });

  return history;
}
```

**Key design choice:** The summary is always the LAST item in compacted history.
This is because models are trained to treat the most recent context as most relevant.

**Current Sunder:** We store the summary on a DB column and inject it as layer 4 of
context assembly. User messages come after. This is **inverted** from the Codex
pattern.

### Pattern 6: Two Trigger Points (adapt for our runner)

Codex triggers compaction at two points:

```
┌─────────────────────────────────────────────────────────┐
│                    TURN LIFECYCLE                        │
│                                                         │
│  1. PRE-SAMPLING COMPACT (before model call)            │
│     - Check: total_tokens >= auto_compact_limit         │
│     - Mode: DoNotInject (next turn will reinject)       │
│     - Also handles model-switch compaction              │
│                                                         │
│  2. MID-TURN COMPACT (between steps, during tool loop)  │
│     - Check: token_limit_reached && needs_follow_up     │
│     - Mode: BeforeLastUserMessage (keeps summary last)  │
│     - Only fires if there are more steps to run         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Current Sunder:** We trigger POST-RUN only (after the entire run completes). We
use message count (40+) not token count. This means:
- If a single run exceeds context, it fails — no mid-run compaction
- We don't compact before sampling, so stale context can cause failures

### Pattern 7: Token-Based Trigger, Not Message-Count (adopt)

```rust
// Codex pattern (codex.rs:5392-5399)
let auto_compact_limit = model_info.auto_compact_token_limit().unwrap_or(i64::MAX);
if total_usage_tokens >= auto_compact_limit {
    run_auto_compact(sess, turn_context, InitialContextInjection::DoNotInject).await?;
}
```

Token-based is strictly better than message-count because:
- 5 messages with large tool results can exceed context
- 100 short messages may fit fine
- Token counting aligns with actual model limits

### Pattern 8: Warning After Compaction (copy exactly)

```rust
// Codex pattern (compact.rs:227-230)
"Heads up: Long threads and multiple compactions can cause the model to be less
accurate. Start a new thread when possible to keep threads small and targeted."
```

Good UX pattern — warn the user that compacted threads degrade over time.

### Pattern 9: Iterative Trimming on Context Overflow (copy exactly)

```rust
// Codex pattern (compact.rs:154-165)
// If compaction itself exceeds context, trim oldest items one at a time
Err(CodexErr::ContextWindowExceeded) => {
    if turn_input_len > 1 {
        history.remove_first_item();
        truncated_count += 1;
        continue;
    }
    // If only 1 item left and still too big, fail
}
```

Defensive fallback: if the compaction prompt itself is too large, iteratively trim
the oldest items from the input before retrying.

---

## 4. Sunder vs. Codex — Gap Analysis

| Aspect | Codex | Sunder (current) | Gap |
|---|---|---|---|
| **Compaction prompt** | Generic "CONTEXT CHECKPOINT COMPACTION" | CRM-tuned instructions | Keep both — Codex base + our CRM addendum |
| **Handoff prefix** | `SUMMARY_PREFIX` prepended to every summary | None | **Add** — critical for model to understand the summary |
| **Summary detection** | `isSummaryMessage()` checks prefix | None | **Add** — needed to filter summaries from user messages |
| **User message retention** | Keeps recent user messages (20k tokens) alongside summary | Only keeps summary | **Add** — user messages represent actual tasks |
| **Summary position** | Always LAST in compacted history | Injected as layer 4 (middle) | **Change** — summary should be last |
| **Trigger mechanism** | Token-based (`auto_compact_limit`) | Message-count (40+) | **Change** — use token estimation |
| **Trigger timing** | Pre-sampling + mid-turn | Post-run only | **Add** pre-sampling check at minimum |
| **Overflow handling** | Iterative trim + retry | None (fails) | **Add** — defensive fallback |
| **Compaction warning** | Warning event to user | None | **Add** — good UX |
| **Compaction model** | Same model as main turn | Dedicated cheaper model (Flash-Lite) | **Intentional drift** — cost savings, summarization doesn't need Tier 1 |
| **DB persistence** | In-memory session replacement | DB columns on thread row | Keep ours — Codex is ephemeral CLI, we're persistent SaaS |

---

## 5. Recommended Refactoring Plan

### What to change

1. **Add `SUMMARY_PREFIX`** — copy Codex's handoff prompt verbatim
2. **Add `isSummaryMessage()`** — copy Codex's detection function
3. **Add `collectUserMessages()`** — extract user messages, exclude summaries
4. **Add `buildCompactedHistory()`** — copy Codex's token-budgeted builder
5. **Change trigger from message-count to token-based** — use AI SDK token estimation
6. **Add pre-run compaction check** — compact before `streamText()` if over threshold
7. **Add iterative trim fallback** — if compaction input too large, trim oldest items
8. **Add compaction warning** — emit user-facing warning after compaction
9. **Keep CRM instructions** — append our domain-specific rules to the Codex base prompt

### What to keep (justified drift from Codex)

| Our Deviation | Why |
|---|---|
| **DB-persisted summary** (thread row columns) | Codex is ephemeral CLI — session ends when terminal closes. We're a persistent SaaS with threads that resume across runs. DB persistence is required. |
| **5-layer context assembly** (RUNNER-03) | Codex injects initial context as `developer` messages. We have a structured 5-layer system (SOUL.md, USER.md, MEMORY.md, summary, messages). Keep our layers. |
| **CRM-tuned compaction instructions** | Codex is generic coding tool. We need domain-specific preservation rules for real estate CRM data. Append ours after the Codex base prompt. |
| **Anthropic native compaction as bonus layer** | Codex doesn't support Anthropic. Our `buildPrepareStep()` for `compact_20260112` is additive — keep it as a second layer alongside our local compaction. |
| **No remote compaction path** | We don't use OpenAI models. Skip `compact_remote.rs` entirely. |
| **Cheaper model for compaction** | Codex uses the same model for compaction as for the main turn. We use a **dedicated cheaper model** (`google/gemini-2.5-flash-lite`) instead of Tier 1 (`google/gemini-3-flash`). Compaction is pure summarization — no tool-calling, no complex reasoning — so a cheaper/faster model is sufficient and saves significant cost on a task that runs frequently (especially with Autopilot at 4x/day). |

### What to delete from current implementation

- `COMPACTION_MESSAGE_THRESHOLD = 40` — replace with token-based threshold
- `COMPACTION_KEEP_RECENT = 15` — replace with `COMPACT_USER_MESSAGE_MAX_TOKENS`
- Raw summary injection without prefix — always prepend `SUMMARY_PREFIX`

---

## 6. File-by-File Implementation Map

### `src/lib/ai/gateway.ts` — MODIFIED

New constant for the compaction model:

```typescript
export const TIER_1_MODEL = "google/gemini-3-flash";       // main agent runs
export const COMPACTION_MODEL = "google/gemini-2.5-flash-lite"; // summarization only
```

Compaction uses `COMPACTION_MODEL` via the same `gateway()` function — Vercel AI
Gateway routes to the right provider/model by the string identifier. No extra config
needed. This is a pure cost optimization: Flash-Lite is significantly cheaper than
Flash 3 and compaction is just summarization (no tools, no complex reasoning).

### `src/lib/runner/compaction.ts` — REFACTOR

Current file gets refactored to follow Codex patterns:

```typescript
// --- Constants (copy from Codex) ---
export const SUMMARIZATION_PROMPT = `...`; // from prompt.md
export const SUMMARY_PREFIX = `...`;       // from summary_prefix.md
export const COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000;

// --- Keep (our addition) ---
export const CRM_COMPACTION_INSTRUCTIONS = `...`; // existing, appended to SUMMARIZATION_PROMPT

// --- New functions (port from Codex) ---
export function isSummaryMessage(message: string): boolean;
export function collectUserMessages(messages: ConversationMessage[]): string[];
export function buildCompactedHistory(
  userMessages: string[],
  summaryText: string,
  maxTokens?: number,
): CompactedHistoryEntry[];

// --- Refactored functions ---
export async function generateCompactionSummary(input): Promise<GeneratedCompactionSummary>;
// Now uses gateway(COMPACTION_MODEL) instead of gateway(TIER_1_MODEL)
// System prompt: SUMMARIZATION_PROMPT + CRM_COMPACTION_INSTRUCTIONS
// Returns summary WITH SUMMARY_PREFIX prepended

export async function maybeCompactThread(supabase, clientId, threadId): Promise<boolean>;
// Now uses token-based threshold instead of message count
// Calls collectUserMessages + buildCompactedHistory
// Includes iterative trim fallback
```

### `src/lib/runner/run-agent.ts` — MODIFY

Add pre-run compaction check:

```typescript
// Before streamText() call:
await maybeCompactThread(supabase, clientId, threadId);
```

### `src/lib/runner/context.ts` — MODIFY

Change summary injection to respect Codex ordering:
- Summary (with `SUMMARY_PREFIX`) injected as part of message history, not as a separate layer
- Or: keep as layer 4 but ensure it comes AFTER recent user messages are stripped

### `src/lib/runner/__tests__/compaction.test.ts` — NEW

Port Codex test patterns:
- `isSummaryMessage` detection
- `collectUserMessages` filtering (excludes summaries, system messages)
- `buildCompactedHistory` token budgeting and truncation
- `generateCompactionSummary` prompt assembly

### DB schema — NO CHANGE

Keep existing `conversation_threads` compaction columns. Codex doesn't persist to DB
(ephemeral CLI), but our schema is correct for persistent SaaS.
