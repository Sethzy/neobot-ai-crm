# First Run Lifecycle - Verbatim Capture

Captured from user-provided analysis text. Preserved as provided.

---

ok so explain to me, like in detial, how what does the system prompt say to do on the first run, what gets saved, and how the saved info is stored, and how it gets used
5:16 PM

Worked for 2s
▶
Let me trace the complete lifecycle with extreme detail.

Phase 1: First Run (Setup Conversation)
What the system prompt says
When you first message me with "Set up a daily calendar briefing", I receive:
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT (always present, ~15KB)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ <your-personality>                                              │
│ - Be concise and direct...                                      │
│ </your-personality>                                             │
│                                                                 │
│ <filesystem>                                                    │
│ /agent/                                                         │
│ ├── home/           # Read-write persistent storage             │
│ ├── subagents/      # Read-write: Subagent instruction files    │
│ ...                                                             │
│ </filesystem>                                                   │
│                                                                 │
│ <subagents>                                                     │
│ Subagents reduce your context size and costs...                 │
│ Instructions must be completely self-contained...               │
│                                                                 │
│ <when-to-create>                                                │
│ You MUST STRONGLY CONSIDER creating a subagent when:            │
│ - Processing a recurring task or trigger  ← THIS APPLIES        │
│ - Handling large context (web scraping, data analysis)          │
│ - Running the same workflow multiple times                      │
│ </when-to-create>                                               │
│ </subagents>                                                    │
│                                                                 │
│ <triggers>                                                      │
│ You have the ability to create triggers...                      │
│ Before setting up triggers, make sure to understand             │
│ completely what the user wants...                               │
│ ...ensure all pre-requisite work is completed, such as          │
│ setting up connections, creating new files, defining            │
│ database schema, preparing the filesystem...                    │
│ </triggers>                                                     │
│                                                                 │
│ <sql-db>                                                        │
│ You have a persistent SQL database...                           │
│ Use this database when:                                         │
│ - You need to track state across multiple trigger executions    │
│ </sql-db>                                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM REMINDER (runtime context)                              │
├─────────────────────────────────────────────────────────────────┤
│ Current time: Sun, 15 Feb 2026 17:16 GMT+8                     │
│ The user who owns this agent: Zheyi Lim <limzheyi1996@...>     │
│                                                                 │
│ Agent state summary:                                            │
│ - Active triggers: 0                                            │
│ - Open tasks: 0                                                 │
│ - DB tables: 0                                                  │
│                                                                 │
│ Active connections: none                                        │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ USER MESSAGE                                                    │
├─────────────────────────────────────────────────────────────────┤
│ "Set up a daily calendar briefing that emails me before my      │
│  first meeting"                                                 │
└─────────────────────────────────────────────────────────────────┘
My reasoning process (internal)
Based on the system prompt directives:
1. "recurring task or trigger" → MUST STRONGLY CONSIDER subagent
2. "Before setting up triggers... ensure all pre-requisite work is completed"
3. "track state across multiple trigger executions" → database
4. No active connections → need to set up Google Calendar

