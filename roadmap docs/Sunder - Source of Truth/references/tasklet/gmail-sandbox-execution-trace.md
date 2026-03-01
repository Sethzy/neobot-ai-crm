# Gmail → Sandbox Execution Trace: Engineering Deep Dive

> **Related traces:**
> - `csv-lead-cleaning-sandbox-workflow.md` — Sandbox-only trace (no external APIs, pure data processing)
> - `tools-skills-subagents.md` — Conceptual overview of the 3 primitives
> - `skills-deep-dive-connection-generation-trace.md` — How skills are auto-generated and injected
>
> **What makes this trace different:** It chains a **connection tool** (Gmail API via OAuth) into a **sandbox execution** (Python data analysis), showing how data crosses from external API → platform → cloud storage → FUSE → sandbox → back out. The CSV cleaning trace only showed sandbox ↔ cloud storage. This one adds the external API layer.

---

## What We're Tracing

User asked: "find my emails from the past week and analyze the senders."

This required four tool calls across two different execution environments. This trace walks through every state transition, every boundary crossing, and every piece of data movement.

---

## Pre-Execution State

Before anything happens, here's what exists:

```
PLATFORM STATE
├── User account: Seth Lim <sethlimzy@gmail.com>
├── Connection: conn_7ydrcj6nwqbr8sd2zbrs (Gmail, OAuth token stored)
│   ├── Activated tools: gmail_search_threads, gmail_send_message
│   └── Deactivated tools: 14 others (drafts, labels, forwarding, etc.)
├── Active triggers: 0
├── Open tasks: 0
├── DB tables: 0
└── Contact methods: 1 (owner email)

CLOUD STORAGE (persistent)
├── /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md  (generated for Gmail — API has quirks; not all connections get skill files)
├── /agent/subagents/weekly-unreplied-emails.md  (from previous session)
├── /agent/home/calendly-briefing-execution-trace.md
├── /agent/home/csv-cleaning-execution-trace.md
├── /agent/home/tools-skills-subagents-mental-model.md
└── /agent/home/recurring-subagent-cron-trace.md

SANDBOX: Does not exist yet. Nothing is running.

LLM CONTEXT: Empty. About to be assembled.
```

---

## Phase 0: Context Assembly (Platform, before LLM sees anything)

The platform builds the full prompt. This happens on the **platform server**, not in any sandbox, not in any LLM.

### 0.1 — System prompt loaded

The platform loads the permanent system prompt from its configuration. This is the ~4,000 token block containing:
- Personality instructions
- Tool usage rules
- Filesystem layout
- Skills directory instructions ("you MUST read skill files when relevant")
- Subagent instructions
- Sandbox instructions
- Connection instructions ("you MUST read skill files before using connection tools")
- Output formatting rules

**This is static.** Same for every turn. It's a template the platform loads from config.

### 0.2 — System-reminder assembled

The platform queries its own state and builds this block dynamically:

```
Current time: Tue, 24 Feb 2026 11:15 GMT+8        ← server clock
The user who owns this agent: Seth Lim             ← account record lookup
  <sethlimzy@gmail.com>

Agent state summary:
- Active triggers: 0                               ← SELECT COUNT(*) FROM triggers
- Open tasks: 0                                    ← SELECT COUNT(*) FROM tasks
- DB tables: 0                                     ← query information_schema

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs:                      ← connections table lookup
  2 of 16 tools activated.                         ← count activated vs total
  You MUST read this skill file before using        ← hardcoded template string
  the tools for this connection:
  /agent/skills/connections/conn_.../SKILL.md       ← path from connection record

User has 0 other inactive connections               ← count inactive connections
Number of configured contact methods: 1             ← count contact methods
```

**Each line is a database query or config lookup.** The platform doesn't use an LLM for this. It's a template with dynamic values.

### 0.3 — Tool definitions loaded

The platform looks at what tools are available:
- Built-in tools: `read_file`, `write_file`, `run_command`, `web_search`, `send_message`, etc.
- Activated connection tools: `conn_7ydrcj6nwqbr8sd2zbrs__gmail_search_threads`, `conn_7ydrcj6nwqbr8sd2zbrs__gmail_send_message`

Each tool gets a JSON schema definition injected into the prompt:

