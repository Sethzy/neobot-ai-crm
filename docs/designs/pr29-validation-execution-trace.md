# PR 29 Validation: Complete Execution Trace

**Date:** March 9, 2026
**Method:** Simulated RSS trigger fire → subagent execution → block storage inspection
**Test payload:** Fake Latent Space episode "Why Agents Need Memory — with Harrison Chase"

---

## 1. Trigger Event Delivery

When a trigger fires, the parent agent receives a `<system-message>` containing XML:

```xml
<system-message>
  <trigger-event>
    <trigger-name>rssFeed</trigger-name>
    <integration-id>system</integration-id>
    <trigger-title>Monitor Latent Space AI podcast</trigger-title>
    <event-title>New Latent Space episode/post detected. Process with podcast-monitor subagent and email summary if relevant.</event-title>
    <trigger-instance-id>rss_k3fq32f4zc6tp07gz9gs</trigger-instance-id>
    <payload>
    {
      "title": "Why Agents Need Memory — with Harrison Chase (LangChain)",
      "link": "https://www.latent.space/p/langchain-memory-agents",
      "pubDate": "2026-03-09T08:00:00Z",
      "description": "Harrison Chase joins to discuss...",
      "author": "Alessio & Swyx"
    }
    </payload>
  </trigger-event>
</system-message>
```

**Key observations:**
- `event-title` = the `invocationMessage` set during `setup_trigger`
- `trigger-title` = the human-readable trigger name
- Payload is raw JSON embedded in XML
- Trigger metadata (name, integration-id, instance-id) delivered alongside payload

---

## 2. Tool Schema: `run_subagent`

**Actual schema from system prompt:**

```
run_subagent(
  path: string,           // REQUIRED - path to .md file (e.g. "/agent/subagents/podcast-monitor.md")
  payload?: string,       // OPTIONAL - data appended after .md content in first user message
  action_pending: string,  // UI status while running
  action_finished: string, // UI status on success
  action_error: string     // UI status on failure
)
```

**What's passed:**
- `path` points to a markdown file in `/agent/subagents/`
- `payload` is a **string** — the parent is responsible for serializing data (e.g., `JSON.stringify(rssItem)`)
- The `action_*` params are UI chrome, not functional

**Returns:** Only the subagent's **final message** as a string.

---

## 3. Subagent System Prompt Composition

From the system prompt docs:

> "The subagent receives the content of the markdown file followed by any payload data you provide in the first user message."

**So the subagent's context is:**
1. **System prompt:** Same as parent (including all tool definitions) — confirmed by the subagent having access to `web_scrape_website`, `send_message`, `<thinking>` blocks, etc.
2. **First user message:** `[full markdown file content]\n[payload string]`

**The subagent does NOT receive:**
- Conversation history
- Previous tool call results
- The parent's system-message/trigger-event
- Any context about the parent session

This is **complete context isolation**.

---

## 4. Tool Access Control

### Tools the subagent CAN use (inherited from parent):
The subagent inherits **all** parent tools. Empirically confirmed it used:
- `web_scrape_website` (scraped the episode URL)
- `send_message` (emailed to 'owner')

### Tools the subagent CANNOT use (from system prompt):
> "Some of your tools cannot be used by subagents because they display UI to the user"

Blocked tools:
- Triggers (search, setup, manage)
- `rename_chat`
- Creating or activating connections
- `add_contact_method`
- Checking quota
- `suggest_intelligence_level_change`

**The blocking principle:** Any tool that requires displaying a UI card to the user is blocked for subagents, because subagent execution is invisible to the user.

---

## 5. What the Parent Sees (Context Isolation)

### In the parent's inline context:
```
<context-removed>5 blocks of subagent execution details truncated to save context</context-removed>
<final-result>
### Results
Emailed summary for: "Why Agents Need Memory — with Harrison Chase (LangChain)"

The episode page URL returned a 404...
</final-result>

blockId: b_8ewbgjr75cbrfyh3ftx6
```

**Critical:** The parent sees ONLY the final message. The "5 blocks" note tells us the subagent produced 5 intermediate steps (thinking + tool calls) that were all stripped from the parent's context. The parent gets:
1. A truncation notice
2. The `<final-result>` text
3. A blockId to recover full details if needed

---

## 6. Block Storage: Full Execution Trace

### Parent block: `b_8ewbgjr75cbrfyh3ftx6`

```
/agent/blocks/b_8ewbgjr75cbrfyh3ftx6/
├── args     → { path, payload, action_* }
├── result   → Full subagent execution trace (see below)
└── info     → { toolName: "run_subagent", startTime: "2026-03-09T08:25:04.488Z" }
```

### The `result` file contains the COMPLETE execution trace:

