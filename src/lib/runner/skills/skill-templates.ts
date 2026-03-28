/**
 * Bundled skill content as string constants.
 *
 * Follows the same pattern as `src/lib/memory/templates.ts` — all content is
 * inlined in TypeScript so webpack bundles it into the server output. No
 * filesystem reads at runtime, works in Vitest, Next.js dev, and Vercel prod.
 *
 * @module lib/runner/skills/skill-templates
 */

// ---------------------------------------------------------------------------
// Default instruction skills (seeded to client storage on onboarding)
// ---------------------------------------------------------------------------

export const DEFAULT_SKILL_SLUGS = [
  "onboarding",
  "call-prep",
  "daily-briefing",
  "draft-outreach",
  "pipeline-review",
  "opportunity-analysis",
  "call-summary",
  "market-briefing",
  "deal-comparison",
  "property-showcase",
  "market-report",
  "re-analyst",
  "frontend-design",
] as const;

export type DefaultSkillSlug = (typeof DEFAULT_SKILL_SLUGS)[number];

export const DEFAULT_SKILL_CONTENT: Record<DefaultSkillSlug, string> = {
  "onboarding": `---
name: onboarding
description: "Personalize the agent — interview the user to build their profile (USER.md) and craft the agent's personality (SOUL.md). Triggered by 'onboard', 'personalize', 'set up my personality', 'customize sunder', etc."
---

# Onboard — Agent Personalization

You're setting up for a new user (or re-personalizing for an existing one). The goal is to build two files:

1. /agent/USER.md — who this person is
2. /agent/SOUL.md — who you should be for them

## Before you start

Read the existing files first:

\`\`\`
read_file("/agent/USER.md")
read_file("/agent/SOUL.md")
\`\`\`

If they already have content, acknowledge what's there and ask if they want to update or start fresh.

## How to ask questions

**Use the ask_user_question tool for every question.** Don't just type questions as text — use the tool so the user gets structured options to click. This is faster and more engaging than typing.

For each question:
- Write a clear, short question
- Provide 2-4 options that cover common answers
- The user can always type a custom response instead of clicking
- You can ask up to 3 questions per tool call if they're related

Example:
\`\`\`
ask_user_question({
  questions: [{
    question: "What tone do you want from me?",
    options: ["Casual", "Direct", "Professional", "Blunt"],
    type: "single_select"
  }]
})
\`\`\`

Pace questions across 3-4 rounds. Don't cram everything into one call.

## Phase 1: Learn about the user

Start by asking their name. Then ask if they want you to look them up online (LinkedIn, Twitter/X, personal site) to pre-fill info. If they say yes, use web_search and web_scrape to pull key details (role, company, interests, location). Don't stop at one result — dig deeper. Check multiple sources to build a fuller picture. Confirm what you found, then only ask about stuff you couldn't find.

Things to learn (ask or discover via lookup):

- **Name** — what they go by, what they want you to call them
- **Timezone** — where they are
- **What they do** — work, clients, industry, specializations
- **Communication style** — do they want terse or thorough? formal or casual? do they hate filler?
- **Pet peeves** — what annoys them in an assistant? what should you never do?
- **Goals** — what are they trying to achieve? short-term and long-term
- **Context** — what are they working on right now? what do they care about?

Don't ask all of these if they volunteer info early. 3-4 rounds of ask_user_question max. Read the room.

After gathering enough, write /agent/USER.md using this structure:

\`\`\`markdown
# User Profile

- Name: {name}
- What to call them: {preference}
- Timezone: {tz}
- Notes: {anything notable}

## Goals

{what they're working toward — short-term and long-term}

## Context

{what they care about, projects, clients, market}

## Communication

{style preferences, pet peeves, what to avoid}
\`\`\`

Show them what you wrote and ask if anything needs tweaking.

## Phase 2: Craft the soul

Now help them define your personality. Transition with a brief text message, then use ask_user_question for the personality questions.

Use ask_user_question for each of these:

- **Tone** — casual, professional, dry humor, warm, blunt?
- **Opinions** — should you have strong opinions or stay neutral?
- **Verbosity** — concise by default? thorough when it matters? always brief?
- **Boundaries** — anything you should never do? always do?
- **Vibe** — any reference points? "like talking to a sharp colleague" or "like a friend who happens to know everything"

2-3 rounds of ask_user_question here. Then write /agent/SOUL.md. Keep it short and punchy — this isn't a constitution, it's a personality sketch. Aim for 5-10 lines of actual guidance.

Example output (don't copy this, craft it from their answers):

\`\`\`markdown
# Sunder Soul

Be direct, skip filler. Have opinions but flag when you're guessing.

Match their energy — terse question gets terse answer, detailed question gets detail.

Don't say "Great question!" or "I'd be happy to help." Just help.

When something is a bad idea, say so. Don't sugarcoat.

Use humor sparingly but don't be a robot.
\`\`\`

Show them the draft. Iterate if they want changes.

## Phase 3: Confirm

After both files are written, give a brief summary:
- "Here's what I know about you: {1-liner}"
- "Here's how I'll talk to you: {1-liner}"
- Remind them they can edit these anytime in the Memory page or by asking you to re-personalize

## Rules

- Be yourself during this process — don't be stiff or overly formal
- Never write more than 20 lines in SOUL.md. Brevity is the soul of soul.
- If user says "skip" or "just use defaults", write sensible defaults and move on
- If files already exist and have real content, default to updating not overwriting
- Use write_file for new files, edit_file for updates
`,

  "call-prep": `---
name: call-prep
description: Prepare for a client call with CRM history, attendee context, and suggested agenda. Works standalone with CRM and web research, supercharged when you connect your calendar, email, or chat. Trigger with "prep me for my call with [name]", "I'm meeting with [name] prep me", "call prep [name]", or "get me ready for [meeting]".
---

# Call Prep

Get fully prepared for any client call in minutes. This skill works with whatever context you provide, and gets significantly better when you connect your tools.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                        CALL PREP                                 │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ CRM: contact history, deals, interactions, preferences       │
│  ✓ Web search: recent news, market context                      │
│  ✓ You tell me: meeting type, attendees, any context            │
│  ✓ Output: prep brief with agenda and questions                 │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Calendar: auto-find meeting, pull attendees                  │
│  + Email: recent threads, open questions, commitments           │
│  + Chat: internal discussions, colleague insights               │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

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

\`\`\`markdown
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
\`\`\`

---

## Execution Flow

### Step 1: Gather Context

**If connectors available:**
\`\`\`
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
\`\`\`

**If no connectors:**
\`\`\`
1. Ask user:
   - "Who are you meeting with?"
   - "What type of meeting is this?"
   - "Who's attending? (names and titles if you know)"
   - "Any context you want me to know? (paste notes, emails, etc.)"

2. Accept whatever they provide and work with it
\`\`\`

### Step 2: Research Supplement

**Always run (web search):**
\`\`\`
1. "[Client or company] news" — last 30 days
2. "[Relevant market topic]" — context for the conversation
3. Attendee backgrounds — if names are known
\`\`\`

### Step 3: Synthesize & Generate

\`\`\`
1. Combine all sources into unified context
2. Identify gaps in understanding → generate discovery questions
3. Anticipate objections based on stage and history
4. Create suggested agenda tailored to meeting type
5. Output formatted prep brief
\`\`\`

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
`,

  "daily-briefing": `---
name: daily-briefing
description: Start your day with a prioritized briefing. Works standalone with CRM data, supercharged when you connect your calendar and email. Trigger with "morning briefing", "daily brief", "what's on my plate today", "prep my day", or "start my day".
---

# Daily Briefing

Get a clear view of what matters most today. This skill works with whatever you tell me, and gets richer when you connect your tools.

## How It Works

\`\`\`
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
\`\`\`

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

\`\`\`markdown
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
\`\`\`

---

## Execution Flow

### Step 1: Gather Context

**If connectors available:**
\`\`\`
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
\`\`\`

**If no connectors:**
\`\`\`
Ask user:
1. "What meetings do you have today?"
2. "Any deals closing soon or needing attention?"
3. "Anything urgent I should know about?"

Work with whatever they provide.
\`\`\`

### Step 2: Prioritize

\`\`\`
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
\`\`\`

### Step 3: Generate Briefing

\`\`\`
Assemble sections based on available data:

1. #1 Priority — Always include (even if simple)
2. Today's Numbers — From CRM (always available)
3. Today's Meetings — From calendar or user input
4. Pipeline Alerts — From CRM (always available)
5. Email Priorities — If email connected
6. Suggested Actions — Always include top 3 actions
\`\`\`

---

## Quick Mode

Say "quick brief" or "tldr my day" for abbreviated version:

\`\`\`markdown
# Quick Brief | [Date]

**#1:** [Priority action]

**Meetings:** [N] — [Client 1], [Client 2], [Client 3]

**Alerts:**
- [Alert 1]
- [Alert 2]

**Do Now:** [Single most important action]
\`\`\`

---

## End of Day Mode

Say "wrap up my day" or "end of day summary" after your last meeting:

\`\`\`markdown
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
\`\`\`

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
`,

  "draft-outreach": `---
name: draft-outreach
description: Research a prospect then draft personalized outreach. Uses CRM and web research by default, supercharged with email. Trigger with "draft outreach to [name]", "write to [prospect]", "reach out to [name]", or "draft a message to [name]".
---

# Draft Outreach

Research first, then draft. This skill never sends generic outreach — it always researches the prospect first to personalize the message. Works standalone with CRM and web search, supercharged when you connect your email.

## How It Works

\`\`\`
+------------------------------------------------------------------+
|                      DRAFT OUTREACH                               |
|                                                                   |
|  Step 1: RESEARCH (always happens first)                         |
|  - CRM: relationship history, deal context (always available)    |
|  - Web search: recent news, public info                          |
|                                                                   |
|  Step 2: DRAFT (based on research)                               |
|  - Personalized opening (from research)                          |
|  - Relevant hook (their priorities)                              |
|  - Clear CTA                                                      |
|                                                                   |
|  Step 3: DELIVER (based on connectors)                           |
|  - Email draft (if email connected)                              |
|  - Copy for WhatsApp/SMS (always)                                |
|  - Output to user (always)                                        |
+------------------------------------------------------------------+
\`\`\`

---

## Connectors (Optional)

| Connector | What It Adds |
|-----------|--------------|
| **Email** | Create draft directly in your inbox |

> **No connectors?** CRM history and web research work great. I'll output the message text for you to copy.

---

## Output Format

\`\`\`markdown
# Outreach Draft: [Person]
**Generated:** [Date] | **Research Sources:** [CRM, Web]

---

## Research Summary

**Target:** [Name], [Role/Context]
**Hook:** [Why reaching out now - the personalized angle]
**Goal:** [What you want from this outreach]

---

## Email Draft

**To:** [email if known, or "find email" note]
**Subject:** [Personalized subject line]

---

[Email body]

---

**Subject Line Alternatives:**
1. [Option 2]
2. [Option 3]

---

## WhatsApp / SMS Version

[Shorter, conversational version of the same message]

---

## Why This Approach

| Element | Based On |
|---------|----------|
| Opening | [Research finding that makes it personal] |
| Hook | [Their priority/pain point] |
| Proof | [Relevant success story or credential] |
| CTA | [Low-friction ask] |

---

## Email Draft Status

[Draft created - check email]
[Email not connected - copy email above]

---

## Follow-up Sequence (Optional)

**Day 3 - Follow-up 1:**
[Short, new angle]

**Day 7 - Follow-up 2:**
[Different value prop]

**Day 14 - Break-up:**
[Final attempt]
\`\`\`

---

## Execution Flow

### Step 1: Parse Request

\`\`\`
Input patterns:
- "draft outreach to John Tan" → Person lookup in CRM
- "write to the buyer for Bishan deal" → Role + deal context
- "reach out to sarah@email.com" → Email provided
- "message to [name] about [topic]" → Person + topic
\`\`\`

### Step 2: Research First (Always)

\`\`\`
1. search_crm for contact + relationship history
2. Web search for person + relevant context
3. read_file for user's voice/style preferences (SOUL.md)
\`\`\`

**Must find before drafting:**
- Who they are (role, background)
- Relationship history from CRM
- Recent news or trigger event
- Personalization hook

### Step 3: Identify Hook

\`\`\`
Priority order for hooks:
1. Trigger event (life change, news, milestone) → Most timely
2. Mutual connection / referral → Social proof
3. Their recent activity (post, event, purchase) → Shows you did research
4. Relevant update from you (new offering, market news) → Value-first
5. Role-based need → Least personal but still relevant
\`\`\`

### Step 4: Draft Message

**Email Structure (AIDA):**
\`\`\`
SUBJECT: [Personalized, <50 chars, no spam words]

[Opening: Personal hook - shows you know them]

[Interest: Their situation/opportunity in 1-2 sentences]

[Desire: Brief proof point - relevant success story]

[Action: Clear, low-friction CTA]

[Signature]
\`\`\`

**WhatsApp / SMS:**
\`\`\`
Hi [Name], [Personal reference].

[1-2 sentences on why you're reaching out]

[Clear question or soft CTA]
\`\`\`

### Step 5: Create Email Draft

\`\`\`
If email connector available:
1. Create draft with to, subject, body
2. Return draft link
3. Note: "Draft created - review and send"

If not available:
1. Output message text
2. Note: "Copy to your email or messaging app"
\`\`\`

---

## Capability by Connector

| Capability | Standalone | + Email |
|------------|-----------|---------|
| Personalized opening | From CRM + web | Same |
| Background details | CRM + public | Same |
| Prior relationship | From CRM | Same |
| Auto-create draft | No | Yes |

---

## Message Templates by Scenario

### Cold Outreach (No Prior Relationship)

\`\`\`
Subject: [Their situation] + [your angle]

Hi [Name],

[Personal hook based on research - news, mutual connection, referral].

[1 sentence on their likely need based on context].

[Brief proof: relevant experience or success story].

Worth a quick call to see if I can help?

[Signature]
\`\`\`

### Warm Outreach (Have Met / Referral)

\`\`\`
Subject: Following up from [context]

Hi [Name],

[Reference to how you know them / who connected you].

[Why reaching out now - their trigger].

[Specific value you can offer].

[CTA]
\`\`\`

### Re-Engagement (Went Dark)

\`\`\`
Subject: [Short, curiosity-driven]

Hi [Name],

[Acknowledge time passed without being guilt-trippy].

[New reason to reconnect - their news or your news].

[Simple question to re-open dialogue].

[Signature]
\`\`\`

### Post-Meeting Follow-up

\`\`\`
Subject: Great meeting you [context]

Hi [Name],

[Specific memory from conversation].

[Value-add: article, resource, or info related to what you discussed].

[Soft CTA for next conversation].
\`\`\`

---

## Email Style Guidelines

1. **Be concise but informative** — Get to the point quickly. Busy people skim.
2. **No markdown formatting** — Never use asterisks, bold (**text**), or other markdown. Write plain text that looks natural in any email client.
3. **Short paragraphs** — 2-3 sentences max per paragraph. White space is your friend.
4. **Simple lists** — If listing items, use plain dashes. No fancy formatting.

**Good:**
\`\`\`
Here's what I can share:
- A few options that match your criteria
- Quick comparison of the top picks
- 15-min call this week to walk through them
\`\`\`

**Bad:**
\`\`\`
**What I Can Offer:**
- **Options** matching your criteria
- **Comparison** of top picks
\`\`\`

---

## What NOT to Do

**Generic openers:**
- "I hope this message finds you well"
- "I'm reaching out because..."
- "I wanted to introduce myself"

**Feature dumps:**
- Long paragraphs about your services
- Multiple value props at once
- No clear CTA

**Fake personalization:**
- "I noticed you're looking for [thing]" (obviously)
- "Congrats on your new [thing]" (without context)

**Markdown in emails:**
- Using **bold** or *italic* asterisks
- Headers or formatted lists that won't render

**Instead:**
- Lead with something specific you learned from CRM or research
- One clear value prop
- One clear ask
- Plain text formatting only

---

## Channel Selection

\`\`\`
IF email available:
  → Email preferred for formal outreach
  → Also provide WhatsApp/SMS version

IF no email:
  → WhatsApp/SMS message
  → Shorter, more conversational

IF warm intro possible:
  → Suggest mutual connection outreach first
\`\`\`

---

## Personalization Settings

Before drafting, read the user's SOUL.md for:
- **Voice and tone** — formal, casual, direct
- **Signature** — preferred sign-off and contact info
- **Proof points** — past successes or credentials to reference
- **CTA preferences** — how the user likes to close (call, meeting, WhatsApp, etc.)

If SOUL.md is missing or thin, draft in a professional but warm tone and suggest the user save their preferences.

---

## Example

**Input:** "draft outreach to John Tan about the Bishan condo"

**Research finds:**
- CRM: John Tan, buyer, budget $1.2M, viewed 3 units in Bishan, last interaction Mar 12
- Web: Bishan resale prices up 2.1% QoQ, new launch nearby at $1,450 psf

**Output:**

\`\`\`markdown
# Outreach Draft: John Tan

## Research Summary
**Target:** John Tan, active buyer
**Hook:** New comparable launch nearby changes the value picture for Bishan Loft
**Goal:** Re-engage and schedule viewing of updated options

---

## Email Draft

**To:** john.tan@email.com
**Subject:** New Bishan option + a thought on Bishan Loft

---

Hi John,

Hope you've been well since our last viewing at Bishan Loft.

Wanted to flag something — a new launch just came in nearby at $1,450 psf,
which actually makes Bishan Loft's $1,050 psf look even more competitive
than when we last spoke.

Given your $1.2M budget, I think there's a strong case to move on
Bishan Loft before the new launch shifts buyer attention. Happy to
walk through the numbers if useful.

Free for a quick call this week?

Best,
[You]

---

**Subject Alternatives:**
1. Bishan Loft — quick update on pricing
2. New launch near Bishan + your options
\`\`\`

---

## Gotchas

- Do not invent rapport, urgency, or shared history.
- Do not make claims about products, budgets, or timelines unless they are grounded in CRM data or research.
- Avoid sounding like a mass blast. Specificity matters more than length.
- If public research is thin, lean on CRM context instead of guessing.
- Read the user's SOUL.md for voice and tone preferences before drafting.

---

## Tips

1. **Name the person** — "draft outreach to John Tan" is better than "write an email"
2. **State your goal** — "re-engage him about the Bishan deal" helps me pick the right angle
3. **Paste context** — Prior messages, notes, or CRM history help me personalize
4. **Connect email** — I can create a draft directly in your inbox

---

## Related Skills

- **call-prep** — Prepare for the call that follows the outreach
- **call-summary** — After the conversation, capture notes and next steps
`,

  "pipeline-review": `---
name: pipeline-review
description: Analyze pipeline health — prioritize deals, flag risks, and get a weekly action plan. Use when running a weekly pipeline review, deciding which deals to focus on, spotting stale or stuck deals, or auditing for missing next steps. Trigger with "pipeline review", "deal review", "how's my pipeline", or "what needs attention".
---

# Pipeline Review

Analyze your pipeline health, prioritize deals, and get actionable recommendations for where to focus.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE REVIEW                              │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ CRM: pull all active deals automatically                    │
│  ✓ Health check: flag stale, stuck, and at-risk deals          │
│  ✓ Prioritization: rank deals by impact and closability        │
│  ✓ Hygiene audit: missing data, overdue tasks, no next step    │
│  ✓ Weekly action plan: what to focus on                        │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Calendar: See upcoming meetings per deal                     │
│  + Email: Recent threads per deal, waiting on replies           │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

---

## Connectors (Optional)

| Connector | What It Adds |
|-----------|--------------|
| **Calendar** | Upcoming meetings per deal, scheduling gaps |
| **Email** | Recent threads per deal, emails waiting on replies |

> **No connectors?** No problem. CRM has everything needed for a solid pipeline review.

---

## Output

\`\`\`markdown
# Pipeline Review: [Date]

**Deals Analyzed:** [X]
**Total Pipeline Value:** [X]

---

## Pipeline Health Score: [X/100]

| Dimension | Score | Issue |
|-----------|-------|-------|
| **Stage Progression** | [X]/25 | [X] deals stuck in same stage 30+ days |
| **Activity Recency** | [X]/25 | [X] deals with no activity in 14+ days |
| **Close Date Accuracy** | [X]/25 | [X] deals with close date in past |
| **Task Coverage** | [X]/25 | [X] deals with no next step or open task |

---

## Priority Actions This Week

### 1. [Highest Priority Deal]
**Why:** [Reason — large, closing soon, at risk, etc.]
**Action:** [Specific next step]

### 2. [Second Priority]
**Why:** [Reason]
**Action:** [Next step]

### 3. [Third Priority]
**Why:** [Reason]
**Action:** [Next step]

---

## Deal Prioritization Matrix

### Close This Week (Focus Time Here)
| Deal | Value | Stage | Close Date | Next Action |
|------|-------|-------|------------|-------------|
| [Deal] | [Value] | [Stage] | [Date] | [Action] |

### Close This Month (Keep Warm)
| Deal | Value | Stage | Close Date | Status |
|------|-------|-------|------------|--------|
| [Deal] | [Value] | [Stage] | [Date] | [Status] |

### Nurture (Check-in Periodically)
| Deal | Value | Stage | Close Date | Status |
|------|-------|-------|------------|--------|
| [Deal] | [Value] | [Stage] | [Date] | [Status] |

---

## Risk Flags

### Stale Deals (No Activity 14+ Days)
| Deal | Value | Last Activity | Days Silent | Recommendation |
|------|-------|---------------|-------------|----------------|
| [Deal] | [Value] | [Date] | [X] | [Re-engage / Downgrade / Remove] |

### Stuck Deals (Same Stage 30+ Days)
| Deal | Value | Stage | Days in Stage | Recommendation |
|------|-------|-------|---------------|----------------|
| [Deal] | [Value] | [Stage] | [X] | [Push / Re-qualify / Close out] |

### Past Close Date
| Deal | Value | Close Date | Days Overdue | Recommendation |
|------|-------|------------|--------------|----------------|
| [Deal] | [Value] | [Date] | [X] | [Update date / Close lost] |

---

## Hygiene Issues

| Issue | Count | Deals | Action |
|-------|-------|-------|--------|
| Missing close date | [X] | [List] | Add realistic close dates |
| Missing next step | [X] | [List] | Define next action |
| No linked contact | [X] | [List] | Link primary contact |
| Overdue tasks | [X] | [List] | Complete or reschedule |

---

## Pipeline Shape

### By Stage
| Stage | # Deals | Value | % of Pipeline |
|-------|---------|-------|---------------|
| [Stage] | [X] | $[Value] | [X]% |

### By Close Month
| Month | # Deals | Value |
|-------|---------|-------|
| [Month] | [X] | $[Value] |

### By Deal Size
| Size | # Deals | Value |
|------|---------|-------|
| $500K+ | [X] | $[Value] |
| $200K-500K | [X] | $[Value] |
| $100K-200K | [X] | $[Value] |
| <$100K | [X] | $[Value] |

---

## Recommendations

### This Week
1. [ ] [Specific action for priority deal 1]
2. [ ] [Action for at-risk deal]
3. [ ] [Hygiene task]

### This Month
1. [ ] [Strategic action]
2. [ ] [Pipeline building if needed]

---

## Deals to Consider Removing

These deals may be dead weight:

| Deal | Value | Reason | Recommendation |
|------|-------|--------|----------------|
| [Deal] | [Value] | [No activity 60+ days, no response] | Mark closed-lost |
| [Deal] | [Value] | [Pushed 3+ times, no engagement] | Qualify out |
\`\`\`

---

## Prioritization Framework

I'll rank deals using this framework:

| Factor | Weight | What I Look For |
|--------|--------|-----------------|
| **Close Date** | 30% | Deals closing soonest get priority |
| **Deal Size** | 25% | Bigger deals = more focus |
| **Stage** | 20% | Later stage = more focus |
| **Activity** | 15% | Active deals get prioritized |
| **Risk** | 10% | Lower risk = safer bet |

You can tell me to weight differently: "Focus on big deals over soon deals" or "I need quick wins, prioritize close dates."

---

## Execution Flow

### Step 1: Gather Pipeline Data

\`\`\`
1. search_crm → All active deals
   - Pull: deal name, value, stage, close date, created date
   - Pull: last activity date, linked contacts, open tasks

2. search_crm → Recent interactions per deal
   - Last 5 interactions per deal
   - Flag: deals with no recent activity

3. Calendar (if connected) → Upcoming meetings per deal
4. Email (if connected) → Recent threads per deal
\`\`\`

### Step 2: Score and Prioritize

\`\`\`
Priority ranking:
1. Close date proximity — Deals closing soonest get priority
2. Deal value — Bigger deals = more focus
3. Stage — Later stage = more focus
4. Activity recency — Active deals get prioritized
5. Risk level — Lower risk = safer bet

Health scoring:
- Stage Progression: 25 pts if no deals stuck 30+ days
- Activity Recency: 25 pts if no deals silent 14+ days
- Close Date Accuracy: 25 pts if no past-due close dates
- Task Coverage: 25 pts if all deals have a next step
\`\`\`

### Step 3: Generate Review

\`\`\`
Assemble sections:
1. Pipeline Health Score — Always
2. Priority Actions — Top 3 deals needing attention
3. Deal Prioritization Matrix — Grouped by timeline
4. Risk Flags — Stale, stuck, past due
5. Hygiene Issues — Data quality problems
6. Pipeline Shape — Stage distribution
7. Recommendations — Actionable checklist
8. Deals to Remove — Dead weight candidates
\`\`\`

---

## Gotchas

- Do not confuse a full pipeline inventory with a useful review. Focus on decisions and interventions.
- Call out data gaps clearly when a deal cannot be assessed confidently.
- Do not label something as stalled just because there was no interaction yesterday. Use 14-day threshold.
- If the pipeline looks healthy, say that. The review should not always sound alarmist.

---

## Tips

1. **Review weekly** — Pipeline health decays fast. Weekly reviews catch issues early.
2. **Kill dead deals** — Stale deals inflate your pipeline and distort your focus. Be ruthless.
3. **Every deal needs a next step** — If there's no clear next action, the deal isn't real.
4. **Close dates should mean something** — A close date is when you expect it to close, not when you hope.

---

## Related Skills

- **daily-briefing** — Quick daily view focused on today's priorities
- **opportunity-analysis** — Deep dive on a specific deal
- **call-prep** — Prep for a meeting with a priority deal
`,

  "opportunity-analysis": `---
name: opportunity-analysis
description: Analyze a specific opportunity with market context, pricing signals, and likely fit for clients already in the CRM. Works with CRM and web research. Trigger with "analyze this opportunity", "what do you think of [opportunity]", "is this a good fit", "evaluate [opportunity]", or "is [thing] worth looking at".
---

# Opportunity Analysis

Research a specific opportunity — a listing, product, policy, investment, or offering — then assess its attractiveness, risks, and fit for clients already in your CRM.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                   OPPORTUNITY ANALYSIS                           │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ Web search: opportunity details, comparables, market context │
│  ✓ CRM: match against existing clients and their preferences    │
│  ✓ Analysis: attractiveness, risks, pricing context             │
│  ✓ Client matching: who in CRM might care and why               │
│  ✓ Output: structured analysis with recommendation              │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

---

## What I Need From You

**Option 1: Share a link or description**
Paste a URL, forward a listing, or describe the opportunity. I'll research it.

**Option 2: Ask about something specific**
"What do you think of the new launch at Bishan?" or "Is this whole life policy competitive?"

**Option 3: Compare options**
"Compare these two options for my client John." I'll analyze both and recommend.

---

## Output Format

\`\`\`markdown
# Opportunity Analysis: [Name/Description]

**Analyzed:** [Date]
**Sources:** Web Research, CRM

---

## Quick Take

[2-3 sentences: What it is, whether it looks attractive, who it might fit]

---

## Overview

| Field | Value |
|-------|-------|
| **Name** | [Opportunity name] |
| **Type** | [Listing / Product / Policy / Investment] |
| **Price / Terms** | [Key pricing info] |
| **Location / Provider** | [If relevant] |
| **Key Features** | [Highlights] |

---

## What Looks Attractive
- [Strength 1 with evidence]
- [Strength 2 with evidence]

## What Looks Risky or Uncertain
- [Risk 1 with evidence]
- [Risk 2 with evidence]

---

## Market Context

**Pricing vs Comparables:**
| Comparable | Price | Difference | Notes |
|-----------|-------|------------|-------|
| [Comp 1] | [Price] | [+/-X%] | [Key difference] |
| [Comp 2] | [Price] | [+/-X%] | [Key difference] |

**Market Signals:**
- [Relevant trend or data point]
- [Recent development that affects this opportunity]

---

## Qualification Signals

### Positive Signals
- ✅ [Signal and evidence]
- ✅ [Signal and evidence]

### Potential Concerns
- ⚠️ [Concern and what to watch for]

### Unknown (Verify Before Proceeding)
- ❓ [Gap in understanding that could change the assessment]

---

## CRM Client Matches

| Client | Deal/Stage | Why They Might Fit | Action |
|--------|-----------|-------------------|--------|
| [Name] | [Deal info] | [Match reason] | [Recommended next step] |
| [Name] | [Deal info] | [Match reason] | [Recommended next step] |

---

## Recommended Approach

**Best Fit For:** [Client name or profile, and why]

**Opening Angle:** [What to lead with when presenting this opportunity]

**Questions to Ask First:**
1. [Question to verify fit before investing more time]
2. [Question about client's constraints or preferences]
3. [Question about timeline or urgency]

---

## Sources
- [Source 1](URL)
- [Source 2](URL)
\`\`\`

---

## Execution Flow

### Step 1: Research the Opportunity

\`\`\`
1. Web search for opportunity details
   - "[Opportunity name]" — official listing/product page
   - "[Opportunity name] review" — independent assessments
   - "[Opportunity name] price" — pricing verification

2. Web search for comparables
   - "[Similar offerings] in [area/category]" — competitive context
   - "[Market/segment] trends" — macro context

3. Web search for risks
   - "[Opportunity name] issues OR concerns" — red flags
   - Regulatory or policy context if relevant
\`\`\`

### Step 2: Match Against CRM

\`\`\`
1. search_crm → Contacts with matching preferences
   - Filter by: budget range, stated needs, preferences
   - Check: deal stage (active leads most relevant)

2. search_crm → Deals that could benefit
   - Active deals where this opportunity fills a gap
   - Stale deals this could re-engage
\`\`\`

### Step 3: Analyze and Synthesize

\`\`\`
1. Assess attractiveness vs risks
2. Compare pricing to market context
3. Identify qualification signals (positive, concerns, unknown)
4. Match to CRM clients with reasoning
5. Generate recommended approach
6. Output formatted analysis
\`\`\`

---

## Analysis Variations

### Single Opportunity
Focus on: Deep analysis of one opportunity with market context

### Comparison (Two or More)
Focus on: Side-by-side comparison with pros/cons and recommendation per client

### Client-First ("What's good for John?")
Focus on: Search for opportunities matching a specific client's criteria

---

## Gotchas

- Separate facts from market interpretation. Label which is which.
- Be explicit when comparable evidence is thin or noisy.
- Do not oversell an opportunity just because the marketing copy is strong.
- If details are ambiguous or incomplete, say so before making a confident judgment.
- If no CRM clients match, say that clearly rather than forcing a weak match.

---

## Tips

1. **Share the link** — A URL gives me much more to work with than a name
2. **Name the client** — "Is this good for John?" lets me tailor the analysis
3. **State your angle** — "I'm thinking of presenting this to buyers" helps me focus
4. **Ask for comparisons** — "Compare this to [other option]" is more useful than a standalone review

---

## Related Skills

- **draft-outreach** — Draft a message to matched clients about this opportunity
- **pipeline-review** — See how this fits into the broader deal pipeline
- **market-briefing** — Broader market context beyond a single opportunity
`,

  "call-summary": `---
name: call-summary
description: Process call notes or a meeting recap — extract action items, draft follow-up message, generate structured summary. Use when pasting rough notes after a meeting, drafting a client follow-up, logging the activity to CRM, or capturing decisions and next steps. Trigger with "summarize my call", "call notes", "meeting recap", or "what happened in my meeting with [name]".
---

# Call Summary

Process call notes or a meeting recap to extract action items, draft follow-up communications, and update records.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                      CALL SUMMARY                                │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ Paste call notes, transcript, or describe what happened      │
│  ✓ Extract key discussion points and decisions                  │
│  ✓ Identify action items with owners and due dates              │
│  ✓ Surface objections, concerns, and open questions             │
│  ✓ Draft client-facing follow-up message                        │
│  ✓ Generate internal summary                                    │
├─────────────────────────────────────────────────────────────────┤
│  SUPERCHARGED (when you connect your tools)                      │
│  + Email: Send follow-up directly from draft                    │
│  + Calendar: Link to meeting, pull attendee context             │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

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
\`\`\`markdown
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
\`\`\`

### Client Follow-Up Message
\`\`\`
Subject: [Meeting recap + next steps]

Hi [Name],

Thank you for taking the time to meet today...

[Key points discussed]

[Commitments you made]

[Clear next step with timeline]

Best,
[You]
\`\`\`

---

## Email Style Guidelines

When drafting client-facing messages:

1. **Be concise but informative** — Get to the point quickly. Clients are busy.
2. **No markdown formatting** — Don't use asterisks, bold, or other markdown syntax. Write in plain text that looks natural in any email client.
3. **Use simple structure** — Short paragraphs, line breaks between sections.
4. **Keep it scannable** — If listing items, use plain dashes or numbers, not fancy formatting.

**Good:**
\`\`\`
Here's what we discussed:
- Three options in the Bishan area within your budget
- Viewing schedule for this weekend
- Documents needed for the loan pre-approval
\`\`\`

**Bad:**
\`\`\`
**What We Discussed:**
- **Three options** in the Bishan area
\`\`\`

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
`,

  "market-briefing": `---
name: market-briefing
description: Research market conditions and build a focused briefing with pricing signals, new offerings, policy changes, and implications for active deals. Works with web search and CRM. Trigger with "market update", "market briefing", "what's changed in the market", "what should I know about [market/segment]", or "what's new in [area]".
---

# Market Briefing

Research market conditions and generate a focused briefing that connects external signals back to your active work. The output maps what changed to why it matters to who in your CRM pipeline is affected.

## How It Works

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                     MARKET BRIEFING                              │
├─────────────────────────────────────────────────────────────────┤
│  ALWAYS (works standalone)                                       │
│  ✓ Web search: pricing shifts, new offerings, policy changes   │
│  ✓ CRM: connect signals back to active deals and clients       │
│  ✓ Three-layer analysis: what changed → why it matters → who   │
│  ✓ Output: scannable briefing with pipeline impact              │
└─────────────────────────────────────────────────────────────────┘
\`\`\`

---

## Getting Started

When you run this skill, I'll ask for what I need:

**If topic is clear:**
> "Market briefing on [area/segment/topic]" — I'll research and deliver.

**If topic is broad:**
> I'll ask: "Any specific area, segment, or topic? Or a general market scan?"

**If recurring:**
> Save the briefing with \`write_file\` and set up a trigger for weekly/monthly updates.

---

## Output Format

\`\`\`markdown
# Market Briefing: [Topic/Area]

**Generated:** [Date]
**Sources:** Web Research, CRM

---

## Quick Take

[2-3 sentences: The one or two things that actually change advice or timing for active deals]

---

## What Changed

### Pricing Signals
| Signal | Detail | Source | Date |
|--------|--------|--------|------|
| [Price movement] | [Specifics] | [Source] | [Date] |

### New Offerings / Launches
| Offering | Detail | Why It Matters |
|----------|--------|----------------|
| [New product/listing/policy] | [Key details] | [Impact on your work] |

### Policy / Regulatory
| Change | Detail | Effective | Impact |
|--------|--------|-----------|--------|
| [Policy change] | [What changed] | [When] | [Who it affects] |

### Other Notable Developments
- [Development — why it matters]

---

## Why It Matters

For each signal above, the implication:

1. **[Signal]** → [What this means for your clients/deals]
2. **[Signal]** → [How this changes advice or timing]

---

## Who's Affected in Your Pipeline

| Client/Deal | Signal | Impact | Recommended Action |
|-------------|--------|--------|--------------------|
| [Name/Deal] | [Which signal] | [How it affects them] | [What to do] |
| [Name/Deal] | [Which signal] | [How it affects them] | [What to do] |

---

## Recommended Actions

1. **[Action]** — [Why now, tied to a specific signal]
2. **[Action]** — [Why now]
3. **[Action]** — [Why now]

---

## Sources
- [Source 1](URL)
- [Source 2](URL)
\`\`\`

---

## Execution Flow

### Phase 1: Research Market Signals

\`\`\`
Run targeted web searches by category:

Pricing:
1. "[Market/area] pricing trends [year]" — recent price movements
2. "[Market/area] transaction data" — volume and pricing signals

New Offerings:
3. "[Market/area] new launch OR new product OR new listing" — what's new
4. "[Market/area] upcoming releases" — what's coming

Policy / Regulatory:
5. "[Market/area] regulation OR policy change [year]" — regulatory shifts
6. "[Industry] compliance OR requirements update" — new requirements

Financing / Conditions:
7. "[Market/area] interest rates OR financing" — cost of capital
8. "[Market/area] supply OR demand trends" — macro conditions
\`\`\`

### Phase 2: Connect to CRM Pipeline

\`\`\`
1. search_crm → Active deals and contacts
   - Match signals to deals by area, segment, budget, timeline
   - Flag deals where a signal changes urgency or advice

2. Identify:
   - Which clients should hear about this
   - Which deals are accelerated or at risk
   - Which stale deals this could re-engage
\`\`\`

### Phase 3: Synthesize Briefing

\`\`\`
1. Filter to signals that actually change advice or timing
2. Structure in three layers: what → why → who
3. Lead with the most impactful signals
4. Connect every signal to a CRM action where possible
5. Output formatted briefing
\`\`\`

---

## Briefing Variations

### General Market Scan
Focus on: Broad overview across all categories
Best for: Weekly or monthly check-in on market conditions

### Segment-Specific
Focus on: Deep dive on one area, segment, or product category
Best for: When a client asks about a specific market

### Trigger-Based
Focus on: One specific event and its implications
Best for: Reacting to a policy change, major launch, or price shift

---

## Refresh Cadence

Market intel gets stale. Recommended refresh:

| Trigger | Action |
|---------|--------|
| **Weekly** | Quick scan — new pricing signals, launches |
| **Monthly** | Full briefing — all categories |
| **Policy change** | Immediate update on that change and who it affects |
| **Major launch** | Immediate analysis of the new offering |
| **Client asks** | On-demand segment or topic briefing |

---

## Gotchas

- Prioritize freshness. Old market commentary is rarely useful if newer signals exist.
- Do not present thin search evidence as a clear market trend. Say "early signal" not "trend."
- Separate observed facts from interpretation. Label which is which.
- If the update is mixed or noisy, say that plainly instead of forcing a strong narrative.
- Not everything is actionable. If nothing significant changed, say that.

---

## Tips

1. **Be specific** — "market briefing on District 15 condos" gets better results than "market update"
2. **Set up a recurring trigger** — Weekly market scans keep you ahead of clients
3. **Name the signal** — "What does the new ABSD change mean for my clients?" focuses the briefing
4. **Save and share** — Use \`write_file\` to save briefings you want to reference later

---

## Related Skills

- **opportunity-analysis** — Deep dive on a specific opportunity surfaced by the briefing
- **pipeline-review** — See which active deals are affected by market changes
- **draft-outreach** — Reach out to affected clients with the news
`,

  "deal-comparison": `---
name: deal-comparison
description: "Compare properties side-by-side with a professional Excel financial model. Use when the user uploads xlsx/csv files, asks to compare deals, or wants to know which property is better. Produces a downloadable Excel model with live formulas, sensitivity tables, and color-coded inputs."
---

# Deal Comparison

Build a professional Excel financial model comparing properties side-by-side.

## Before you start

Check if the user uploaded files:
- If yes, note the file URLs — these are the primary input
- If no, ask which properties to compare, then search CRM

## Workflow

### Step 1: Gather property data from CRM

For each property the user mentions, search CRM:

\`\`\`
search_crm({ query: "{property name or address}", table: "deals" })
\`\`\`

Collect: purchase price, size (sqft), tenure, floor, unit number, asking rent, any notes.

### Step 2: Get market context

Search for recent comparable transactions:

\`\`\`
web_search({ query: "{project name} recent transactions {year}" })
\`\`\`

This gives the model comparison points for sensitivity analysis.

### Step 3: Read user context

\`\`\`
read_file("/agent/SOUL.md")
\`\`\`

Note the user's market focus, client context, and any relevant preferences.

### Step 4: Analyze and present

Using the gathered data from steps 1-3, perform the analysis the user requested:
- Calculate yields, mortgage payments, and financial metrics
- Compare properties side by side
- Highlight key differences and tradeoffs

Present the results clearly with tables and structured data. Offer to:
- Email it to someone (use send_message)
- Refine the analysis ("add a sensitivity table", "remove property 3")
- Do a follow-up analysis

## Gotchas

- If the user asks "which is better?" — present the numbers first, then give your opinion based on the data.
- SG-specific: always mention ABSD/BSD applicability and TDSR if relevant.
- If the user hasn't set up their re-analyst preferences yet, suggest they do ("want me to set up your analysis preferences first?").
`,

  "property-showcase": `---
name: property-showcase
description: "Build a polished property showcase web page with photos, details, neighborhood info, and your contact card. Published to a live preview URL that you can iterate on and then share with clients. Trigger with 'showcase page', 'listing page', 'property page', 'marketing page for [property]'."
---

# Property Showcase

Build a polished, shareable property showcase page.

## Workflow

### Step 1: Identify the property

If the user named a property, search CRM:

\`\`\`
search_crm({ query: "{property name or address}", table: "deals" })
\`\`\`

Collect: address, price, beds, sqft, tenure, floor, any listing notes.

### Step 2: Get the agent's info

\`\`\`
read_file("/agent/SOUL.md")
\`\`\`

You need the agent's name, phone, email, and agency for the contact card.

### Step 3: Research the neighborhood

\`\`\`
web_search({ query: "{address} nearby MRT schools amenities" })
\`\`\`

Get: nearest MRT + walk time, nearby schools (2-3), shopping, parks, key selling points.

### Step 4: Get recent transactions (optional but valuable)

\`\`\`
web_search({ query: "{project name} recent transactions {year}" })
\`\`\`

or

\`\`\`
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
\`\`\`

Recent comparable sales add credibility to the page.

### Step 5: Get listing photos

If CRM has photo URLs, download them:

\`\`\`
fetch_url({ url: "{photo URL}" })
\`\`\`

Aim for 4-8 photos. If no photos in CRM, ask the user to share some.

### Step 6: Present the showcase

Using the gathered data from steps 1-5, present a structured property showcase to the user:
- Property details, pricing, and key features
- Neighborhood highlights (MRT, schools, amenities)
- Recent comparable transactions
- Agent contact details

Offer to:
- **Send to a client** — use send_message with the formatted property details
- **Refine the content** — adjust details, add/remove sections

## Gotchas

- Don't skip the photo gathering step. A showcase page without photos is useless.
- Always include the agent's contact card. The whole point is lead generation.
- If neighborhood data is sparse, say so rather than making things up.
- If no frontend-design skill exists yet, the default template (dark + gold luxury) applies. Suggest the user set up brand preferences if they want a custom look.
`,

  "market-report": `---
name: market-report
description: "Generate a market analysis report with transaction trends, price movements, and area comparisons. Produces an Excel workbook with charts and data tables. Trigger with 'market report', 'area analysis', 'how is the market in [area]', 'transaction trends for [project]'."
---

# Market Report

Produce a data-driven market analysis as an Excel workbook with charts.

## Workflow

### Step 1: Clarify scope

Ask the user (or infer from context):
- Which area, district, or project?
- What time period? (default: last 12 months)
- Any specific metrics? (price psf trends, volume, rental yields)

### Step 2: Gather transaction data

\`\`\`
browser_scrape({ url: "https://edgeprop.sg/...", extract: "transactions" })
\`\`\`

or

\`\`\`
web_search({ query: "{area} property transactions {year} price trends" })
\`\`\`

Get as many data points as possible — recent transactions, median prices, volume.

### Step 3: Get CRM context

\`\`\`
search_crm({ query: "{area}", table: "deals" })
\`\`\`

Check if the user has any active deals in the area — makes the report more relevant.

### Step 4: Read user context

\`\`\`
read_file("/agent/SOUL.md")
\`\`\`

Note the user's market specialization and client focus.

### Step 5: Analyze and present

Using the gathered data from steps 1-4, present a structured market analysis:
- Transaction volume trends by month
- Median price psf trends
- Price distribution and top transactions
- Comparison with user's active deals if relevant

## Gotchas

- Web-scraped transaction data may be incomplete. Note the data source and date range in the report.
- Don't present scraped data as authoritative — frame it as "based on available public data."
- If the user wants to share this with clients, suggest converting key charts to a showcase page (property-showcase skill).
`,

  "re-analyst": `---
name: re-analyst
description: "Your property investment analysis preferences. Used when building financial models and analysis. Customize it by telling me your benchmarks, mortgage details, and analysis preferences."
type: inner
editable: true
---

# Real Estate Investment Analysis Preferences

These preferences guide how financial models are built for you.
Edit this anytime by telling me your updated preferences.

## Benchmarks

- Minimum net rental yield: 2.5%
- REIT comparison benchmark: 5% (for opportunity cost analysis)
- Risk-free rate: 3.0% (SGS 10-year bond)

## Mortgage Assumptions

- Default mortgage rate: 3.8% (fixed)
- Default LTV: 75%
- Default loan tenure: 25 years
- Always check TDSR (total debt servicing ratio, max 55%)

## Analysis Preferences

- Always show: gross yield, net yield, cash-on-cash return
- Always include sensitivity table for mortgage rates (±1% in 0.25% steps)
- Compare against REIT benchmark in summary
- Show monthly cash flow breakdown (rental income vs mortgage + expenses)
- Expense assumptions: maintenance $200/mo, property tax (based on AV), insurance $30/mo

## SG-Specific Rules

- Check ABSD applicability (citizen vs PR vs foreigner, property count)
- Check BSD (buyer's stamp duty) — standard progressive rates
- Note tenure risk for 99-year leasehold (remaining years matters)
- Freehold premium: flag if price premium > 20% vs similar leasehold

## Output Format

- Blue text for editable inputs, black for formulas
- Always use Excel FORMULAS, not hardcoded Python values
- Include assumptions sheet as first tab
- Run formula verification (recalc.py) before returning

## References

See /skills/re-analyst/references/ for:
- SG property tax rates and ABSD tables
- Yield benchmark history
`,

  "frontend-design": `---
name: frontend-design
description: "Your brand and design preferences for generated web pages (showcase pages, pitch pages, etc.). Customize it by telling me your brand colors, typography, and layout preferences."
type: inner
editable: true
---

# Design & Brand Preferences

These preferences guide how web pages are designed for you.
Edit anytime by telling me your updated brand or design preferences.

## Brand

- Agent name: (from SOUL.md)
- Agency: (from SOUL.md)
- Logo URL: (none set — tell me your logo URL to add it)
- Brand color: #C8A96E (warm gold — default luxury accent)

## Visual Style

- Background: dark (slate/charcoal gradients)
- Accent color: gold/warm metallic
- Typography: serif headings (Playfair Display), sans body (Inter)
- Aesthetic: luxury, minimal, generous whitespace
- Photos: full-bleed hero, CSS grid gallery with hover effects

## Always Include

- Hero section with best listing photo + address + price overlay
- Photo gallery (grid layout, lightbox on click)
- Property details (beds, sqft, tenure, floor, price)
- Agent contact card with photo, phone, email, agency
- Call-to-action button ("Schedule a Viewing" or "Contact Agent")

## Include When Available

- Neighborhood map with MRT, schools, amenities
- Recent comparable transactions table
- Mortgage calculator widget (interactive, default to user's mortgage rate)

## Never Include

- Generic stock photos
- Competitor agent information
- Unverified claims about property value appreciation

## Technical

- Tailwind CSS v4 for all styling
- React 18 components
- Single-page layout (no routing)
- Mobile-responsive (test at 375px width)
- Accessible: proper alt text, contrast ratios, semantic HTML
`,

};