```json
{
  "name": "conn_7ydrcj6nwqbr8sd2zbrs__gmail_search_threads",
  "description": "Search Gmail threads using Gmail search syntax...",
  "parameters": {
    "query": { "type": "string", "description": "Gmail search query..." },
    "readMask": { "type": "array", "description": "Array of fields to include..." },
    "maxResults": { "type": "number", "max": 100 }
  }
}
```

**This is where the tool name prefix comes from.** The platform prepends `conn_7ydrcj6nwqbr8sd2zbrs__` to every Gmail tool name so the LLM and the platform both know which connection's credentials to use when the tool is called.

The 14 deactivated Gmail tools are NOT included. The LLM cannot call what it cannot see.

### 0.4 — Conversation history loaded

All previous messages in this chat session.

### 0.5 — User's new message appended

```
"find my emails from the past week and analyze the senders"
```

### Final assembled prompt

```
┌──────────────────────────────────────────────────┐
│ SYSTEM PROMPT (~4,000 tokens)                    │  ← static template
│ + SYSTEM REMINDER (~200 tokens)                  │  ← dynamically assembled
│ + TOOL DEFINITIONS (~800 tokens for 2 Gmail      │  ← based on activated tools
│   tools + ~2,000 tokens for built-in tools)      │
│ + CONVERSATION HISTORY (variable)                │  ← prior turns
│ + USER MESSAGE                                   │  ← current request
└───────────────────────┬──────────────────────────┘
                        │
                        ▼
                LLM inference begins
```

---

## Phase 1: Tool Call #1 — read_file (Skill File)

### 1.1 — LLM reasoning

The LLM sees the user wants email analysis. It knows it'll need Gmail tools. The system-reminder says:

> "You MUST read this skill file before using the tools for this connection"

So before touching Gmail, it must read the skill file.

### 1.2 — LLM generates tool call

```json
{
  "tool": "read_file",
  "arguments": {
    "path": "/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md"
  }
}
```

Text generation **stops here**. The LLM yields control to the platform.

### 1.3 — Platform executes read_file

```
EXECUTION ENVIRONMENT: Platform server (NOT a sandbox)

The platform:
1. Receives the tool call from the LLM output
2. Sees tool name: "read_file" → this is a platform tool
3. Parses the path
4. Platform has direct access to storage via API
5. Returns file contents as a string
```

**Boundary crossing:** LLM → Platform → Cloud Storage → Platform → LLM

```
Result returned to LLM context:
"<read-mask-instructions>
  Use the readMask parameter to control what information is returned...
  - Email metadata analysis: Default [date, participants, subject, bodySnippet] is sufficient
  ...
</read-mask-instructions>
<labels>
  Gmail labels have two identifiers: a user-facing name and a fixed Label ID...
  - gmail_search_threads: use label names in search queries
  - All other tools: use label IDs
</labels>
<link-instructions>
  You can use 'https://mail.google.com/mail/u/...' to give the user a link...
</link-instructions>"
```

### 1.4 — LLM context after this step

```
[everything from Phase 0]
+ Tool call: read_file(path=".../SKILL.md")
+ Tool result: "<read-mask-instructions>..."      ← ~300 tokens added

Total new context cost: ~300 tokens
```

The skill content is now in context. The LLM has "read the manual" and now knows:
- Use minimal readMask for metadata analysis
- Use label names (not IDs) in search queries
- How to construct Gmail links

---

## Phase 2: Tool Call #2 — gmail_search_threads

### 2.1 — LLM reasoning

The LLM generates the Gmail search. The skill file told it:
- "Email metadata analysis: Default readMask is sufficient"
- So it uses: `["date", "participants", "subject", "bodySnippet"]`

### 2.2 — LLM generates tool call

```json
{
  "tool": "conn_7ydrcj6nwqbr8sd2zbrs__gmail_search_threads",
  "arguments": {
    "query": "newer_than:7d",
    "readMask": ["date", "participants", "subject", "bodySnippet"],
    "maxResults": 50
  }
}
```

LLM stops. Yields to platform.

### 2.3 — Platform routes the tool call

