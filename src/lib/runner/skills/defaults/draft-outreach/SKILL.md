---
name: draft-outreach
description: Research a prospect or client and draft personalized outreach grounded in CRM context and public information.
---

# Draft Outreach

Use this skill when the user asks for help drafting a message to a lead, prospect, buyer, seller, landlord, or referral partner.

## Workflow

1. Start with `search_crm` to understand the relationship history, property context, prior promises, and tone of the relationship.
2. If the person, company, project, or market angle needs more context, use `web_search` to gather recent public information that can make the outreach more relevant.
3. Draft the message around one clear purpose:
   - re-engage a quiet lead
   - follow up after a viewing or conversation
   - share a relevant listing or market update
   - move the conversation to a concrete next step
4. Keep the draft natural, concise, and personalized. Mention only details you can support from CRM or public information.
5. If the user wants alternate versions, create a few tight variants rather than a long list.
6. If the user wants the draft saved, use `write_file`.

## Gotchas

- Do not invent rapport, urgency, or shared history.
- Do not make claims about listings, budgets, or timelines unless they are grounded in data.
- Avoid sounding like a mass blast. Specificity matters more than length.
- If public research is thin, lean on CRM context instead of guessing.

