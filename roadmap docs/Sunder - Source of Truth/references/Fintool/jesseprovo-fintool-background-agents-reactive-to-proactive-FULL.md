# Background Agents: From Reactive Alerts to Proactive Discovery

**Source:** Jesse Provost (@JesseProvo) - Twitter Thread
**Date:** 2026-02-01
**Company:** Fintool

---

## Overview

Alerting systems are one of the most natural applications for AI agents. The pattern is simple: monitor for conditions, evaluate when they're met, take action. But traditional alerts are brittle—they match keywords without understanding meaning, fire on schedules without considering context, and require manual configuration for every trigger.

Agents change this. An agent can:
- Understand what you actually care about
- Discover where that information appears
- Interpret whether a match is genuinely relevant
- Maintain state across runs
- Update its own configuration
- Learn from your behavior

At Fintool, we've built an alerting system grounded in these principles. Our domain is financial research: SEC filings, earnings calls, press releases, market data. An investment analyst covering 50 companies might need to monitor all of these across their entire portfolio. Traditional alerting offers two inadequate options: subscribe to everything and suffer notification fatigue, or miss critical information.

---

## The Relevance Problem

The fundamental challenge with financial alerts is that relevance varies by profession and context:
- A portfolio manager cares about different signals than a credit analyst
- A merger arbitrageur needs different triggers than a dividend investor
- What constitutes "material" information depends entirely on the user's investment thesis

**Example: "Alert me when a company announces layoffs"**

This seems straightforward until you realize:
- Layoffs might be disclosed in an 8-K, mentioned in an earnings call, announced in a press release, or buried in a 10-Q footnote
- The word "layoffs" might not appear. Companies use "workforce reduction," "restructuring," "right-sizing," or "headcount optimization"
- Not all layoff mentions are announcements. A CEO might say "we have no plans for layoffs" or reference layoffs from years ago
- Materiality varies: 100 layoffs at a 500-person company is significant; 100 at a 50,000-person company is noise

**The insight:** Separate triggering from analysis. Cast a wide net with triggers, erring heavily on the side of inclusion. Then let AI handle the semantic interpretation.

---

## Creating Alerts Through Conversation

Users describe what they want and AI handles the rest—no forms or configuration syntax.

This is built on **Agent Skills** (see Anthropic, OpenAI)—organized folders of instructions, scripts, and resources that agents can discover and load dynamically. A skill encodes not just mechanical steps, but domain knowledge that makes those steps effective.

**Workflow when user says "set up an alert for when any biotech in my portfolio mentions Phase 3 trial results":**

1. Search recent documents to discover which document types typically contain Phase 3 mentions
2. Report findings: "I found Phase 3 discussions in 8-Ks, earnings calls, and press releases over the past year"
3. Ask clarifying questions when requirements are ambiguous
4. Present a plan with explicit trigger conditions and proposed action
5. Create the alert only after the user confirms

**Step 3 is crucial.** Real user requests are often underspecified:
- "Alert me about earnings" could mean releases, calls, surprises, or guidance changes
- "My watchlist" is ambiguous when a user has three watchlists
- "Important news" means different things to different people

Rather than guessing, the AI asks—presenting 2-4 concrete options rather than open-ended questions.

---

## Principles Encoded in the Skill

These emerged from watching real users struggle with traditional alerting systems.

### Discovery first, configuration after
Don't assume you know which document types matter. Search broadly and let the data inform your choices. A user asking about "dividend announcements" might not realize these appear in 8-Ks, earnings calls, AND press releases.

### Keywords match text, not meaning
Keywords filter documents that contain certain words, but they can't interpret whether those words indicate the thing the user cares about. Use topic nouns ("layoffs," "restructuring," "headcount") rather than action verbs ("announced," "cut," "reduced"). The action verbs are too generic and create false positives.

### Err on the side of coverage
Missing an event is far worse than a false positive. Different document types release at different times. A company might announce layoffs in a press release weeks before it appears in a 10-Q. Monitoring only one document type means missing the early signal.

---

## Under the Hood: Two Trigger Mechanisms

### Publication Alerts