```
EXECUTION ENVIRONMENT: Platform server (NOT a sandbox)

The platform:
1. Receives tool call
2. Parses tool name: "conn_7ydrcj6nwqbr8sd2zbrs__gmail_search_threads"
   ├── Connection ID: conn_7ydrcj6nwqbr8sd2zbrs
   └── Tool name: gmail_search_threads
3. Looks up connection record → retrieves stored Google OAuth token
4. Checks: is "gmail_search_threads" in the activated tools list? → YES
5. Constructs Gmail API request:
   - Endpoint: https://gmail.googleapis.com/gmail/v1/users/me/threads
   - Authorization: Bearer {stored_oauth_token}
   - Query parameters: q=newer_than:7d, maxResults=50
6. Makes HTTP request to Google's servers
7. Receives response: array of thread objects
8. Applies readMask filter: only returns date, participants, subject, bodySnippet
9. Formats result as JSON
10. Returns to LLM context
```

**Boundary crossings:** LLM → Platform → Google API → Platform → LLM

```
What the LLM NEVER sees:
- The OAuth token (platform keeps this secret)
- The raw Google API response format (platform normalizes it)
- The HTTP headers, status codes, pagination internals

What the LLM receives:
{
  "numThreads": 32,
  "nextPageToken": "08798652492695757707",
  "threads": [
    {
      "threadId": "19c8db7e5a871475",
      "messages": [
        {
          "messageId": "19c8db7e5a871475",
          "from": "LinkedIn Editors <editors-noreply@linkedin.com>",
          "to": ["sethlimzy@gmail.com"],
          "subject": "Seth, your take on...",
          "bodySnippet": "LinkedIn Messaging icon...",
          "date": "Tue, 24 Feb 2026 03:36:02 +0000 (UTC)"
        }
      ]
    },
    ... 31 more threads
  ]
}
```

### 2.4 — Platform saves full result to filesystem

The result is large (~20KB). The platform does two things:
1. **Injects a truncated version into LLM context** (~5KB) to save tokens
2. **Saves the full untruncated result to disk** at `/agent/toolcalls/b_19bq85aq309a3a33kv1r/result`

This is critical for what comes next. The LLM sees a preview. The full data is on disk.

### 2.5 — LLM context after this step

```
[everything from before]
+ Tool call: gmail_search_threads(query="newer_than:7d", ...)
+ Tool result: { truncated to ~5KB, 32 threads partially shown }
+ Note: "Data truncated 21kB → 5kB. Full data at /agent/toolcalls/b_.../result"

Total new context cost: ~1,500 tokens (truncated)
```

---

## Phase 3: Tool Call #3 — run_command (SANDBOX SPINS UP)

### 3.1 — LLM reasoning

The LLM needs to:
- Parse 32 email threads
- Extract sender information
- Count frequencies
- Generate a chart

It CANNOT do this by "thinking." It needs to run actual code. This means `run_command`.

It knows the full data is at `/agent/toolcalls/b_19bq85aq309a3a33kv1r/result` (the platform told it when it truncated the context). It writes Python that reads from that path.

### 3.2 — LLM generates tool call

```json
{
  "tool": "run_command",
  "arguments": {
    "command": "uv run --with pandas,matplotlib python3 << 'PYEOF'\nimport json\nimport pandas as pd\n...\nPYEOF",
    "timeout": 60
  }
}
```

LLM stops. Yields to platform. **This is where things get interesting.**

### 3.3 — Platform provisions a sandbox

```
SANDBOX PROVISIONING (Platform server-side)

The platform:
1. Receives tool call for "run_command"
2. This is not an HTTP API call — this requires an operating system
3. Platform provisions a new sandbox:
   a. Alpine Linux container/microVM
   b. Mounts FUSE filesystem:
      - /agent/home/         → Cloud Storage (read-write)
      - /agent/uploads/      → Cloud Storage (read-only)
      - /agent/toolcalls/    → Cloud Storage (read-only)
      - /agent/skills/       → Cloud Storage (read-only)
      - /agent/subagents/    → Cloud Storage (read-only)
   c. Sandbox has: Python 3.12, uv, ffmpeg, curl, jq, etc. (pre-installed)
   d. Sandbox has: network access (for package downloads)
   e. Sandbox does NOT have: the OAuth token, the LLM context, any memory
```