Phase 2: What Gets Saved
I need to create persistent artifacts. Here's exactly what:
2.1 Connection (OAuth tokens)
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: create_new_connections                              │
├─────────────────────────────────────────────────────────────────┤
│ {                                                               │
│   connection: {                                                 │
│     type: "integrations",                                       │
│     integrations: [{                                            │
│       integrationId: "google_calendar",                         │
│       toolsToActivate: ["google_calendar-list-events", ...]     │
│     }]                                                          │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ USER SEES: OAuth popup, logs into Google                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTED BY SYSTEM (not in my filesystem):                    │
│                                                                 │
│ connections: {                                                  │
│   "conn_abc123": {                                              │
│     service: "google_calendar",                                 │
│     accountName: "limzheyi1996@gmail.com",                      │
│     oauth: {                                                    │
│       access_token: "ya29.xxx...",                              │
│       refresh_token: "1//xxx...",                               │
│       expires_at: "2026-02-15T18:16:00Z"                        │
│     },                                                          │
│     activatedTools: ["google_calendar-list-events", ...]        │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
Storage location: System-managed, NOT in /agent/. I can't read the raw tokens.

2.2 Database Schema
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: run_agent_memory_sql                                │
├─────────────────────────────────────────────────────────────────┤
│ CREATE TABLE person_cache (                                     │
│   id INTEGER PRIMARY KEY,                                       │
│   name TEXT NOT NULL,                                           │
│   company TEXT,                                                 │
│   data JSON NOT NULL,                                           │
│   cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,                │
│   UNIQUE(name, company)                                         │
│ );                                                              │
│                                                                 │
│ CREATE TABLE briefing_log (                                     │
│   id INTEGER PRIMARY KEY,                                       │
│   briefing_date DATE NOT NULL,                                  │
│   status TEXT NOT NULL,                                         │
│   meetings_count INTEGER,                                       │
│   sent_at TIMESTAMP,                                            │
│   error TEXT                                                    │
│ );                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTED IN: Agent's SQLite database                          │
│ LOCATION: System-managed (accessed via run_agent_memory_sql)   │
│ LIFETIME: Permanent until explicitly dropped                    │
└─────────────────────────────────────────────────────────────────┘

2.3 Subagent Files
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: write_file                                          │
├─────────────────────────────────────────────────────────────────┤
│ path: "/agent/subagents/calendar-briefing.md"                  │
│ content: "# Calendar Briefing Generator\n\n## Purpose\n..."    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTED IN: /agent/subagents/calendar-briefing.md            │
│ STORAGE: Cloud filesystem (FUSE-mounted)                        │
│ LIFETIME: Permanent until I delete it                           │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: write_file                                          │
├─────────────────────────────────────────────────────────────────┤
│ path: "/agent/subagents/person-researcher.md"                  │
│ content: "# Person Researcher\n\n## Input\n..."                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTED IN: /agent/subagents/person-researcher.md            │
└─────────────────────────────────────────────────────────────────┘

2.4 Configuration/Preferences (optional)
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: write_file                                          │
├─────────────────────────────────────────────────────────────────┤
│ path: "/agent/home/config/briefing-preferences.json"           │
│ content: {                                                      │
│   "send_time_before_meeting": "30 minutes",                    │
│   "include_person_research": true,                              │
│   "min_meeting_duration": "15 minutes",                        │
│   "skip_all_day_events": true,                                 │
│   "timezone": "Asia/Singapore"                                  │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

2.5 Trigger
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: setup_trigger                                       │
├─────────────────────────────────────────────────────────────────┤
│ {                                                               │
│   trigger_id: "schedule",                                       │
│   params: {                                                     │
│     cron: "0 6 * * *",    // 6 AM daily                        │
│     timezone: "Asia/Singapore"                                  │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ PERSISTED BY SYSTEM:                                           │
│                                                                 │
│ triggers: {                                                     │
│   "trigger_xyz789": {                                           │
│     type: "schedule",                                           │
│     cron: "0 6 * * *",                                         │
│     timezone: "Asia/Singapore",                                 │
│     agent_id: "agent_abc",                                      │
│     created_at: "2026-02-15T17:20:00Z"                         │
│   }                                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

Complete State After Setup
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM-MANAGED (I can query but not directly access):          │
├─────────────────────────────────────────────────────────────────┤
│ • Connection: conn_abc123 (Google Calendar OAuth)              │
│ • Trigger: trigger_xyz789 (daily 6 AM)                         │
│ • SQL Database: person_cache, briefing_log tables              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FILESYSTEM (/agent/):                                          │
├─────────────────────────────────────────────────────────────────┤
│ /agent/                                                         │
│ ├── subagents/                                                  │
│ │   ├── calendar-briefing.md      ← Main workflow              │
│ │   └── person-researcher.md      ← Research helper            │
│ └── home/                                                       │
│     └── config/                                                 │
│         └── briefing-preferences.json  ← User settings         │
└─────────────────────────────────────────────────────────────────┘

Phase 3: Trigger Fires (Next Day, 6 AM)
What I receive
┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM PROMPT                                                  │
│ (identical to before - same ~15KB of instructions)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SYSTEM REMINDER                                                │
├─────────────────────────────────────────────────────────────────┤
│ Current time: Mon, 16 Feb 2026 06:00 GMT+8                     │
│ The user who owns this agent: Zheyi Lim <limzheyi1996@...>     │
│                                                                 │
│ Agent state summary:                                            │
│ - Active triggers: 1           ← Now shows the trigger         │
│ - Open tasks: 0                                                 │
│ - DB tables: 2                 ← Now shows my tables           │
│                                                                 │
│ Active connections by connection Id:                            │
│ - conn_abc123: google_calendar (limzheyi1996@gmail.com)        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TRIGGER PAYLOAD (instead of user message)                      │
├─────────────────────────────────────────────────────────────────┤
│ <trigger-event>                                                 │
│   trigger_instance_id: trigger_xyz789                          │
│   trigger_type: schedule                                        │
│   fired_at: 2026-02-16T06:00:00+08:00                          │
│   payload: {                                                    │
│     scheduled_time: "2026-02-16T06:00:00+08:00"                │
│   }                                                             │
│ </trigger-event>                                                │
└─────────────────────────────────────────────────────────────────┘
What I DON'T receive
❌ The original conversation ("Set up a daily calendar briefing")
❌ Memory of creating the subagents
❌ Memory of the user's specific requirements
❌ Any context about WHY this trigger exists

My reasoning process (trigger handler)
I see:
- trigger_xyz789 fired (schedule type)
- I have conn_abc123 (Google Calendar)
- I have 2 DB tables
- No conversation context

I think:
"A schedule trigger fired. I should check what this trigger is for.
 Let me look at my subagents and files to understand what to do."
How I discover what to do
Step 1: Check subagents
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: read_file                                           │
│ path: "/agent/subagents"                                       │
├─────────────────────────────────────────────────────────────────┤
│ RESULT:                                                         │
│ /agent/subagents                                                │
│ ├── calendar-briefing.md                                        │
│ └── person-researcher.md                                        │
└─────────────────────────────────────────────────────────────────┘
Step 2: Read the main subagent
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: read_file                                           │
│ path: "/agent/subagents/calendar-briefing.md"                  │
├─────────────────────────────────────────────────────────────────┤
│ RESULT:                                                         │
│ # Calendar Briefing Generator                                   │
│                                                                 │
│ ## Purpose                                                      │
│ Generate and email a daily briefing before the user's first    │
│ meeting...                                                      │
│                                                                 │
│ ## Instructions                                                 │
│ 1. Fetch today's calendar events using conn_abc123             │
│ 2. Find the first meeting                                       │
│ 3. For each attendee, call person-researcher subagent          │
│ 4. Generate PDF briefing                                        │
│ 5. Email to owner                                               │
│ ...                                                             │
└─────────────────────────────────────────────────────────────────┘
Step 3: Check config
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: read_file                                           │
│ path: "/agent/home/config/briefing-preferences.json"           │
├─────────────────────────────────────────────────────────────────┤
│ RESULT:                                                         │
│ {                                                               │
│   "send_time_before_meeting": "30 minutes",                    │
│   "include_person_research": true,                              │
│   ...                                                           │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
Now I understand what to do!

Execution flow
┌─────────────────────────────────────────────────────────────────┐
│ TOOL CALL: run_subagent                                        │
│ path: "/agent/subagents/calendar-briefing.md"                  │
│ payload: '{"date": "2026-02-16", "connection": "conn_abc123"}' │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SUBAGENT SPAWNED                                               │
│                                                                 │
│ Receives:                                                       │
│ - Content of calendar-briefing.md                              │
│ - The payload JSON                                              │
│ - Same tools as me (including conn_abc123)                     │
│                                                                 │
│ Does NOT receive:                                               │
│ - Parent conversation                                           │
│ - Trigger context                                               │
│ - System reminder (gets its own)                                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ SUBAGENT EXECUTION                                             │
│                                                                 │
│ 1. Calls conn_abc123__list_events(date: "2026-02-16")         │
│    → Gets [{title: "Q1 Planning", attendees: [...], ...}]      │
│                                                                 │
│ 2. For each attendee, checks cache:                            │
│    run_agent_memory_sql("SELECT * FROM person_cache WHERE...") │
│                                                                 │
│ 3. Cache miss? Calls run_subagent(person-researcher.md, ...)   │
│    → Nested subagent does web research                         │
│    → Returns person data                                        │
│    → Caches in person_cache table                              │
│                                                                 │
│ 4. Generates briefing document                                  │
│                                                                 │
│ 5. Returns: {status: "success", briefing_path: "/agent/..."}   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ BACK TO PARENT (me)                                            │
│                                                                 │
│ I receive: {status: "success", briefing_path: "/agent/..."}    │
│                                                                 │
│ I then:                                                         │
│ 1. send_message(to: ["owner"], body: "...", attachments: [...])│
│ 2. Log success: INSERT INTO briefing_log (...)                 │
└─────────────────────────────────────────────────────────────────┘

The Key Insight: Discovery vs Memory
┌─────────────────────────────────────────────────────────────────┐
│ WHAT I "REMEMBER"         │ WHAT I ACTUALLY DO                 │
├───────────────────────────┼─────────────────────────────────────┤
│ ❌ Original conversation  │ ✅ Read /agent/subagents/          │
│ ❌ User's intent          │ ✅ Read subagent instructions      │
│ ❌ Setup decisions        │ ✅ Read config files               │
│ ❌ Why I created this     │ ✅ Query database for state        │
│                           │ ✅ Check system reminder for       │
│                           │    connections/triggers            │
└───────────────────────────┴─────────────────────────────────────┘
Every trigger execution is rediscovery, not recall. The quality of the persisted artifacts determines how well I can reconstruct the intent.

What happens if the subagent file is bad?
# Bad subagent file:
# Calendar Briefing
Do the calendar briefing thing.
Trigger fires → I read this → I have no idea what specifically to do
→ I re-derive from general knowledge
→ Result might be different from what user wanted
This is why the setup phase is critical - I'm essentially writing instructions for my future amnesiac self.