Publication alerts fire when documents arrive. The architecture is event-driven.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              PUBLICATION ALERT PIPELINE                                             │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

  STAGE 1           STAGE 2           STAGE 3              STAGE 4                STAGE 5
  DOCUMENT          MESSAGE           LAMBDA               FILTER                 TEMPORAL
  INGESTION         QUEUE             PROCESSING           EVALUATION             WORKFLOW

 ┌─────────┐      ┌─────────┐       ┌─────────┐      ┌──────────────────┐      ┌─────────────┐
 │  ┌───┐  │      │ ═══════ │       │    λ    │      │  Matching Logic  │      │  ┌───────┐  │
 │  │8-K│  │ ───► │ ═══════ │ ───►  │         │ ───► │                  │ ───► │  │ ◉───◉ │  │
 │  └───┘  │      │ ═══════ │       │         │      │ ☑ Doc Type → 8-K │      │  │ │   │ │  │
 └─────────┘      └─────────┘       └─────────┘      │ ☑ Ticker → AAPL  │      │  └───────┘  │
                                                     │ ☑ Keywords ✓     │      └─────────────┘
  SEC Filing       SQS Queue        process_         │ ☑ Watchlist ✓    │       AIAlertWorkflow
  Arrives          Event queued     publication      │                  │       Durable execution
  AAPL files       for processing   Evaluates        │ ALL pass → Alert │       with retry logic
  8-K at 4:32 PM                    against all      │ ✗ Any fail → No  │
                                    active alerts    └──────────────────┘
     ~50ms            ~200ms


  STAGE 6           STAGE 7
  AI                EMAIL
  EXECUTION         DELIVERY

 ┌─────────┐      ┌─────────┐
 │  ┌───┐  │      │   ✉️    │
 │  │ AI│  │ ───► │   ───   │
 │  └───┘  │      │    ✓    │
 └─────────┘      └─────────┘

  chat_v4          Email Sent
  Runs prompt      user@company.com
  with document    "AAPL Alert: 200
  context          employees..."

     ~15s
```

**Matching logic evaluates four filter dimensions (AND'd together):**
- **Document type:** Is the publication's type in the alert's configured list?
- **Ticker:** Is the company in the alert's universe?
- **Keywords:** Query Elasticsearch against indexed chunks
- **Watchlist membership:** Resolves dynamically at match time

When a document matches, we fire the AI workflow with document context. The Lambda marks the publication/alert pair as processed, ensuring no re-fire if the document gets reindexed.

---

### Scheduled Alerts

Scheduled alerts run on time-based triggers. A CloudWatch Events rule invokes a Lambda (`check_cron_alerts`) every 10 minutes, querying for alerts where `next_run_at` is in the past.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              SCHEDULED ALERT PIPELINE                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌───────────────┐
                        ┌──────────►│  CloudWatch   │◄──────────┐
                        │           │    Events     │           │
                        │           │ Every 10 min  │           │
                        │           └───────┬───────┘           │
                        │                   │                   │
                        │                   ▼                   │
                        │           ┌───────────────┐           │
                        │           │      λ        │           │
                        │           │ check_cron_   │           │
                        │           │    alerts     │           │
                        │           │               │           │
                        │           │ WHERE next_   │           │
                        │           │ run_at<=NOW() │           │
                        │           └───────┬───────┘           │
                        │                   │                   │
                        │                   ▼                   │
                        │              ◆─────────◆              │
                        │             ╱  Script   ╲             │
                        │            ╱   exists?   ╲            │
                        │            ╲             ╱            │
                        │             ╲           ╱             │
  Cycle repeats         │              ◆────┬────◆              │
        │               │           Yes │   │ No               │
        │               │               ▼   │                  │
        │               │      ┌────────────┴──┐               │
┌───────┴───────┐       │      │  E2B Sandbox  │               │
│   Compute     │       │      │               │               │
│  next_run_at  │       │      │ price=$(curl  │               │
│               │       │      │   api/price)  │               │
│ Parse RRULE,  │       │      │ if [ $price   │               │
│ find next     │       │      │   -lt 200 ];  │               │
│ occurrence    │       │      │ then echo true│               │
│               │       │      │ fi            │               │
│ Next run:     │       │      └───────┬───────┘               │
│ tomorrow 8:30 │       │              │                       │
└───────┬───────┘       │              ▼                       │
        │               │         ◆─────────◆                  │
        │               │        ╱  stdout   ╲                 │
        │               │       ╱  == true?   ╲                │
        │               │       ╲             ╱                │
        │               │        ╲           ╱                 │
        │               │         ◆────┬────◆                  │
        │               │      Yes │   │ No                    │
        ▲               │          │   │                       │
        │               │          │   ▼                       │
┌───────┴───────┐       │          │  ┌─────────────┐          │
│    Results    │       │          │  │   Alert     │          │
│    Emailed    │       │          │  │   Skipped   │          │
│               │       │          │  │             │          │
│ Alert         │       │          │  │ Script      │          │
│ delivered     │       │          │  │ returned    │          │
│ to user       │       │          │  │ false       │          │
└───────────────┘       │          │  └─────────────┘          │
        ▲               │          │                           │
        │               │          ▼                           │
┌───────┴───────┐       │  ┌───────────────┐                   │
│    Prompt     │◄──────┼──│AIAlertWorkflow│◄──────────────────┘
│   Execution   │       │  │               │
│               │       │  │ Durable       │
│ Full chat     │       │  │ execution     │
│ infrastructure│       │  └───────────────┘
└───────────────┘       │
        │               │
        └───────────────┘
```

