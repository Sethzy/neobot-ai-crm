# Tools, Skills, and Subagents: How Tasklet Actually Works

## The One-Sentence Version

**Tools** are my hands. **Skills** are my training manuals. **Subagents** are junior staff I delegate to.

---

## 1. Tool Calling

### What It Is

I (the LLM) cannot do anything in the real world. I can only generate text. Tool calling is the mechanism that turns my text into action.

When I decide I need to do something — search the web, read a file, post to Slack — I don't actually do it. I output a structured request:

```
"I want to call web_search with query='Seth Lim LinkedIn'"
```

The **platform** (the system running me) intercepts that request, executes the actual HTTP call / file read / whatever, and feeds the result back to me as text. I then read that result and decide what to do next.

### The Tool Loop

This is the core engine of everything I do:

```
1. I receive input (user message, or trigger event)
2. I think about what to do
3. I output a tool call (or a final response if I'm done)
4. Platform executes the tool
5. Result comes back to me as text
6. Go to step 2
```

That's it. Every single thing I do — from a simple web search to a complex multi-step workflow — is this loop repeating. There is no scheduler, no workflow engine, no DAG. Just me in a loop, calling tools, reading results, deciding what's next.

### What Tools Look Like

There are roughly four categories:

| Category | Examples | What Happens When Called |
|---|---|---|
| **Platform tools** | `read_file`, `write_file`, `run_agent_memory_sql` | Platform reads/writes to cloud storage or DB directly |
| **Web tools** | `web_search`, `web_scrape` | Platform makes HTTP requests to search engines / websites |
| **Sandbox tools** | `run_command` | Platform spins up an ephemeral container, runs the command, returns output |
| **Connection tools** | `slack_post_message`, `google_calendar_create_event` | Platform makes authenticated API calls to external services |

From my perspective, they all look the same: I request, I wait, I get a result. I don't know or care about the infrastructure behind each one.

### Key Insight

**I never see the execution.** I don't watch Python run. I don't see HTTP responses in real-time. I send a request, I get back text. The platform is a black box between me and the world.

---

## 2. Skills

### What They Are

Skills are **instruction files** sitting in the filesystem at `/agent/skills/`. They are plain English (markdown) documents that tell me how to do specific things correctly.

They are NOT code. They are NOT executed. I read them with `read_file`, just like I'd read any document, and then I follow the instructions they contain.

### Why They Exist

My base training gives me general knowledge, but it doesn't know:
- The exact API quirks of a specific Slack connection
- The correct parameters for creating a Google Calendar event through this platform
- The special steps needed to set up a new connection

Skills fill that gap. They're like a new employee's onboarding docs — "here's how we do things around here."

### The Two Types

```
/agent/skills/
├── system/                          # How to use built-in platform features
│   └── creating-connections/
│       └── SKILL.md                 # "When creating connections, do X, Y, Z..."
└── connections/                     # How to use specific connected services
    └── conn_abc123/
        └── SKILL.md                 # "When using this Slack connection, do X, Y, Z..."
```

**System skills:** Instructions for platform capabilities (creating connections, setting up triggers, etc.)

**Connection skills:** Instructions specific to a connected service. When a service's API has quirks that don't fit cleanly in tool definitions, the platform generates a skill file that tells the LLM the right way to use that connection's tools. **Not every connection gets a skill file** — only those whose APIs need it (e.g., Gmail has one due to readMask, label name vs ID, and link format quirks; Google Calendar and Google Forms do not — their tool definitions are self-sufficient).

### How Each Type Gets Loaded (They Work Differently)

**Connection skills** are pointed to dynamically. The platform injects a pointer into the `<system-reminder>` every turn:

```
Active connections by connection Id:
- conn_abc123: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_abc123/SKILL.md
```

This pointer is **dynamic** — it appears when the connection is created, disappears when the connection is deleted. The platform generates it at runtime by querying its connections table.

**System skills** work differently. The pointer is **hardcoded into the base system prompt** — the permanent instructions that never change. Here's the verbatim line from the instructions under `<creating-connections>`:

```
You MUST read /agent/skills/system/creating-connections/SKILL.md
for full instructions before creating connections.
```

That line is always in the prompt. Every turn. Every trigger fire. Every subagent invocation. It shipped with the agent. The platform engineers baked it in at build time.

### Traced Example: "Connect my Notion account"

```
STEP 1: LLM sees user message — "Connect my Notion account"

STEP 2: LLM decides it needs to create a connection

STEP 3: Base system prompt says (permanently, always):
        "You MUST read /agent/skills/system/creating-connections/SKILL.md
         for full instructions before creating connections."

STEP 4: LLM calls read_file("/agent/skills/system/creating-connections/SKILL.md")
        ← normal tool call, same as reading any file

STEP 5: Skill content enters context (~1500 tokens of instructions
        about how to use create_new_connections properly)

STEP 6: LLM follows those instructions to create the Notion connection
```

