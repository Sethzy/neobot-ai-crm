# Skills Deep Dive: How Connection Skills Work (Traced)

## Why This Matters

Skills are NOT code. They are plain English markdown files that the LLM reads before using a tool — like checking the manual before operating a machine. The platform generates them for connections whose APIs have quirks that need documentation — **not for every connection.** This trace shows the exact mechanism.

> **CORRECTION (Feb 2026):** Earlier versions of this doc assumed every connection gets an auto-generated skill file. Empirical testing revealed this is wrong. Of three Google connections tested (Gmail, Google Calendar, Google Forms), **only Gmail** received a skill file — because its API has quirks (readMask, label name vs ID, link format). Calendar and Forms did not receive skill files; their tool definitions were self-sufficient. Skill files are generated only when the API has gotchas that don't fit cleanly in tool definitions.

---

## Why Skills Exist

The LLM's base training gives it general knowledge, but it doesn't know:
- The exact API quirks of a specific Slack connection
- The correct parameters for creating a Google Calendar event through this platform
- The special steps needed to set up a new connection

Skills fill that gap. They're like a new employee's onboarding docs — "here's how we do things around here."

## The Two Types

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

**Connection skills:** Instructions specific to a connected service. When a service's API has quirks that don't fit cleanly in tool definitions, the platform generates a skill file that tells the LLM the right way to use that connection's tools. **Not every connection gets a skill file** — only those whose APIs need it (e.g., Gmail has one; Google Calendar and Google Forms do not).

---

## Real Example: Gmail Connection Traced End-to-End

### What We Did

