# Betting on a Hyper-Personalized, Chat-Only Product

**Source:** X Article by @DonovanSo2 (Founding engineer at Fintool, YC)
**Date:** Jan 29, 2026
**Views:** 187
**Tags:** #fintool #chat-ui #personalization #filesystem-architecture #claude-code #s3 #ai-agents #fintech

---

## Background

My name is Donovan, a founding engineer at Fintool. We're building an AI research platform for financial professionals.

Over the past 1.5 years, we've experimented with a ton of different UIs for our AI features. Our company screener looked like an Excel spreadsheet. Watchlists were giant tables of tickers. The news feed was a list of cards with LLM-generated content.

However, when Anthropic launched Claude Code in early 2025 -- and later Claude Opus 4.5 -- something clicked for our team. We saw an AI agent that could read files, write files, run bash commands, and iterate until the task was done. Soon, we realized Claude Code was tackling non-coding tasks too: reading CSVs, building charts, searching the web, and writing reports.

**That's when we made a big strategic decision: we would scrap every feature except chat.** Fintool is now on its way to becoming a chat-only interface with deep personalization.

---

## The Bets

### Bet 1: Going All-in on Chat

In the early days, we built custom UI for every feature. Each feature got its own tab, its own design, its own UX.

This approach caused three problems:

1. **Learning curve:** Users had to learn a new interface for each feature -- that's a lot of cognitive overhead.
2. **Maintenance burden:** More surfaces meant more code to maintain, and our small team was stretched thin.
3. **Discoverability:** Features got buried in navigation, and users often didn't know they existed.

So we made a bet: migrate everything into chat. Need to create a watchlist? Ask Fintool. Need to set up an alert? Ask Fintool. Need a DCF model? Ask Fintool.

**"Just ask Fintool" became our mantra on customer calls.** When users ask what Fintool can do, we tell them: "Why don't you ask Fintool yourself?"

The architectural payoff has been significant. New features no longer require new pages -- we just build a tool, plug it into the agent, and it surfaces through the same familiar interface. Users stay in one place. The AI brings capabilities to them rather than the other way around.

### Bet 2: Relentlessly Personalize

At Fintool, we're fighting the battle on two fronts. On one end, there are AI labs like OpenAI and Anthropic who control the models. On the other, there are incumbents like Factset and S&P Global who have massive market share in the financial industry.

**Without persistent memory, we're just another generic chatbot. Every conversation starts from zero.**

To differentiate, we realized we had to collect as much context about our users as possible. Before using our product, users provide their watchlists, investment profile, samples of past reports they've written, portfolio holdings, Notion, OneDrive, everything.

Then, we strive to personalize every response. Recommended questions that pull from your watchlists. Alerts that reference your investment thesis. A screener that finds opportunities in industries that actually matter to you.

**In the world of AI, any feature that isn't personalized will be commoditized.** Washed away by the next wave of AI products.

---

## The Technical Challenges

### Challenge 1: Chat That Does Everything

If chat is the only interface, it needs to handle everything -- both rendering rich content inline and collecting structured input when the AI needs it.

**Rendering side:**

- Markdown via **Streamdown**
- **KaTeX** for equations
- **Shiki** for syntax highlighting
- **Plotly** for interactive charts (AI generates Plotly chart specs as JSON, rendered inline)
- Custom citation syntax linking claims to source documents
- **SpreadJS** for Excel/CSV with full styling and formula support
- **Gotenberg** for Office docs (Word, PowerPoint) converted to PDF for in-browser previews