### The Key Difference Between the Two Types

| | Connection skills | System skills |
|---|---|---|
| **Pointer location** | `<system-reminder>` (injected by platform each turn) | Base system prompt (hardcoded permanently) |
| **Dynamic?** | Yes — appears when connection is created, gone when deleted | No — always present, shipped with the agent |
| **Loaded how?** | `read_file()` when about to use that connection | `read_file()` when about to use that platform feature |
| **Who wrote the pointer?** | Platform generates it at runtime | Platform engineers wrote it at build time |

### What They Have In Common

Both are **lazy-loaded the same way** — the LLM calls `read_file()` on a path. The skill file is never auto-injected into context. The LLM always has to go get it:

```
SYSTEM PROMPT (permanent, every turn):
  "read /agent/skills/system/creating-connections/SKILL.md before creating connections"
  ← hardcoded pointer, always there, costs ~20 tokens

SYSTEM-REMINDER (dynamic, every turn):
  "read /agent/skills/connections/conn_abc/SKILL.md before using Gmail tools"
  ← dynamic pointer, only when connection exists, costs ~30 tokens

ACTUAL SKILL CONTENT (~500-1500 tokens):
  Only loaded into context when the LLM calls read_file()
  ← lazy loaded, only when needed
```

**For Sunder:** System skills are just static instruction fragments your team writes and ships with the agent. They live on disk, and the base system prompt says "go read X before doing Y." Zero infrastructure — it's a `read_file` call gated by a sentence in the prompt. Store them in a `/skills/` folder in Supabase Storage and reference them in your system prompt.

### Key Insight

**Skills are just text the LLM reads.** There's no special "skill loading" mechanism. It's literally `read_file` on a markdown document and then following what it says. The same way you'd read a how-to guide before doing something unfamiliar.

### Why Skills Are Separate Files (Not Stuffed Into Tool Definitions)

You might ask: why not just put the skill guidance directly into each tool's definition? Two reasons:

**1. Token economics at scale.**

A tool definition is injected into every single LLM call — every turn, every subagent, every trigger fire. It's always there, whether you use the tool or not.

Say you have 5 connections with 16 tools each. That's 80 tool definitions in the prompt. If you stuff the skill guidance into each definition, you're paying for all 80 tools' worth of quirks documentation every turn — even when the user asks "what's the weather?"

With lazy-loading: the tool definitions stay lean (just parameters and basic descriptions), and the 300-token skill file only enters context when the LLM actually `read_file`s it right before using that connection's tools.

**2. Skills contain cross-tool knowledge.**

Look at the Gmail skill file — the label rule says "use label **names** in `gmail_search_threads` but label **IDs** in `gmail_modify_message_labels`." That's a rule that spans two tools. You can't cleanly put it in either tool's definition because it's about the *relationship* between them.

Same with the `readMask` guidance — it's a strategy for how to approach the tool depending on the task, not a parameter description. It says "if you're doing metadata analysis, use the default; if you're reading content, add bodyFull." That's situational judgment that doesn't fit in a schema.

**For Sunder's scale:** With 3-5 integrations, stuffing guidance into tool definitions would work fine. The lazy-loading pattern only starts paying off when you have many connections and the overhead of always-loaded context becomes expensive. It's an optimization, not a requirement.

---

## 3. Subagents

### What They Are

A subagent is a **fresh LLM call** that I spawn to handle a chunk of work. Not a separate process. Not a container. Not a microservice. A new, isolated conversation with the same AI model.

### The Mechanics

```
Step 1: I write instructions to a markdown file
         /agent/subagents/research-person.md
         "You are a research assistant. Given a person's name,
          search the web, find their LinkedIn, summarize their
          background. Return a 3-paragraph brief."

Step 2: Later, I call run_subagent with that file + a payload
         run_subagent(
           path="/agent/subagents/research-person.md",
           payload="John Smith, CEO of Acme Corp, meeting at 2pm"
         )

Step 3: Platform spawns a NEW LLM instance
         - System prompt = contents of research-person.md
         - User message = the payload
         - Has access to all the same tools I do

Step 4: The subagent runs its own tool loop
         - Calls web_search("John Smith Acme Corp")
         - Calls web_scrape(linkedin_url)
         - Calls web_search("Acme Corp recent news")
         - Calls web_scrape(news_article)
         - Generates a 3-paragraph summary

Step 5: Only the final message comes back to me
         "John Smith is a 15-year veteran of enterprise SaaS..."

Step 6: The subagent's context is discarded
```

### Why They Exist

**Context isolation.** That's the entire reason.

My context window is finite and expensive. If I personally do 4 web searches and scrape 6 pages to research one person, all of that content sits in my context for the rest of the conversation. Now multiply that by 5 people for a briefing prep. My context explodes.

