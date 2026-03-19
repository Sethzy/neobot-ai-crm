---
name: call-prep
description: Prepare for a client call or meeting with CRM history, property context, and focused talking points.
---

# Call Prep

Use this skill when the user asks for call prep, meeting prep, or a quick brief before speaking with a client, prospect, landlord, or buyer.

## Workflow

1. Use `search_crm` first to find the relevant contact, deal, recent interactions, open tasks, and any recorded preferences.
2. If a property, project, district, or market topic is involved, use `web_search` to gather recent context that could change the conversation.
3. Build a practical brief with:
   - who the person is and how they relate to the current deal or workflow
   - recent history, promises made, and open loops
   - property or market context that matters for this conversation
   - 3-5 talking points
   - likely objections, concerns, or decision blockers
   - the clearest next step to secure before the call ends
4. If the user wants the brief saved for later, use `write_file` with a descriptive filename.

## Gotchas

- Separate known facts from reasonable inference. Do not blur them together.
- Do not drown the user in CRM history. Surface only what changes the conversation.
- If search results are ambiguous, say so and keep the brief conditional.
- If market facts may be stale, say that explicitly rather than sounding certain.

