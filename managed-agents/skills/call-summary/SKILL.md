---
name: call-summary
description: "Summarizes a client call, extracts actions, and updates durable context. Use when the user shares call notes, meeting notes, or asks to turn a conversation into a structured summary."
---

# Call Summary

Process call notes or a meeting recap to extract action items, draft follow-up communications, and update records.

## How It Works

**Always available (works standalone)**
- Paste call notes, transcript, or describe what happened
- Extract key discussion points and decisions
- Identify action items with owners and due dates
- Surface objections, concerns, and open questions
- Draft client-facing follow-up message
- Generate internal summary

**Supercharged (when you connect your tools)**
- Email: send follow-up directly from draft
- Calendar: link to meeting, pull attendee context

---

## What I Need From You

**Option 1: Paste your notes**
Just paste whatever you have — bullet points, rough notes, stream of consciousness. I'll structure it.

**Option 2: Paste a transcript**
If you have a full transcript from a video call or recording, paste it. I'll extract the key moments.

**Option 3: Describe the call**
Tell me what happened: "Had a first meeting with John Tan. He's looking to buy in Bishan, budget around $1.2M. Main concern is stamp duty as a foreigner."

---

## Connectors (Optional)

| Connector | What It Adds |
|-----------|--------------|
| **Email** | Create follow-up draft directly in your inbox, or send if you approve |
| **Calendar** | Link to meeting, pull attendee context automatically |

> **No connectors?** No problem. CRM anchors the summary to the right contact and deal. I'll output the follow-up text for you to copy.

---

## Output

### Internal Summary
```markdown
## Call Summary: [Client Name] — [Date]

**Attendees:** [Names and roles]
**Call Type:** [Discovery / Follow-up / Negotiation / Check-in]
**Duration:** [If known]

### Key Discussion Points
1. [Topic] — [What was discussed, decisions made]
2. [Topic] — [Summary]

### Client Priorities
- [Priority 1 they expressed]
- [Priority 2]

### Objections / Concerns Raised
- [Concern] — [How you addressed it / status]

### Competing Offers / Alternatives
- [Any competing options, other agents, or alternative choices mentioned]

### Action Items
| Owner | Action | Due |
|-------|--------|-----|
| [You] | [Task] | [Date] |
| [Client] | [Task] | [Date] |

### Next Steps
- [Agreed next step with timeline]

### Deal Impact
- [How this call affects the deal — stage change, risk, acceleration]
```

### Client Follow-Up Message
```
Subject: [Meeting recap + next steps]

Hi [Name],

Thank you for taking the time to meet today...

[Key points discussed]

[Commitments you made]

[Clear next step with timeline]

Best,
[You]
```

---

## Email Style Guidelines

When drafting client-facing messages:

1. **Be concise but informative** — Get to the point quickly. Clients are busy.
2. **No markdown formatting** — Don't use asterisks, bold, or other markdown syntax. Write in plain text that looks natural in any email client.
3. **Use simple structure** — Short paragraphs, line breaks between sections.
4. **Keep it scannable** — If listing items, use plain dashes or numbers, not fancy formatting.

**Good:**
```
Here's what we discussed:
- Three options in the Bishan area within your budget
- Viewing schedule for this weekend
- Documents needed for the loan pre-approval
```

**Bad:**
```
**What We Discussed:**
- **Three options** in the Bishan area
```

---

## If Connectors Available

**CRM (always available):**
- Anchor summary to the right contact and deal
- Log the call as an interaction
- Create tasks for action items
- Update deal stage if warranted

**Email connected:**
- Offer to create a draft follow-up
- Or send directly if you approve

**Calendar connected:**
- Link summary to the calendar event
- Pull attendee names and context automatically

---

## Gotchas

- Do not invent commitments that were not actually made.
- Keep the summary tighter than the raw notes. Distillation is the job.
- If the notes are ambiguous, surface the ambiguity instead of pretending it is resolved.
- Distinguish between agreed actions and suggested next actions.

---

## Tips

1. **More detail = better output** — Even rough notes help. "They seemed concerned about X" is useful context.
2. **Name the attendees** — Helps me structure the summary and assign action items.
3. **Flag what matters** — If something was important, tell me: "The big thing was..."
4. **Tell me the deal stage** — Helps me tailor the follow-up tone and next steps.

---

## Related Skills

- **draft-outreach** — Draft a follow-up message based on the call
- **call-prep** — Prepare for the next call with this client