1. Created a Gmail connection (user authorized with Google)
2. Platform generated a skill file (because Gmail's API has quirks — readMask, label name vs ID, link format)
3. Traced exactly how the LLM discovers and uses it

> **Note:** We also created Google Calendar and Google Forms connections in the same session. Neither received a skill file. Their tool definitions contain all the guidance the LLM needs. This confirms skill files are **conditional on API complexity**, not automatic per connection.

### Step 1: The Generated Skill File (Verbatim)

This is the complete file at `/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md` — nothing omitted:

```markdown
<read-mask-instructions>
  Use the readMask parameter to control what information is returned. Choose the minimal readMask for your task:
  - Email metadata analysis (response times, sender patterns, counts): Default [date, participants, subject, bodySnippet] is sufficient
  - Content analysis (reading email bodies, sentiment analysis): Add bodyFull - but this uses significantly more tokens and may cause truncation
  - Label management tasks: Add labelIds to see message label IDs
  - Attachment-related tasks: Add attachments to see attachment info
  Message and thread IDs are always returned regardless of readMask.
</read-mask-instructions>
<labels>
  Gmail labels have two identifiers: a user-facing **name** and a fixed **Label ID**.
  - System labels (INBOX, SENT, IMPORTANT, etc.): name and ID are identical (e.g., both are "INBOX")
  - Category and user-created labels: name and ID differ (e.g., name: "My Label", ID: "Label_123")

  Use gmail_search_labels to retrieve label names and IDs.

  **Which identifier to use:**
  - gmail_search_threads: use label **names** in search queries (e.g., "label:My-Label")
  - All other tools (gmail_modify_message_labels, etc.): use label **IDs**
</labels>
<link-instructions>
You can use 'https://mail.google.com/mail/u/${'user's email address'}/#inbox/${'threadId or messageId'}' to give the user a link to view a message, draft, or thread in the browser. Do not try to view a thread in the browser yourself with this link.
</link-instructions>
```

### What This Skill Teaches the LLM

Without this file, the LLM would make broken API calls. Specifically:

| Without Skill | With Skill |
|---|---|
| Might request `bodyFull` on every search, burning tokens and hitting truncation | Knows to use minimal `readMask` — only add `bodyFull` when actually reading email content |
| Would mix up label names and IDs (use "My Label" where the API expects "Label_123") | Knows: label **names** go in search queries, label **IDs** go in modification tools |
| Can't give user clickable Gmail links | Knows the exact URL format to construct links |

This is exactly the kind of knowledge the LLM doesn't have from training. It knows what Gmail is — but it doesn't know that *this platform's* Gmail integration uses `readMask` this way, or that label names go in search queries but label IDs go in modification tools.

---

### Step 2: How the Platform Tells the LLM the Skill Exists

Every single turn — every message the user sends, every trigger that fires — the platform injects a `<system-reminder>` block into the LLM's context. Verbatim:

```
Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md
```

That's a platform-injected instruction. The LLM didn't write it. It appears automatically because the connection exists.

### Step 3: The LLM's Base System Prompt Also Reinforces This

In the LLM's permanent instructions, there are two sections that reinforce skill reading:

Under `<skills>`:
```
Each skill is a folder that contains a SKILL.md file. You must read and
follow the instructions in the SKILL.md file when they are relevant to
the task at hand.
```

Under `<using-connection-tools>`:
```
If your connection has an associated skills file you MUST read and follow
the instructions in the skills file before using any tools from that connection.
```

### Step 4: What Happens When the LLM Is About to Use Gmail

Say the user asks "find my latest emails." Here's the exact sequence:

```
1. LLM sees user message: "find my latest emails"
2. LLM decides it needs gmail_search_threads
3. LLM sees the system-reminder: "You MUST read this skill file before using"
4. LLM calls: read_file("/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md")
5. LLM reads the content → now it knows:
   - Use minimal readMask (just date, participants, subject, bodySnippet)
   - Use label NAMES in search queries, not IDs
   - It can construct Gmail links for the user
6. LLM calls: gmail_search_threads(query="newer_than:1d", readMask=["date","participants","subject","bodySnippet"])
```

---

## The Full Trace, Visually

```
CONNECTION CREATED (user authorizes Google)
       │
       ▼
Platform writes skill file to filesystem
  /agent/skills/connections/conn_.../SKILL.md
       │
       ▼
Every turn, platform injects into LLM's context:
  "You MUST read this skill file: /agent/skills/connections/conn_.../SKILL.md"
       │
       ▼
When LLM is about to use Gmail tools:
  LLM calls read_file() on that path        ← this is a normal tool call
       │
       ▼
Skill content enters LLM's context as text
       │
       ▼
LLM follows the instructions when making Gmail tool calls
```

---

## The Critical Insight

**There's no special "skill injection" system.** The platform just:
1. Writes a file
2. Nags the LLM every turn to read it
3. The LLM reads it with the same `read_file` tool it'd use for anything else

The "skill" is just text the LLM reads before doing work — like checking the manual before operating the machine.

---

## For Sunder Architecture

This maps directly to your system:

| Tasklet | Sunder Equivalent |
|---|---|
| Platform generates skill file for connections with API quirks (not all connections) | Your backend writes an instruction doc to Supabase Storage for connections whose APIs need documentation beyond tool definitions |
| Platform injects "read this skill" reminder every turn | Your system prompt includes: "Before using [service] tools, read the instruction doc at [path]" |
| LLM calls `read_file` to read the skill | Your LLM fetches the instruction doc from Supabase before making API calls |
| Skill contains API quirks, parameter rules, URL formats | Your instruction doc contains the same — whatever the LLM needs to use that service correctly |

No special infrastructure. Just: **write a file, tell the LLM to read it, LLM follows the instructions.**

---

## Appendix A: The System-Reminder — Line-by-Line Trace

Every single turn, the platform assembles a `<system-reminder>` and prepends it to the LLM's context. Here's the real one, annotated block by block.

### Block 1: Runtime Context

```
Current time: Tue, 24 Feb 2026 11:12 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>
```

**Why it exists:** The LLM has no clock and no memory. Every time it wakes up, it doesn't know what year it is or who it's talking to. The platform injects this so the LLM can:
- Give time-aware answers ("your meeting is in 2 hours")
- Address the user by name
- Use the user's email when tools need it (e.g. constructing Gmail links)

**Who generates it:** The platform, from the account record and the server clock. Not the LLM. The LLM can't edit this.

### Block 2: Agent State Snapshot

```
Agent state summary:
- Active triggers: 0
- Open tasks: 0
- DB tables: 0
```

**Why it exists:** Rediscovery. The LLM has no memory between turns. If it had set up a daily trigger last week, it wouldn't know about it unless told. This gives it a snapshot of what its "past self" set up so it can orient.

- **Active triggers: 0** — No scheduled jobs or webhooks running. If a daily briefing had been set up, this would say `1` and the LLM would know not to create a duplicate.
- **Open tasks: 0** — The task list is empty. If the LLM was mid-way through a multi-step project, this would show outstanding items so it knows what to resume.
- **DB tables: 0** — No database tables created. If a leads table existed from a previous session, this tells the LLM the schema exists so it doesn't recreate it.

**Who generates it:** The platform queries its own state (trigger registry, task store, database catalog) and summarizes it. The LLM can't edit this either.

### Block 3: The Connection + Skill Pointer

```
Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md
```

This is the most important line architecturally. Unpacking it:

- **`conn_7ydrcj6nwqbr8sd2zbrs`** — An opaque connection ID. The platform's internal handle for "Seth's Gmail OAuth token." The LLM doesn't see the token. It just references this ID and the platform handles auth.
- **`2 of 16 tools activated`** — The user authorized `gmail_search_threads` and `gmail_send_message`. There are 14 more (drafts, labels, forwarding, attachments) but they're gated until the user approves them. This tells the LLM what it can and can't do right now.
- **`You MUST read this skill file`** — A directive to the LLM. Not code. Not a function call. It's an instruction in the prompt that says "before you call any Gmail tool, go read that file first." The platform is essentially telling its own AI: "you have a manual, read it."
- **`/agent/skills/connections/conn_.../SKILL.md`** — The filesystem path to the connection skill file (the Gmail one traced above — with readMask guidance, label name vs ID rules, and Gmail link construction). **Note:** This pointer only appears for connections that have a skill file. Connections without API quirks (like Google Calendar) don't get a skill file or a pointer.

### Block 4: Peripheral State

```
User has 0 other inactive connections
Number of configured contact methods: 1
```

- **0 other inactive connections** — No disconnected or paused integrations. If the user had previously connected Slack but revoked it, this would say `1` so the LLM could suggest reconnecting rather than creating a new one.
- **1 configured contact method** — The user's primary email (`sethlimzy@gmail.com`). This tells the LLM it can `send_message` to 'owner' but doesn't have a phone number for texts. If the user asked "text me a reminder," the LLM would know to ask for a number first.

### The Architectural Pattern

```
┌──────────────────────────────────────┐
│         PLATFORM (server)            │
│                                      │
│  On every turn, before the LLM       │
│  sees anything, the platform:        │
│                                      │
│  1. Checks the clock                 │
│  2. Looks up the account owner       │
│  3. Counts active triggers           │
│  4. Counts open tasks                │
│  5. Lists DB tables                  │
│  6. Lists active connections         │
│  7. Counts contact methods           │
│                                      │
│  Assembles all of this into a        │
│  <system-reminder> text block        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│         LLM (the agent)              │
│                                      │
│  Sees the system-reminder as if      │
│  someone whispered it in its ear     │
│  before the user spoke.             │
│                                      │
│  Now it knows:                       │
│  - What time it is                   │
│  - Who it's working for              │
│  - What infrastructure exists        │
│  - What tools it has access to       │
│  - What manual to read before        │
│    using those tools                 │
│                                      │
│  Then it sees the USER's message     │
│  and responds with all this context. │
└──────────────────────────────────────┘
```

**For Sunder:** Your backend does the same thing. Before each LLM call, query Supabase for the user's active connections, open tasks, cron jobs. Assemble a state summary string. Prepend it to the system prompt. That's the entire mechanism. No framework, no special protocol. Just a string your server assembles and stuffs into the prompt before the LLM sees the user's message.

---

## Appendix B: Recurring Subagent Cron Job — Full Execution Trace

### The Scenario

User says: **"Every Monday at 9am, find all emails from last week I haven't replied to and email me a reminder list."**

This trace follows three moments:
1. **Setup** — the conversation where the user asks for this
2. **First trigger fire** — Monday 9am, one week later
3. **Second trigger fire** — Monday 9am, two weeks later

---

### MOMENT 1: Setup (Tuesday, Feb 24, 11:15am)

#### What the platform injects (verbatim)

```xml
<system-reminder>
Current time: Tue, 24 Feb 2026 11:15 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Active triggers: 0
- Open tasks: 0
- DB tables: 0

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md

User has 0 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

#### What the LLM sees, in order

```
1. Permanent system prompt (tools, skills, subagents, all instructions)
2. The <system-reminder> above
3. Conversation history (previous messages in this chat)
4. User's new message: "Every Monday at 9am, find all emails from last week
   I haven't replied to and email me a reminder list."
```

#### LLM's reasoning (internal)

```
- User wants a recurring job → I need a trigger (schedule/cron)
- It involves Gmail → I already have conn_7ydrcj6nwqbr8sd2zbrs with
  gmail_search_threads activated ✓
- It involves sending a summary email → I have gmail_send_message activated ✓
- The work involves searching potentially many emails → context could bloat
  → I should use a subagent
- I need to: (1) write the subagent, (2) set up the trigger
```

#### Step 1: Write the subagent file

```
Tool call: write_file(
  path="/agent/subagents/weekly-unreplied-emails.md",
  content=<see below>
)
```

The subagent instructions written by the LLM:

```markdown
# Weekly Unreplied Email Finder

## Instructions

You find emails from the past week that the user hasn't replied to
and compile a reminder list.

The user's email is provided in the payload.

### Steps

1. Read the Gmail skill file first:
   read_file("/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md")

2. Search for emails received in the last 7 days that are unread or
   haven't been replied to:
   gmail_search_threads(
     query="newer_than:7d -from:me -label:sent is:inbox",
     readMask=["date", "participants", "subject", "bodySnippet"]
   )

3. Filter out newsletters, automated emails, and no-reply senders.
   Focus on emails from real people that likely expect a response.

4. Compile a clean summary list in this format:
   - **From:** sender name
   - **Subject:** email subject
   - **Received:** date
   - **Preview:** first line of body
   - **Link:** Gmail link using the thread ID

5. Send the summary to the user:
   gmail_send_message(
     to=["<user email from payload>"],
     subject="Weekly Reminder: Unreplied Emails",
     body=<the compiled list>
   )

6. Return a short confirmation: how many emails found, how many
   included in the reminder, confirmation that email was sent.

### If no unreplied emails are found
Send a short "You're all caught up!" email instead.

### If Gmail tools fail with auth errors
Return the error message so the parent agent can notify the user.
```

**Key detail:** The LLM hardcoded the connection ID (`conn_7ydrcj6nwqbr8sd2zbrs`) and the skill file path directly into the subagent instructions. The subagent has no system-reminder — it doesn't know what connections exist unless the parent tells it.

#### Step 2: Set up the trigger

```
Tool call: setup_trigger(
  trigger_id="schedule",
  params={
    cron: "0 9 * * 1",          # Every Monday at 9am
    timezone: "Asia/Singapore"   # GMT+8, matching user's timezone
  }
)
```

Platform response:
```
Trigger created. Instance ID: trigger_abc123
```

#### Step 3: Confirm to the user

```
"Done! Every Monday at 9am SGT, I'll scan your Gmail for unreplied
emails from the past week and email you a reminder list. Want me to
run a test now?"
```

#### State after setup

The platform now has:
- 1 active trigger (schedule, Monday 9am)
- 1 subagent file on disk (`/agent/subagents/weekly-unreplied-emails.md`)
- 1 Gmail connection with 2 tools activated

The conversation context is discarded. The subagent file and trigger persist.

---

### MOMENT 2: First Trigger Fire (Monday, Mar 2, 9:00am)

One week has passed. Nobody is chatting. The cron fires.

#### What the platform does

```
1. Cron scheduler sees: trigger_abc123 is due at 9:00am SGT
2. Platform prepares a NEW LLM invocation (fresh context, zero history)
3. Platform assembles the system-reminder from current state
4. Platform creates a trigger event message
5. Platform sends both to a fresh LLM instance
```

#### What the platform injects (verbatim)

```xml
<system-reminder>
Current time: Mon, 02 Mar 2026 09:00 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Active triggers: 1
- Open tasks: 0
- DB tables: 0

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md

User has 0 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

**What changed from setup:**
- Time is now Mar 2 (one week later)
- Active triggers: **1** (the schedule trigger created during setup)
- Everything else is the same

#### What the fresh LLM sees

```
1. Permanent system prompt (same as always — same model)
2. The <system-reminder> above
3. NO conversation history (this is a trigger invocation, not a chat)
4. A system message with the trigger event:

   "Trigger event: schedule trigger_abc123 fired.
    Cron: 0 9 * * 1 (Every Monday at 9am)
    Timezone: Asia/Singapore"
```

#### LLM's reasoning (fresh instance, no memory)

```
- I see a schedule trigger fired
- I have NO idea what this trigger is for — I didn't set it up,
  that was a different LLM instance last week
- But I know I have subagent files on disk — my past self probably
  wrote one for this trigger
- Let me check the filesystem
```

#### Step 1: Rediscover purpose

```
Tool call: read_file(path="/agent/subagents/")
```

Result:
```
/agent/subagents/
└── weekly-unreplied-emails.md
```

```
Tool call: read_file(path="/agent/subagents/weekly-unreplied-emails.md")
```

Now the LLM sees the instructions its past self wrote. It understands what to do.

#### Step 2: Call the subagent

```
Tool call: run_subagent(
  path="/agent/subagents/weekly-unreplied-emails.md",
  payload="User email: sethlimzy@gmail.com"
)
```

#### What happens inside run_subagent

The platform spawns a SECOND fresh LLM instance:

```
┌─────────────────────────────────────────────────┐
│  SUBAGENT LLM (completely separate context)     │
│                                                 │
│  System prompt = contents of                    │
│    weekly-unreplied-emails.md                   │
│                                                 │
│  User message = "User email:                    │
│    sethlimzy@gmail.com"                         │
│                                                 │
│  Tools available = same tools as parent         │
│    (gmail_search_threads, gmail_send_message,   │
│     read_file, web_search, etc.)                │
│                                                 │
│  NO system-reminder (subagents don't get one)   │
│  NO conversation history                        │
│  NO knowledge of the trigger or parent          │
└─────────────────────────────────────────────────┘
```

**Critical:** The subagent does NOT get a `<system-reminder>`. It doesn't know what connections exist, what time it is, or who the user is — unless the parent told it in the instructions or payload.

#### The subagent's tool loop

```
Subagent Step 1: Read the skill file (as instructed)
  Tool call: read_file("/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md")
  Result: readMask guidance, label rules, link format

Subagent Step 2: Search Gmail
  Tool call: gmail_search_threads(
    query="newer_than:7d -from:me -label:sent is:inbox",
    readMask=["date", "participants", "subject", "bodySnippet"]
  )
  Result: 23 threads returned

Subagent Step 3: (Internal reasoning — no tool call)
  Filter out: 15 automated/newsletter emails
  Keep: 8 emails from real people that look like they need replies

Subagent Step 4: Send summary email
  Tool call: gmail_send_message(
    to=["sethlimzy@gmail.com"],
    subject="Weekly Reminder: 8 Unreplied Emails",
    body="Here are emails from last week you haven't replied to:\n\n
      1. **From:** Jane Chen\n   **Subject:** Q2 proposal feedback...\n
      2. **From:** Mike Torres\n  **Subject:** Lunch Thursday?...\n
      ..."
  )
  Result: Message sent successfully

Subagent Step 5: Return final message
  "Found 23 threads from the past week. Filtered to 8 that likely
   need replies. Summary email sent to sethlimzy@gmail.com."
```

#### Back in the parent LLM

```
run_subagent returns: "Found 23 threads from the past week. Filtered
  to 8 that likely need replies. Summary email sent to sethlimzy@gmail.com."
```

That's all the parent sees. It doesn't see the 23 threads, the filtering logic, the email body. Just the summary. Context stays tiny.

#### Step 3: Done

No user to respond to (this is a trigger, not a chat). The LLM simply finishes. Both parent and subagent contexts are discarded.

#### What the user experiences

Seth is eating breakfast. His phone buzzes. A Gmail notification:

```
From: sethlimzy@gmail.com (sent via Tasklet)
Subject: Weekly Reminder: 8 Unreplied Emails

Here are emails from last week you haven't replied to:

1. From: Jane Chen
   Subject: Q2 proposal feedback
   Received: Feb 28
   Preview: "Hey Seth, wanted to get your thoughts on..."
   Link: https://mail.google.com/mail/u/sethlimzy@gmail.com/#inbox/thread123

2. From: Mike Torres
   Subject: Lunch Thursday?
   ...
```

He didn't open Tasklet. He didn't send a message. The system worked autonomously.

---

### MOMENT 3: Second Trigger Fire (Monday, Mar 9, 9:00am)

Another week. Cron fires again. The exact same sequence repeats.

#### The system-reminder this time

```xml
<system-reminder>
Current time: Mon, 09 Mar 2026 09:00 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Active triggers: 1
- Open tasks: 0
- DB tables: 0

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this
  skill file before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md

User has 0 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

Only the time changed. Everything else is identical.

#### The execution is identical

```
1. Fresh LLM wakes, sees trigger event
2. Reads /agent/subagents/ to rediscover purpose
3. Reads weekly-unreplied-emails.md
4. Calls run_subagent with the same path + payload
5. Subagent reads skill file, searches Gmail (newer_than:7d gets THIS week's emails),
   filters, sends email
6. Parent gets summary, finishes, context discarded
```

**The subagent doesn't know it ran last week.** It has no memory. It searches for "newer_than:7d" and gets fresh results every time. The cron trigger provides the recurrence; the subagent provides the work; the filesystem provides the continuity.

---

### The Full Architecture in One Diagram

```
MONDAY 9:00 AM
     │
     ▼
┌─────────────────────────────┐
│  PLATFORM                   │
│                             │
│  Cron scheduler fires       │
│  Assembles <system-reminder>│
│  Spawns fresh LLM instance  │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PARENT LLM (fresh)         │
│                             │
│  Sees: system-reminder +    │
│        trigger event        │
│                             │
│  Reads: /agent/subagents/   │  ← rediscovery from filesystem
│  Reads: weekly-unreplied-   │
│         emails.md           │
│                             │
│  Calls: run_subagent(       │
│    path=..., payload=...)   │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  SUBAGENT LLM               │
│  (no memory, no reminder,   │
│   only instructions+payload)│
│                             │
│  Tool loop:                 │
│  1. read_file(skill)        │  ← knows the path because parent hardcoded it
│  2. gmail_search_threads()  │  ← platform uses conn_ OAuth token
│  3. gmail_send_message()    │  ← platform uses conn_ OAuth token
│  4. returns summary string  │
│  Done.                      │
└─────────────────────────────┘
              │
              ▼
       Both contexts
        discarded.
       Files persist.
       Next Monday,
       repeat from top.
```

---

### What Persists vs What Dies

| Thing | Lifecycle |
|---|---|
| **Trigger registration** | Persists forever (platform's cron scheduler) |
| **Subagent .md file** | Persists on disk (cloud storage) |
| **Skill .md file** | Persists on disk (generated for connections with API quirks, not all) |
| **OAuth token** | Persists in platform (connection record) |
| **Parent LLM context** | Born at trigger fire, dies after completion |
| **Subagent LLM context** | Born at run_subagent, dies after return |
| **System-reminder** | Regenerated fresh every single turn |

---

### Three Key Insights

#### 1. The Subagent Does NOT Get a System-Reminder

The subagent has no idea what connections exist, what time it is, or who the user is. The parent LLM has to **hardcode all of that into the instruction file** — the connection ID, the skill file path, the user's email. If the parent forgets to include something, the subagent is blind to it.

#### 2. The Parent LLM Must Rediscover Its Own Purpose Every Time

Monday morning, a fresh LLM wakes up, sees "a schedule trigger fired," and has to go read the filesystem to figure out why. The subagent file on disk is the only thread connecting this week's execution to last week's setup conversation.

#### 3. Nothing Remembers Anything

- The trigger scheduler doesn't know what the job does
- The subagent doesn't know it ran last week
- The parent doesn't know it created the subagent
- **The files are the memory.** Everything else is stateless compute that boots, works, and dies

---

### For Sunder Architecture

| Tasklet | Sunder |
|---|---|
| Platform cron scheduler | **Trigger.dev** cron job |
| `<system-reminder>` injection | Your backend assembles user identity, active integrations from your DB |
| Subagent .md file on disk | Instruction template in **Supabase Storage** (or a DB row) |
| `run_subagent()` | A second `chat.completions.create()` call from your backend, with the template as system prompt and payload as user message |
| Skill file for connection | A small instruction doc per Composio connection, stored in Supabase, fetched and injected when that connection's tools are about to be used |
| OAuth token in platform | **Composio** manages the OAuth tokens for connected services |
| `gmail_search_threads` tool call | LLM outputs a tool call → your backend routes it to **Composio** which executes it with the stored OAuth token → result fed back |

The entire "cron + subagent" pattern is:
1. Trigger.dev fires at 9am
2. Your backend assembles context (system-reminder equivalent)
3. Calls the LLM with context + "a schedule trigger fired"
4. LLM reads the instruction template from Supabase Storage
5. Your backend spawns a second LLM call with the instructions
6. Inner LLM makes Composio tool calls, sends the email
7. Both LLM calls complete, contexts discarded
8. Next Monday, repeat