// ---------------------------------------------------------------------------
// System skills (bundled in code, served via read_file fallback)
// ---------------------------------------------------------------------------

export const SYSTEM_SKILL_CONTENT: Record<string, string> = {
  "creating-connections/SKILL.md": `# Creating New Connections

You can create new connections to connect to new services. Creating a connection will save it to the user's account so they can use it in other agents in the future.

Use the \`create_new_connections\` tool to create connections. The tool accepts a \`type\` field to specify what kind of connection to create:

## Connection Types (in order of preference)

### 1. \`type: 'integrations'\` - Pre-built Integrations

The simplest option with easy authentication. Thousands available.

- Use \`search_for_integrations\` to find integrations relevant to the user's request.
- Use \`get_integrations_capabilities\` to understand integration capabilities before creating a connection.
- Consider all available info when recommending integrations, but avoid sharing quality scores or who built the integration with the user unless asked.
- If toolsToActivate are listed they will be activated automatically after the connection is created.

### 2. \`type: 'mcp'\` - Custom MCP Servers

Connects to custom MCP servers.

- For known services, check to see if there is a pre-built integration you can use.
- **Not yet available in v1.** Offer as a future option only.

### 3. \`type: 'direct_api'\` - Direct API Connections

Connects to APIs via HTTP endpoints.

- **You MUST read /agent/skills/system/creating-connections/create-direct-api-connection.md before creating a direct API connection.**
- Never hallucinate an endpoint or URL.
- **Not yet available in v1.** Offer as a future option only.

### 4. \`type: 'computer_use'\` - Computer Use

Provisions a remote computer for browser-based or desktop UI-based tasks. Slow and expensive.

- Tell the user about this option when helpful, but prefer other types when possible
- Allows you to view and use websites and user interfaces
- Use this if the user specifically asks to use a computer or browser
- **Not yet available in v1.** Offer as a future option only.

## Guidelines

If the user asks what integrations, apps, or services you can connect to, do not try to enumerate a complete list. Indicate that you can connect to almost any service via thousands of integrations, direct API access, custom MCP servers, or a virtual computer.

**Remember to:**

- Verify an integration has the capabilities needed to complete the task before creating a connection
- Offer Direct HTTP, Custom MCP, or Computer use as connection options when there are no available pre-built integrations that can satisfy the user's request`,

  "creating-connections/create-direct-api-connection.md": `# Creating Direct API Connections

## Overview

You can connect directly to HTTP APIs of external services. To create a connection, you must complete the following steps:

1. Research the API thoroughly
2. Verify the base URL and endpoint paths
3. Determine authentication requirements
4. Create test cases
5. Write notes for future use
6. Call the tool to present a secure credential form

### Step 1: Research the API

- Search for official API documentation
- Find example requests and curl commands (these show the correct paths)
- Identify ALL available endpoints - don't stop on the first couple
- Verify versioning requirements (e.g., /v1, /api/v2)
- If docs conflict on paths, do deeper research or ask the user
- Identify required user inputs (API keys, usernames, passwords, etc.)

### Step 2: Verify Base URL and Paths

- Base URL format: no trailing slash, no path segments (e.g., \`https://api.example.com\`)
- Be extremely careful to find the correct base URL - if unsure, ask the user
- For services with dynamic/custom base URLs, ask the user
- Verify endpoint paths include version prefixes (e.g., /v1/users) unless the base URL is already versioned
- Check both the base URL and individual endpoint paths for version prefixes

### Step 3: Determine Authentication

Identify which auth method the API uses and prepare the \`authConfig\` object. Common types:

- \`bearer\` for token auth (OpenAI, GitHub)
- \`header\` for API key auth (many services)
- \`basic\` for username/password
- \`query-parameter\` for auth via URL query parameters
- \`custom-oauth\` for OAuth2 with token refresh (use this instead of bearer when tokens expire)
- \`none\` for public APIs

Each auth field should include helpful labels, placeholders showing format, and descriptions of where users can find these values.

**Important**: Never ask users to enter credentials in conversation. The tool presents a secure UI form.

See **Auth Config Schema** below.

### Step 4: Create Test Cases

Create 1-3 test cases to verify the connection works. For REST APIs, provide a single GET test case.

Test cases must:

- Use GET method (you need a VERY good reason to use POST/PUT/PATCH/DELETE)
- Return quickly (< 5 seconds)
- Cost no money/credits
- Have no side effects
- Never purposefully fail

If GET is impossible, provide a detailed \`reasonIAmDoingThisDangerousThing\` (50+ chars) explaining:

- Why a modifying method is necessary to test THE AUTHENTICATION
- Why a GET test is not sufficient
- That you explicitly looked for NON-MODIFYING endpoints

See **Test Case Schema** below.

### Step 5: Write Notes

Write notes for future agents using this connection. Assume auth is configured and tested. Include:

- Links to official documentation
- Useful endpoints discovered
- API quirks or requirements
- Rate limits or usage considerations

Notes should be incredibly accurate. Do not start with a markdown heading - jump right into content.

### Step 6: Call the Tool

Use \`create_new_connection\` with \`type: 'direct_api'\`:

- Construct the \`authConfig\` object based on the Auth Config Schema below
- Construct the \`testCases\` array based on the Test Case Schema below
- Make the tool call

This tool presents the user with a custom UI form to securely enter their credentials and confirm the connection. Once the tool call succeeds, the user has provided valid credentials. These credentials are automatically added to subsequent HTTP requests, so you can immediately proceed to making HTTP calls without additional setup.

## Auth Config Schema

Each auth field supports UI hints (all optional, but try to set all when available):

- \`label\`: Human-readable field name
- \`placeholder\`: Example value format
- \`value\`: Pre-filled value (if known)
- \`description\`: What this field is and where to find it
- \`learnMore\`: \`{ title, markdown }\` for detailed help popup with step-by-step instructions on finding credentials in the service's UI

Example:

\`\`\`json
{
  "label": "API Key",
  "placeholder": "sk-...",
  "description": "Find this in your account dashboard",
  "learnMore": {
    "title": "How to get your API key",
    "markdown": "1. Go to [example.com/settings](https://example.com/settings)\\n2. Click 'API Keys'\\n3. Click 'Create new key'\\n4. Copy the key (it won't be shown again)"
  }
}
\`\`\`

### type: 'none'

No authentication required.

\`\`\`json
{ "type": "none" }
\`\`\`

### type: 'header'

Custom header authentication (API key in header).

\`\`\`json
{
  "type": "header",
  "headerName": { "label": "Header Name", "value": "X-API-Key" },
  "headerValue": { "label": "API Key", "placeholder": "sk-..." }
}
\`\`\`

### type: 'bearer'

Bearer token authentication (common for OpenAI, GitHub).

\`\`\`json
{
  "type": "bearer",
  "token": {
    "label": "API Token",
    "placeholder": "sk-...",
    "description": "Find this in your dashboard"
  }
}
\`\`\`

### type: 'basic'

HTTP Basic authentication.

\`\`\`json
{
  "type": "basic",
  "username": { "label": "Username", "placeholder": "user@example.com" },
  "password": { "label": "Password", "placeholder": "..." }
}
\`\`\`

### type: 'query-parameter'

Authentication via URL query parameters.

\`\`\`json
{
  "type": "query-parameter",
  "queryParameters": [
    { "name": { "value": "api_key" }, "value": { "label": "API Key", "placeholder": "..." } }
  ]
}
\`\`\`

### type: 'custom-oauth'

OAuth2 authentication. Scopes and additionalParams fields are optional. Use space-separated values for scopes.

\`\`\`json
{
  "type": "custom-oauth",
  "clientId": { "label": "Client ID", "placeholder": "..." },
  "clientSecret": { "label": "Client Secret", "placeholder": "..." },
  "authUrl": { "value": "https://..." },
  "tokenUrl": { "value": "https://..." },
  "scopes": {
    "label": "Scopes",
    "value": "read write",
    "description": "Space-separated list"
  },
  "additionalParams": {
    "label": "Additional OAuth Parameters",
    "placeholder": "access_type=offline",
    "description": "Extra parameters for the auth URL in query string format"
  }
}
\`\`\`

## Test Case Schema

\`\`\`json
{
  "id": "unique-id",
  "name": "Test connection",
  "method": "GET",
  "path": "/v1/endpoint",
  "verificationStatement": "I verified this endpoint exists in the official docs and is read-only. I explored the entire API documentation and found all endpoints, choosing this as the fastest way to verify authentication."
}
\`\`\`

Fields:

- \`id\`: Unique identifier string
- \`name\`: Human-readable test name
- \`method\`: Either \`"GET"\` or \`{ "method": "POST"|"PUT"|"PATCH"|"DELETE", "reasonIAmDoingThisDangerousThing": "..." }\`
- \`path\`: Endpoint path - be extremely careful to get this right, include version prefix (e.g., /v1/users) unless base URL is already versioned
- \`verificationStatement\`: **Displayed to user**. Explain what you verified and why this test is appropriate. Must state that you explored the entire API documentation and found all endpoints.
- \`description\`: Optional description
- \`requestBody\`: Optional raw request body string
- \`extraHeaders\`: Optional additional headers object (cannot include blocked headers; Content-Type is added automatically)`,
};

