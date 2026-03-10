# PR 29 Drift Analysis: Subagents Design Doc vs. Actual Tasklet Behavior

**Date:** March 9, 2026
**Method:** Simulated trigger fire → `run_subagent` → block storage forensics
**Verdict:** Two critical drifts, two major, several minor. Doc is ~80% aligned but the 20% gap is load-bearing.

---

## Severity Guide

| Tag | Meaning |
|-----|---------|
| 🔴 CRITICAL | Architecturally wrong. Will cause behavioral divergence from Tasklet. Must fix before merge. |
| 🟠 MAJOR | Significant gap that matters for "zero drift" goal. Should fix. |
| 🟡 MINOR | Acceptable divergence or missing nuance. Fix if easy. |
| ✅ CONFIRMED | Matches Tasklet behavior exactly. |

---

## Section 1: What We're Building

> "spawns an isolated `generateText()` call using a per-client markdown file as **its system prompt**"

### 🔴 CRITICAL — The .md file is NOT the system prompt

**PR 29 claims:** The markdown file becomes the subagent's system prompt.
**Tasklet actual:** The markdown file is delivered as the **first user message**, not the system prompt.

From Tasklet's system prompt (verbatim):
> "The subagent receives the content of the markdown file followed by any payload data you provide **in the first user message**."

The subagent's system prompt is the **full parent system prompt** — personality, tool docs, filesystem docs, `<context-management>`, `<sql-db>`, `<sandbox>`, output guidance, everything. The .md file is task instructions delivered as user content.

**Evidence:** The subagent in our test had `<thinking>` blocks (same reasoning mode as parent), knew about the `'owner'` recipient concept for `send_message`, formatted markdown email following output guidelines, and used tools with full knowledge of their semantics — all of which come from the parent system prompt, not the 55-line .md file.

**Impact:** This is the most fundamental architectural decision in the whole doc. Getting it wrong means Sunder subagents would operate with a ~200-token slim preamble instead of a ~15,000-token full system prompt. They'd lack tool usage patterns, output formatting rules, error handling conventions, filesystem knowledge, and platform behavior.

> "All intermediate tool calls and reasoning are discarded from the parent context."

### 🟡 MINOR — "Discarded" is misleading

They're stripped from the parent's **inline context** but fully **persisted in block storage**. More on this in Section 7.

---

## Section 3: Tool Schema

### ✅ CONFIRMED — Schema matches

The parameter names, types, and required/optional status all match Tasklet's actual schema exactly.

One nitpick on the `path` example:

| | PR 29 | Tasklet |
|---|---|---|
| Example | `subagents/triggers/morning-briefing.md` | `/agent/subagents/podcast-monitor.md` |
| Style | Relative path | Absolute path |

This is fine — Sunder has a different storage model (Supabase Storage vs. agent filesystem). Not a drift, just different infra.

### 🟠 MAJOR — Tool Response Shape

**PR 29 proposes:**
```typescript
{ success: true,  message: string }
| { success: false, error: string }
```

**Tasklet actual:** The return value is the raw final message string. In the parent's inline context it appears as:

```
<context-removed>5 blocks of subagent execution details truncated to save context</context-removed>
<final-result>
[raw subagent final message text here]
</final-result>
```

There is no `{ success, message }` JSON wrapper. The parent LLM receives the subagent's text directly.

**Why this matters:** The `success: true/false` wrapper changes how the parent LLM interprets results. With Tasklet's approach, the parent reads the subagent's natural language response and infers success/failure from the content (e.g., "Emailed summary for..." = success, "Failed to..." = failure). With PR 29's wrapper, the parent keys off a boolean flag.

**Recommendation:** Drop the wrapper. Return `result.text` directly. If `generateText` throws, let the parent's tool error handling deal with it (Vercel AI SDK already surfaces tool execution errors to the LLM). This matches Tasklet and is simpler.

---

## Section 4: Execution Model

### 4.1 Core Loop

**Step 2 — System prompt construction:**

