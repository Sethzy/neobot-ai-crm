# Persistence and Cron Behavior - Verbatim Capture

Captured from user-provided text. Preserved as provided.

---

then add this.

Persistence

Question 2: How do you save it so it always reruns?
This is the critical insight: There's no automatic learning. Persistence is explicit.
What persists across sessions:
/agent/
├── home/           ← Files I create (scripts, templates, notes)
├── subagents/      ← Workflow instructions I write
└── [SQL database]  ← Schemas and data I define

+ Triggers          ← "When to run"
+ Connections       ← OAuth tokens, API configs
What does NOT persist:
* My "understanding" of your preferences (unless I write it down)
* Complex decision logic (unless encoded in subagents)
* This conversation (eventually truncates/ends)

The Real Persistence Pattern
When I build something like the calendar briefing, I'm actually creating a distributed encoding:
┌─────────────────────────────────────────────────────────────┐
│  TRIGGER                                                    │
│  "Run at 6 AM daily"                                        │
│  (persisted in trigger system)                              │
└─────────────────────┬───────────────────────────────────────┘
                      │ fires event
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  MAIN AGENT (me)                                            │
│  - Receives trigger payload                                 │
│  - Has system prompt + tools                                │
│  - But NO memory of how we built this...                    │
│                                                             │
│  UNLESS I read:                                             │
│    /agent/subagents/calendar-briefing.md  ← Instructions    │
│    /agent/home/preferences.md             ← User prefs      │
│    SQL: SELECT * FROM briefing_config     ← Settings        │
└─────────────────────┬───────────────────────────────────────┘
                      │ delegates to
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  SUBAGENT: /agent/subagents/person-researcher.md           │
│  - Contains detailed instructions I wrote                   │
│  - "Search LinkedIn, then company site, then news..."       │
│  - Encodes the HOW explicitly in text                       │
└─────────────────────────────────────────────────────────────┘

The Honest Truth
When a trigger fires tomorrow at 6 AM:
1. I wake up with amnesia - Fresh context, no memory of this conversation
2. I see the trigger payload - "calendar_briefing fired"
3. I must reconstruct intent from:
    * Subagent files I previously created
    * Database records
    * File contents in /agent/home/
    * The trigger's configuration
If I didn't write good subagent instructions, or didn't persist the workflow details somewhere, I might handle it differently than we discussed - because I'm re-deriving from general knowledge, not replaying a recorded procedure.

This is why subagent quality matters enormously
A bad subagent:
# Person Researcher
Research people for meetings.
A good subagent:
# Person Researcher

## Context
Called before calendar briefings to gather attendee background.

## Instructions
1. Extract person name and company from payload
2. Search: "{name} {company} LinkedIn"
3. If LinkedIn found, extract: title, tenure, background
4. Search: "{name} {company}" for recent news
5. If no results after 3 searches, return partial data with confidence: low
6. Cache results in SQL table `person_cache` with 7-day TTL

## Output Format
Return JSON: {name, title, company, background, recent_news, confidence, sources}

## Error Handling
- Rate limited: wait 30s, retry once
- No results: return {confidence: "none", reason: "..."}
The second one encodes the knowledge explicitly so future-me can execute it reliably without re-deriving everything.

Summary
Question	Answer
How do I know how to do it?	Pre-trained knowledge + system prompt + conversation context
How does it persist?	Explicit encoding: subagent files, database, /agent/home/ files, triggers, connections
Is there automatic learning?	No. If I don't write it down, I forget it.
What makes reruns reliable?	Quality of the subagent instructions and persisted state
Does this explain the gap you were sensing? The "skills" framing is a bit misleading - it's really "instructions and tools" not "learned capabilities."
wait then how do your cron jobs work? Like, surely you're reruning some determinsitic workflwo
5:12 PM

Worked for 6s
▶
Ah, you've hit on a key architectural point! Let me clarify because there's a subtle but important distinction:
There is NO deterministic workflow engine
When a trigger fires, here's what actually happens:
┌──────────────────────────────────────────────────────────────┐
│  TRIGGER FIRES (6:00 AM)                                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  SYSTEM CONSTRUCTS A NEW CONVERSATION:                       │
│                                                              │
│  [System Prompt]     ← Same every time                       │
│  [System Reminder]   ← Current time, connections, state      │
│  [Trigger Payload]   ← "Your trigger 'calendar_briefing'     │
│                         fired. Payload: {event_data...}"     │
│                                                              │
│  Then invokes ME (Claude) to respond                         │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  I (LLM) DECIDE WHAT TO DO                                   │
│                                                              │
│  Based on:                                                   │
│  - The trigger name/payload                                  │
│  - My general knowledge                                      │
│  - Whatever I choose to read from disk                       │
└──────────────────────────────────────────────────────────────┘
There's no workflow definition that runs automatically. It's always me being invoked and making decisions.

