# Every SaaS Is Now an API. Whether They Like It or Not.

**Author:** Nicolas Bustamante
**Published:** February 23, 2026
**Source:** https://x.com/nicbstme/status/1893368830423752704

## Subtitle

I don't log into any of my SaaS anymore. My agent does. Every piece of software my company uses, I access through a single AI agent connected to their APIs.

---

## In This Article

- Why people judge AI by ChatGPT and why that's like judging the internet by AOL
- My actual daily workflow: every SaaS product, accessed through an agent, never through their interface
- Why headless is better: the power of merging context across sources
- How my agent builds memory files that make it smarter every day (system of record)
- A real story from my fundraise that shows what this looks like in practice
- Why every SaaS is now an API, and what happens to those that don't have one (WebMCP, browser agents, and the end of the UI moat)
- Business to Agent (B2A): the most underrated shift in enterprise software
- Why some SaaS are heading toward perfect competition

---

## My Setup: Every SaaS Product, Zero Dashboards

I use Claude Code as a general purpose agent harness. Not as a chatbot. As an operating system for running my company. It's connected via API to every tool I use:

Brex for banking. QuickBooks for accounting. HubSpot for CRM. Gmail for email. Stripe for invoicing and payments. Mixpanel for product analytics. Datadog for infrastructure monitoring. Braintrust for LLM evals. Granola for meeting notes etc etc.

I do not log into any of these products. I talk to my agent and it talks to them.

### HOW I USE SOFTWARE IN 2026

```
┌──────────────────────────────────────────────────────┐
│            HOW I USE SOFTWARE IN 2026                 │
├──────────────────────────────────────────────────────┤
│                                                      │
│              Claude Code                             │
│           (Agent Harness)                            │
│                  │                                   │
│    ┌─────┬──────┼──────┬───────┬───────┐            │
│    │     │      │      │       │       │            │
│  Brex  Quick  HubSpot Gmail  Stripe  GitHub         │
│  Bank  Books   CRM    Email  Paymts  Code           │
│    │     │      │      │       │       │            │
│  Mixpnl Datadog Braintr. Granola Pulley Slack       │
│  Analytc Monitor LLMEval Meeting CapTbl Comms       │
│                                                      │
│  Nicolas <-> Natural Language <-> Agent <-> 12+ APIs │
│                                                      │
└──────────────────────────────────────────────────────┘
```

When I want to know how a customer is doing, I don't open HubSpot, then open Mixpanel, then open QuickBooks in three different browser tabs and try to piece together the story. I say: "Give me a full picture of Kennedy Capital. Pull their deal history from HubSpot, their product usage from Mixpanel, their invoicing and payment status from Stripe, and any recent support threads from Gmail." The agent goes to four different APIs, fetches everything, merges the context, and gives me one coherent answer.

**The power of headless isn't avoiding dashboards. It's merging context from sources that were never designed to talk to each other.**

No human can hold the full context of CRM, analytics, payments, and email in working memory at the same time. The agent can. And when it has all that context simultaneously, the quality of its analysis is fundamentally different from what you get by looking at each system individually.

The interaction model is not just text in, text out. When the agent hits a decision point, it surfaces a structured question with options:

### AGENT INTERACTION PATTERN

```
┌─────────────────────────────────────────────────┐
│ Agent: Pulling Kennedy Capital data...           │
│        HubSpot: 3 deals, 2 closed, 1 in pipeline│
│        Mixpanel: Usage up 40% last month         │
│        Stripe: Invoice #891 overdue 15 days      │
├─────────────────────────────────────────────────┤
│                                                  │
│  Invoice overdue 15 days. Want me to:            │
│                                                  │
│  [A] Draft a check-in email to their PM          │
│  [B] Schedule a call and prep talking points     │
│  [C] Just flag it, I'll handle it                │
│                                                  │
├─────────────────────────────────────────────────┤
│ Nicolas: B                                       │
│                                                  │
│ Agent: Scheduling call, pulling their recent     │
│        feature requests from Gmail to prep...    │
└─────────────────────────────────────────────────┘
```