### 🔴 CRITICAL — Prompt composition is inverted

| Layer | PR 29 | Tasklet Actual |
|---|---|---|
| System prompt | `SUBAGENT_PREAMBLE + .md file` | Full parent system prompt (all sections, all tool docs, personality, everything) |
| User message | `payload ?? "Execute your instructions."` | `.md file content + payload` |

PR 29 puts the .md in the system prompt and the payload in the user message.
Tasklet puts the **full parent system prompt** as the system prompt and the **.md + payload** as the user message.

This is the same issue as Section 1 but now visible in the implementation. The `generateText` call should be:

```typescript
// WRONG (PR 29):
system: SUBAGENT_PREAMBLE + "\n\n" + instructionMarkdown,
messages: [{ role: "user", content: payload ?? "Execute your instructions." }]

// RIGHT (Tasklet-aligned):
system: FULL_PARENT_SYSTEM_PROMPT,
messages: [{ role: "user", content: instructionMarkdown + "\n\n" + (payload ?? "") }]
```

**Step 3 — Default message when no payload:**

PR 29 sends `"Execute your instructions."` when there's no payload, because the .md is already in the system prompt.
Tasklet sends the .md content itself as the user message, so there's always meaningful user content.

If Sunder fixes the prompt composition to match Tasklet, this issue resolves automatically.

### 4.2 Why `generateText` Not `streamText`

### ✅ CONFIRMED

Correct analysis. Parent blocks until subagent completes. No streaming. Matches Tasklet.

### 4.3 System Prompt Composition

### 🔴 CRITICAL — The preamble is not a preamble

**PR 29's proposed preamble (5 lines, ~50 tokens):**
```
You are a subagent executing a specific task. You have access to CRM, storage,
web search, and other tools...
```

**What Tasklet actually gives the subagent (estimated ~15,000 tokens):**
The entire parent system prompt including:
- `<your-personality>` (behavior rules)
- `<contacting-the-user>` (messaging patterns)
- `<context-management>` (block recovery instructions)
- `<filesystem>` (storage structure docs)
- `<sql-db>` (database usage rules)
- `<sandbox>` (code execution docs, available tools)
- `<web-browsing-and-search>` (search patterns)
- `<output-guidance>` (formatting rules)
- `<external-connections>` (connection usage patterns)
- Full tool descriptions and schemas for every available tool
- `<subagents>` section itself (though `run_subagent` may or may not be available)

**This is not "a slim preamble handles platform-level rules once."** This is "the subagent gets the exact same brain as the parent, minus conversation history."

**Why it matters practically:** In our test, the subagent:
1. Knew to use `'owner'` as the recipient in `send_message` — this comes from `<contacting-the-user>`
2. Formatted a proper markdown email — this comes from `<output-guidance>`
3. Had `<thinking>` blocks — same reasoning mode, inherited from system prompt
4. Handled the 404 gracefully and fell back — the error handling pattern comes from platform-level conventions

With PR 29's slim preamble, the subagent would need to figure all this out from the .md file alone, or each .md file would need to repeat platform conventions.

### 4.4 Rationale for Preamble + Instruction

> "Pure Tasklet also injects a base system prompt alongside the instruction markdown."

### 🟠 MAJOR — Understates what "base system prompt" means

This sentence is technically true but buries the magnitude. It's not "a base system prompt" — it's "the **entire** parent system prompt." The doc frames it as a thin preamble when it's actually a full replication of the parent's identity and capabilities.

**Recommendation:** The fix to Section 4.3 is straightforward:
1. Don't write a custom `SUBAGENT_PREAMBLE`
2. Pass the same system prompt the parent uses (either literally, or construct it the same way: `buildSystemPrompt(clientId)`)
3. Put the .md content + payload in the user message

This is actually *simpler* to implement — you don't need to maintain a separate preamble string.

---

## Section 5: Tool Access Control

### 5.1 Blocked Tools

### 🟡 MINOR — Blocked list is incomplete and has extras