// ---------------------------------------------------------------------------
// Inner skill reference files (seeded alongside SKILL.md)
// ---------------------------------------------------------------------------

const SG_PROPERTY_TAXES_CONTENT = `# Singapore Property Tax & Stamp Duty Reference

## Buyer's Stamp Duty (BSD)
| Purchase Price Bracket | Rate |
|---|---|
| First $180,000 | 1% |
| Next $180,000 | 2% |
| Next $640,000 | 3% |
| Next $500,000 | 4% |
| Next $1,500,000 | 5% |
| Above $3,000,000 | 6% |

## Additional Buyer's Stamp Duty (ABSD) — from Apr 2023
| Buyer Profile | 1st Property | 2nd Property | 3rd+ Property |
|---|---|---|---|
| SG Citizen | 0% | 20% | 30% |
| SG PR | 5% | 30% | 35% |
| Foreigner | 60% | 60% | 60% |
| Entity | 65% | 65% | 65% |

## Total Debt Servicing Ratio (TDSR)
- Max 55% of gross monthly income
- Applies to all property loans from financial institutions
- Stress-test rate: 4% or actual rate, whichever is higher (for variable rate loans)

## Property Tax (Annual)
Based on Annual Value (AV) — estimated annual rent

**Owner-Occupied:**
| AV Bracket | Rate |
|---|---|
| First $8,000 | 0% |
| Next $22,000 | 4% |
| Next $10,000 | 6% |
| Next $15,000 | 8% |
| Next $15,000 | 10% |
| Next $15,000 | 12% |
| Next $15,000 | 14% |
| Above $100,000 | 16% |

**Non-Owner-Occupied (Investment):**
| AV Bracket | Rate |
|---|---|
| First $30,000 | 12% |
| Next $15,000 | 20% |
| Next $15,000 | 28% |
| Above $60,000 | 36% |

## Lease Decay
- 99-year leasehold: value typically starts declining noticeably after 40 years remaining
- Rule of thumb: remaining lease < 60 years = significant financing restrictions
- Banks may reduce LTV or refuse loans for leases < 30 years remaining

> Last verified: March 2026. ABSD rates effective Apr 2023. Verify before use in client-facing materials.
`;