This is UI. It's just UI that the agent assembled dynamically from four data sources in ten seconds. No SaaS company on earth builds a dashboard that shows you HubSpot deal status + Mixpanel usage trends + Stripe invoicing + Gmail threads in one view. But the agent does. Because it has access to all of them through APIs.

People who say "I prefer a UI to text" haven't seen this. They're imagining typing into ChatGPT and getting a wall of text back. That's not what this is. This is a dynamic interface that's better than any dashboard because it's not limited to one vendor's data.

---

## Why Headless Is Better: Context Merging and Memory

The single biggest advantage of working through an agent is something no SaaS dashboard will ever give you: **merged context across every system your business runs on.**

When I ask my agent a question, it doesn't just query one system. It queries all of them and reasons over the combined data. This is categorically different from what any individual SaaS product can offer. Mixpanel can show me product analytics. But it can't tell me which of my dropping-usage accounts also has an overdue invoice in Stripe and a stalled deal in HubSpot. The agent can, because it sees everything.

But context merging is just the beginning. **The second superpower is memory.**

I've instructed my agent to maintain detailed memory files about how I work. It writes a daily changelog of every action it takes: what it queried, what decisions I made, what the outcomes were. It maintains a folder of key decisions and the reasoning behind them. It tracks my work preferences: how I like reports formatted, which metrics I care about, how I evaluate new tools, my communication style.

### AGENT MEMORY STRUCTURE

```
/memories/
├── work-preferences.md          <- How I like things done
├── key-decisions/
│   ├── 2026-01-hiring.md        <- Why we hired Wei
│   ├── 2026-01-payroll.md       <- Why we're leaving Rippling
│   └── 2026-02-fundraise.md     <- Due diligence approach
├── daily-changelog/
│   ├── 2026-02-17.md            <- Actions taken, decisions made
│   ├── 2026-02-18.md
│   └── 2026-02-19.md
└── context/
    ├── customers.md             <- Key accounts and status
    └── team.md                  <- Team context and preferences
```

Over time, this makes the agent dramatically better. It doesn't just know what I asked today. It knows what I decided last month, why I decided it, and how I like to approach similar problems. It's building institutional knowledge that normally lives in the heads of a lot of different people. Except it's in files, it's searchable, and it never forgets.

At Doctrine, institutional knowledge lived in people. When my VP of Finance left, his understanding of our billing quirks, our investor reporting preferences, our accounting edge cases, all of that walked out the door with him. With an agent that maintains structured memory files, that knowledge persists. It compounds.

> This is why I work headless. Not because I hate UIs. Because the combination of cross-system context merging and persistent memory is so much more powerful than any single SaaS dashboard that going back feels like using a calculator after you've had a spreadsheet.

---

## A Real Example: The Fundraising Due Diligence Problem

When I was raising money for Fintool, our investors flagged an issue during due diligence. We had non-voided invoices in Stripe that were being counted as bad debt in the books. It looked like we had receivables we couldn't collect. In reality, these were invoices that should have been voided but weren't. A bookkeeping cleanup issue, not a business problem. But to prove that to investors, I needed to pull the full picture across multiple systems.

### BEFORE: MANUAL vs AFTER: AGENT

```
┌─────────────────────────────┐  ┌─────────────────────────────────┐
│        BEFORE: MANUAL       │  │         AFTER: AGENT            │
├─────────────────────────────┤  ├─────────────────────────────────┤
│                             │  │                                 │
│ 1. Log into Stripe          │  │ "Reconcile all outstanding      │
│ 2. Log into QuickBooks      │  │  invoices against QuickBks      │
│ 3. Log into Brex            │  │  and Brex. Flag any that        │
│ 4. Log into HubSpot         │  │  should have been voided."      │
│ 5. Export 4 spreadsheets    │  │                                 │
│ 6. Cross-reference Excel    │  │ -> Queries 4 APIs               │
│ 7. Build reconciliation     │  │ -> Asks 1 clarifying Q          │
│ 8. Format for investors     │  │ -> Produces clean Excel         │
│                             │  │ -> Sends Excel to investors     │
│ Time: 6+ hours              │  │                                 │
│ Quality: error prone         │  │ Time: 5 minutes                 │
│ Delegation: impossible       │  │ Quality: better than manual     │
│      (no VP of Finance)     │  │ Delegation: one sentence        │
└─────────────────────────────┘  └─────────────────────────────────┘
```