```
  +--[ Fintool Chat: DCF on $AMZN ]------------------------------------------+
  |                                                                           |
  |  "create a DCF on $AMZN - ask me questions"                             |
  |                                                                           |
  |  +-- Chat Panel ----+  +-- AMZN_DCF_Model.xlsx -----------------------+  |
  |  |                  |  |                                               |  |
  |  | Assumptions:     |  |  AMAZON (AMZN) - SUM-OF-THE-PARTS DCF       |  |
  |  |                  |  |  Valuation Date: January 27, 2026            |  |
  |  | NA Retail Exit   |  |  10-Year Forecast with Exit Multiple         |  |
  |  |  Multiple: 11.0x |  |  Terminal Value                              |  |
  |  |  EBITDA          |  |                                               |  |
  |  |                  |  |  KEY VALUATION OUTPUTS                       |  |
  |  | Intl Retail Exit |  |  AWS Enterprise Value          $0.0B        |  |
  |  |  Multiple: 10.0x |  |  North America Enterprise      $0.0B        |  |
  |  |  EBITDA          |  |  International Enterprise      $0.0B        |  |
  |  |                  |  |                                               |  |
  |  | Forecast Period: |  |  Implied Share Price          $178.16       |  |
  |  |  10 years        |  |  Current Share Price          $244.68       |  |
  |  |                  |  |  Upside / (Downside)          -27.2%        |  |
  |  | Tax Rate: 21%    |  |                                               |  |
  |  |                  |  |  SEGMENT VALUE BREAKDOWN                    |  |
  |  | [Copy table]     |  |  AWS                   $0.0B    68.2%       |  |
  |  | [Export]         |  |  NA Retail             $0.0B    24.9%       |  |
  |  | [Generate chart] |  |  Intl Retail           $0.0B     6.9%       |  |
  |  | [Generate Excel] |  |                                               |  |
  |  |                  |  |  IMPLIED MULTIPLES (FY 2025E)               |  |
  |  | AMZN_DCF_Model   |  |  EV / Revenue                   2.8x       |  |
  |  |  .xlsx           |  |  EV / EBITDA                   12.1x       |  |
  |  +------------------+  |                                               |  |
  |                        |  [Overview] [Assumptions] [AWS DCF] [NA..]   |  |
  |                        +-----------------------------------------------+  |
  +--The Excel model includes:                                                |
  |  - Overview: Summary of all key outputs                                   |
  |  - Assumptions: All modifiable inputs (blue = adjustable)                 |
  |  - AWS DCF: 10-year AWS segment forecast                                 |
  |  - NA Retail DCF: North America forecast                                 |
  +---------------------------------------------------------------------------+
```

**Input side: AskUserQuestion tool**

When extra context is needed, the AI calls an `AskUserQuestion` tool that streams a JSON payload with questions, options, and input types (multiple choice, ticker search, file upload).

```
  +--[ Fintool Chat: $NFLX Earnings Memo ]-----------------------------------+
  |                                                                           |
  |  User: "Write an earnings memo on $NFLX - ask me questions"             |
  |                                                                           |
  |  [Agent processing...]                                                   |
  |                                                                           |
  |  +-- AskUserQuestion tool called ------------------------------------+   |
  |  |                                                                    |   |
  |  |  Input bar: [Ask a follow-up...]                                  |   |
  |  |  Quick actions: [Upload] [Docs] [$ Tickers] [$] [Stop]           |   |
  |  |                                                                    |   |
  |  +--------------------------------------------------------------------+   |
  |                                                                           |
  |  Sidebar: Recent Chats                                                   |
  |   - AMZN DCF Questions (4m ago)                                          |
  |   - SOFI Growth Trends (6h ago)                                          |
  +---------------------------------------------------------------------------+
```

Under the hood, answers serialize back to the LLM as formatted text:

```markdown
1. What sectors interest you?
Technology, Healthcare

2. What's your investment horizon?
No preference
```

The LLM parses this response and continues the task with the user's context baked in.

### Challenge 2: Getting User Context to the AI

Personalization only works if the AI can actually access user data -- quickly, reliably, and flexibly.

Inspired by Claude Code, the solution was a **filesystem-first architecture**. Every user gets a virtual filesystem backed by S3:

