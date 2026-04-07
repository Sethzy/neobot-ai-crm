# How to turn your OpenClaw into the world's best assistant

**Author:** Ryan Carson (@ryancarson)
**Published:** Apr 3, 2026
**Source:** X / Twitter Article
**Repo:** https://github.com/snarktank/clawchief

---

I turned my @openclaw into the most effective assistant and chief of staff I've ever worked with.

I've hired executive assistants in previous companies, and I'm honestly blown away by how well this works.

If you want the shortcut, start here:
http://github.com/snarktank/clawchief

## What it can do

- Schedule meetings for me
- Parse booking links and book workable times
- Check my inbox every 15 minutes and surface only what matters
- Proactively follow up on emails that didn't get a reply
- Watch my calendar, flag conflicts, and warn me about upcoming events
- Run my day from one canonical markdown task list
- Prep my task list before I wake up
- Keep tasks clean by avoiding duplicate entries
- Update my outreach tracker / CRM based on email activity
- Research suppliers or partners and reach out to them
- Send me short, high-signal updates only when action is needed
- Work from durable context in files, memory, Gmail, Calendar, and Sheets
- Adapt to my business, my preferences, and my operating style

## Credit

A lot of the ideas for the priority map, auto-resolver, and ingestion pipeline were inspired by @pedroh96 OpenClaw setup, which he talked about on Core Memory with @ashleevance at youtube.com/watch?v=9ZbbxSgrjhw&t=3847s

## Repo Structure

```
clawchief/
├── README.md
├── clawchief/
│   ├── priority-map.md
│   ├── auto-resolver.md
│   ├── meeting-notes.md
│   ├── tasks.md
│   └── tasks-completed.md
├── skills/
│   ├── business-development/
│   │   └── SKILL.md
│   ├── daily-task-manager/
│   │   └── SKILL.md
│   ├── daily-task-prep/
│   │   └── SKILL.md
│   └── executive-assistant/
│       └── SKILL.md
├── workspace/
│   ├── HEARTBEAT.md
│   ├── TOOLS.md
│   ├── memory/
│   │   └── meeting-notes-state.json
│   └── tasks/
└── cron/
    └── jobs.template.json
```

## Step 1: Start with a working OpenClaw install

Before you do anything with clawchief, make sure OpenClaw itself is already installed and working.

clawchief is not a replacement for OpenClaw.
It's an operating layer on top of it.

## Step 2: Get GOG working first

This setup expects gog to work for:

- Gmail message search
- Calendar list and event reads
- Google Sheets metadata reads
- Google Docs reads (if you want meeting-notes ingestion)

If those are broken, your assistant won't be able to do real executive-assistant work reliably.

## Step 3: Install the skills

Copy these skill directories into ~/.openclaw/skills/

```
/executive-assistant
/business-development
/daily-task-manager
/daily-task-prep
```

These are the behavioral building blocks.

They teach OpenClaw how to:
- act like an executive assistant
- manage a real task list
- prepare the day proactively
- handle operational business-development workflows

## Step 4: Install the workspace files

Copy these into ~/.openclaw/workspace/

```
clawchief/
/HEARTBEAT.md
/TOOLS.md
/memory/meeting-notes-state.json
```

### Why HEARTBEAT.md matters

This file tells the assistant how to be proactive.
It tells the assistant to:
- read the priority map
- read the auto-resolver
- read the meeting-notes policy + ledger
- read the live task file
- run the right workflow
- only message me when something actually matters

That's how you stop your assistant from being passive without turning it into a noisy mess.

### Why TOOLS.md matters

This is where I keep environment-specific notes.

For example:
- preferred email accounts
- tracker / Google Sheets notes
- local environment quirks
- target-market notes
- tactical operating rules I don't want buried in prompts

### Why clawchief/tasks.md matters

This is one of the most important files in the whole system.

I keep one canonical markdown task list.

That means when the assistant checks what matters today, it's looking at one live source of truth instead of guessing from stale conversation history.

## Step 5: Create your private context files

Customize these heavily:

- AGENTS.md
- SOUL.md
- USER.md
- IDENTITY.md
- MEMORY.md
- memory/

This is where OpenClaw becomes your assistant instead of mine.

These files define:
- who the human is
- who the assistant is
- tone and boundaries
- personal and business preferences
- long-term memory
- continuity across sessions

If you skip this step, you'll have a decent template.
If you do it well, you'll have something that feels personal, grounded, and increasingly excellent.

## Step 6: Replace every placeholder

The repo includes placeholders for the obvious things:
- owner name
- assistant name
- assistant email
- primary work email
- personal email
- business name
- business URL
- timezone
- primary update channel
- primary update target
- Google Sheet ID
- target market
- target geography

Then customize these files for your real world:
- workspace/TOOLS.md
- clawchief/priority-map.md
- clawchief/tasks.md
- skills/business-development/resources/partners.md
- cron/jobs.template.json

## Step 7: Set up cron jobs

This is where the assistant starts to feel alive.

The repo includes a cron template.

The recommended starting jobs are:
- executive assistant sweep
- daily task prep
- daily business-development sourcing

You can add optional jobs later, like backups or self-update.

The important point is this:

The assistant becomes dramatically more useful when it wakes itself up to do recurring work.

That's what shifts it from reactive to proactive.

## Step 8: Validate the install

Use the checklist in the repo and make sure the whole system works end to end.

A real install means the assistant can:
- read the source-of-truth files correctly
- route proactive updates to the right place
- use Gmail message-level search
- check all relevant calendars before booking
- treat the tracker / sheet as the live outreach source of truth
- promote due-today items into ## Today
- archive prior-day completions
- ingest meeting notes into real tasks and follow-ups

If those behaviors are not working, you're not done.

## My advice if you want this to be amazing

Use clawchief as the starting point, not the finish line.

The best version of this setup will reflect your actual world:
- your inboxes
- your calendars
- your preferred channels
- your task habits
- your business workflows
- your memory model
- your tolerance for interruptions

The more you customize it, the more valuable it becomes.

Generic assistants are generic because they are under-configured.

Great assistants are opinionated, specific, and deeply shaped around one person's operating reality.

## Final thought

I didn't get the world's best assistant by asking OpenClaw better questions.

I got it by giving OpenClaw a better operating system.

That's what clawchief is.

If you want the shortcut, start here:
http://github.com/snarktank/clawchief

If you want to do it properly, use the repo, customize it aggressively, and make your assistant responsible for real recurring work.

That's when things get interesting.
