# Tasklet Context Management Architecture

**Date:** March 9, 2026
**Method:** Empirical testing + system prompt inspection from inside a live Tasklet agent
**Purpose:** Complete technical reference for how Tasklet handles context management. Source of truth for Sunder's implementation.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Block Storage System](#2-block-storage-system)
3. [Layer 1: Inline Result Truncation](#3-layer-1-inline-result-truncation)
4. [Layer 2: Context Compaction](#4-layer-2-context-compaction)
5. [System State Reminders](#5-system-state-reminders)
6. [Context Assembly Order](#6-context-assembly-order)
7. [The `<context-removed>` Tag — Three Distinct Formats](#7-the-context-removed-tag--three-distinct-formats)
8. [Agent Recovery Instructions](#8-agent-recovery-instructions)
9. [Tool-Level Truncation](#9-tool-level-truncation)
10. [Design Trade-offs and Gaps](#10-design-trade-offs-and-gaps)

---

## 1. Architecture Overview

Tasklet manages context through **five independent mechanisms** that work together to keep the LLM's context window within budget while preserving recoverability:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONTEXT WINDOW                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 1. System Prompt (static, always present)                    │   │
│  │    - Tool definitions, personality, <context-management>     │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 2. Conversation Summary (LLM-generated, 4 fixed sections)   │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 3. Pruned Trigger Events (mechanical title extraction)       │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 4. Recent Messages (verbatim, oldest→newest)                 │   │
│  │    - Some tool results inline-truncated to ~5KB              │   │
│  │    - Some tool call blocks fully removed (listed by blockId) │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │ 5. System State Reminders (injected periodically)            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  EXTERNAL (not in context window):                                  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Block Storage: /agent/blocks/{blockId}/                      │   │
│  │ Full args + result for EVERY tool call, regardless of size   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** Nothing is permanently lost. Inline context is aggressively managed, but full data is always recoverable from block storage — *if* the agent knows the blockId.

---

## 2. Block Storage System

### What It Is

Every tool call the agent makes — regardless of tool type, result size, or success/failure — is persisted to a filesystem-backed key-value store at `/agent/blocks/{blockId}/`.

### Storage Structure

```
/agent/blocks/{blockId}/
├── args      # Full tool call arguments (JSON)
├── result    # Full tool call result (JSON, may contain file references)
├── info      # Metadata: {"toolName": "...", "startTime": "..."}
└── *.ext     # Optional file attachments (e.g., images from web scrape)
```

### Real Examples (Two Sessions)

**Session 1 — general usage:**

| blockId | Tool | Args (bytes) | Result (bytes) | Notes |
|---|---|---|---|---|
| `b_0xh08j5xqzg1wjjc1knq` | `rename_chat` | 47 | 71 | Even tiny results get stored |
| `b_n5p35vze3gg7wn4s8ynb` | `web_scrape_website` | 64 | 617,624 | 617KB — full storage |
| `b_tcn409mnzz14ys8fhnd7` | `run_command` | 650 | 784 | Normal size |
| `b_0vtsjzrstmtyvat97vt8` | `run_command` | 377 | 187 | Normal size |
| `b_nz0hbvb9c8zpw5gv9r5a` | `run_command` (failed) | 515 | 273 | Even failed commands get stored |

**Session 2 — truncation testing:**

| blockId | Tool | Args (bytes) | Result (bytes) | Truncated Inline? | Notes |
|---|---|---|---|---|---|
| `b_9430q490zcnejee3x40d` | `run_command` | 565 | **94,068** | **Yes → 5KB** | Primary truncation test |
| `b_yevchtzzbm19qkkx7wsn` | `write_file` | **22,960** | 17 | No | Large args (file content), tiny result |
| `b_5c3kfh0hsx56acxj3p68` | `read_file` | 52 | 3,154 | No | Normal |
| `b_tr68nqsvc6tpph9q8tpj` | `show_user_preview` | 101 | 106 | No | Even UI-only tools get stored |
| `b_3eepde0fhgytpyfcvqy8` | `read_file` | 25 | 314 | No | Directory listing |

**Critical observation:** The 92KB `run_command` result was stored in full (94,068 bytes) in block storage, while the inline context version was truncated to ~5KB. Block storage is the source of truth.

### BlockId Breadcrumbs

Every tool call result in the agent's context ends with a blockId line:

```
blockId: b_3s89xyycn3jbw7nf2w9h
```

This is the **only way** the agent learns which blockId corresponds to which tool call. The breadcrumb is appended by the system to every tool result, both truncated and non-truncated.

### Blocks Are NOT Enumerable

```bash
$ ls /agent/blocks/
# Returns nothing

$ find /agent/blocks/ -maxdepth 1 -type d
/agent/blocks/
# Only the directory itself

$ cat /agent/blocks/b_9430q490zcnejee3x40d/result
# Returns full 94KB — works perfectly
```

Blocks are a **key-value store addressed by blockId**. The agent cannot discover blocks it doesn't already have the ID for. This means:

- If a blockId was in a message that got compacted into a summary, and the summary didn't preserve the ID, that block is **technically accessible but practically lost**.
- The agent's only sources for blockIds are: (a) breadcrumbs on inline tool results, (b) `<context-removed>` removal notices that list blockIds, and (c) anything it explicitly saved to its own files or database.

### `info` File Contents

The metadata file is minimal:

```json
{"toolName": "run_command", "startTime": "2026-03-09T04:38:12.345Z"}
```

Always exactly two fields: `toolName` and `startTime`. Size is consistently ~65 bytes.

---

## 3. Layer 1: Inline Result Truncation

### What It Is

When a tool call returns a result larger than a threshold (~5KB), the inline version in the agent's context is **head-truncated** to approximately 5KB. The full result is stored in block storage.

### Mechanism: HEAD Truncation

This is a **dumb head truncation** — the system keeps the first ~5KB of the result content, discards the rest, and appends a `<context-removed>` marker. It is:

- ❌ NOT an LLM summary
- ❌ NOT tail truncation
- ❌ NOT sampling or intelligent selection
- ✅ Just the first ~5KB of bytes, then a marker

### When It Happens

Truncation is applied at **persistence/assembly time** — when the tool result is placed into the agent's context. It is a one-time, permanent transformation of the inline version. Once truncated, the inline version is never "unshrunk" even if context budget frees up later.

### Real Example

A `run_command` that generated 92KB of test output (500 lines of structured data):

**What appeared inline (in the agent's context):**
```json
{
  "log": "LINE_0000: This is test data row 0 with padding... Category=0 Score=0.0000...\nLINE_0001: ...\nLINE_0002: ...\n...[approximately 27 lines]...",
  "exitCode": 0
}
```
Followed by:
```
<context-removed>Data truncated 92kB → 5kB</context-removed>

blockId: b_9430q490zcnejee3x40d
```

**What was stored in block storage:**
```bash
$ wc -c /agent/blocks/b_9430q490zcnejee3x40d/result
94068  # Full 94KB — LINE_0000 through LINE_0499
```

The inline version kept LINE_0000 through roughly LINE_0027 (the first ~5KB). Everything from LINE_0028 onward was only in block storage.

### What Triggers Truncation

Results **below** ~5KB are never truncated, even when overall context pressure is high. This was tested — a 784-byte result and a 71-byte result both appeared in full inline despite the context already containing a 92KB truncation. The threshold appears to be a **fixed size**, not adaptive to context budget.

Evidence:
- System prompt example: `Data truncated: 16KB -> 5KB`
- Actual scrape result: `Data truncated 602kB → 5kB`
- Test result: `Data truncated 92kB → 5kB`

### Truncation Applies to Results Only

Tool call **arguments** are not inline-truncated. The `write_file` call with 22,960 bytes of args appeared with full args inline. Only the result field is subject to inline truncation.

---

## 4. Layer 2: Context Compaction

Context compaction is a **separate, independent system** from inline truncation. It removes entire messages from the context window and replaces them with compressed representations. It has three sub-mechanisms:

### 4A. Structured Conversation Summary

**What it is:** An LLM-generated summary of old conversation messages, placed at the top of the context window. Old messages that have been summarized are removed entirely.

**Fixed structure — exactly 4 sections, always these names:**

```markdown
Previous conversation summary:

## User Instructions

**Primary Goal**: [What the user wants]

**Key Directives**:
- [Direct quotes from user when relevant]
- [Synthesized instructions]

## Workflow

[Description of established processes, automations, configurations]

## Resources

**External**:
- [URLs, email addresses, API endpoints]

**Internal**:
- [File paths within /agent/ filesystem]
- [Database tables if any]

## Current Focus

[What the conversation was most recently working on]
```

**Real example (verbatim from a live session):**

```markdown
Previous conversation summary:

## User Instructions

**Primary Goal**: Monitor AI-related podcasts and blogs, email summaries
when something interesting drops.

**Key Directives**:
- "you decide everything. ai related stuff. i want to find cool stuff"
  — Agent has full discretion on sources and what counts as interesting
- Email alerts to: **limzheyi1996@gmail.com**
- User wants to see and adjust the subagent prompt that filters content

## Workflow

**RSS Monitoring System** (checks every 15 minutes):

**Monitored Sources**:
1. **Lex Fridman Podcast** - https://lexfridman.com/feed/podcast/
2. **Latent Space Podcast** - https://api.substack.com/feed/podcast/1084089.rss
3. **OpenAI Blog** - https://openai.com/blog/rss.xml
4. **Simon Willison's Blog** - https://simonwillison.net/atom/everything/
5. **The Gradient Blog** - https://thegradient.pub/rss/

**Process Flow**:
- Triggers fire when new RSS items appear
- Subagent evaluates if content is genuinely interesting
- If interesting: sends email alert with summary
- Goal is to skip noise, only send the good stuff

**Current Limitations** (discussed):
- No deduplication
- No history tracking
- Completely stateless fire-and-forget architecture

## Resources

**External**:
- Email address: limzheyi1996@gmail.com (alert destination)
- 5 RSS feed URLs (listed above)

**Internal**:
- `/agent/subagents/ai-content-processor.md` - Subagent prompt file
- `/agent/home/apps/ai-monitor/` - Demo React app
- `/agent/home/tool-definitions.md` - Tool documentation (22KB)

## Current Focus

User is investigating Tasklet's internal architecture...
```

**Key properties:**
- The summary contains **synthesized** content — not raw extraction but LLM-interpreted
- `## Resources` captures both external URLs and internal file paths — this is how the agent recovers knowledge of its own filesystem state after compaction
- `## Current Focus` captures "what were we in the middle of" — critical for session continuity
- Direct user quotes are preserved when they encode important directives
- No trigger event details appear in the summary — complete separation

### 4B. Trigger Event Pruning

**What it is:** A mechanical (non-LLM) process that replaces trigger invocation + response message pairs with a compact title listing.

**Format:**
```
<context-removed>
Omitted 34 trigger invocations & responses to reduce context size:
- New RSS item: Quoting Martin Fowler: Monitor Simon Willison Blog
- New RSS item: The A.I. Disruption We've Been Waiting for Has Arrived: Monitor Simon Willison Blog
- New RSS item: Typing without having to type: Monitor Simon Willison Blog
- New RSS item: The Reasonable Effectiveness of Virtue Ethics in AI Alignment: Monitor The Gradient Blog
- New RSS item: LadybirdBrowser/ladybird: Abandon Swift adoption: Monitor Simon Willison Blog
- New RSS item: Introducing OpenAI for India: Monitor OpenAI Blog
...and 24 more trigger events
</context-removed>
```

**What's extracted per event:**
- ✅ Trigger title (e.g., "Quoting Martin Fowler")
- ✅ Source/trigger name (e.g., "Monitor Simon Willison Blog")
- ✅ Trigger type prefix ("New RSS item:")

**What's NOT preserved:**
- ❌ No timestamp per event
- ❌ No outcome (→ emailed / → skipped / → errored)
- ❌ No blockIds for recovery
- ❌ No payload data (article URL, description, etc.)

**This is a real gap.** The agent cannot determine what action it took on any pruned trigger event without manually reading every individual block — and it doesn't even have the blockIds to do so. For trigger-heavy workflows, this means the agent has no memory of past processing decisions.

**Mechanical, not LLM:** The title extraction is pattern-based from the trigger event payload, not LLM-generated. It uses the same format for all trigger types.

### 4C. Tool Call Block Removal

**What it is:** When context pressure is high, entire tool call message pairs (assistant tool_use + system tool_result) are removed and replaced with a compact listing.

**Format:**
```
<context-removed>
Omitted 2 tool call(s) to reduce context size:
b_cey0rj2g2vz0yajqn8xd: read_file({"path": "/agent/blocks/b_9430q490zcnejee3x40d/result", "start_line": 1, "end_line": 5})
b_2w4dmxat3v3gmr8hxzjp: read_file({"path": "/agent/blocks/b_9430q490zcnejee3x40d/result", "start_line": -5, "end_line": -1})
</context-removed>
```

**What's preserved per removed call:**
- ✅ blockId (for recovery)
- ✅ Tool name
- ✅ Abbreviated arguments

**What's NOT preserved:**
- ❌ The tool result
- ❌ Any assistant reasoning before/after the call

**Key difference from trigger pruning:** Tool call removals INCLUDE blockIds, making full recovery possible. Trigger pruning does NOT include blockIds.

### Independence of Layer 1 and Layer 2

These are completely independent systems:

| | Layer 1: Inline Truncation | Layer 2: Compaction |
|---|---|---|
| **When** | Persistence/assembly time | When conversation gets long |
| **What** | Chops large results to ~5KB HEAD | Summarizes old messages, prunes triggers, removes tool calls |
| **Reversible?** | No — marker is permanent | No — original messages replaced |
| **Block storage** | Unaffected — always stores full data | Unaffected — blocks persist |

- A large tool result gets truncated at Layer 1 regardless of compaction state
- Compaction removes/summarizes messages regardless of whether they contain truncated results
- A tool result can be BOTH inline-truncated (Layer 1) AND later have its entire message removed (Layer 2)
- Compaction does NOT "unshrink" previously truncated results

---

## 5. System State Reminders

### What It Is

The system periodically injects a `<system-reminder>` block into the agent's context. This is NOT compaction — it's a synthetic state injection that keeps the agent aware of its own configuration without requiring it to query for that information.

### Real Example (verbatim)

```xml
<system-reminder>
Current time: Mon, 9 Mar 2026 12:47 GMT+8
The user who owns this agent: Zheyi Lim <limzheyi1996@gmail.com>

Agent state summary:
- Current intelligence level: genius
- Active triggers: 3
- Open tasks: 0
- DB tables: 0

Active connections by connection Id:
- none

User has 2 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

### Field Breakdown

| Field | Example | Purpose |
|---|---|---|
| Current time | `Mon, 9 Mar 2026 12:47 GMT+8` | Agent has no clock — this is its only time source |
| Owner info | `Zheyi Lim <limzheyi1996@gmail.com>` | Identity of the account owner |
| Intelligence level | `genius` | Current model tier |
| Active triggers | `3` | Count only, not details |
| Open tasks | `0` | Count only |
| DB tables | `0` | Count only |
| Active connections | `none` / list of IDs | Connection IDs if any are activated |
| Inactive connections | `2 other inactive connections` | Count of unactivated connections |
| Contact methods | `1` | Count of verified contact methods |

### Injection Timing

System reminders appear to be injected **between messages** at intervals. They appear as system-role messages interspersed in the recent message window. The exact timing/frequency is not directly observable but they appear roughly every few messages or after gaps in conversation time.

---

## 6. Context Assembly Order

The agent's context window is assembled in this exact order:

```
Position 1: System Prompt
            ├── <your-personality>
            ├── <contacting-the-user>
            ├── <context-management>        ← recovery instructions
            ├── <filesystem>
            ├── <blocks>                    ← explains block storage
            ├── <skills>
            ├── <tasks>
            ├── <web-browsing-and-search>
            ├── <sql-db>
            ├── <subagents>
            ├── <sandbox>
            ├── <external-connections>
            ├── <triggers>
            ├── <when-to-notify>
            ├── <working-via-your-task-list>
            ├── <preview-panel-and-instant-apps>
            ├── <pdf-generation>
            └── <output-guidance>

Position 2: "Previous conversation summary:" (if compaction has occurred)
            ├── ## User Instructions
            ├── ## Workflow
            ├── ## Resources
            └── ## Current Focus

Position 3: <context-removed> trigger pruning block (if triggers were pruned)

Position 4: <context-removed> tool call removal blocks (if calls were removed)

Position 5: Recent messages (verbatim, oldest → newest)
            ├── User messages
            ├── Assistant messages (with tool calls)
            ├── Tool results (with blockId breadcrumbs, possibly inline-truncated)
            └── <system-reminder> blocks (injected periodically within the message stream)

Position 6: Current user message (the latest input)
```

**Important ordering details:**
- The summary is always at the TOP of the conversation, before any messages
- Pruned trigger events and removed tool calls appear between the summary and recent messages
- System reminders are inline within the message stream, not at a fixed position
- The system prompt is always present and never compacted

---

## 7. The `<context-removed>` Tag — Three Distinct Formats

The same XML tag is used for three mechanically different operations. Implementations must handle all three:

### Format A: Inline Result Truncation (Layer 1)

**Trigger:** Tool result exceeds ~5KB size threshold.
**Location:** Inline within a tool result message, after the truncated content.
**Reversibility:** Full data in block storage. Agent has blockId from breadcrumb on same message.

```
<context-removed>Data truncated 92kB → 5kB</context-removed>
```

Real example — a 92KB `run_command` result:
```json
{
  "log": "LINE_0000: This is test data row 0 with padding to make it larger. Category=0 Score=0.0000 Status=active Region=APAC...\nLINE_0001: ...\n[...first ~5KB of content...]",
  "exitCode": 0
}

<context-removed>Data truncated 92kB → 5kB</context-removed>

blockId: b_9430q490zcnejee3x40d
```

### Format B: Full Tool Call Removal (Layer 2)

**Trigger:** Context compaction decides to remove older tool call messages.
**Location:** Replaces the removed messages as a standalone user-role message.
**Reversibility:** Full data in block storage. BlockIds are listed in the removal notice.

```
<context-removed>
Omitted 2 tool call(s) to reduce context size:
b_cey0rj2g2vz0yajqn8xd: read_file({"path": "/agent/blocks/b_9430q490zcnejee3x40d/result", "start_line": 1, "end_line": 5})
b_2w4dmxat3v3gmr8hxzjp: read_file({"path": "/agent/blocks/b_9430q490zcnejee3x40d/result", "start_line": -5, "end_line": -1})
</context-removed>
```

### Format C: Trigger Event Pruning (Layer 2, Specialized)

**Trigger:** Context compaction prunes old trigger invocations.
**Location:** Replaces the removed trigger messages as a standalone user-role message.
**Reversibility:** LIMITED — no blockIds listed. Title-only extraction. Agent cannot recover full trigger payloads or processing outcomes without external records.

```
<context-removed>
Omitted 34 trigger invocations & responses to reduce context size:
- New RSS item: Quoting Martin Fowler: Monitor Simon Willison Blog
- New RSS item: The A.I. Disruption We've Been Waiting for Has Arrived: Monitor Simon Willison Blog
- New RSS item: Typing without having to type: Monitor Simon Willison Blog
...and 24 more trigger events
</context-removed>
```

### Comparison Table

| Property | Format A (Truncation) | Format B (Call Removal) | Format C (Trigger Pruning) |
|---|---|---|---|
| Layer | 1 (persistence-time) | 2 (compaction-time) | 2 (compaction-time) |
| Mechanism | Fixed size threshold | Context budget pressure | Context budget pressure |
| What's removed | Tail of one result | Entire message pairs | Entire trigger+response pairs |
| BlockIds listed | Yes (breadcrumb) | Yes (in notice) | No |
| Full recovery possible | ✅ Yes | ✅ Yes | ❌ No (titles only) |
| LLM involved | No | No | No |
| Content preserved inline | First ~5KB (head) | Tool name + abbreviated args | Event title + source name |

---

## 8. Agent Recovery Instructions

The system prompt includes a `<context-management>` section that teaches the agent how to recover from context removal. This is critical — without it, the agent would not know that blocks exist or how to access them.

### Verbatim from Tasklet's System Prompt

```xml
<context-management>
To keep your context size manageable, some block data may be truncated
or removed. Context that has been truncated or removed will be marked
by a <context-removed> tag.
You MUST read the full untruncated data from the filesystem using the
read_file tool and the blockId for the block if you need the information
to complete your work.

Tool call block results always end with a blockId. If a tool call block
result has been truncated you will see a note like this:
<context-removed>Data truncated: 16KB -> 5KB</context-removed>

Sometimes entire sequences of tool call blocks may be removed. In this
case, you will see a user message with a context management note and a
list of removed blocks.
Each item in the list will begin with the blockId. Here's an example of
two removed tool call blocks:
<context-removed>
Omitted 2 tool call(s) to reduce context size:
b_123: tool_name(args: {...});
b_124: tool_name(args: {...});
</context-removed>

To read the full arguments and results for a tool call block,
use the blockId:
read_file(path: "/agent/blocks/b_123/args")
read_file(path: "/agent/blocks/b_123/result")
</context-management>
```

### What This Section Achieves

1. **Teaches the tag:** Agent knows `<context-removed>` means data was removed, not that it's missing
2. **Teaches both formats:** Shows examples of truncation (Format A) and removal (Format B)
3. **Teaches recovery paths:** Explicit `read_file` examples with the block path convention
4. **Uses MUST directive:** "You MUST read the full untruncated data" — strong instruction, not suggestion
5. **Explains breadcrumbs:** "Tool call block results always end with a blockId"

### What It Does NOT Cover

- ❌ Format C (trigger pruning) — no recovery instructions because no blockIds are provided
- ❌ The non-enumerability of blocks — doesn't tell the agent it can't list/discover blocks
- ❌ The `info` file — doesn't mention metadata is available
- ❌ Tool-level truncation in `read_file` — only covers context-level truncation

---

## 9. Tool-Level Truncation

### What It Is

Separate from all context management, the `read_file` tool itself truncates individual long lines when displaying file contents. This is a tool implementation detail, not a context management mechanism, but it affects the agent's ability to recover full data from block storage.

### Real Example

Reading the 94KB block file via `read_file`:

```
LINE_0010: This is test data row 10 with padding to make it larger.
  Category=0 Score=31.4159 Status=active Region=APAC Notes="Lorem ipsum
  dolor sit amet... [line truncated]
```

The `[line truncated]` marker is added by `read_file` when a single line exceeds its display limit. The actual file on disk is not modified.

### Workaround

The agent can use `run_command` with `cat`, `head`, `python`, etc. to read full file contents without line truncation:

```bash
cat /agent/blocks/b_9430q490zcnejee3x40d/result
# Returns full 94KB with no line truncation
```

Or with Python for structured processing:

```python
import json
with open('/agent/blocks/b_9430q490zcnejee3x40d/result') as f:
    data = json.load(f)
# Full result accessible programmatically
```

### Why This Matters

If the agent needs to recover a large tool result from block storage, using `read_file` might re-truncate it at the line level. The agent should use `run_command` for full fidelity recovery. The system prompt does NOT warn about this — it recommends `read_file` for block recovery, which works for most cases but silently truncates very long lines.

---

## 10. Design Trade-offs and Gaps

### Deliberate Trade-offs

| Trade-off | Decision | Rationale |
|---|---|---|
| HEAD truncation vs. intelligent summary | HEAD truncation | Zero LLM cost, simple, predictable. First 5KB is usually sufficient context. |
| Fixed threshold vs. adaptive budget | Fixed ~5KB threshold | Simple. Doesn't require tracking total context size at persistence time. |
| Block storage for ALL calls vs. size threshold | ALL calls | Uniform behavior. No edge cases around "was this result big enough to store?" |
| Non-enumerable blocks vs. browseable directory | Non-enumerable | Simpler implementation (key-value vs. filesystem listing). Agent doesn't need to discover blocks — it gets IDs from breadcrumbs. |
| Summary at top vs. inline | Summary at top | Clean separation. Agent always knows where to find the summary. |
| Trigger titles only vs. full payloads | Titles only | Minimal space. Triggers fire frequently — even titles add up. |

### Known Gaps

**1. Trigger event outcomes are not preserved.**
After pruning, the agent cannot determine whether it emailed, skipped, or errored on any trigger event. For workflows where trigger actions have real consequences (emails sent, records updated), this is a meaningful information loss. The agent would need to maintain its own state (SQL database, filesystem) to track processing history.

**2. No blockId recovery path for pruned triggers.**
Format C (trigger pruning) does not include blockIds. The agent literally cannot recover full trigger payloads or its own processing decisions for pruned events. This is the only case where block storage data becomes practically inaccessible.

**3. Summary quality depends on LLM.**
The 4-section structure is enforced, but the content quality varies. Critical details (file paths, configuration values) might not make it into the summary if the LLM doesn't judge them important enough. The `## Resources` section mitigates this for file paths, but there's no guarantee.

**4. No cross-session block persistence guarantee.**
Blocks from the current session are accessible. Whether blocks from previous sessions (before compaction) remain accessible indefinitely is not confirmed. Empirically, blocks from earlier in the same session (hours ago) are still readable.

**5. `read_file` recommended for recovery but has line truncation.**
The `<context-management>` instructions recommend `read_file` for block recovery, but `read_file` truncates long lines. For most tool results (JSON with reasonable line lengths) this is fine. For tool results with very long lines (e.g., minified JSON, base64 data), the agent would need to use `run_command` instead — but the system prompt doesn't teach this.

---

## Complete Mechanism Inventory

| # | Mechanism | Layer | Description |
|---|---|---|---|
| 1 | Block storage (full, all calls) | Persistence | Full args + result + info stored for every tool call |
| 2 | Inline HEAD truncation (~5KB) | Layer 1 | First ~5KB kept inline, rest chopped, marker appended. Results only — args are NOT truncated. |
| 3 | Structured LLM summary (4 sections) | Layer 2 | Synthesized summary replaces old conversation |
| 4 | Trigger event pruning | Layer 2 | Mechanical title extraction, no LLM, no blockIds |
| 5 | Full tool call removal | Layer 2 | Entire messages removed, blockIds listed for recovery |
| 6 | System state reminders | Assembly-time injection | `<system-reminder>` with agent state, injected periodically |
| 7 | `read_file` line-length cap | Tool-level | Long lines truncated with `[line truncated]` marker |
| 8 | `<context-management>` instructions | System prompt | Teaches agent about markers, breadcrumbs, and recovery paths |
| 9 | BlockId breadcrumbs | Convention | Every tool result ends with its blockId |

---

## Appendix A: Implementation Priority Guide

For a developer implementing equivalent context management:

### Must Have (Core)

1. **Block storage for all tool calls.** Store full args + result to `{blockId}/args` and `{blockId}/result`. Generate a unique blockId per call.
2. **BlockId breadcrumbs.** Append `blockId: {id}` to every tool result the agent sees.
3. **Inline HEAD truncation.** If result > threshold, keep first ~5KB inline, append `<context-removed>Data truncated {original} → {truncated}</context-removed>`.
4. **Structured conversation summary.** When context exceeds budget, LLM-summarize old messages into the 4-section format. Remove summarized messages.
5. **`<context-management>` in system prompt.** Teach the agent about `<context-removed>`, blockIds, and recovery paths. Include examples of all formats.

### Should Have (Robustness)

6. **Tool call removal with blockId listing.** When removing tool call messages, list their blockIds in the removal notice (Format B).
7. **Trigger event pruning.** For trigger-heavy workflows, mechanically extract titles instead of including full payloads. Consider including blockIds (Tasklet doesn't, but should).
8. **System state reminders.** Periodically inject agent state (time, active resources, counts) so the agent stays oriented without querying.

### Nice to Have (Polish)

9. **`info` metadata file per block.** Store `{toolName, startTime}` for debugging.
10. **Outcome tracking in trigger pruning.** Add `→ emailed` / `→ skipped` to pruned trigger titles. Tasklet doesn't do this — it's an improvement opportunity.
11. **Block persistence documentation.** Tell the agent in the system prompt that blocks can't be listed/discovered, only accessed by known ID.

---

## Appendix B: Sunder Action Items

Based on this reference, areas where Sunder's implementation should align or can improve:

### Already matching
- ✅ Block storage for all tool calls (args + result)
- ✅ ~5KB inline truncation threshold
- ✅ Two independent layers
- ✅ Structured 4-section compaction summary
- ✅ Mechanical trigger event pruning (separate from LLM summarizer)
- ✅ No block index needed
- ✅ No assembly-time "unshrink" logic

### Needs expansion
- ⚠️ `<context-management>` instructions need all three `<context-removed>` format variants
- ⚠️ Specify truncation strategy is HEAD (first N bytes), not summary
- ⚠️ Document that blocks are key-value only, not enumerable
- ⚠️ Add blockId/toolCallId breadcrumb to every tool result
- ⚠️ Note that only results are truncated — args stay full inline

### Decide for Sunder
- 🔵 System state reminders — for a CRM agent, injecting `active deals: 5, pending tasks: 3, last sync: 2h ago` could be extremely useful
- 🔵 `info` file per block (toolName, startTime) — useful for debugging, not critical for v1
- 🔵 `read_file` line-length cap — be aware of this when designing block recovery paths
- 🔵 Cross-session block persistence — confirm whether blocks survive across sessions or need explicit retention

### Improvement over Tasklet
- 💡 Add **outcomes to trigger pruning** (e.g., `→ emailed client` / `→ skipped, duplicate`). Tasklet just lists titles — the agent cannot reconstruct what actions it took on pruned trigger events without reading each individual block. For CRM where trigger actions have real consequences, this is a meaningful gap.
- 💡 Ensure `## Resources` in the summary captures file paths — this is how the agent recovers filesystem state knowledge after compaction