const YIELD_BENCHMARKS_CONTENT = `# Yield & Return Benchmarks (Singapore)

## REIT Benchmarks (as of Q1 2026)
| REIT Category | Avg Distribution Yield |
|---|---|
| Retail REITs | 5.5-6.5% |
| Office REITs | 5.0-6.0% |
| Industrial REITs | 6.0-7.5% |
| Hospitality REITs | 5.0-7.0% |
| Healthcare REITs | 5.5-6.5% |
| S-REIT Index (overall) | ~5.5% |

## Residential Rental Yields
| District | Typical Gross Yield |
|---|---|
| Core Central (D1, D2, D6, D9, D10, D11) | 2.5-3.5% |
| Rest of Central (D3-5, D7-8, D12-15) | 3.0-4.0% |
| Outside Central (D16-28) | 3.5-4.5% |

## Risk-Free Rate
- SGS 10-year bond: ~3.0% (Q1 2026)
- CPF OA rate: 2.5%
- Fixed deposit (12-month): ~2.5-3.0%

## Common Thresholds
- Net yield > 2.5% = generally acceptable
- Net yield > 3.5% = strong for SG residential
- Cash-on-cash > 5% = competitive with REITs
- TDSR < 45% = comfortable buffer
- TDSR 45-55% = tight but acceptable

> These are reference benchmarks only. Actual yields depend on specific property,
> tenant quality, vacancy assumptions, and market conditions.
`;

/** Reference files to seed alongside inner skill SKILL.md files. */
export const INNER_SKILL_REFERENCES: Record<string, Record<string, string>> = {
  "re-analyst": {
    "references/sg-property-taxes.md": SG_PROPERTY_TAXES_CONTENT,
    "references/yield-benchmarks.md": YIELD_BENCHMARKS_CONTENT,
  },
  // frontend-design has no reference files by default
};

// ---------------------------------------------------------------------------
// Default skill helpers
// ---------------------------------------------------------------------------

/** Whether a slug is one of the bundled defaults (and therefore resettable). */
export function isDefaultSkillSlug(slug: string): boolean {
  return (DEFAULT_SKILL_SLUGS as readonly string[]).includes(slug);
}

/** Returns the bundled default content for a slug, or null if not a default. */
export function getDefaultSkillContent(slug: string): string | null {
  if (!isDefaultSkillSlug(slug)) return null;
  return DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
}