After I connected my agent to all four APIs, the same task took five minutes. One sentence. The agent pulled data from all four systems, cross-referenced everything, asked me one clarifying question ("This customer has two accounts in HubSpot, which one is the active account?"), and produced a clean Excel file I could send directly to investors.

The output was better than what I would have done manually. Because the agent had perfect context across all four systems simultaneously. Something I can't hold in working memory when I'm flipping between browser tabs and spreadsheets at midnight before a board meeting.

**The magic isn't the chat. It's the context across systems.**

---

## Every SaaS Is Now an API: The Strategic Shift

So here's the question every SaaS founder should be asking: if the future is agents talking to software through APIs, what happens to the software that doesn't have a good API? Or worse, doesn't have one at all?

Three things are happening simultaneously:

### 1. If you have a good API, agents will use it

This is the best case. The agent calls your API, gets clean structured data back, and your product becomes a first-class participant in agentic workflows. This is Brex. This is Stripe. This is QuickBooks. Their APIs are clean, fast, well documented. My agent works beautifully with them.

### 2. If you don't have an API, WebMCP is coming for you

Google Chrome just shipped WebMCP (Web Model Context Protocol) in early preview with Chrome 146 Canary. This is a proposed web standard, developed jointly by Google and Microsoft through the W3C, that lets any website expose structured, callable tools directly to AI agents through the browser.

A single WebMCP tool call replaces what used to be dozens of browser interactions: clicking filters, scrolling pages, parsing results.

### 3. Worst case: agents just browse your site anyway

Even without an API and without WebMCP, agents can already use browser automation to navigate your product. They take screenshots, identify buttons, click through forms, and extract data. It's slow, expensive, and fragile. But it works. And it's getting better every month.

### THE API GRADIENT

```
┌─────────────────┬──────────────────────────────────────┐
│                 │                                      │
│  Best case      │  Clean API                           │
│  (You win)      │  Fast, reliable, structured data     │
│                 │  Agent loves your product             │
│                 │                                      │
├─────────────────┼──────────────────────────────────────┤
│                 │                                      │
│  Middle         │  WebMCP / Browser Standard           │
│  (You lose      │  Website becomes callable tool       │
│   control)      │  Agent uses it, you didn't design it │
│                 │                                      │
├─────────────────┼──────────────────────────────────────┤
│                 │                                      │
│  Worst case     │  Browser automation / Scraping        │
│  (You're        │  Screenshots, clicking, parsing HTML │
│   bypassed)     │  Slow, fragile, you lose all control │
│                 │                                      │
└─────────────────┴──────────────────────────────────────┘
```

The UI moat is collapsing no matter what you do. The only question is whether you participate in that collapse on your terms (good API) or on someone else's (WebMCP, scraping).

> **Your interface is no longer your product. Your data model and your API are.**

### The Rippling Example

I use Rippling for HR and payroll. The UI is painful. My team hates using it. But that's almost beside the point now. The real problem is that Rippling doesn't open their API easily. My agent connects to Brex and QuickBooks seamlessly. But the moment a workflow touches payroll data, everything breaks. The agent can't get clean data out of Rippling. So every workflow that needs HR information -- headcount costs for budgeting, payroll data for investor reporting, employee information for compliance -- I have to do it manually.

**I am actively looking to move to a payroll provider that's API first.** Not because Rippling's features are bad. Not because a competitor gave a better demo. Because my agent can't work with Rippling, and that makes the product useless in the way I actually use software now.

> API quality is now a primary purchasing criterion. If your API fails the agent, you lose the customer.

---

## Business to Agent (B2A): The New Growth Motion

