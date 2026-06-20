# How to Make Your AI Agent Its Own Forward-Deployed Engineer

**Source:** X Article by @ishanxnagpal (Fintool)
**Date:** Jan 28, 2026
**Views:** 41.9K
**Tags:** #ai-agents #skills #proactive-automation #fde #fintool #filesystem #continual-learning

---

## The FDE Concept

Palantir invented the Forward Deployed Engineer. Embed a technical person with the customer. Learn their domain, customize the product, make it indispensable.

The key thing FDEs do that most software doesn't: they notice patterns in how you work and build automation around them. They don't wait for you to ask. They watch, learn, propose, and implement.

That's what Fintool automated.

---

## Where Agents Are Today

Skills are the hot primitive. Claude introduced them. Cursor added them in January. Agent Skills is becoming an open standard.

A skill is a `SKILL.md` file that teaches the agent how to do something. Anthropic calls them "executable knowledge packages." The key innovation: **progressive disclosure**. Agent sees skill metadata upfront, only loads full instructions when relevant. Scales without bloating context.

Claude Code and even the infamous clawdebot have Skill Creator skills now. You tell the agent "save this as a skill" and it writes the file.

But that's reactive. You have to ask.

```
+---------------------------------------------------------------+-------------------------------------------------------------+
|                        REACTIVE                               |                       PROACTIVE                             |
+---------------------------------------------------------------+-------------------------------------------------------------+
|                                                               |                                                             |
|                                                               |               +---> Detects ----+                          |
|                                                               |              /      patterns     \                         |
|                                                               |             /                     v                        |
|   +------------+        +--------------+                      |    Agent  --+                   Proposes                   |
|   | User asks  | -----> | Agent creates|                      |    watches                      skill                     |
|   |            |        | skill        |                      |        ^                         |                         |
|   +------------+        +--------------+                      |         \                       v                          |
|                                                               |          +--- Skill  <--- User                            |
|                                                               |               saved       approves                        |
|                                                               |                                                           |
|   "You have to ask"                                           |   "Agent notices before you ask"                          |
|     - 'make me a skill for X'                                 |                                                           |
|     - 'save this as a template'                               |   [Weekly pattern detection across all conversations]     |
|                                                               |                                                           |
|   'Claude, Cursor, Clawdbot' (current tools)                 |   'FDE Agent' (the future)                                |
+---------------------------------------------------------------+-------------------------------------------------------------+
```

---

## What an FDE Actually Does

An FDE doesn't wait for you to ask for automation. They watch how you work. They notice you do the same analysis every quarter. They notice you always check the same five metrics. They notice you uploaded the same Excel template three times.

Then they say: "I noticed you keep doing this. Want me to automate it?"

That's the difference between a tool and a coworker.

The agent actually has an advantage over a human FDE: it can hold your entire history in context. Every conversation, every watchlist, every document you've created. A human forgets. The agent doesn't. More context means better pattern detection, better proactive suggestions.

---

## Architecture: Two Trigger Paths, One Agent

Two trigger types feed the same agent:

- **Scheduled triggers** run on cron. A Lambda checks schedules every 10 minutes, matches alerts, queues workflows.
- **Publication triggers** fire on events. New SEC filing drops, hits event queue, Lambda matches alerts, queues workflow.

Both paths converge on the same AI agent with full context: user filesystem, conversation history, email delivery. Same agent that handles chat. No separate system.

```
  TOP PATH: SCHEDULED ALERTS
  ===========================

  +--------+     +--------+     +--------+     +--------+
  | Every  |---->| Check  |---->| Match  |---->| Queue  |----+
  | 10 min |     |schedules|    | alerts |     |workflow|    |
  +--------+     +--------+     +--------+     +--------+    |
                                                              |     +------------+     +---------------+
                                                              +---->|            |---->| Email sent    |
                                                                    |  AI Agent  |---->| Skill created |
                                                              +---->| Same agent,|---->| Content       |
                                                              |     | full tool  |     | published     |
  BOTTOM PATH: PUBLICATION ALERTS                             |     | access     |
  ================================                            |     +------------+
                                                              |        ^  ^  ^
  +--------+     +--------+     +--------+     +--------+    |        |  |  |
  |  New   |---->| Event  |---->| Match  |---->| Queue  |----+        |  |  |
  | filing/|     | queue  |     | alerts |     |workflow|          +--+  |  +--+
  |transcr.|     +--------+     +--------+     +--------+          |     |     |
  +--------+                                                    User  Convo  Email
                                                               filesys history delivery
```

The FDE at Fintool is the **Proactive skill creator**, which is a scheduled trigger. Runs weekly. The prompt:

