---
name: call-summary
description: Turn call notes or a meeting recap into a clear summary with decisions, follow-ups, and what should happen next.
---

# Call Summary

Use this skill when the user shares notes from a call, asks for a recap, or wants help turning a conversation into a structured next-step summary.

## Workflow

1. Read the conversation notes carefully and identify the core facts before summarizing.
2. If the relevant contact or deal is unclear, use `search_crm` to anchor the summary to the right person or opportunity.
3. Produce a compact recap with:
   - what happened
   - what was decided
   - open questions or unresolved issues
   - specific follow-ups and owners where possible
   - what the user should do next
4. If the user wants the notes saved or turned into a reusable record, use `write_file` with a descriptive filename.

## Gotchas

- Do not invent commitments that were not actually made.
- Keep the summary tighter than the raw notes. Distillation is the job.
- If the notes are ambiguous, surface the ambiguity instead of pretending it is resolved.
- Distinguish between agreed actions and suggested next actions.