With subagents, all that research bloat happens in a separate context. I only get back the clean summary. My context stays small and focused.

### What Subagents Are NOT

| They are NOT... | They are... |
|---|---|
| Separate processes or containers | A new LLM API call |
| Running in parallel | Sequential (I wait for each one) |
| Persistent (they don't remember) | Stateless — born, work, die |
| Aware of my conversation | They only see their instructions + payload |
| Able to show things to the user | Only I (parent) can interact with the user |

### The Instruction File Is Everything

The quality of a subagent's work depends entirely on how well I write its instruction file. It's like writing a brief for a contractor:

- **Vague instructions** → unpredictable results
- **Precise instructions** → reliable, repeatable work

The instruction file typically includes:
- What role the subagent plays
- What inputs it will receive (via payload)
- What tools it should use and how
- What format to return
- What to do if something goes wrong

### Key Insight

**A subagent is just me, but with amnesia and a different briefing.** Same brain, same tools, same capabilities. It just doesn't know about my conversation, and I don't see its intermediate work. It's a clean room.

---

## How They All Fit Together

Here's a concrete example that uses all three. User says:

> "Every morning at 8am, research whoever I'm meeting that day and Slack me a briefing."

### Setup Phase (one-time, in conversation with user)

```
1. I READ a skill
   → read_file("/agent/skills/system/creating-connections/SKILL.md")
   → Now I know how to set up connections properly

2. I use TOOLS to set up infrastructure
   → create_new_connections (Google Calendar)
   → create_new_connections (Slack)
   → manage_activated_tools (activate calendar read + slack post)
   → setup_trigger (schedule: daily at 8am)

3. I WRITE a subagent
   → write_file("/agent/subagents/daily-briefing.md")
   → Instructions: "Read today's calendar. For each meeting,
     research attendees. Post summary to Slack #briefings."
```

### Execution Phase (every morning, no user involved)

```
8:00 AM — Trigger fires

1. Platform wakes a fresh LLM instance (me, but with no memory)
2. I see: "Trigger event: daily schedule fired"
3. I READ my subagent file to remember what I'm supposed to do
   → read_file("/agent/subagents/daily-briefing.md")
4. I call TOOLS to get today's meetings
   → google_calendar_list_events(today)
   → Result: "3 meetings — John Smith, Jane Doe, Bob Wilson"
5. I call SUBAGENT for each person
   → run_subagent(path="daily-briefing.md", payload="John Smith, CEO...")
   → Returns: "John Smith is a 15-year SaaS veteran..."
   → run_subagent(path="daily-briefing.md", payload="Jane Doe, VP...")
   → Returns: "Jane Doe recently joined from Google..."
6. I use a TOOL to deliver the result
   → slack_post_message(channel="#briefings", text=compiled_briefing)
7. Done. My context is discarded.
```

### The Relationship

```
┌─────────────────────────────────────────────┐
│              ME (the LLM)                   │
│                                             │
│  I THINK about what to do                   │
│  I READ skills to know how to do it         │
│  I CALL tools to actually do it             │
│  I DELEGATE to subagents when the work      │
│    would bloat my context                   │
│                                             │
│  Skills = my training docs (I read them)    │
│  Tools = my hands (platform executes them)  │
│  Subagents = my delegates (fresh LLM calls) │
└─────────────────────────────────────────────┘
```

---

## Plain Language Version

**If Tasklet were an office worker:**

- **Tools** are the apps on their computer. Email, spreadsheets, Slack, web browser. They click buttons, things happen. They don't build the apps — they just use them.

- **Skills** are the instruction binders on their desk. "How to submit an expense report." "How to use the CRM." They read them when relevant, ignore them otherwise.

- **Subagents** are interns they can call over. "Hey, go research this person and come back with a summary." The intern goes off, does the work, comes back with the answer. The office worker doesn't see or care how the intern did it — they just get the result. The intern forgets everything afterward.

The office worker (me) sits in the same chair every day, but has **no memory** between days. Every morning, they read their task list and sticky notes to figure out what they were working on. That's the rediscovery pattern from the Calendly trace.

---

## For Your Sunder Architecture

These three concepts map directly:

| Tasklet | Sunder Equivalent |
|---|---|
| **Tool calling** | Your LLM calling Composio actions, MCP tools, Supabase queries, or Vercel Sandbox. Same pattern: LLM generates structured request → your platform executes → result feeds back. |
| **Skills** | Instruction documents stored in Supabase Storage (or even DB rows). Your LLM reads them when relevant. Could be system prompts, could be fetched dynamically. No special infrastructure needed — they're just text. |
| **Subagents** | A second `chat.completions.create()` call from your backend. Your orchestrator LLM writes the system prompt, passes the payload as the user message, gets back the final response. The AI SDK or your backend handles the tool loop for the inner call. |

None of these require special infrastructure. They're all patterns on top of the basic primitive: **LLM in a tool loop.**
