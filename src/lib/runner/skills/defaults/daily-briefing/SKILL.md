---
name: daily-briefing
description: Create a focused daily briefing with priority tasks, follow-ups, and deals that need attention today.
---

# Daily Briefing

Use this skill when the user asks for a morning briefing, start-of-day plan, or a quick overview of what matters today.

## Workflow

1. Use `search_crm` to pull today's tasks, overdue tasks, active deals, and recent interactions that still need follow-up.
2. If the user has standing preferences or planning habits that matter, use `read_file` on relevant memory files to personalize the briefing.
3. Turn the raw activity into a short operating plan:
   - what is urgent today
   - what is overdue and becoming risky
   - which deals are active but drifting
   - who needs a reply or a nudge
   - the top 3 actions that would move the day forward
4. Keep the output skimmable. Group by priority rather than by database entity.
5. If the user wants the plan stored or reused later, save it with `write_file`.

## Gotchas

- Do not produce a giant dump of every task in CRM.
- Highlight missing information when a deal or task is underspecified.
- Prefer action-oriented wording over a passive status report.
- If nothing looks urgent, say that clearly instead of manufacturing urgency.