### 3.4 — Command execution inside the sandbox

Here's the exact sequence of operations inside the sandbox:

```
SANDBOX TIMELINE (wall clock: ~20 seconds total)

T+0.0s  Shell starts, interprets the heredoc
T+0.1s  `uv run --with pandas,matplotlib python3` begins
T+0.2s  uv resolves dependencies:
          pandas → needs numpy
          matplotlib → needs numpy, pillow, kiwisolver, fonttools, contourpy
          Total: 12 packages, ~53MB
T+0.5s  uv downloads packages from PyPI over the network
          ├── numpy (17.5MB)
          ├── pandas (11.4MB)
          ├── matplotlib (9.2MB)
          ├── pillow (6.8MB)
          ├── fonttools (4.9MB)
          ├── kiwisolver (2.2MB)
          ├── contourpy (1.3MB)
          └── 5 other small packages
T+8.0s  All packages downloaded and installed in a virtual environment
T+8.1s  Python interpreter starts, begins executing the script
```

### 3.5 — File operations inside the sandbox (FUSE in action)

```
T+8.2s  FUSE READ #1: Python opens '/agent/toolcalls/b_19bq85aq309a3a33kv1r/result'
        ├── Python calls: open('/agent/toolcalls/b_.../result', 'r')
        ├── OS sees path is under /agent/ → routes to FUSE driver
        ├── FUSE driver sends HTTP request to cloud storage API
        ├── Cloud storage returns the file content (~21KB of JSON)
        ├── FUSE driver returns bytes to the OS
        ├── OS returns bytes to Python
        └── Latency: ~10-50ms (network round-trip to cloud storage)

        Compare to local disk: ~0.1ms. This is 100-500x slower.
        For a single 21KB file, nobody notices. For thousands of
        small files, this would be painful.

T+8.3s  json.loads(raw) → Python parses JSON into dict
        data['threads'] → list of 32 thread objects
        This is pure CPU work. No FUSE involved.

T+8.4s  Loop through threads, extract sender info with regex
        Pure CPU work. No I/O. No FUSE.
        Result: pandas DataFrame with 32 rows, 5 columns

T+8.5s  FUSE WRITE #1: df.to_csv('/agent/home/gmail-week-data.csv')
        ├── Python calls: open('/agent/home/gmail-week-data.csv', 'w')
        ├── OS routes to FUSE driver
        ├── Python writes CSV data through the file handle
        ├── FUSE driver buffers writes
        ├── On file close: FUSE driver uploads to cloud storage
        ├── Cloud storage confirms write
        └── File now exists in persistent cloud storage

T+8.8s  df.value_counts().head(10) → pandas counts senders
        Pure CPU. No I/O.

T+9.0s  matplotlib creates figure, renders bar chart
        Pure CPU + memory. No I/O.

T+9.5s  FUSE WRITE #2: fig.savefig('/agent/home/gmail-sender-chart.png')
        ├── Same FUSE flow as the CSV write
        ├── matplotlib renders PNG to bytes
        ├── Bytes written through FUSE → cloud storage
        ├── PNG now exists in persistent cloud storage
        └── ~150KB file

T+9.6s  print() statements → write to stdout (captured by platform)
        "Total emails: 32"
        "Unique senders: 15"
        "Top senders: ..."
        This goes to stdout, NOT to FUSE. The platform captures stdout.
```

### 3.6 — Sandbox teardown

```
T+10.0s Script exits with code 0
        Platform captures:
        ├── stdout: the print() output
        ├── stderr: uv download logs
        └── exit code: 0

T+10.1s SANDBOX IS DESTROYED
        ├── The Alpine Linux container/microVM is terminated
        ├── The virtual environment with pandas/matplotlib is gone
        ├── /tmp/ contents are gone
        ├── Everything in memory is gone
        │
        └── What SURVIVES (in cloud storage, via FUSE writes):
            ├── /agent/home/gmail-week-data.csv
            └── /agent/home/gmail-sender-chart.png
```

### 3.7 — Platform returns result to LLM