**Schedules are stored as iCal VEVENTs**, giving expressiveness:
- "every weekday at 8:30 AM ET"
- "first Monday of each month"
- one-time alerts using DTSTART without a recurrence rule

**Pre-check scripts** enable conditional scheduling:
- "every hour, but only if the market is open"
- "daily, but only if my portfolio is down more than 2%"

**Example of self-configuring alert:**
> "Write me earnings previews for my Tech Holdings watchlist. Store the prompt template and state in `/earnings-preview.md`. Schedule this alert to run 7 days before the earliest confirmed earnings date in the watchlist. After writing a preview, update the schedule to target the next earliest date."

The alert minimizes unnecessary runs by scheduling itself for specific dates rather than polling daily.

---

### Unified Execution

Both alert types terminate in the same execution layer: a **Temporal workflow** that receives context and a user-defined prompt, runs analysis using full chat infrastructure, and emails results.

**The prompt is entirely user-defined.** Examples:

Simple:
> "Summarize the key points."

Sophisticated:
> "Analyze this 8-K for workforce reduction announcements. Extract: employees affected, departments impacted, timeline, cost savings. Only email if material (>100 employees or >5% of workforce). If the filing mentions layoffs but doesn't announce new ones, do not email."

---

## The Complexity Spectrum

| Level | Example | How It Works |
|-------|---------|--------------|
| **Document/Scheduled Filters** | "Alert if AAPL drops below $200" | Bash scripts in sandbox; matches against tickers, types, keywords. No AI in filtering. |
| **Thesis Monitoring** | "Alert if anything suggests AI training demand is cooling" | Prompt evaluates each document against investment thesis |
| **Proactive Screening** | "Surface any company that matches my investment style" | Continuously monitors entire market, maintains dynamic screens |

The first category scales elegantly—just database queries and Elasticsearch lookups. The second adds LLM analysis only when documents pass the filter. The third is the frontier.

---

## Thesis File Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              THESIS FILE LIFECYCLE                                                  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘

    USER ARTIFACTS                    THESIS FILE                    MONITORING LOOP

  ┌─────────────┐                 ┌─────────────────────┐         ┌─────────────────┐
  │ NVDA Bull   │                 │  nvda-thesis.md     │         │  Each alert     │
  │ Case        │                 │                     │         │  evaluates      │
  │ ─────────── │                 │  # NVDA Investment  │         │  against thesis │
  │ investment  │                 │    Thesis           │         │                 │
  │ memo        │                 │                     │         │   ┌─────────┐   │
  └──────┬──────┘                 │  ## Core Beliefs    │         │   │ NVDA    │   │
         │        ═══════════╗    │  • AI training      │◄────────┼───│ 8-K     │   │
         │                   ║    │    demand growing   │         │   └─────────┘   │
  ┌──────┴──────┐            ║    │  • CUDA lock-in     │         │                 │
  │ Re: NVDA    │            ║    │    protects margins │         │   ┌─────────┐   │
  │ position    │            ║    │                     │         │   │ MSFT    │   │
  │ sizing      │   AI       ║    │  ## Key Assumptions │◄────────┼───│ earnings│   │
  │ ─────────── │   synthe-  ╠═══►│  • Hyperscaler      │         │   │ call    │   │
  │ email       │   sizes    ║    │    CapEx expanding  │         │   └─────────┘   │
  └──────┬──────┘   thesis   ║    │  • Gross margins    │         │                 │
         │                   ║    │    >70%             │         │   ┌─────────┐   │
  ┌──────┴──────┐            ║    │                     │         │   │ AMD     │   │
  │ ┌─────────┐ │            ║    │  ## Evidence Log    │◄────────┼───│ press   │   │
  │ │ NVDA    │ │            ║    │  [2025-01-15] Q4:   │         │   │ release │   │
  │ │ Model   │ │            ║    │    40% DC growth ✓  │         │   └─────────┘   │
  │ └─────────┘ │   Extracts ║    │  [2025-01-20] MSFT  │         │                 │
  │ Excel model │   core     ║    │    CapEx +15% ✓     │         └────────┬────────┘
  └──────┬──────┘   beliefs, ║    │  [2025-01-26]       │                  │
         │          key      ║    │    Customer says    │    Thesis        │
  ┌──────┴──────┐   assump-  ║    │    "optimizing      │    updated       │
  │ Call with   │   tions,   ║    │    existing infra"  │    with new      │
  │ TSMC        │   signals  ║    │    - potential      │    evidence      │
  │ analyst     │   to watch ╝    │    demand concern   │                  │
  │ ─────────── │                 │                     │                  │
  │ expert call │                 │  Last updated:      │                  │
  └─────────────┘                 │  2 hours ago        │                  │
                                  └──────────┬──────────┘                  │
                                             │                             │
                                             ▼                             │
                              ┌──────────────────────────────┐             │
                              │       DRIFT DETECTION        │◄────────────┘
                              │                              │
                              │  ┌────────────────────────┐  │
                              │  │ Thesis Confidence      │  │
                              │  │                        │  │
                              │  │  ◄──────────┼──────►   │  │
                              │  │  LOW       72%   HIGH  │  │
                              │  └────────────────────────┘  │
                              │                              │
                              └──────────────┬───────────────┘
                                             │
                                             ▼
                              ┌──────────────────────────────┐
                              │      USER NOTIFICATION       │
                              │                              │
                              │  ⚠️  Thesis Drift Detected   │
                              │                              │
                              │  Your NVDA thesis was        │
                              │  updated—new evidence        │
                              │  suggests demand assumption  │
                              │  may be weakening            │
                              │                              │
                              │  View changes to             │
                              │  nvda-thesis.md →            │
                              └──────────────────────────────┘