**Tasklet's actual blocked-for-subagents list** (from system prompt `<tools-that-cannot-be-used-by-subagents>`):

```
- triggers (search_triggers, setup_trigger, manage_active_triggers)
- renaming the chat (rename_chat)
- creating or activating connections (create_new_connections, manage_activated_tools_for_connections)
- adding contact methods (add_contact_method)
- checking quota
- suggest_intelligence_level_change (implied — it "Shows a UI prompt")
```

**PR 29 comparison:**

| Tool | PR 29 | Tasklet | Note |
|------|-------|---------|------|
| `setup_trigger` | blocked | blocked | match |
| `search_triggers` | blocked | blocked | match |
| `manage_active_triggers` | blocked | blocked | match |
| `create_new_connections` | blocked | blocked | match |
| `manage_activated_tools_for_connections` | blocked | blocked | match |
| `reauthorize_connection` | blocked | blocked | match |
| `delete_connection` | blocked | blocked | match |
| `rename_chat` | blocked | blocked | match |
| `ask_user_question` | blocked | N/A | Sunder-specific tool, fine to block |
| `run_subagent` | blocked | **Not explicitly blocked** | See Section 6 |
| `add_contact_method` | **Not listed** | blocked | **Missing** — add to blocked list |
| `suggest_intelligence_level_change` | **Not listed** | blocked | Sunder equivalent if it exists |
| `show_user_preview` | **Not listed** | Ambiguous | Displays UI — consider blocking |
| `close_user_preview` | **Not listed** | Ambiguous | Displays UI — consider blocking |