> "Review this user's last week of conversations. If patterns exist, draft skill recommendations and email them. If nothing, stay silent."

---

## The Filesystem

Each user gets their own filesystem rooted at their `{user_uuid}`. System skills live in `/public/`. Agent reads both.

```
/{user_uuid}/
|-- memories/
|   +-- UserMemories.md
|-- skills/          # their custom skills
|-- watchlists/
+-- artifacts/

/public/
|-- skills/          # system skills (everyone gets these)
+-- ...
```

What you see is what the agent sees. No hidden state. You can grep your entire knowledge base like a codebase.

**Why filesystem?** LLMs already know how to use them. It's in the pretraining. Vercel found they could replace most custom tooling with a filesystem tool and a bash tool. Cost dropped 75%. Letta's benchmark showed filesystem-based agents scored 74% on memory tasks, beating specialized memory tools.

The filesystem is all you need for continual learning. Files accumulate. The agent navigates, searches, understands structure.

---

## The Three FDE Loops

The filesystem enables three loops:

### 1. Learning Loop

User signs up. Agent asks what they do, how they invest. Writes to `UserMemories.md`. Every session, reads it first. Doesn't ask "what do you care about" again.

```
  +--[ Fintool Onboarding UI ]--------------------------------------------+
  |                                                                        |
  |  "do an onboarding for me"                                            |
  |                                                                        |
  |  Asked question > Answered:                                           |
  |  +----------------------------------------------------------------+   |
  |  | 1. What sectors do you focus on?                               |   |
  |  |    Technology, Financials                                      |   |
  |  |                                                                |   |
  |  | 2. What market cap range do you typically focus on?            |   |
  |  |    Mid caps ($2B-$10B)                                         |   |
  |  +----------------------------------------------------------------+   |
  |                                                                        |
  |  Asking question > Awaiting response:                                 |
  |  +----------------------------------------------------------------+   |
  |  | Style: What's your investment orientation?                     |   |
  |  |                                                                |   |
  |  |  [ Long-only      ] Only buy positions                        |   |
  |  |  [ Long/short     ] Both long and short positions             |   |
  |  |  [ Just researching] No active positions, research only       |   |
  |  +----------------------------------------------------------------+   |
  +------------------------------------------------------------------------+
```

### 2. Automation Loop

Runs weekly. Agent reviews your conversations, spots repeated templates, repeated document structures, repeated workflows. Emails recommendations. User replies yes. Agent writes `SKILL.md`. The product customizes itself to how they work.

```
  +--[ Email: "I found a workflow I can automate for you" ]---------------+
  |                                                                       |
  |  From: Fintool <memos@fintool.com>                                   |
  |                                                                       |
  |  Hi,                                                                  |
  |  I reviewed your conversations from the past week and noticed         |
  |  a pattern.                                                           |
  |                                                                       |
  |  +---------------------------------------------------------------+   |
  |  | DCF Valuation Template                                        |   |
  |  |                                                               |   |
  |  | You've run 4 DCF valuations this month (CRWD, PANW, FTNT,    |   |
  |  | ZS) and they all use the same assumptions:                    |   |
  |  |   - 10-year projection period                                 |   |
  |  |   - Revenue growth fading from current to 3% terminal         |   |
  |  |   - WACC: 10-12% for software companies                      |   |
  |  |   - Terminal multiple: 15-20x FCF based on growth profile     |   |
  |  |   - Three scenarios: base, bull (+20% to terminal),           |   |
  |  |     bear (-20%)                                               |   |
  |  |   - Output as Excel with sensitivity tables                   |   |
  |  +---------------------------------------------------------------+   |
  |                                                                       |
  |  Want me to save this as a reusable skill?                           |
  |  Once saved, you can just say "run a DCF on DDOG" and I'll pull     |
  |  the financials, apply your assumptions, build the three scenarios,  |
  |  and generate the Excel with sensitivity tables. Same structure      |
  |  every time.                                                         |
  |                                                                       |
  |  [ Yes, create this skill ]    [ Not now ]                           |
  +-----------------------------------------------------------------------+
```

### 3. Outreach Loop

User goes quiet. Trigger fires. Agent checks their watchlists, sees something happened. Sends personalized email with research attached. Not a drip campaign. Actual relevance.