This brings us to what I think is the most underrated shift in enterprise software: the move from B2B to B2A. Business to Agent.

In the B2B world, software is sold to humans. A VP of Finance sits in a demo, clicks around a dashboard, evaluates the UX, compares it to competitors, runs a procurement process, and signs a contract.

In the B2A world, software is consumed by agents. The agent evaluates the API, not the UI. The agent cares about latency, reliability, data richness, and documentation. It doesn't need onboarding. It doesn't care about your NPS.

### B2B PROCUREMENT (OLD) vs B2A PROCUREMENT (NEW)

```
┌──────────────────────────┐  ┌──────────────────────────────┐
│  B2B PROCUREMENT (OLD)   │  │  B2A PROCUREMENT (NEW)       │
├──────────────────────────┤  ├──────────────────────────────┤
│                          │  │                              │
│ 1. Vendor sends pitch    │  │ 1. "Show me API docs"        │
│ 2. VP sits in demo       │  │ 2. Spin up Claude Code       │
│ 3. Clicks around UI      │  │ 3. Point agent at API        │
│ 4. Compares screenshots  │  │ 4. Run real workflow          │
│ 5. Internal committee    │  │ 5. Agent returns result      │
│ 6. Procurement review    │  │                              │
│ 7. Contract signed       │  │ Decision: minutes            │
│                          │  │ Based on: data quality       │
│ Decision: 3-6 months     │  │                              │
│ Based on: UI, demo,      │  │ No demo needed               │
│ relationship, brand      │  │ No committee needed           │
│                          │  │                              │
└──────────────────────────┘  └──────────────────────────────┘
```

This is already how I evaluate tools at Fintool. When we were looking at new software, I didn't sit through demos. I connected Claude Code to each product's API and ran real workflows. The software that produced clean, fast, structured results won. The one where the agent couldn't get data out (Rippling) is getting replaced.

**No API means you're done.** Not eventually. Now. Having an API is just table stakes. The real competition is API quality: speed, reliability, data richness, documentation, error handling. Because agents develop preferences. Or more precisely, the developers building agent workflows develop preferences, and those preferences calcify into defaults. If your API is slow or badly structured, the agent picks a competitor. Silently. Every time.

> The agent becomes the buyer. The agent recommends. The human approves.

---

## The Commoditization Risk: SaaS Meets Perfect Competition?

When the UI moat collapses and everything becomes an API, SaaS starts to look like a commodity market.

What historically justified premium SaaS pricing:
- A beautiful interface that users spent years learning
- Workflow automations that encoded how an entire organization operates
- Integrations that were painful to rebuild
- Training costs, migration costs

All of these created switching costs. And switching costs are what allow you to charge premium.

### HUMAN USER vs AGENT USER: SWITCHING COSTS

```
┌────────────────────────────────┬──────────────────────────────┐
│         HUMAN USER             │        AGENT USER            │
├────────────────────────────────┼──────────────────────────────┤
│                                │                              │
│ Interface muscle memory        │ None (calls APIs)            │
│ Workflow lock-in               │ None (builds own)            │
│ Data migration pain            │ Trivial (API to API)         │
│ Training investment            │ Zero                         │
│ Integration rebuilds           │ Minutes, not months          │
│ Organizational habits          │ Irrelevant                   │
│                                │                              │
│ Switching cost: HIGH           │ Switching cost: ZERO         │
│ Pricing power: HIGH            │ Pricing power: ???           │
│                                │                              │
└────────────────────────────────┴──────────────────────────────┘
```

When switching costs collapse, pricing power follows.

This is closer to the economics of a utility than a traditional SaaS business. Think Twilio, not Salesforce. Twilio's messaging API sells at thinner margins than regular software. Salesforce sells a UI, a workflow, a platform, at premium prices with 75%+ gross margins.

When agents reduce every SaaS product to its API, you're potentially moving from Salesforce economics to Twilio economics. Not every SaaS will get there. Companies with genuinely proprietary data, regulatory lock-in, or transaction embedding will hold pricing power. But for the many SaaS products whose moat was primarily UI and workflow? The compression is real.

