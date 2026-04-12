---
name: daily-briefing
description: "Builds a daily briefing with priorities, follow-ups, meetings, and CRM context. Use when the user asks for a morning brief, daily plan, start-of-day summary, or what needs attention today."
---

# Daily Briefing

Get a clear view of what matters most today. This skill works with whatever you tell me, and gets richer when you connect your tools.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                      DAILY BRIEFING                              │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ CRM: pipeline alerts, tasks, deal health                    │
│  ✓ You tell me: today's meetings, key priorities                │
│  ✓ I organize: prioritized action plan for your day             │
│  ✓ Output: scannable 2-minute briefing                          │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Calendar: auto-pull today's meetings with attendees          │
│  + Email: unread from key clients, waiting on replies           │
│  + Chat: overnight messages, colleague updates                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Getting Started

When you run this skill, I'll ask for what I need:

**If no calendar connected:**
> "What meetings do you have today? (Just paste your calendar or list them)"

**If you have connectors:**
I'll pull everything automatically and just show you the briefing.

---

## Connectors (Optional)

Connect your tools to supercharge this skill:

| Connector | What It Adds |
|-----------|--------------|
| **Calendar** | Today's meetings with attendees, times, and context |
| **Email** | Unread from key clients, emails waiting on replies |
| **Chat** | Overnight messages, colleague updates about clients |

> **No connectors?** No problem. CRM has your pipeline and tasks. Tell me your meetings and I'll create your briefing.

---

## Output Format

```markdown
# Daily Briefing | [Day, Month Date]

---

## #1 Priority

**[Most important thing to do today]**
[Why it matters and what to do about it]

---

## Today's Numbers

| Active Deals | Pipeline Value | Closing This Month | Meetings Today |
|--------------|---------------|-------------------|----------------|
| [N] | $[Value] | [N] ($[Value]) | [N] |

---

## Today's Meetings

### [Time] — [Client Name] ([Meeting Type])
**Attendees:** [Names]
**Context:** [One-line: deal status, last touch, what's at stake]
**Prep:** [Quick action before this meeting]

### [Time] — [Client Name] ([Meeting Type])
**Attendees:** [Names]
**Context:** [One-line context]
**Prep:** [Quick action]

*Run call-prep for detailed meeting prep*

---

## Pipeline Alerts

### Needs Attention
| Deal | Stage | Value | Alert | Action |
|------|-------|-------|-------|--------|
| [Deal] | [Stage] | [Value] | [Why flagged] | [What to do] |

### Closing This Week
| Deal | Close Date | Value | Confidence | Blocker |
|------|------------|-------|------------|---------|
| [Deal] | [Date] | [Value] | [H/M/L] | [If any] |

---

## Email Priorities

### Needs Response
| From | Subject | Received |
|------|---------|----------|
| [Name] | [Subject] | [Time] |

### Waiting On Reply
| To | Subject | Sent | Days Waiting |
|----|---------|------|--------------|
| [Name] | [Subject] | [Date] | [N] |

---

## Suggested Actions

1. **[Action]** — [Why now]
2. **[Action]** — [Why now]
3. **[Action]** — [Why now]

---

*Run call-prep before your meetings*
*Run call-summary after each call*
```

---

## Execution Flow

### Step 1: Gather Context

**If connectors available:**
```
1. Calendar → Get today's events
   - Filter to client meetings
   - Pull: time, title, attendees, description

2. CRM → Query pipeline (always available)
   - Active deals
   - Flag: closing this week, no activity 7+ days, slipped dates
   - Get: overdue tasks, upcoming tasks

3. Email → Check priority messages
   - Unread from key client contacts
   - Sent messages with no reply (3+ days)

4. Chat → Check overnight messages (if available)
   - Client-related mentions
   - Colleague updates
```

**If no connectors:**
```
Ask user:
1. "What meetings do you have today?"
2. "Any deals closing soon or needing attention?"
3. "Anything urgent I should know about?"

Work with whatever they provide.
```

### Step 2: Prioritize

```
Priority ranking:
1. URGENT: Deal closing today/tomorrow not yet won
2. HIGH: Meeting today with high-value deal
3. HIGH: Unread message from key client
4. MEDIUM: Deal closing this week
5. MEDIUM: Stale deal (7+ days no activity)
6. LOW: Tasks due this week

Select #1 Priority:
- If meeting with important deal today → prep that
- If deal closing today → focus on close
- If urgent message from client → respond first
- Else → highest-value stale deal
```

### Step 3: Generate Briefing

```
Assemble sections based on available data:

1. #1 Priority — Always include (even if simple)
2. Today's Numbers — From CRM (always available)
3. Today's Meetings — From calendar or user input
4. Pipeline Alerts — From CRM (always available)
5. Email Priorities — If email connected
6. Suggested Actions — Always include top 3 actions
```

---

## Quick Mode

Say "quick brief" or "tldr my day" for abbreviated version:

```markdown
# Quick Brief | [Date]

**#1:** [Priority action]

**Meetings:** [N] — [Client 1], [Client 2], [Client 3]

**Alerts:**
- [Alert 1]
- [Alert 2]

**Do Now:** [Single most important action]
```

---

## End of Day Mode

Say "wrap up my day" or "end of day summary" after your last meeting:

```markdown
# End of Day | [Date]

**Completed:**
- [Meeting 1] — [Outcome]
- [Meeting 2] — [Outcome]

**Pipeline Changes:**
- [Deal] moved to [Stage]

**Tomorrow's Focus:**
- [Priority 1]
- [Priority 2]

**Open Loops:**
- [ ] [Unfinished item needing follow-up]
```

---

## Tips

1. **Connect your calendar first** — Biggest time saver
2. **Connect email second** — Unlocks message priorities
3. **Even without connectors** — CRM has your pipeline. Just tell me your meetings and I'll help prioritize

---

## Gotchas

- Do not produce a giant dump of every task in CRM. Focus on what's actionable.
- Highlight missing information when a deal or task is underspecified.
- Prefer action-oriented wording over a passive status report.
- If nothing looks urgent, say that clearly instead of manufacturing urgency.

---

## Related Skills

- **call-prep** — Deep prep for any specific meeting
- **call-summary** — Process notes after calls
- **pipeline-review** — Broader review of the full deal pipeline