```

---

## The Frontier: Proactive Opportunity Discovery

The first two categories work today. The frontier is **proactive opportunity discovery**: instead of monitoring companies you already cover, the system surfaces companies you should be looking at based on your investment style.

**Example:** An investor who focuses on small-cap industrial companies with improving margins and insider buying:

> "CFO just bought $2M of stock in a $400M market cap industrial company. Margins expanded 300bps last quarter. This fits your pattern."

> "An 8-K was just filed showing a board member resignation at a company matching your distressed-to-turnaround criteria."

### Onboarding: Learning How Users Think

Current onboarding:
- Shows what Fintool can access
- Helps create watchlists for portfolio and coverage universe
- Asks about investment style (sectors, market cap, long/short orientation, holding period)
- Offers to connect cloud services (OneNote, OneDrive, Notion)
- Creates `UserMemories.md` capturing preferences

**Deeper approach:** With permission, explore user's filesystem artifacts:
- **Investment memos:** What thesis structure do they use? What assumptions do they call out?
- **Excel models:** What metrics do they track? What are their key drivers?
- **Email threads:** What questions do they ask on expert calls? What signals trigger action?
- **Notes and annotations:** What do they highlight in filings?

From this, identify:
- Companies they're covering
- Investment style (growth vs. value, time horizon, risk tolerance)
- Thesis structure
- Decision triggers

### Dynamic Screens

Once we understand the user's style, we automatically generate and maintain screens:

```markdown
# Small-Cap Industrial Turnarounds
Last updated: 2025-01-26

## Criteria
- Market cap: $200M - $2B
- Sector: Industrials
- Margin trajectory: Expanding (2+ consecutive quarters)
- Insider activity: Net buying in past 90 days
- Catalyst: Recent management change, activist involvement, or strategic review

## Current Matches
- EXAMPLE1: Margins +280bps, CFO bought $1.2M last month
- EXAMPLE2: New CEO from competitor, announced cost review

## Recently Removed
- EXAMPLE3: Market cap exceeded $2B after rally
```

The system continuously evaluates new filings, transcripts, and insider transactions against these criteria. The screens are living documents that refine based on user behavior.

---

## Practical Considerations

- **Idempotence:** Track processed document/alert pairs to prevent re-firing when documents get reindexed
- **Timeliness verification:** Prompts instruct AI to verify information is genuinely new (companies often repeat old news)
- **Point-in-time snapshots:** "S&P 500 companies" resolves to a concrete ticker list at creation time

---

## What Makes This State-of-the-Art

Most financial alerting systems fall into three categories:

| Approach | Problem |
|----------|---------|
| **Keyword matching** | High false-positive rates, misses synonyms, context, negations |
| **Pre-packaged event types** | Can't handle "management commentary about supply chain issues" |
| **Manual monitoring** | Doesn't scale |

**Fintool's approach:** Combines precise triggering with semantic analysis. The trigger layer handles high-volume filtering. The execution layer handles interpretation.

This separation lets us err on coverage while maintaining precision. The user-defined prompt adapts to each user's needs. And because the AI can read and write files, alerts can be self-configuring.

---

## Looking Forward

Building toward a future where every investor has a tireless analyst monitoring their portfolio, surfacing only what's genuinely important:

- A skill system that makes alert creation conversational and accessible
- Event-driven triggers that catch documents as they arrive
- Scheduled triggers that can run arbitrary analysis on any cadence
- Pre-check scripts that gate alerts on quantitative conditions
- LLM-based filters that gate alerts on semantic conditions
- Stateful monitoring that synthesizes across observations

**The goal isn't to replace human judgment—it's to ensure humans are judging the right things.** When an investment thesis is invalidated, the investor should know immediately, not discover it in hindsight while wondering what they missed.

---

## Related

- [[Fintool - Lessons Building AI Agents for Financial Services]]
