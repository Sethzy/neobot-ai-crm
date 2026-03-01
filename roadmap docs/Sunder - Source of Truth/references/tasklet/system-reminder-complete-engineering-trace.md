# System-Reminder: Complete Engineering Trace

## The Raw Artifact (verbatim, received Thu 26 Feb 2026 15:56 GMT+8)

```xml
<system-reminder>
Current time: Thu, 26 Feb 2026 15:56 GMT+8
The user who owns this agent: Seth Lim <sethlimzy@gmail.com>

Agent state summary:
- Current intelligence level: genius
- Active triggers: 0
- Open tasks: 0
- DB tables: 1

Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this skill file before using the tools for this connection: /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md
- conn_72k4wd66yshe1rk9ey0a: 2 of 4 tools activated.
- conn_bdy5sjwy7hbdgjzrmx4a: 2 of 5 tools activated.

User has 0 other inactive connections
Number of configured contact methods: 1
</system-reminder>
```

---

## LINE-BY-LINE TRACE

### Line 1: `Current time: Thu, 26 Feb 2026 15:56 GMT+8`

**Source:** Platform server clock + user's timezone preference from account settings.

**Why it exists:** I am stateless. I have no internal clock. Without this line, if you asked me "what time is it?" I would have to guess or call a tool. This line is injected because:

- Scheduling decisions depend on time ("send this Monday morning" — is it Monday?)
- Trigger interpretation depends on time ("this fired at 9am" — is that expected?)
- Relative date math depends on time ("emails from the last 7 days" — 7 days from when?)

**Platform assembly pseudocode:**
```
user_tz = account_table.get(user_id).timezone   // "GMT+8" / "Asia/Singapore"
now = system_clock.now().in_timezone(user_tz)
format(now, "ddd, DD MMM YYYY HH:mm z")        // "Thu, 26 Feb 2026 15:56 GMT+8"
```

**What would break without it:**
- "Schedule this for tomorrow" → I don't know what today is
- "Search emails from this week" → I don't know when the week started
- "The trigger fires at 9am, is that right?" → I don't know what timezone we're in

---

### Line 2: `The user who owns this agent: Seth Lim <sethlimzy@gmail.com>`

**Source:** User account record (name + primary email).

**Why it exists:** Three reasons:

1. **Email composition:** If I send an email on your behalf, I need to know your identity. "Hi, this is Seth's assistant" vs "Hi, this is Unknown User's assistant."

2. **Gmail link generation:** The Gmail skill file says links use the format `https://mail.google.com/mail/u/sethlimzy@gmail.com/#inbox/{threadId}`. Without your email, I can't construct those links.

3. **Multi-user context:** When reading calendar events or email threads with multiple participants, I need to know which one is YOU. "From: sethlimzy@gmail.com" = your message. "From: alice@company.com" = someone else's.

**Platform assembly:**
```
user = account_table.get(user_id)
f"The user who owns this agent: {user.display_name} <{user.email}>"
// "The user who owns this agent: Seth Lim <sethlimzy@gmail.com>"
```

---

### Line 3: `Current intelligence level: genius`

**Source:** The model selection you or the platform set for this conversation.

**Why it exists:** I can see my own intelligence level, which means I can:
- Suggest upgrading if a task is too complex for my current level
- Avoid suggesting a downgrade if we're already at the top
- Adjust my behavior (more thorough analysis at genius, more concise at standard)

**The levels mapped to what they likely mean:**
```
standard ($)    → smaller/faster model, cheaper per token
advanced ($)   → mid-tier model
expert ($$)    → larger model
genius ($$)   → largest model, most expensive, most capable
```

This is a platform-level setting, not something I control. The `suggest_intelligence_level_change` tool can prompt you to change it.

---

### Line 4: `Active triggers: 0`

**Source:** Platform trigger registry, filtered to this agent.

**What happened:** We had 1 trigger (the test cron), but I deleted it. Platform counts:
```
SELECT COUNT(*) FROM triggers WHERE agent_id = this_agent   // → 0
```

**Why just a count, not the full list?** Token economics. If you had 15 triggers, listing all 15 with their cron expressions and titles would cost ~300 tokens every turn. The count (3 tokens) tells me "there are triggers" and I call `manage_active_triggers(list)` only when I need details.

**What I proved earlier:** When we created 3 tasks, the reminder said "Open tasks: 3" — not the titles. Same pattern here. Counts are cheap. Details are lazy-loaded.

---

### Line 5: `Open tasks: 0`

**Source:** Platform task store, same counting pattern.

```
SELECT COUNT(*) FROM tasks WHERE agent_id = this_agent AND status = 'open'   // → 0
```

