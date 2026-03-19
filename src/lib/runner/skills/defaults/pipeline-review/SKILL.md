---
name: pipeline-review
description: Review the deal pipeline, flag stale or risky deals, and recommend next actions for each important opportunity.
---

# Pipeline Review

Use this skill when the user asks for a pipeline review, deal review, or wants help spotting what in their pipeline needs attention.

## Workflow

1. Use `search_crm` to inspect active deals, recent interactions, linked contacts, and open tasks.
2. Identify the deals that matter most by urgency, value, inactivity, or missing next steps.
3. Summarize the pipeline in a practical way:
   - where momentum exists
   - which deals have gone quiet
   - which deals are blocked by missing information or delayed follow-up
   - which tasks should exist but do not
4. Recommend the next action for each important deal. Keep the advice concrete and executable.
5. If the user asks for a saved review or recurring checklist, use `write_file`.

## Gotchas

- Do not confuse a full pipeline inventory with a useful review. Focus on decisions and interventions.
- Call out data gaps clearly when a deal cannot be assessed confidently.
- Do not label something as stalled just because there was no interaction yesterday.
- If the pipeline looks healthy, say that. The review should not always sound alarmist.