```
/private/
|-- watchlists/biotech.yaml
|-- memories/UserMemories.md
|-- uploads/earnings_summary.pdf
+-- artifacts/dcf_model.xlsx
```

The LLM reads, writes, and edits these files through tools. Watchlists are YAML files, user preferences live in markdown, and generated spreadsheets save to an artifacts folder.

**Why files instead of database records?** Because LLMs like Claude Opus 4.5 are trained to navigate and manipulate filesystems. They already know how to read, write, and edit files -- we don't have to teach them a custom API or data model. The filesystem is a universal interface that the model understands natively.

This also gives flexibility. The LLM doesn't need a predefined schema -- it can create whatever structure makes sense for the task at hand. Want to add a "notes" field to a watchlist? Just write it. Want the AI to remember your investment thesis? It appends to your memories file. No migrations required, no API changes, no frontend updates.

### Data Sync Architecture Evolution

**Before (messy):** Started with Postgres as the source of truth, with bidirectional sync to S3. Any write to Postgres had to be accompanied by a write to S3; likewise, any write to S3 had to be synced back to Postgres via a Lambda script. Sync logic was scattered across the backend, race conditions began to appear, and debugging required tracing writes across multiple systems.

**After (clean):** Made **S3 the single source of truth**. Now, one Lambda handles the sync from S3 to Postgres (to a table that enables fast queries). All writes go to S3 first, the sync is unidirectional, and all the logic lives in one place.

```
  BEFORE: Bidirectional sync (messy)
  ====================================

  +----------+  write  +-----+  write  +----+
  |  Backend | ------> |  PG | ------> | S3 |
  |          | <------ |     | <------ |    |
  +----------+  sync   +-----+  Lambda +----+

  Race conditions, scattered logic, hard to debug


  AFTER: S3 as single source of truth (clean)
  ==============================================

  +----------+  write  +----+  Lambda  +----+
  |  Backend | ------> | S3 | -------> | PG |
  +----------+         +----+   (one   +----+
                                 way)    (fast queries)

  +----------+  optimistic  +-------+
  | Frontend |  update via  | React |
  |          |  React Query | Query |
  +----------+--------------+-------+
  (hides 2-3s sync delay, feels instant)
```

To keep the UI feeling snappy, the frontend uses **React Query's optimistic updates** to hide the 2-3 second sync delay. When you create a watchlist, it appears instantly in the interface -- even though Postgres won't reflect it for a few seconds. Clean data flow without sacrificing responsiveness.

---

## What's Temporary, What's Permanent

A lot of what we build today is scaffolding:
- **Streaming animations** exist because responses are slow -- they'll be redundant when inference reaches 1500 tokens/s
- **Autocomplete menus** exist because models used to struggle with recognizing company names -- smarter models will just understand

But the two bets -- **chat-only** and **hyper-personalization** -- will stay.

---

## Key Takeaways

- **Chat as the only interface:** Eliminates learning curve, maintenance burden, and discoverability problems. New features = new tools, not new pages
- **"Just ask Fintool":** The product mantra. Users don't need to know what features exist
- **Personalization is the moat:** Without persistent memory, you're a commoditized chatbot. Collect context aggressively (watchlists, investment profile, past reports, holdings, Notion, OneDrive)
- **Filesystem-first architecture:** LLMs already understand files. YAML watchlists, markdown memories, artifacts folder. No schema migrations needed
- **S3 as single source of truth:** Unidirectional sync to Postgres via one Lambda. Eliminates race conditions from bidirectional sync
- **React Query optimistic updates:** Hides 2-3s sync delay for snappy UI
- **Rich rendering stack:** Streamdown + KaTeX + Shiki + Plotly + SpreadJS + Gotenberg + custom citations
- **AskUserQuestion tool:** Structured input mid-task. Multiple choice, ticker search, file upload. Serializes answers as formatted text back to LLM
- **Any unpersonalized feature will be commoditized** by the next wave of AI products