So how does it stay consistent?
The "determinism" is emergent, not enforced:
Pattern 1: I rely on subagent instructions
Trigger fires
    ↓
I see: "calendar_briefing triggered"
    ↓
I think: "I should run my calendar briefing subagent"
    ↓
I call: run_subagent("/agent/subagents/calendar-briefing.md")
    ↓
Subagent follows its written instructions
The subagent file IS the "workflow definition" - but I still have to choose to invoke it.
Pattern 2: Convention over configuration
If you set up a trigger named calendar_briefing, future-me sees that name and infers: "This is probably for calendar briefings, let me check for a subagent or instructions..."
But this is inference, not determinism.

What could go wrong?
Day 1: We set up trigger, I create subagent
Day 30: Trigger fires
        I see "calendar_briefing"
        I think "I should make a calendar briefing"
        I FORGET there's a subagent
        I re-derive from scratch
        Result: Similar but not identical behavior
Or worse:
Day 30: Trigger fires
        I see "calendar_briefing"
        I check /agent/subagents/ - find calendar-briefing.md
        But the instructions are vague
        I interpret them differently than Day 1 me
        Result: Drift in behavior

How to maximize consistency
The more explicit the encoding, the more deterministic the behavior:
Approach	Determinism	Why
Vague trigger name only	🔴 Low	I re-derive everything each time
Trigger + subagent	🟡 Medium	I follow instructions, but interpretation varies
Trigger + detailed subagent + explicit config	🟢 High	Less room for interpretation
Trigger + subagent that runs a Python script	🟢🟢 Very High	Code is deterministic, I just invoke it
The most deterministic pattern
If you really want cron-job-like determinism:
# /agent/subagents/calendar-briefing.md

## Instructions
Run the script at /agent/home/scripts/calendar_briefing.py
Email the output to owner.
Only intervene if the script fails.
# /agent/home/scripts/calendar_briefing.py
# Actual deterministic code that does the work
Now the Python is deterministic, and I'm just the invoker. But even here, I still have to choose to run that subagent and follow those instructions.

The honest summary
What you might expect	What actually happens
Cron → runs workflow.yaml	Cron → invokes LLM → LLM decides what to do
Deterministic execution	Probabilistic execution guided by instructions
Workflow engine	Me, reading files and making judgment calls
The system trades determinism for flexibility. I can handle edge cases, adapt to failures, and deal with unexpected situations - but I might also drift or make different choices over time.
This is fundamentally different from traditional workflow automation. It's more like hiring a contractor who reads your SOPs each morning vs. running a script.
Does that clarify the architecture? The "rerun" is really "re-invoke the LLM with context that should lead to similar behavior."
i see, so what is in the subagent file?
5:13 PM

Worked for 1s
▶
Let me show you directly:

Worked for 3s
▶
No subagents exist yet (we haven't built anything). Let me create an example to show you exactly what one looks like:

Worked for 13s
▶
Here's what's in a subagent file:

Worked for 2s
▶
What a subagent file actually is
It's just a markdown file with instructions for another instance of me.
When I call:
run_subagent(path: "/agent/subagents/example-person-researcher.md", payload: '{"name": "Jane Smith", ...}')
The system:
1. Spawns a fresh LLM instance
2. Sends it the markdown content as its first message
3. Appends the payload data
4. Lets it run until it produces a final response
5. Returns that response to me

The anatomy:
Section	Purpose
Title + description	Helps me (parent) know what this subagent does
Input	Contract for what payload to send
Instructions	Step-by-step what the subagent should do
Output Format	Contract for what I expect back
Error Handling	How to handle edge cases (so behavior is consistent)
Caching	State management instructions
The key insight
A subagent is just me, reading a different prompt.
It has:
* ✅ All the same tools (web search, database, file access, etc.)
* ✅ Access to the same filesystem and database
* ❌ NO access to this conversation's context
* ❌ NO memory of previous runs
So the markdown file IS the "code" - it's natural language instructions that guide LLM behavior. The more specific and explicit the instructions, the more deterministic the execution.

Why this architecture?
Parent agent context: [████████████████████░░░░] 80% full

If I do all the research myself:
  - Context fills up fast
  - Can't process many people
  - Previous work gets truncated

If I use subagents:
  - Each runs in fresh context
  - Only the final result comes back
  - Parent stays lean
It's context management + "function extraction" in natural language.
Want me to demonstrate running this subagent so you can see the actual invocation?