```
<thinking>:
This RSS item is about LangChain's memory architecture for long-running agents...
I should scrape the episode page for more details, then send a summary email.
</thinking>

<tool-use blockId="b_638qhc9dgybbxt61v315">
  <args>{"url": "https://www.latent.space/p/langchain-memory-agents"}</args>
  <result>
    {"markdown": "...page content..."}
    <context-removed>Data truncated: 14973 chars -> 1024 chars.</context-removed>
  </result>
</tool-use>

<thinking>:
The page returned "Page not found"... Let me proceed with what I have.
</thinking>

<agent>:
The page returned "Page not found"... Let me send the summary email.
</agent>

<tool-use blockId="b_cq07r0q212njprdjw19c">
  <args>{"to": ["owner"], "subject": "🎙️...", "body": "**Latent Space**..."}
    <context-removed>Data truncated: 1238 chars -> 512 chars.</context-removed>
  </args>
  <result>{"message": "Message sent", "messageId": "em_3z14b5cr3cg371156y5z"}</result>
</tool-use>

<agent>:
### Results
Emailed summary for: "Why Agents Need Memory — with Harrison Chase (LangChain)"
...
</agent>
```

### Key structural observations:

1. **Every subagent step** is recorded: thinking → tool call → thinking → agent message → tool call → final message
2. **Tool calls within the trace** are truncated but have their own blockIds
3. **The trace format uses XML-like tags**: `<thinking>:`, `<tool-use>`, `<agent>:`
4. **Truncation happens even within block storage** for the composite trace (14973→1024 chars for scrape result, 1238→512 for email body)

---

## 7. Block Hierarchy: Nested Full Recovery

Each tool call the subagent made gets its **own** independent block with full untruncated data:

### `b_638qhc9dgybbxt61v315` (web_scrape_website)
```
├── args   → { url: "https://www.latent.space/p/langchain-memory-agents" }
├── result → { markdown: "...FULL 14,973 char page scrape..." }  ← UNTRUNCATED
└── info   → { toolName: "web_scrape_website", startTime: "2026-03-09T08:25:11.742Z" }
```

### `b_cq07r0q212njprdjw19c` (send_message)
```
├── args   → { to: ["owner"], subject: "🎙️...", body: "...FULL email body..." }  ← UNTRUNCATED
├── result → { message: "Message sent", messageId: "em_..." }
└── info   → { toolName: "send_message", startTime: "2026-03-09T08:25:21.996Z" }
```

**This confirms the "never mutate stored data" principle:** The parent's trace file truncates large values for its own storage budget, but each individual tool call's block is stored in full. Recovery is always possible via the blockId reference.

---

## 8. Error Handling

**Observed behavior:**
1. Subagent tried to scrape `https://www.latent.space/p/langchain-memory-agents` → got "Page not found" (404)
2. Subagent recognized the error in its `<thinking>` block
3. Fell back to RSS data per its instructions ("If you can't scrape the episode page, still send the email using whatever info is available")
4. Sent email successfully using RSS data
5. Reported what happened in final message

**There is no crash propagation.** The subagent handled the error internally and reported results. The parent received a clean final message.

If the subagent had completely failed (e.g., threw an unrecoverable error), the `action_error` status text would have been shown in the UI.

---

## 9. Instruction File Anatomy

The actual file (`/agent/subagents/podcast-monitor.md`, 55 lines):

```markdown
# Podcast Episode Monitor

Processes new podcast/newsletter RSS items and emails a concise summary to the user.

## Instructions

[detailed step-by-step instructions]

## Email Format

[template with markdown format]

## Error Handling

[fallback behavior instructions]
```

**Structure:** Pure markdown, no frontmatter, no metadata, no special annotations.

**Required sections:**
- `# Title` — what it does
- Description paragraph — one-liner
- `## Instructions` — the actual logic
- Additional `##` sections as needed (format templates, error handling, etc.)

**Not required:** No schema definitions, no tool declarations, no config blocks. The subagent discovers available tools from the inherited system prompt.

---

## 10. Timing

From the `info` files:

| Step | Timestamp | Delta |
|------|-----------|-------|
| `run_subagent` start | 08:25:04.488Z | — |
| `web_scrape_website` | 08:25:11.742Z | +7.2s |
| `send_message` | 08:25:21.996Z | +10.3s |

Total subagent execution: ~17.5 seconds (including model inference + scraping + email send).

---

## 11. Summary: What PR 29 Must Match

| Dimension | Tasklet Actual Behavior |
|-----------|------------------------|
| **Invocation** | `run_subagent(path, payload?)` — path to .md, payload as string |
| **Prompt composition** | .md file content + payload → first user message; parent system prompt inherited |
| **Tool inheritance** | All parent tools EXCEPT UI-displaying tools |
| **Context isolation** | Complete — no conversation history, no parent context |
| **Return value** | Final message only (string) |
| **Parent visibility** | Final message inline + blockId; intermediate steps hidden |
| **Block storage** | Full execution trace in parent block; each tool call also stored independently |
| **Truncation within trace** | Large values truncated in composite trace; individual blocks are full |
| **Error model** | Subagent handles errors internally; reports via final message |
| **Instruction format** | Pure markdown, no metadata required |
| **Subagent statefulness** | None — single request-response cycle, no memory across runs |
| **Shared state** | Via filesystem (`/agent/home/`) and SQL database — subagent has full access |
| **UI tools blocked** | triggers, connections, contacts, chat rename, intelligence change |