```
Platform assembles the tool result:
{
  "log": "Total emails: 32\nUnique senders: 15\n\nTop senders:\n  Julian Goldie via LinkedIn: 16\n  ...\n\nCSV saved to: /agent/home/gmail-week-data.csv\nChart saved to: /agent/home/gmail-sender-chart.png\nDownloading pandas (11.4MiB)\n...\nInstalled 12 packages in 20ms\n",
  "exitCode": 0
}
```

**Note:** stdout and stderr are interleaved in the log. The download messages appear at the bottom even though they happened first — this is just how uv buffers its output.

### 3.8 — LLM context after this step

```
[everything from before]
+ Tool call: run_command(command="uv run --with pandas,matplotlib ...")
+ Tool result: { log: "Total emails: 32...", exitCode: 0 }

Total new context cost: ~400 tokens (just the stdout output)
```

The LLM does NOT see:
- The 53MB of downloaded packages
- The pandas DataFrames in memory
- The matplotlib rendering internals
- The FUSE read/write operations
- The CSV or PNG file contents

It only sees the print() output. The heavy work happened in a separate process in a separate machine.

---

## Phase 4: Tool Call #4 — show_user_preview

### 4.1 — LLM reasoning

There's a chart at `/agent/home/gmail-sender-chart.png`. It should show it to the user.

### 4.2 — LLM generates tool call

```json
{
  "tool": "show_user_preview",
  "arguments": {
    "kind": "file",
    "filepath": "/agent/home/gmail-sender-chart.png",
    "title": "Gmail Sender Analysis — Built in Sandbox"
  }
}
```

### 4.3 — Platform executes

```
EXECUTION ENVIRONMENT: Platform server + user's browser

1. Platform receives show_user_preview call
2. Reads /agent/home/gmail-sender-chart.png from cloud storage (direct API, no sandbox)
3. Generates a URL or streams the file to the user's browser
4. User's browser renders the preview panel on the right side of their screen
5. Returns confirmation to LLM
```

**Boundary crossings:** LLM → Platform → Cloud Storage → Platform → User's Browser

No sandbox involved. The PNG already exists in cloud storage (put there by the sandbox in Phase 3). The platform just serves it.

---

## Complete Data Flow Diagram

```
USER'S BROWSER                    PLATFORM SERVER                     CLOUD STORAGE
                                                                     (persistent)
     │                                  │                                 │
     │  "analyze my emails"             │                                 │
     ├─────────────────────────────────>│                                 │
     │                                  │                                 │
     │                          ┌───────┴───────┐                        │
     │                          │ Assemble prompt│                        │
     │                          │ + sys-reminder │                        │
     │                          └───────┬───────┘                        │
     │                                  │                                 │
     │                          ┌───────┴───────┐                        │
     │                          │   LLM CALL    │                        │
     │                          │               │    read skill file      │
     │                          │  Tool call 1  ├───────────────────────>│
     │                          │  read_file    │<───────────────────────┤
     │                          │               │    returns SKILL.md    │
     │                          │               │                        │
     │                          │  Tool call 2  │    Gmail API call       │
     │                          │  gmail_search ├──────> Google ─────────>│
     │                          │               │<──────────────────────<┤
     │                          │               │    saves full result    │
     │                          │               ├───────────────────────>│
     │                          │               │   /agent/toolcalls/... │
     │                          │               │                        │
     │                          │  Tool call 3  │                        │
     │                          │  run_command  │                        │
     │                          └───────┬───────┘                        │
     │                                  │                                 │
     │                          ┌───────┴───────┐                        │
     │                          │ SANDBOX BOOTS │                        │
     │                          │               │   FUSE read: 21KB JSON │
     │                          │  Python reads ├───────────────────────>│
     │                          │  toolcall data│<───────────────────────┤
     │                          │               │                        │
     │                          │  Python writes│   FUSE write: CSV      │
     │                          │  CSV file     ├───────────────────────>│
     │                          │               │                        │
     │                          │  Python writes│   FUSE write: PNG      │
     │                          │  PNG chart    ├───────────────────────>│
     │                          │               │                        │
     │                          │  stdout ──────┤                        │
     │                          │ SANDBOX DIES  │                        │
     │                          └───────┬───────┘                        │
     │                                  │                                 │
     │                          ┌───────┴───────┐                        │
     │                          │ LLM RESUMES   │                        │
     │                          │               │                        │
     │                          │  Tool call 4  │   read PNG from storage│
     │                          │  show_preview ├───────────────────────>│
     │  preview panel opens     │               │<───────────────────────┤
     │<─────────────────────────┤               │                        │
     │  (chart displayed)       │               │                        │
     │                          │  Final text   │                        │
     │<─────────────────────────┤  response     │                        │
     │                          └───────────────┘                        │
     │                                                                    │
     │                          Files persist ────────────────────────────┤
```

