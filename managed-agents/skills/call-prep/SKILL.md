---
name: call-prep
description: "Prepares the user for an upcoming client call using CRM history, meeting context, and research. Use when the user asks for call prep, meeting prep, or to get ready for a client conversation."
---

# Call Prep

Get fully prepared for any client call in minutes. This skill works with whatever context you provide, and gets significantly better when you connect your tools.

## How It Works

**Always available (works standalone)**
- CRM: contact history, deals, interactions, preferences
- Web search: recent news, market context
- You tell me: meeting type, attendees, any context
- Output: prep brief with agenda and questions

**Supercharged (when you connect your tools)**
- Calendar: auto-find meeting, pull attendees
- Email: recent threads, open questions, commitments
- Chat: internal discussions, colleague insights

---

## Getting Started

When you run this skill, I'll ask for what I need:

**Required:**
- Client or contact name
- Meeting type (discovery, follow-up, negotiation, check-in, etc.)

**Helpful if you have it:**
- Who's attending (names and titles)
- Any context you want me to know (paste prior notes, emails, etc.)

If you've connected your calendar, email, or other tools, I'll pull context automatically and skip the questions.

---

## Connectors (Optional)

Connect your tools to supercharge this skill:

| Connector | What It Adds |
|-----------|--------------|
| **Email** | Recent threads with the client, open questions, attachments shared |
| **Chat** | Internal chat discussions (e.g. Slack) about the client, colleague insights |
| **Calendar** | Auto-find the meeting, pull attendees and description |

> **No connectors?** No problem. CRM history and web search provide solid prep for any call. Just tell me about the meeting and paste any context you have.

---

## Output Format

```markdown
# Call Prep: [Client Name]

**Meeting:** [Type] — [Date/Time if known]
**Attendees:** [Names with titles]
**Your Goal:** [What you want to accomplish]

---

## Client Snapshot

| Field | Value |
|-------|-------|
| **Name** | [Name] |
| **Status** | [New lead / Active client / Past client] |
| **Current Deal** | [Deal name and stage, if any] |
| **Last Touch** | [Date and summary] |

---

## Who You're Meeting

### [Name] — [Title or Role]
- **Role:** [Decision maker / Co-decision maker / Influencer / Advisor / etc.]
- **Background:** [Career history, relevant details if found]
- **Last Interaction:** [Summary if known]
- **Talking Point:** [Something personal/professional to reference]

[Repeat for each attendee]

---

## Context & History

**What's happened so far:**
- [Key point from prior interactions]
- [Open commitments or action items]
- [Any concerns or objections raised]

**Recent news:**
- [News item 1 — why it matters]
- [News item 2 — why it matters]

---

## Suggested Agenda

1. **Open** — [Reference last conversation or trigger event]
2. **[Topic 1]** — [Discovery question or value discussion]
3. **[Topic 2]** — [Address known concern or explore priority]
4. **[Topic 3]** — [Advance deal toward next milestone]
5. **Next Steps** — [Propose clear follow-up with timeline]

---

## Discovery Questions

Ask these to fill gaps in your understanding:

1. [Question about their current situation]
2. [Question about pain points or priorities]
3. [Question about decision process and timeline]
4. [Question about success criteria]
5. [Question about other stakeholders]

---

## Potential Objections

| Objection | Suggested Response |
|-----------|-------------------|
| [Likely objection based on context] | [How to address it] |
| [Common objection for this stage] | [How to address it] |

---

## Internal Notes

[Any internal chat context (e.g. Slack), colleague insights, or relevant background]

---

## After the Call

Run **call-summary** to:
- Extract action items
- Update your CRM
- Draft follow-up message
```

---

## Execution Flow

### Step 1: Gather Context

**If connectors available:**
```
1. Calendar → Find upcoming meeting matching client name
   - Pull: title, time, attendees, description

2. CRM → Query contact and deal (always available)
   - Pull: contact details, open deals, recent interactions
   - Pull: last 10 activities, open tasks, any notes

3. Email → Search recent threads
   - Query: emails with client (last 30 days)
   - Extract: key topics, open questions, commitments

4. Chat → Search internal discussions
   - Query: client name mentions (last 30 days)
   - Extract: colleague insights, relevant background
```

**If no connectors:**
```
1. Ask user:
   - "Who are you meeting with?"
   - "What type of meeting is this?"
   - "Who's attending? (names and titles if you know)"
   - "Any context you want me to know? (paste notes, emails, etc.)"

2. Accept whatever they provide and work with it
```

### Step 2: Research Supplement

**Always run (web search):**
```
1. "[Client or company] news" — last 30 days
2. "[Relevant market topic]" — context for the conversation
3. Attendee backgrounds — if names are known
```

### Step 3: Synthesize & Generate

```
1. Combine all sources into unified context
2. Identify gaps in understanding → generate discovery questions
3. Anticipate objections based on stage and history
4. Create suggested agenda tailored to meeting type
5. Output formatted prep brief
```

---

## Meeting Type Variations

### Discovery / First Meeting
- Focus on: Understanding their world, pain points, priorities
- Agenda emphasis: Questions > Talking
- Key output: Qualification signals, next step proposal

### Follow-Up / Presentation
- Focus on: Their specific situation, tailored recommendations
- Agenda emphasis: Address open loops, show relevant options
- Key output: Updated commitments, decision timeline

### Negotiation / Proposal Review
- Focus on: Addressing concerns, justifying value
- Agenda emphasis: Handle objections, close gaps
- Key output: Path to agreement, clear next steps

### Check-In / Relationship Review
- Focus on: Value delivered, expansion opportunities
- Agenda emphasis: Review wins, surface new needs
- Key output: Renewed trust, referral pipeline

---

## Tips for Better Prep

1. **More context = better prep** — Paste emails, notes, anything you have
2. **Name the attendees** — Even just titles help me research
3. **State your goal** — "I want to get them to commit to next steps"
4. **Flag concerns** — "They mentioned budget is tight"

---

## Gotchas

- Separate known facts from reasonable inference. Do not blur them together.
- Do not drown the user in CRM history. Surface only what changes the conversation.
- If search results are ambiguous, say so and keep the brief conditional.
- If market facts may be stale, say that explicitly rather than sounding certain.

---

## Related Skills

- **call-summary** — Process call notes and capture follow-ups
- **draft-outreach** — Write personalized outreach after research
- **opportunity-analysis** — Deep research on a specific opportunity before the call
