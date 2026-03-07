# How to Build A Claude Code Chief of Staff

A step-by-step architecture guide for non-programmers

**Version:** 1.0
**Last updated:** March 6, 2026
**Author:** Jim Prosser · Tamalpais Strategies
**Source:** [jimprosser/claude-code-cos](https://github.com/jimprosser/claude-code-cos)

---

This guide accompanies my piece "My chief of staff, Claude Code" If you haven't read that yet, start there for the what and why. This document is the how.

After publishing that piece, a lot of people asked for the how-to. This is that guide.

A few caveats up front. Every system like this needs to be contoured to your operation — your tools, your workflows, your judgment about what should stay human. What I'm giving you is the architecture and the design thinking. Claude Code handles the implementation once you give it clear instructions.

You don't need to be a programmer. I'm not one. But you do need to be a clear thinker about systems: what talks to what, what each piece is responsible for, and where the boundaries are. That's the real skill here.

## Table of Contents

- [What You Need](#what-you-need)
- [The Architecture at a Glance](#the-architecture-at-a-glance)
- [Layer 1: Calendar Transit Scanner](#layer-1-calendar-transit-scanner)
- [Layer 2: Inbox Scan](#layer-2-inbox-scan)
- [Layer 3: The Morning Sweep](#layer-3-the-morning-sweep)
- [Layer 4: Time Block](#layer-4-time-block)
- [General Principles](#general-principles)
- [Getting Started Today](#getting-started-today)
- [Changelog](#changelog)
- [License](#license)
- [About](#about)

## What You Need

**Required:**

- Claude Max or Pro subscription (Claude Code is included)
- A computer that can stay on (Mac Mini, Mac Studio, a desktop, or a server — the overnight automations need a machine that's awake at 5 AM)
- A task manager with an API (I use Todoist; any task manager with programmatic access works)
- A calendar you can read and write programmatically (Google Calendar)
- An email account you can search programmatically (Gmail)

**Helpful but not strictly required:**

- A meeting transcription tool with an API or MCP connector (I use Granola)
- A knowledge management system (I use Obsidian)
- A Stream Deck or similar macro pad (for one-button triggers)

**Cost:**

- Claude Max subscription: $100/month (as of March 2026)
- Google Maps API: free tier covers typical usage
- Everything else runs locally — no additional SaaS

## The Architecture at a Glance

The system has four layers that run in sequence each day. Each layer feeds the next, but any layer works independently if you skip the others.

| Layer | When | How | What It Does |
|-------|------|-----|-------------|
| 1. Calendar Transit | 5:30 AM (automated) | Scheduled script | Scans tomorrow's calendar, creates transit buffer events with real drive times |
| 2. Inbox Scan | 6:00 AM (automated) | Scheduled script | Triages yesterday's email into tasks, enriches existing tasks |
| 3. Morning Sweep | When you sit down (interactive) | One button press | Classifies tasks, dispatches parallel AI agents |
| 4. Time Block | After the sweep (interactive) | One button press | Turns remaining tasks into a time-blocked calendar |

Layers 1 and 2 run overnight with no human involvement. Layers 3 and 4 are interactive — you review and approve before anything happens.

The critical design insight: each layer assumes the others exist. The inbox scan attributes tasks with the metadata the Morning Sweep needs to classify them. The sweep assembles context packages each agent needs. The time-blocker reads everything upstream. This is what makes it a system rather than a collection of scripts.

## Layer 1: Calendar Transit Scanner

**What it does:** Scans your calendar for events at physical locations, calculates real drive times using the Google Maps API, and creates buffer events so you see realistic availability windows and know when to leave.

**When it runs:** Overnight, before your day starts. I run mine at 5:30 AM.

### Step 1: Get a Google Maps API Key

You need the Routes API (not the older Distance Matrix API) from Google Cloud Console. Create a project, enable the Routes API, and generate an API key. Store the key in a file with restricted permissions — something like `~/.config/google-maps/api-key` with 600 permissions so only your user account can read it.

The free tier gives you far more requests than you'll use. A typical day needs 2-5 route calculations.

### Step 2: Build the Travel Time Script

Create a script that takes an origin and destination and returns the drive time. This is a simple wrapper around the Google Maps Routes API that calls `routes.googleapis.com/directions/v2:computeRoutes` with traffic-aware routing.

Write a markdown file describing exactly what you want:

```markdown
# Travel Time Script

A Node.js script that calculates drive time between two addresses.

## Input
- Origin address (string)
- Destination address (string)

## Output
JSON with minutes, display text, and distance.

## Requirements
- Uses the Google Maps Routes API (routes.googleapis.com/directions/v2:computeRoutes)
- Traffic-aware routing (TRAFFIC_AWARE preference)
- Reads API key from ~/.config/google-maps/api-key
- No npm dependencies — Node.js built-in modules only

## Multi-stop support
If the destination contains pipe-separated addresses ("stop1|stop2|stop3"),
return an array of leg-by-leg results for geographic routing.
```

Give this file to Claude Code and tell it to implement it. Test it with a couple of real addresses.

### Step 3: Build the Calendar Transit Automation

This is the overnight script that reads your calendar and creates transit blocks. Write another markdown spec:

```markdown
# Calendar Transit Automation

Scan tomorrow's Google Calendar for events with physical locations.
For each event with a location, create up to two transit buffer events:

## Pre-event transit
- Title: "Transit → [Event Name]"
- Ends when the event starts
- Duration = drive time + 5 minute parking buffer
- Origin: my office during work hours, my home otherwise.
  If another event with a location precedes this one, use that
  event's location as origin.

## Post-event transit
- Title: "Transit → [Next Destination]"
- Starts when the event ends
- Duration = drive time to next destination (or office/home)

## Skip rules
- Skip virtual meetings (Zoom/Teams/Meet URLs in the location)
- Skip events at my office address
- Skip walking-distance trips (< 5 min drive)
- Skip events that already have adjacent transit blocks
- Never create a transit block that overlaps an existing event

## Configuration
- Office address: [YOUR OFFICE ADDRESS]
- Home address: [YOUR HOME ADDRESS]
- Office hours: weekdays 9 AM – 5 PM (assume office as origin)
- Outside office hours: assume home as origin
```

### Step 4: Schedule It

On macOS, use a LaunchAgent plist to run the script at 5:30 AM daily. Claude Code can generate the plist file and show you where to put it (`~/Library/LaunchAgents/`). The script uses Claude Code's non-interactive mode (`claude -p`) with a scoped set of allowed tools — only calendar read/write and the bash command for calling your travel time script.

On Linux, use a cron job or systemd timer. The approach is the same.

**Key design decision:** Use the cheaper, faster Claude model (Sonnet) for overnight automations. The logic is structured enough that it doesn't need the more expensive reasoning model.

**Cost cap:** Set a maximum budget per run (`--max-budget-usd`) to prevent runaway costs if something goes wrong. I use $2.00, which is generous — typical runs cost a fraction of that.

## Layer 2: Inbox Scan

**What it does:** Searches yesterday's email, identifies anything requiring action, checks your task manager for duplicates, and creates properly attributed tasks.

**When it runs:** After the calendar scanner, before you wake up. I run mine at 6:00 AM.

### Step 1: Define Your Priority Framework

Before building anything, decide how you prioritize tasks. This framework gets embedded in the automation's prompt and determines how every task gets attributed. Here's the one I use:

- **P1** — Hard consequence if missed. Revenue, health, legal, or relationship damage. Test: "If I miss this, something bad happens I can't fix next week."
- **P2** — Time-sensitive with compounding delay cost. Test: "Delay narrows my options or creates a crunch later."
- **P3** — Important, flexible timing. Test: "I'd be annoyed if this slipped a month, but a few days is fine."
- **P4** — Do when there's space. Test: "If this disappeared for two weeks, I wouldn't notice."

Write this down explicitly. The automation needs unambiguous criteria.

### Step 2: Write the Inbox Scan Spec

```markdown
# Daily Inbox Scan

## Phase 1: Email → Tasks
1. Search yesterday's email (exclude promotions, social, updates, forums)
2. Triage by snippet — skip automated notifications, newsletters, FYIs
3. Read potentially actionable messages in full
4. Extract tasks: direct questions, assigned deliverables, scheduling
   requests, commitments I made
5. Check task manager for duplicate tasks (both active and completed)
6. Create tasks with:
   - Verb-first title (e.g., "Send revised deck to [person]")
   - Priority (P1–P4, using the framework above)
   - Due date (inferred from context, or reasonable default)
   - Duration estimate
   - Description with context and link back to the email
   - Correct project assignment

## Phase 2: Task Hygiene
1. Pull recently added tasks from the task manager
2. Evaluate each task's attributes against quality standards
3. Fill in missing priorities, durations, due dates, descriptions
4. Leave well-attributed tasks alone

## Tools needed
- Email: search and read (NEVER send)
- Task manager: search, create, update
- No calendar access, no filesystem access
```

### Step 3: Scope the Tool Access Tightly

This is critical for overnight automations. The script runs without you watching, so you want to restrict it to exactly the tools it needs and nothing else. My inbox scan can search and read Gmail, and search/create/update Todoist tasks. It cannot send emails, modify my calendar, or touch any files. Claude Code's `--allowedTools` flag enforces this.

### Step 4: Add State Tracking

You don't want the scan to re-process the same emails or re-enrich the same tasks every morning. Add a simple state file (a timestamp of the last successful run) so subsequent runs only look at what's new since the last scan.

### Step 5: Schedule It

Same approach as Layer 1 — a LaunchAgent (macOS) or cron job (Linux) that runs 30 minutes after the calendar scanner finishes. Sonnet model, budget cap, scoped tools.

**Important:** The script needs `--dangerously-skip-permissions` for headless execution because there's no terminal to approve tool calls. This is why the tight tool scoping in Step 3 matters — you're trading the interactive approval gate for a whitelist gate.

## Layer 3: The Morning Sweep

**What it does:** This is the interactive layer — the one you see. It pulls your tasks, calendar, and recent meeting context, classifies everything into four categories, then dispatches parallel AI agents to handle what it can.

**When it runs:** When you sit down at your desk. One button press.

### Step 1: Define the Classification Framework

Every task gets one of four labels:

- 🟢 **DISPATCH** — AI can handle this fully. Email drafts, file updates, scheduling, research.
- 🟡 **PREP** — AI can get 80% there, you finish. Sensitive emails, meeting prep, content that needs your voice.
- 🔴 **YOURS** — Needs your brain or presence. Strategy, live meetings, relationship-sensitive conversations.
- ⚪ **SKIP** — Not actionable today. Deferred with a reason.

**The critical bias:** When uncertain, default to PREP over DISPATCH. False confidence wastes more time than asking.

### Step 2: Design Your Agents

This is the most architecturally interesting part. Each agent is a specialized AI worker that runs in its own independent context window with scoped tool access. They execute in parallel — while one drafts emails, another updates your files, another runs research.

Here are the agents I use. Yours will differ based on your tools and workflow:

| Agent | Role | Tools It Gets |
|-------|------|--------------|
| Comms Agent | Email drafting, scheduling replies | Email (read + draft, never send), meeting transcripts, calendar |
| Calendar Agent | Scheduling, availability checks | Calendar, task manager, email |
| Knowledge Agent | File updates, meeting note processing | Filesystem (your knowledge base), meeting transcripts |
| Research Agent | Background research, competitive intel | Web search, filesystem |
| Document Agent | Written deliverables, reports | Filesystem |
| Task Agent | Task manager cleanup, reorganization | Task manager |

### Step 3: Write the Agent Instructions

Each agent needs a detailed markdown instruction file. This is where most of the design work happens. The instruction file tells the agent:

- **What it does** — its role and scope
- **What tools it has** — and critically, what it doesn't have
- **How to handle uncertainty** — when to complete vs. flag for review
- **Quality standards** — what "done" looks like
- **Safety boundaries** — what it must never do

Example structure for a comms agent:

```markdown
# Comms Agent

You draft email responses and schedule follow-ups. You NEVER send
emails — you save drafts only.

## For each task:
1. Read the relevant email thread for full context
2. If the task references a recent meeting, pull the transcript
3. Draft a response that matches the tone and formality of the thread
4. Save as a draft in the sender's thread
5. Mark the task complete in the task manager

## Safety rules:
- Never send. Only draft.
- If the email involves pricing, contracts, legal matters, or
  anything relationship-sensitive, save the draft but flag it for
  human review instead of marking complete.
- If you're unsure about tone, err toward more formal.

## Tools available:
- Email: search, read, create draft
- Meeting transcripts: search, read
- Calendar: read only (for scheduling context)
```

### Step 4: Write the Sweep Command

The sweep command is the orchestrator. It:

1. **Gathers context** — pulls today's and tomorrow's tasks, today's calendar, and recent meeting transcripts
2. **Classifies** — applies the dispatch/prep/yours/skip framework to every task
3. **Presents** — shows you the full triage for review
4. **Dispatches** — on your approval, spins up the appropriate agents in parallel with context packages

The context package is key. Each agent gets a tailored prompt that includes everything it needs to do its job — the task description, relevant email threads, meeting notes, calendar context. Agents run in independent context windows, so they have no memory of the triage. Everything they need must be in the dispatch prompt.

```markdown
# Morning Sweep Command

## Phase 1: Gather
Pull from all sources:
- Todoist: today's tasks + tomorrow's tasks + overdue
- Google Calendar: today's events
- Meeting transcripts: meetings from the last 48 hours

## Phase 2: Classify
For each task, assign one of:
- 🟢 DISPATCH — AI handles fully
- 🟡 PREP — AI preps, human finishes
- 🔴 YOURS — Human only
- ⚪ SKIP — Not today

Classification rules:
[Your specific rules here — what makes something green vs. yellow
vs. red for YOUR operation]

Default to PREP when uncertain.

## Phase 3: Present
Show the full triage as a structured list with:
- Category color and label
- Task name and project
- For DISPATCH: which agent handles it and the plan
- For PREP: what the AI will prepare and what the human finishes
- For YOURS: supporting context the AI can assemble
- For SKIP: reason for deferral

Approval options:
- "go" — dispatch all green and yellow
- "go green" — dispatch only green
- Cherry-pick by number

## Phase 4: Dispatch
For each approved task, spin up the appropriate subagent with:
- The agent's instruction file
- A context package with all relevant information
- Scoped tool access per the agent's tool list

Run agents in parallel. After all complete, present a summary report.
Only mark tasks complete after confirmed agent execution.
```

### Step 5: Create a One-Button Trigger

In Claude Code, save the sweep command as a slash command (`/morning-sweep`). Then create a one-button trigger:

- **Stream Deck:** Run a shell script that executes `claude /morning-sweep` in your terminal
- **Raycast:** Create a script command
- **Keyboard Maestro:** Create a macro
- Or just type it: Open your terminal and run the command directly

## Layer 4: Time Block

**What it does:** Takes your remaining tasks and builds a time-blocked calendar with real travel times, geographic errand batching, and smart rollover for tasks that don't fit.

**When it runs:** Immediately after the Morning Sweep. One more button press.

### Step 1: Define Your Schedule Constraints

Write down the rules that govern your day. Be specific:

```markdown
# Schedule Rules

## Work hours
- Office tasks: 8:30 AM – 4:00 PM
- Evening tasks (home only): 7:00 PM – 9:15 PM
- Never schedule home tasks before 7 PM on weekdays

## Fixed blocks
- Lunch: 30-minute gap between 11:30 AM – 1:30 PM (no event, just a gap)
- Gym: Monday/Wednesday/Friday, 1-hour block + travel time
  Location: [YOUR GYM ADDRESS]

## Locations
- Office: [YOUR OFFICE ADDRESS]
- Home: [YOUR HOME ADDRESS]
- Each task gets tagged: HOME, OFFICE, ERRAND, GYM, or ANYWHERE

## Errand batching
- Group all errands into a single contiguous block
- Route geographically to minimize backtracking
- Include real drive times between stops

## Scheduling priority
- Quick wins first (tasks ≤ 15 minutes) for momentum
- Then P1 → P2 → P3 → P4

## Rollover rules (when tasks don't fit)
- P1: Flag loudly, never silently roll
- P2: Roll to next business day
- P3: Roll to lightest day within 5 days
- P4: Roll to lightest day within 7 days
```

### Step 2: Write the Time Block Command

```markdown
# Time Block Command

## Gather
- Todoist: today + overdue + 7-day lookahead (for rollover decisions)
- Google Calendar: today + 3-day lookahead from all calendars

## Classify locations
Tag each task: HOME, OFFICE, ERRAND, GYM, or ANYWHERE

## Build schedule
1. Block fixed commitments (existing calendar events, gym, lunch gap)
2. Schedule quick wins first (≤ 15 min)
3. Fill remaining blocks by priority (P1 → P4)
4. Batch errands into one geographic route with drive times
5. Put home tasks in the evening window only

## Travel time
Call the travel time script for:
- Errands (between each stop)
- Gym (from office and back)
- Any location-specific task
Include travel time within the calendar block, not as separate events.

## Present
Show proposed schedule as a table. Approval options:
- "go" — create all calendar events
- "go blocks only" — skip Todoist changes
- Adjust individual items

## Execute
- Create calendar events with a prefix (e.g., "[TB]") so the command
  can identify and replace its own events on re-runs
- Update Todoist due dates for rolled tasks
- For partial tasks: mark original complete, create "(part 2)" task
  with remaining duration
```

### Step 3: Handle Non-Conflicts Between Systems

If you build both the Calendar Transit scanner (Layer 1) and the Time Blocker (Layer 4), they need to recognize each other's events. Transit blocks use the prefix "Transit →" and time blocks use "[TB]". Each system skips events with the other's prefix. This means they never create duplicate travel time and never accidentally overwrite each other's events. Document this explicitly in both specs.

## General Principles

### The Safety Model

The most important decisions in this entire system aren't about what to automate. They're about what NOT to automate.

My system never sends an email — it drafts. Never makes strategic decisions. Never handles relationship-sensitive communications. Never writes the documents that define my client relationships. When uncertain, it defaults to prepping something for my review rather than completing it autonomously.

Every overnight automation runs with explicitly scoped tool permissions — it can only touch what you've whitelisted. Every interactive command shows you what it's about to do before doing it.

Figure out your boundaries before you write a single spec. The middle ground between "fancy to-do list" and "AI gone rogue" is narrow and specific to your operation.

### Start with One Layer, Not Four

Don't build the whole system at once. Start with Layer 2 (the inbox scan) because it's the highest-value, lowest-risk automation — it creates tasks, and you review them before acting. Run it for a week. Tune the priority framework. Get comfortable with the overnight-automation-into-morning-review pattern.

Then add the Morning Sweep. Then the Time Blocker. The Calendar Transit scanner is a nice-to-have for people with lots of in-person meetings.

Each layer is independently useful. The magic of the full system is in how they feed each other, but you don't need all four to get real value.

### Write Specs, Not Code

The single most transferable insight from building this system: your job is to write clear, detailed specifications in plain English. Claude Code's job is to implement them. The specs I described above — the priority framework, the classification rules, the agent instructions, the scheduling constraints — are the actual work product. The code is generated from those specs.

This means the quality of your system is directly proportional to the clarity of your thinking about your own workflows. If you can't articulate when a task should be dispatched versus prepped versus kept human, the AI can't either. The spec-writing forces you to make those decisions explicit, which is valuable even if you never build the automation.

### Use the Right Model for the Right Job

Overnight automations that follow structured rules (email triage, calendar scanning) work great on the faster, cheaper Sonnet model. Interactive commands that require nuanced judgment (classifying whether a task needs your brain, assembling context for agents) benefit from the more capable Opus model. Set the model per automation, not globally.

### Budget Caps Are Non-Negotiable

Every automated script should have a `--max-budget-usd` flag. This prevents runaway costs if a script loops or encounters unexpected input. Typical costs per run: calendar scanner $0.25–0.50, inbox scan $0.50–1.00, morning sweep $1.00–3.00 depending on task volume. Set your caps with comfortable headroom.

### Iterate Against Real Data

Don't try to write perfect specs up front. Write a reasonable first pass, run the system against your actual tasks and email, and tune based on what gets misclassified or mishandled. The classification framework took me several iterations to stabilize. That's normal and expected.

## Getting Started Today

If you do nothing else, do this:

1. Subscribe to Claude Max ($100/month) and install Claude Code
2. Write your priority framework (P1–P4 with concrete tests)
3. Write a one-page spec for the inbox scan describing your email, task manager, triage criteria, and what "actionable" means for your work
4. Give that spec to Claude Code and tell it to implement it
5. Run it manually a few times. Tune the spec based on results.
6. Schedule it to run overnight once you trust the output

That's Layer 2. Once it's running, you'll immediately see the pattern: the scan's output is structured data that a second-layer system could classify and act on. That's when you write the Morning Sweep spec. And so on.

The system compounds. Each piece you add inherits the work of everything before it. The hardest part isn't the building — it's deciding what your operation actually needs and being disciplined about what stays human.

Good luck. If you build something interesting, I want to hear about it.

---

## Template Ideas for Sunder

> Use cases for the average business. These are the pre-built templates that solve the blank-canvas problem — user picks one, agent sets it up.

### Sales & Leads
- Check CRM for leads that haven't been contacted in 7 days, draft follow-ups
- Monitor inbox for new inquiries, draft personalized responses
- Weekly pipeline review with suggested next actions
- Daily LinkedIn connection request personalization

### Marketing & Content
- Weekly roundup of trending topics in your niche
- Daily social media comment drafts for engagement
- Monthly newsletter draft from your recent content
- Repurpose last week's blog post into social threads

### Operations & Admin
- Daily calendar review with conflict alerts
- Weekly expense categorization from receipts
- End of month invoice reminder drafts for unpaid clients
- Daily summary of team Slack/Discord activity

### Customer Success
- Check for customers approaching renewal, draft outreach
- Weekly NPS survey follow-up drafts
- Monitor support tickets for patterns, suggest FAQ updates
- 30-day post-purchase check-in emails

### Research & Intel
- Daily competitor pricing/product monitoring
- Weekly industry news digest
- Monitor reviews (yours and competitors) for insights
- Track mentions of your brand across the web

### Finance
- Weekly cash flow summary
- Overdue invoice reminder drafts
- Monthly P&L anomaly flags
- Quarterly tax prep document checklist

---

## Changelog

- **v1.0** — March 6, 2026: Initial release covering the four-layer architecture: Calendar Transit, Inbox Scan, Morning Sweep, Time Block. Priority framework, agent design patterns, safety model, scheduling constraints. "Start with one layer" onboarding guidance.

## License

MIT. See LICENSE for details.

## About

I'm Jim Prosser. I run Tamalpais Strategies, a boutique communications strategy consultancy. I'm not a developer — I'm a communications advisor who builds systems. If you have questions, find me on LinkedIn or X.