> SaaS pricing compression is coming. Driven not by competing sales teams, but by agents making frictionless comparisons and switches on behalf of users. Great for buyers. Brutal for incumbents who built their moat in UI rather than data and API quality.

---

## What To Do If You're Building SaaS Today

1. **Audit your API surface.** Not the one in your docs. The real one. Is it fast enough for an agent to call in a multi-step workflow? Is the data model clean enough for an LLM to reason over? Are error messages clear enough for an agent to self-correct?

2. **Think about auth and permissioning for agents, not just humans.** Today, API keys are designed for developers building integrations. Tomorrow, every user will have an agent that needs scoped access to their account. You need machine-to-machine auth patterns and audit trails that make sense for agent actions.

3. **Make API quality a first-class product metric.** Latency, reliability, uptime, data freshness. These matter more than your NPS score now. An agent that gets a 500 error doesn't leave a bad review on G2. It switches to a competitor and never comes back.

4. **Prepare for WebMCP.** If you have a web application, start thinking about what tools you'd expose through the WebMCP standard. Which functions would an agent want to call? What data would it need? Get ahead of this before the browser turns your site into an API you didn't design.

5. **Watch for agent-native entrants in your market.** Someone is building the API-first version of your product right now. They're small. They won't be for long.

> Don't wait for the shift to be obvious. By then you're already behind.

---

## The Agentic Era Is Already Here

At my previous company, I had 100+ people. A VP of Legal, a VP of HR, a VP of Finance. Every one of them spent their days operating specialized software through specialized interfaces. Logging into dashboards. Running reports. Exporting spreadsheets. Stitching data together manually.

Today at Fintool, I have more agents than people. The agent pulls my Stripe invoices, reconciles them against QuickBooks accounting records and Brex bank transactions, checks Mixpanel for product usage trends, monitors Datadog for infrastructure health, and maintains memory files that capture every key decision and why we made it. It does in minutes what used to take a leadership team days.

**"I'm replacing payroll with tokens."**

The people who push back and say "I prefer UI" are right to want a good interface. But the best interface is no longer a static dashboard designed by one SaaS vendor. It's an agent that dynamically assembles the perfect view from every system in your business, asks you for the decisions that matter, and handles everything else.

The question is no longer whether agents will run business workflows. They already do. The future is here; it's just unevenly distributed.

The question is whether your SaaS will be a first-class participant in that world -- with a clean, fast, well-documented API that agents love to work with -- or whether it will be the Rippling in someone's stack: the weak link that gets scraped, bypassed, and eventually replaced by a competitor that understood what "every SaaS is now an API" actually means.

---

## Key Takeaways for Sunder

### Memory System Design (Critical Reference)
- Nicolas uses a `/memories/` directory structure with three categories:
  - **work-preferences.md** -- persistent user preferences and style
  - **key-decisions/** -- timestamped decision logs with reasoning
  - **daily-changelog/** -- dated action logs
  - **context/** -- entity-level context (customers, team)
- This is institutional knowledge as files -- searchable, persistent, compounding
- Key insight: "When my VP of Finance left, his understanding walked out the door. With structured memory files, that knowledge persists."

### Agent-as-OS Pattern
- Claude Code as general-purpose agent harness, not chatbot
- Connected to 12+ SaaS APIs simultaneously
- Core superpower: **cross-system context merging** -- no single SaaS can do this
- Dynamic UI generated from merged data > static vendor dashboard

### B2A (Business to Agent) Shift
- Software evaluated by agent, not human: API docs > UI demos
- Purchasing decisions made in minutes, not months
- API quality = primary purchasing criterion
- If agent can't use your product, you lose the customer (Rippling example)

### SaaS Commoditization Thesis
- UI moat collapsing via three vectors: good APIs, WebMCP, browser automation
- Switching costs collapse when agents mediate the experience
- Pricing power shifts from Salesforce economics (75%+ margins) to Twilio economics (utility margins)
- Survivors: proprietary data, regulatory lock-in, transaction embedding