```
  +--[ Email: "You haven't been back in a while" ]------------------------+
  |                                                                        |
  |  From: Fintool <memos@fintool.com>                                    |
  |                                                                        |
  |  Hi,                                                                   |
  |  I noticed you haven't logged in for a few weeks. A few things        |
  |  happened in your Technology watchlist that might be worth             |
  |  catching up on:                                                       |
  |                                                                        |
  |  +----------------------------------------------------------------+   |
  |  | INTC filed an 8-K announcing CEO departure                     |   |
  |  | Pat Gelsinger out. Stock down 8% on the news. Interim          |   |
  |  | co-CEOs appointed.                                             |   |
  |  +----------------------------------------------------------------+   |
  |  +----------------------------------------------------------------+   |
  |  | AMD raised guidance at CES                                     |   |
  |  | MI350 chips shipping ahead of schedule. Data center revenue    |   |
  |  | guide raised to $8B for 2026.                                  |   |
  |  +----------------------------------------------------------------+   |
  |  +----------------------------------------------------------------+   |
  |  | ASML missed bookings estimates                                 |   |
  |  | Q4 orders E2.6B vs E4.0B expected. China restrictions cited.   |   |
  |  | Stock -12% in two sessions.                                    |   |
  |  +----------------------------------------------------------------+   |
  |                                                                        |
  |  Based on your watchlist, you might want to try:                      |
  |  +----------------------------------------------------------------+   |
  |  | "Screen my Technology watchlist for companies that beat        |   |
  |  |  estimates and raised guidance this quarter"                   |   |
  |  +----------------------------------------------------------------+   |
  |                                                                        |
  |  [ Open Fintool ]                                                     |
  +------------------------------------------------------------------------+
```

That's specific to their data. A different user gets different events, different suggestions.

---

## Skills That Matter

Skills load on-demand. The agent sees skill metadata upfront but only loads the full content when relevant. There are 2 types of skills relevant no matter your vertical:

1. **System skills** ship with the product. Data sources, workflows, document generators. Engineers and non-engineers collaborate to write them. Domain expertise encoded in markdown.

2. **User skills** don't exist until the agent creates them. Patterns detected, skill proposed, user approves, skill saved.

```
              Skills Compound Over Time
  ================================================

    Week 1              Month 1              Month 3
   +------+           +--------+           +----------+
   |      |           |        |           |          |
   | [  ] |           | [    ] |           | [      ] |
   |      |           | [    ] |           | [      ] |
   +------+           +--------+           | [      ] |
                                           | [      ] |
   0 skills           2 skills            | [      ] |
   Agent knows        Earnings memo,       +----------+
   nothing about      quarterly model      5+ skills
   how you work                            LLM gets caught up
                                           on your style instantly

   <----------- Skills accumulate over time ----------->
```

Skills accumulate. Week 1, the agent knows nothing specific to you. Month 3, it has five skills tailored to how you work.

---

## Conclusion

Palantir-esque FDEs cost millions. They don't scale.

Fintool built one that runs on cron. It watches every user, learns their patterns, and builds automation before they think to ask. The longer someone uses the product, the more it customizes itself to how they work.

**That's the difference between a tool and a coworker.**

---

## BONUS: How Fintool Automated Inbound (10M+ Monthly Impressions on Google Search)

Same architecture. Same skills. They created a Fintool account for SEO.

The account has its own filesystem, its own watchlists, and its own skills. They wrote skills for news articles, earnings recaps, company pages, and a dozen more. They are organized in a neatly grepable filesystem, essentially Markdown (`.md`) guideline files that describe what context to gather and what to write (and how).

Triggers fire when earnings drop, when filings hit, when news breaks. The agent reads the relevant skill file, follows the instructions, writes the content, and publishes to fintool.com/news.

**Result:** 10M+ monthly impressions across Google Search, ChatGPT, and Perplexity. No content team. Completely autonomous.

- Google indexes the pages
- ChatGPT and Perplexity cite them when users ask financial questions
- AI referral traffic converts **4x better** than traditional search
- The content is structured for both humans and models

The same AI agent that customizes the product for users also generates the content that brings users in.

---

## Key Takeaways

- **Skills as primitives:** `SKILL.md` files = executable knowledge packages with progressive disclosure
- **Proactive > Reactive:** Don't wait for users to ask for automation; detect patterns and propose
- **Filesystem-based memory:** LLMs already know filesystems from pretraining; beats specialized memory tools (Letta benchmark: 74%)
- **Three loops:** Learning (onboarding), Automation (weekly pattern detection), Outreach (re-engagement)
- **Two trigger types:** Scheduled (cron) + Publication (event-driven), both feeding the same agent
- **Skills compound:** Week 1 = generic, Month 3 = deeply personalized
- **Same architecture for SEO:** Agent writes content autonomously; 10M+ impressions, 4x conversion vs traditional search