---

## What Exists After Everything Completes

```
STILL EXISTS:
├── /agent/home/gmail-sender-chart.png        (in cloud storage, written by sandbox via FUSE)
├── /agent/home/gmail-week-data.csv           (in cloud storage, written by sandbox via FUSE)
├── /agent/toolcalls/b_.../result             (in cloud storage, written by platform)
├── Gmail connection + OAuth token            (in platform database)
├── Skill file                                (in cloud storage)
└── Conversation history                      (in platform database, for this chat session)

GONE:
├── LLM context                               (inference complete, memory freed)
├── Sandbox container                          (terminated)
├── FUSE mount                                 (disconnected with sandbox)
├── pandas, matplotlib, numpy                  (installed in sandbox, gone with it)
└── All intermediate variables                 (DataFrame, figure object, regex matches)
```

---

## Execution Cost Breakdown

| Phase | Tokens consumed | Time | Compute |
|---|---|---|---|
| Phase 0: Prompt assembly | 0 (platform work) | ~50ms | Platform CPU |
| Phase 1: read_file (skill) | ~300 tokens added to context | ~100ms | Cloud Storage read |
| Phase 2: gmail_search | ~1,500 tokens (truncated) | ~800ms | Google API + network |
| Phase 3: run_command | ~400 tokens (stdout only) | ~20s | Sandbox VM + PyPI downloads + Python |
| Phase 4: show_preview | ~50 tokens (confirmation) | ~200ms | Cloud Storage read + browser render |
| **Total** | **~2,250 tokens of context growth** | **~22s** | **Most time: package downloads** |

The sandbox (Phase 3) consumed 90% of the wall-clock time but only 18% of the token budget. The LLM's context barely grew because all the heavy data processing happened outside the LLM, inside the sandbox.

---

## Contrast with the CSV Cleaning Trace

| Aspect | CSV Cleaning | Gmail → Sandbox (this trace) |
|---|---|---|
| External API involved? | No — data was already uploaded | Yes — Gmail API via OAuth |
| How data enters sandbox | FUSE read from `/agent/uploads/` | FUSE read from `/agent/toolcalls/` (platform saved API result to disk) |
| Skill file read? | No — no connection tools used | Yes — Gmail skill read before API call |
| Platform truncation? | No — CSV was read with `read_file` directly | Yes — 21KB Gmail result truncated to 5KB, full saved to disk |
| Sandbox output | CSV file (via FUSE write) | CSV + PNG chart (via FUSE writes) |
| Key pattern shown | Pure sandbox execution | **Connection tool → platform saves to disk → sandbox reads from disk** (data handoff between environments) |

---

## For Your Sunder Architecture

The equivalent execution path:

| Tasklet Phase | Sunder Equivalent |
|---|---|
| Phase 0: System-reminder assembly | Your Vercel backend builds context string from Supabase queries |
| Phase 1: read_file (skill) | Fetch instruction doc from Supabase Storage, inject into context |
| Phase 2: gmail_search_threads | LLM generates tool call → your backend routes to Composio → Composio uses stored OAuth → returns results |
| Phase 3: run_command (sandbox) | LLM generates "execute code" tool call → your backend sends code to Vercel Sandbox SDK → sandbox runs Python → downloads from Supabase Storage, processes, uploads back → returns stdout |
| Phase 4: show_user_preview | Your frontend reads the PNG URL from Supabase Storage and renders it |

**The critical difference at Phase 3:**
- Tasklet uses FUSE so the sandbox sees cloud files as local paths (`/agent/home/file.csv`)
- Sunder would use explicit download/upload: `supabase.storage.download('file.csv')` → process → `supabase.storage.upload('result.png')`
- Same outcome. Sunder's approach is simpler per-file (direct HTTP vs FUSE overhead) but requires more boilerplate in every script.