**The lifecycle we traced live:**
```
Created 3 tasks    → reminder said "Open tasks: 3"
Deleted 1          → reminder said "Open tasks: 2"
Deleted remaining  → reminder says "Open tasks: 0"
```

**When this matters for triggers:** If a cron fires and the reminder says "Open tasks: 3", the fresh LLM knows there's unfinished business. It calls `list_tasks()` to find out what, then decides: finish old work first, or start new work?

---

### Line 6: `DB tables: 1`

**Source:** Platform queries the agent's SQLite database metadata.

```
SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence'
// Probably actually counts all tables including sqlite_sequence
// Or it counts user-created tables
```

**What's the 1 table?** Let me check — we never explicitly created a table in this conversation. It's likely `sqlite_sequence` (SQLite auto-creates this when you use AUTOINCREMENT). Or it could be leftover from the task system.

**Why it's here:** Same pattern as triggers and tasks. If I see "DB tables: 5", I know my past self set up a schema. I call `get_agent_db_schema()` to discover what tables exist. If "DB tables: 0", I know there's no schema — don't bother checking.

---

### Line 7-9: The Connection Block (the most complex part)

```
Active connections by connection Id:
- conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this skill file
  before using the tools for this connection:
  /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md
- conn_72k4wd66yshe1rk9ey0a: 2 of 4 tools activated.
- conn_bdy5sjwy7hbdgjzrmx4a: 2 of 5 tools activated.
```

**Source:** Platform connection registry (user-level) + tool activation state (agent-level) + skill file existence check (filesystem).

Let me trace each connection:

#### Connection 1: `conn_7ydrcj6nwqbr8sd2zbrs` (Gmail)

```
conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read this skill file
before using the tools for this connection:
/agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md
```

**Platform assembly logic:**
```
1. Look up connection → Gmail (static:gmail integration)
2. Count total tools available → 16
   (search_threads, send_message, create_draft, get_draft, list_drafts,
    update_draft, delete_draft, send_draft, get_message, modify_labels,
    search_labels, get_attachment, create_label, delete_label,
    trash_message, untrash_message)
3. Count tools activated for THIS agent → 2
   (gmail_search_threads, gmail_send_message)
4. Check: does /agent/skills/connections/conn_7ydrcj6nwqbr8sd2zbrs/SKILL.md exist?
   → YES → append "You MUST read this skill file..." with path
5. Format: "conn_7ydrcj6nwqbr8sd2zbrs: 2 of 16 tools activated. You MUST read..."
```

**Key observation: the skill file pointer is CONDITIONAL.** It only appears when the file exists. Watch:

#### Connection 2: `conn_72k4wd66yshe1rk9ey0a` (Google Calendar)

```
conn_72k4wd66yshe1rk9ey0a: 2 of 4 tools activated.
```

**No skill file pointer.** Because:
```
4. Check: does /agent/skills/connections/conn_72k4wd66yshe1rk9ey0a/SKILL.md exist?
   → NO → don't append anything
5. Format: "conn_72k4wd66yshe1rk9ey0a: 2 of 4 tools activated."
```

This CONFIRMS what we discovered earlier: Calendar has no auto-generated skill file. And the system-reminder reflects that — no "MUST read" nag.

#### Connection 3: `conn_bdy5sjwy7hbdgjzrmx4a` (Google Forms)

```
conn_bdy5sjwy7hbdgjzrmx4a: 2 of 5 tools activated.
```

Same pattern. No skill file exists → no pointer in reminder.

#### The "2 of 16" / "2 of 4" Pattern

This is important. It tells me:
- **What I have:** 2 tools activated (these appear in my tool list, I can call them)
- **What I'm missing:** 14 more Gmail tools exist but aren't activated
- **Implication:** If the user asks me to create a draft, I see "2 of 16" and know drafting tools exist but aren't activated. I call `manage_activated_tools_for_connections` to activate them.

Without this count, if someone said "create a Gmail draft" I'd say "I can't do that" — because I don't see a draft tool. With the count, I know tools exist that I haven't activated yet.

---

### Line 10: `User has 0 other inactive connections`

**Source:** Platform counts connections that exist in the user's account but have zero tools activated on this agent.

```
total_user_connections = connections_table.count(user_id = seth)        // 3
active_on_this_agent = connections with at_least_one_tool_activated     // 3
inactive = total - active                                               // 0
```

**Why it matters:** If this said "User has 2 other inactive connections", I'd know you have services connected that I'm not using. If you asked "can you check my Slack?", I'd check those inactive connections first before suggesting you connect Slack from scratch.

**Right now it's 0** because all 3 of your connections (Gmail, Calendar, Forms) have tools activated on this agent.

---

