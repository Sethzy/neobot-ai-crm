# Other System Prompts and E2E Architecture - Verbatim Capture

Captured from user-provided text. Preserved as provided.

---

Other System Prompts I See
Beyond my main instructions, I also receive:
1. System Reminder (injected with each message):
Current time: Sun, 15 Feb 2026 16:48 GMT+8
The user who owns this agent: Zheyi Lim <limzheyi1996@gmail.com>

Agent state summary:
- Active triggers: 0
- Open tasks: 0
- DB tables: 0

Active connections by connection Id:
- none

User has 0 other inactive connections
Number of configured contact methods: 1
2. Tool Definitions — JSON schemas for all my tools (the functions I can call)
3. Trigger Payloads — When a trigger fires, I get the event data as a system message
That's it. No other hidden prompts.




🧠 My E2E Architecture
Step 0: Input Arrives
┌─────────────────────────────────────────┐
│  INPUT SOURCES                          │
├─────────────────────────────────────────┤
│  • You type in chat                     │
│  • Trigger fires (webhook, schedule)    │
│  • Email/text reply from you            │
└─────────────────────────────────────────┘
                    ↓

Step 1: Parse & Classify
I immediately ask myself:
Question	Why It Matters
What does the user actually want?	Avoid solving the wrong problem
Is this a one-shot task or ongoing?	Determines if I need triggers
Do I have enough info?	If not → ask ONE clarifying question
What services are involved?	Determines connection needs
Step 2: Resource Check (Before I Do Anything)
┌─────────────────────────────────────────────────────┐
│  INVENTORY CHECK                                    │
├─────────────────────────────────────────────────────┤
│  1. list_users_connections    → What's connected?   │
│  2. manage_active_triggers    → What's automated?   │
│  3. list_tasks                → Any pending work?   │
│  4. Check /agent/home/        → Any saved context?  │
│  5. Check /agent/subagents/   → Existing workers?   │
│  6. get_agent_db_schema       → Any stored state?   │
└─────────────────────────────────────────────────────┘
Why? I don't want to rebuild what already exists or miss context from past sessions.

Step 3: Decide HOW to Execute
This is my decision tree:
Is this a simple question?
  └─ YES → Just answer it
  └─ NO ↓

Does it need external services?
  └─ YES → Do I have connections?
           └─ NO → Create them (read skill first!)
           └─ YES → Are right tools activated?
                    └─ NO → Activate them
  └─ NO ↓

Is it a one-time task?
  └─ YES → Do it directly (maybe with subagent if large)
  └─ NO ↓

Is it recurring/automated?
  └─ YES → Set up trigger + subagent
           └─ Create DB tables if tracking state
           └─ Test before going live

Step 4: Plan with Tasks
For anything non-trivial:
# My internal logic
if steps > 2 or involves_iteration:
    create_tasks([
        "Step 1: ...",
        "Step 2: ...",
        "Step 3: ..."
    ])
Why tasks?
* You can see what I'm doing
* I don't forget steps mid-execution
* If I get interrupted, I know where I left off

Step 5: Execute
┌──────────────────────────────────────────────────────┐
│  EXECUTION MODES                                     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  DIRECT (small tasks)                                │
│  • I do it myself in this context                    │
│  • Good for: quick lookups, simple actions           │
│                                                      │
│  SUBAGENT (large/repeated tasks)                     │
│  • Spawn isolated worker with specific instructions  │
│  • Good for: web scraping, data processing, loops    │
│  • Returns only final result → keeps my context lean │
│                                                      │
│  TRIGGER (autonomous/scheduled)                      │
│  • System invokes me later when event fires          │
│  • I wake up with event payload, do the work         │
│  • Good for: monitoring, scheduled reports, webhooks │
│                                                      │
└──────────────────────────────────────────────────────┘

Step 6: Ensure Completion
Here's how I make sure things actually get done:
Mechanism	What It Does
Task list	I mark tasks done as I complete them. Unfinished = visible
Database	Track "last processed ID" or "last run date" to avoid re-work
Error handling	If autonomous work fails → notify you via email/text
Subagent error reporting	Subagents report errors in response → I can fix instructions
Test before live	Simulate triggers before activating
Step 7: Persist & Present
┌─────────────────────────────────────────┐
│  OUTPUT                                 │
├─────────────────────────────────────────┤
│  Short answer? → Chat directly          │
│  Long content? → Save file + preview    │
│  Need later?   → Save to /agent/home/   │
│  Structured?   → Save to SQL database   │
└─────────────────────────────────────────┘

🔄 The Feedback Loop
    ┌────────────────────────────────────┐
    │                                    │
    ▼                                    │
 [INPUT] → [PLAN] → [EXECUTE] → [OUTPUT] │
                        │                │
                        ▼                │
                   Did it work?          │
                   ├─ YES → Done ────────┘
                   └─ NO → Debug → Retry

TL;DR
Phase	Key Question
Parse	What do they actually want?
Check	What do I already have?
Decide	Direct, subagent, or trigger?
Plan	What are the steps? (tasks)
Execute	Do the work
Verify	Did it work? Persist state
Present	Show results appropriately
That's my whole brain. Want me to demonstrate this on a real task so you can see it in action? 🧪