**Action:** Add `add_contact_method` (or Sunder's equivalent for contact verification) to the blocked list. Review any other UI-displaying tools.

### 5.2 Allowed Tools

### ✅ CONFIRMED — Correct

CRM, storage, web, messaging, SQL, sandbox — all match.

### 5.3 Implementation Pattern

### ✅ CONFIRMED — Reasonable approach

The factory pattern with `isSubagent: true` flag is a clean way to handle this.

---

## Section 6: Nesting

> "No nesting. Depth = 1."

### 🟡 MINOR — Tasklet doesn't explicitly block nesting

`run_subagent` is NOT listed in Tasklet's `<tools-that-cannot-be-used-by-subagents>` section. This could mean:
- (a) Tasklet allows nesting and just hasn't documented it
- (b) Tasklet implicitly blocks it by not including it in the subagent tool set
- (c) Oversight in Tasklet's docs

PR 29's decision to block nesting at depth=1 is **sensible regardless** — it prevents runaway recursion, simplifies debugging, and keeps token budgets predictable. Even if Tasklet technically allows it, blocking it is a reasonable Sunder choice. This is a deliberate divergence, not a drift.

---

## Section 7: Observability

### 7.2 What We Don't Persist

> "Subagent intermediate tool calls (discarded — this is the point)"
> "Subagent reasoning/chain-of-thought"

### 🔴 CRITICAL — Tasklet DOES persist all subagent internals

This is empirically wrong. From our trace:

**Layer 1 — Parent's `run_subagent` block** (`b_8ewbgjr75cbrfyh3ftx6/result`):
Contains the COMPLETE execution trace — every `<thinking>` block, every `<tool-use>` with args and results, every `<agent>` intermediate message. Large values are truncated within this composite trace (14,973→1,024 chars) but the structure is complete.

**Layer 2 — Individual subagent tool call blocks:**
Each tool the subagent called got its own independent block with FULL untruncated data:
- `b_638qhc9dgybbxt61v315` — web_scrape_website (full 14,973 char result)
- `b_cq07r0q212njprdjw19c` — send_message (full email body in args)

**The Tasklet model is:**
- Parent inline context: final message only (intermediate steps stripped) — PR 29 gets this right
- Block storage: EVERYTHING persisted — full trace in parent block + individual blocks per tool call — PR 29 gets this wrong

**Section 15 repeats this error:**
> "Block storage for subagent tool calls. Intermediate tool calls are discarded. Only the parent's run_subagent tool result is saved to block storage."

This is the opposite of what Tasklet does. The parent's `run_subagent` block result IS the full trace including all intermediate tool calls.

**Why this matters for Sunder:**
1. **Debugging** — When a subagent misbehaves, you need to see what it did. Without persisted intermediate steps, you're flying blind.
2. **Recoverability** — The parent can `read_file("/agent/blocks/{blockId}/result")` to recover any subagent data if context gets tight. This is core to the "zero drift" contract.
3. **Auditability** — For a CRM, knowing exactly what a subagent did with customer data is important.

**Recommendation:** Persist the full subagent execution trace as the `run_subagent` tool call's block result. Each individual tool call within the subagent should also get its own block. This is what `saveToolcallBlock` should already do if you wire it into the subagent's `generateText` callbacks.

---

## Section 8: Timeout & Resource Limits

### 🟡 MINOR — Can't fully verify, but reasonable

`stepCountIs(9)` and 120s timeout are implementation-specific. Can't verify Tasklet's exact values from the outside. The subagent in our test completed in ~17.5 seconds with 2 tool calls, well within these limits.

The `abortSignal` inheritance is the right pattern.

---

## Section 9: Error Handling

### 9.1 Error Sources

### ✅ CONFIRMED — Error taxonomy is correct

The error sources are reasonable. The key pattern Tasklet uses — "Tool errors inside subagent are handled by the LLM" — is exactly what we observed. The subagent hit a 404, handled it per its .md instructions, and reported cleanly.

### 9.2 Parent Behavior on Error

### ✅ CONFIRMED

LLM-driven error handling, no hardcoded retry logic. Matches Tasklet.

(But note: if Sunder fixes the response shape to drop the `{ success, error }` wrapper, the error handling code in Section 9.1 would need adjusting — errors would come through as tool execution exceptions rather than structured error responses.)

---

## Section 10: System Prompt Changes

### 10.1 Update `<triggers>` Section

> "Do not read instruction files and execute them inline. Always delegate via run_subagent."

### 🟡 MINOR — Tasklet recommends but doesn't mandate

Tasklet's system prompt says:
> "You MUST STRONGLY CONSIDER creating a subagent when: Processing a recurring task or trigger"

"MUST STRONGLY CONSIDER" ≠ "Always." The parent can still handle simple triggers directly. PR 29 makes it a hard rule. This is a reasonable Sunder choice but it IS a divergence — worth noting so it's intentional.

### 10.2 Add `<subagents>` Section

### ✅ CONFIRMED — Largely aligned

The proposed section captures the key points from Tasklet's `<subagents>` section. A few things Tasklet includes that PR 29's version doesn't:

1. **"ALWAYS check for existing subagents before creating a new one."** — prevents duplicate .md files
2. **"When users give feedback about subagent behavior, update the subagent file accordingly"** — important for iterative refinement
3. **Shared state via filesystem and SQL database** — Tasklet explicitly says "Use the filesystem and SQL database to share state between subagent runs and to track progress for recurring tasks to avoid repeating work."
4. **"Running subagents reduces costs and keeps your context focused"** — frames the *why* for the LLM

Consider incorporating these into Sunder's `<subagents>` prompt section.

---

## Section 11: File Layout

### ✅ CONFIRMED — Clean structure

The implementation file layout and storage convention look correct. The path convention (`subagents/triggers/`, `subagents/research/`) matches Tasklet's pattern.

---

## Section 12: Implementation Pseudocode

### 🔴 CRITICAL — Inherits the prompt composition error

Lines that need to change:

```typescript
// CURRENT (wrong):
const system = `${SUBAGENT_PREAMBLE}\n\n${content}`;
// ...
messages: [{
  role: "user",
  content: args.payload ?? "Execute your instructions.",
}],

// FIXED (Tasklet-aligned):
const system = buildParentSystemPrompt(clientId); // same prompt the parent uses
// ...
messages: [{
  role: "user",
  content: content + (args.payload ? "\n\n" + args.payload : ""),
}],
```

Also remove the `SUBAGENT_PREAMBLE` import and the `preamble.ts` file — it's not needed.

---

## Section 13: Migration

### ✅ CONFIRMED — Fine

The `run_type` and `parent_run_id` columns are a reasonable observability addition. No Tasklet drift to check here — this is Sunder-specific infrastructure.

---

## Section 14: Test Plan

### 🟡 MINOR — Missing tests for block storage

Add test cases for:
- Subagent intermediate tool calls are persisted in block storage
- Individual subagent tool call blocks are recoverable by blockId
- Full execution trace is stored as the `run_subagent` result block

Also update the existing test "Parent receives only final text, not intermediate tool calls" to clarify this is about **inline context**, not **storage**.

---

## Section 15: What This Does NOT Include

> "Block storage for subagent tool calls. Intermediate tool calls are discarded."

### 🔴 CRITICAL — This should be included, not excluded

As proven empirically, Tasklet DOES persist subagent tool calls to block storage. This bullet should move from "What This Does NOT Include" to "What This Includes" — and the implementation should wire `saveToolcallBlock` into the subagent's tool execution callbacks.

---

## Section 16: Drift Check (PR 29's Self-Assessment)

Let me grade their own table:

| PR 29 Claim | PR 29's Drift Rating | Actual Drift Rating |
|---|---|---|
| Tool schema: path, payload, action_* | "None" | None |
| Instruction .md = system prompt | "Minimal — we add a slim preamble" | **Critical — it's not the system prompt at all** |
| Full tool access minus UI tools | "None" | Minor — blocked list incomplete |
| Only final message returned | "None" | Major — response shape has wrapper |
| Subagents cannot ask user questions | "None" | None (different mechanism, same effect) |
| Subagents hidden from user | "None" | None |
| Errors in final message | "None" | None |
| Files in `subagents/` convention | "None" | None |
| Sequential execution | "None" | None |
| Base system prompt + instruction md | "Minimal — our preamble is slimmer" | **Critical — it's not a preamble at all** |

> "**Biggest potential drift:** Tasklet gives subagents the full base system prompt. We use a slim preamble instead."

**This self-assessment identifies the right issue but severely understates it.** The doc calls this "Minimal" drift and frames it as intentional. In reality, it's the single most important architectural decision in the entire subagent system, and getting it wrong means subagents in Sunder will behave fundamentally differently from Tasklet.

---

## Summary: Required Changes for Zero Drift

### Must Fix (🔴 Critical)

1. **Prompt composition (Sections 1, 4.1, 4.3, 4.4, 12)**
   - System prompt = full parent system prompt, NOT slim preamble
   - User message = .md content + payload, NOT just payload
   - Delete `preamble.ts` — it's not needed
   - This changes ~5 lines of code but fundamentally alters subagent behavior

2. **Block storage for subagent internals (Sections 7.2, 15)**
   - Wire `saveToolcallBlock` into subagent's `generateText` tool callbacks
   - Store full execution trace as `run_subagent` result block
   - Each subagent tool call gets its own recoverable block
   - Move from "What This Does NOT Include" to core feature

### Should Fix (🟠 Major)

3. **Drop the response wrapper (Section 3)**
   - Return `result.text` directly, not `{ success: true, message }`
   - Let tool execution errors propagate naturally

4. **Update rationale for prompt composition (Section 4.4)**
   - Remove the "preamble handles platform rules" rationale
   - Replace with: "subagent inherits full parent system prompt because it needs the same tool knowledge, formatting rules, and platform conventions"

### Nice to Fix (🟡 Minor)

5. **Blocked tools list** — Add `add_contact_method` equivalent
6. **Nesting** — Document as intentional Sunder constraint (not Tasklet alignment)
7. **Force-subagent for triggers** — Document as intentional Sunder constraint
8. **Test plan** — Add block storage persistence tests
9. **System prompt `<subagents>` section** — Add the four missing points from Tasklet