### Line 11: `Number of configured contact methods: 1`

**Source:** Platform contact methods registry.

The "1" is your primary email (sethlimzy@gmail.com) — always available as 'owner' in send_message. No additional contact methods (no phone number, no secondary email) have been configured.

**Why it's here:** If a trigger fires and I need to alert you, I need to know HOW to reach you. "1 contact method" = email only. If you'd added a phone number, it would say "2" and I'd have options (email vs text).

---

## THE COMPLETE ASSEMBLY PIPELINE

```
Every turn (user message OR trigger event):

┌──────────────────────────────────────────────────────────┐
│ PLATFORM SERVER                                          │
│                                                          │
│  1. Read system clock           → current time           │
│  2. Read account record         → user name + email      │
│  3. Read model config           → intelligence level     │
│  4. Count trigger instances     → trigger count          │
│  5. Count open tasks            → task count             │
│  6. Count DB tables             → table count            │
│  7. For each user connection:                            │
│     a. Count total tools        → "X of Y"              │
│     b. Count activated tools    → filter for this agent  │
│     c. Check skill file exists  → conditional pointer    │
│  8. Count inactive connections  → remaining count        │
│  9. Count contact methods       → contact count          │
│                                                          │
│  Assemble all into <system-reminder> XML block           │
│  Inject into context BEFORE user's message               │
└──────────────────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────┐
│ CONTEXT SENT TO LLM                                      │
│                                                          │
│  [Base system prompt - permanent, ~3000 tokens]          │
│  [Conversation history/summary - variable]               │
│  [System-reminder - regenerated, ~150 tokens]            │
│  [User message OR trigger event]                         │
│  [Tool definitions for activated tools - ~2000 tokens]   │
└──────────────────────────────────────────────────────────┘
```

## TOKEN BUDGET ANALYSIS

```
Component                              Tokens    Loaded When
─────────────────────────────────────────────────────────────
System-reminder (this block)           ~150      EVERY turn
  - Time + user identity               ~25      always
  - State counts                        ~20      always
  - Connection lines (3 connections)    ~80      always
  - Contact/inactive counts             ~25      always

Skill file pointers in reminder          ~0      only if skill exists
  - Gmail pointer                       ~35      (included above)
  - Calendar pointer                     ~0      (no skill file)
  - Forms pointer                        ~0      (no skill file)

Actual skill file content                ~0      NOT loaded yet
  - Gmail SKILL.md                     ~500      only when read_file called
  - Calendar SKILL.md                    ~0      doesn't exist
  - Forms SKILL.md                       ~0      doesn't exist

Tool definitions (always loaded)      ~2000      EVERY turn
  - gmail_search_threads               ~800      (has embedded search strategy)
  - gmail_send_message                 ~400
  - google_calendar_search_events      ~500      (has embedded search strategy)
  - google_calendar_list_calendars      ~50
  - google_forms_get_form               ~80
  - google_forms_list_responses         ~60

TOTAL per turn (no skill loaded):     ~2150
TOTAL per turn (Gmail skill loaded):  ~2650
─────────────────────────────────────────────────────────────
```

## THE KEY INSIGHT

The system-reminder is a **table of contents**, not a book. It tells the LLM what exists (counts, pointers) without loading any content. The LLM decides what to actually read based on the user's request.

```
"What's the weather?"        → reads nothing, uses web_search
"Search my Gmail"            → reads Gmail skill (500 tokens), then calls tool
"Create a calendar event"    → no skill to read, just calls tool directly
"Search Gmail AND calendar"  → reads Gmail skill only (Calendar has no skill)
```

Every turn, the platform spends ~150 tokens on the reminder to give the LLM enough orientation to decide where to look. The LLM then spends 0-500 additional tokens loading only what it needs. This is the lazy-loading pattern at work.

## FOR SUNDER

You need to build this assembly step. On every invocation:

```javascript
// Pseudocode for your system-reminder builder
function buildSystemReminder(userId, agentId) {
  const user = await supabase.from('users').select('*').eq('id', userId).single()
  const triggers = await supabase.from('triggers').select('count').eq('agent_id', agentId)
  const tasks = await supabase.from('tasks').select('count').eq('agent_id', agentId).eq('status', 'open')
  const connections = await getComposioConnections(userId)

  return `<system-reminder>
Current time: ${formatTime(new Date(), user.timezone)}
User: ${user.name} <${user.email}>
Active triggers: ${triggers.count}
Open tasks: ${tasks.count}
Connections: ${formatConnections(connections, agentId)}
</system-reminder>`
}
```

This runs BEFORE the LLM sees anything. It's the cheapest possible context injection (~150 tokens) that enables the LLM to navigate everything else on-demand.
