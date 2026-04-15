---
name: draft-outreach
description: "Drafts personalized outreach using CRM history, deal context, and research. Use when the user asks to write outreach, follow up with a lead, re-engage a contact, or send a tailored message."
---

# Draft Outreach

Research first, then draft. This skill never sends generic outreach — it always researches the prospect first to personalize the message. Works standalone with CRM and web search, supercharged when you connect your email.

## How It Works

**Step 1: Research** (always happens first)
- CRM: relationship history, deal context
- Web search: recent news, public info about the prospect

**Step 2: Draft** (based on research)
- Personalized opening from what was found
- Relevant hook tied to their priorities
- Clear call to action

**Step 3: Deliver** (based on connectors)
- Email draft (if email connected)
- Copy for WhatsApp/SMS (always)
- Output to user (always)

---

## Connectors (Optional)

| Connector | What It Adds |
|-----------|--------------|
| **Email** | Create draft directly in your inbox |

> **No connectors?** CRM history and web research work great. I'll output the message text for you to copy.

---

## Output Format

```markdown
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
```

---

## Execution Flow

### Step 1: Parse Request

```
Input patterns:
- "draft outreach to John Tan" → Person lookup in CRM
- "write to the buyer for Bishan deal" → Role + deal context
- "reach out to sarah@email.com" → Email provided
- "message to [name] about [topic]" → Person + topic
```

### Step 2: Research First (Always)

```
1. search_crm for contact + relationship history
2. Web search for person + relevant context
3. storage_read for user's voice/style preferences (SOUL.md)
```

**Must find before drafting:**
- Who they are (role, background)
- Relationship history from CRM
- Recent news or trigger event
- Personalization hook

### Step 3: Identify Hook

```
Priority order for hooks:
1. Trigger event (life change, news, milestone) → Most timely
2. Mutual connection / referral → Social proof
3. Their recent activity (post, event, purchase) → Shows you did research
4. Relevant update from you (new offering, market news) → Value-first
5. Role-based need → Least personal but still relevant
```

### Step 4: Draft Message

**Email Structure (AIDA):**
```
SUBJECT: [Personalized, <50 chars, no spam words]

[Opening: Personal hook - shows you know them]

[Interest: Their situation/opportunity in 1-2 sentences]

[Desire: Brief proof point - relevant success story]

[Action: Clear, low-friction CTA]

[Signature]
```

**WhatsApp / SMS:**
```
Hi [Name], [Personal reference].

[1-2 sentences on why you're reaching out]

[Clear question or soft CTA]
```

### Step 5: Create Email Draft

```
If email connector available:
1. Create draft with to, subject, body
2. Return draft link
3. Note: "Draft created - review and send"

If not available:
1. Output message text
2. Note: "Copy to your email or messaging app"
```

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

```
Subject: [Their situation] + [your angle]

Hi [Name],

[Personal hook based on research - news, mutual connection, referral].

[1 sentence on their likely need based on context].

[Brief proof: relevant experience or success story].

Worth a quick call to see if I can help?

[Signature]
```

### Warm Outreach (Have Met / Referral)

```
Subject: Following up from [context]

Hi [Name],

[Reference to how you know them / who connected you].

[Why reaching out now - their trigger].

[Specific value you can offer].

[CTA]
```

### Re-Engagement (Went Dark)

```
Subject: [Short, curiosity-driven]

Hi [Name],

[Acknowledge time passed without being guilt-trippy].

[New reason to reconnect - their news or your news].

[Simple question to re-open dialogue].

[Signature]
```

### Post-Meeting Follow-up

```
Subject: Great meeting you [context]

Hi [Name],

[Specific memory from conversation].

[Value-add: article, resource, or info related to what you discussed].

[Soft CTA for next conversation].
```

---

## Email Style Guidelines

1. **Be concise but informative** — Get to the point quickly. Busy people skim.
2. **No markdown formatting** — Never use asterisks, bold (**text**), or other markdown. Write plain text that looks natural in any email client.
3. **Short paragraphs** — 2-3 sentences max per paragraph. White space is your friend.
4. **Simple lists** — If listing items, use plain dashes. No fancy formatting.

**Good:**
```
Here's what I can share:
- A few options that match your criteria
- Quick comparison of the top picks
- 15-min call this week to walk through them
```

**Bad:**
```
**What I Can Offer:**
- **Options** matching your criteria
- **Comparison** of top picks
```

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

```
IF email available:
  → Email preferred for formal outreach
  → Also provide WhatsApp/SMS version

IF no email:
  → WhatsApp/SMS message
  → Shorter, more conversational

IF warm intro possible:
  → Suggest mutual connection outreach first
```

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

```markdown
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
```

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
