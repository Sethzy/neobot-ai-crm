# Lessons from Building AI Agents for Financial Services

> **Source**: Nicolas Bustamante (@nicbstme), CEO of Fintool
> **Date**: January 25, 2026
> **Context**: 2 years building AI agents for financial services

---

## Table of Contents

1. [Why Financial Services Is Hard](#why-financial-services-is-hard)
2. [The Sandbox Is Not Optional](#the-sandbox-is-not-optional)
3. [Context Is the Product](#context-is-the-product)
4. [The Parsing Problem](#the-parsing-problem)
5. [Skills Are Everything](#skills-are-everything)
6. [The Model Will Eat Your Scaffolding](#the-model-will-eat-your-scaffolding)
7. [The S3-First Architecture](#the-s3-first-architecture)
8. [The File System Tools](#the-file-system-tools)
9. [Temporal Changed Everything](#temporal-changed-everything)
10. [Real-Time Streaming](#real-time-streaming)
11. [Evaluation Is Not Optional](#evaluation-is-not-optional)
12. [Production Monitoring](#production-monitoring)
13. [The Meta Lesson](#the-meta-lesson)

---

## Why Financial Services Is Hard

This domain doesn't forgive mistakes. Numbers matter. A wrong revenue figure, a misinterpreted guidance statement, an incorrect DCF assumption—professional investors make million-dollar decisions based on agent output. One mistake on a $100M position destroys trust forever.

**The users are demanding.** Professional investors are some of the smartest, most time-pressed people. They spot bullshit instantly. They need precision, speed, and depth.

**Key insight**: The fear of being wrong becomes your best feature. Every number gets double-checked. Every assumption gets validated. Every model gets stress-tested.

---

## The Sandbox Is Not Optional

> "The first time an LLM decided to `rm -rf /` on our server (it was trying to 'clean up temporary files'), I became a true believer."

Agents need to run multi-step operations. A professional investor asks for a DCF valuation—that's not a single API call. That's:
- Research the company
- Gather financial data
- Build a model in Excel
- Run sensitivity analysis
- Generate complex charts
- Iterate on assumptions

That's dozens of steps, each potentially modifying files, installing packages, running scripts. **You can't do this without code execution. And executing arbitrary code on your servers is insane.**

### Sandbox Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          SANDBOX                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │  /private (read/write)  │  │  /shared (read-only)        │   │
│  │  └── {user_id}/         │  │  └── {org_id}/              │   │
│  │      ├── artifacts/     │  │      ├── skills/            │   │
│  │      ├── memories/      │  │      └── data/              │   │
│  │      └── uploads/       │  │                             │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  /public (read-only)                                     │    │
│  │  └── skills/                                             │    │
│  │      ├── company-primer/                                 │    │
│  │      ├── earnings-preview/                               │    │
│  │      └── ...                                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              ↕                                   │
│                    AWS STS AssumeRole                            │
│                    (ABAC session tags)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Three mount points:**
- **Private**: Read/write for user's stuff
- **Shared**: Read-only for organization
- **Public**: Read-only for everyone

**The magic is in the credentials.** AWS ABAC (Attribute-Based Access Control) generates short-lived credentials scoped to specific S3 prefixes. User A literally cannot access User B's data—the IAM policy uses `${aws:PrincipalTag/S3Prefix}` to restrict access.

**Sandbox pre-warming**: When a user starts typing, spin up their sandbox in the background. By the time they hit enter, the sandbox is ready.

---

## Context Is the Product

Your agent is only as good as the context it can access. The real work isn't prompt engineering—it's turning messy financial data from dozens of sources into clean, structured context.

### The Heterogeneity Problem

Financial data comes in every format imaginable:
- **SEC filings**: HTML with nested tables, exhibits, signatures
- **Earnings transcripts**: Speaker-segmented text with Q&A sections
- **Press releases**: Semi-structured HTML from PRNewswire
- **Research reports**: PDFs with charts and footnotes
- **Market data**: Snowflake/databases with structured numerical data
- **News**: Articles with varying quality and structure
- **Alternative data**: Satellite imagery, web traffic, credit card panels
- **Broker research**: Proprietary PDFs with price targets and models
- **Fund filings**: 13F holdings, proxy statements, activist letters

### The Normalization Layer

Everything becomes one of three formats:
1. **Markdown** for narrative content (filings, transcripts, articles)
2. **CSV/tables** for structured data (financials, metrics, comparisons)
3. **JSON metadata** for searchability (tickers, dates, document types, fiscal periods)

### Chunking Strategy Matters

Not all documents chunk the same way:

| Document Type | Chunking Strategy |
|---------------|-------------------|
| 10-K filings | Section by regulatory structure (Item 1, 1A, 7, 8...) |
| Earnings transcripts | By speaker turn (CEO remarks, CFO remarks, Q&A by analyst) |
| Press releases | Usually small enough to be one chunk |
| News articles | Paragraph-level chunks |
| 13F filings | By holder and position changes quarter-over-quarter |

**The chunking strategy determines what context the agent retrieves. Bad chunks = bad answers.**

### Tables Are Special

LLMs are surprisingly good at reasoning over markdown tables. But they're terrible at reasoning over HTML `<table>` tags or raw CSV dumps.

### Metadata Enables Retrieval

User asks: "What did Apple say about services revenue in their last earnings call?"

To answer this, you need:
- Ticker resolution (AAPL → correct company)
- Document type filtering (earnings transcript, not 10-K)
- Temporal filtering (most recent, not 2019)
- Section targeting (CFO remarks or revenue discussion, not legal disclaimer)

**This is why `meta.json` exists for every document.** Without structured metadata, you're doing keyword search over a haystack.

---

## The Parsing Problem

Normalizing financial data is 80% of the work.

### SEC Filings Are Adversarial

They're not designed for machine reading. They're designed for legal compliance:
- Tables span multiple pages with repeated headers
- Footnotes reference exhibits that reference other footnotes
- Numbers appear in text, tables, and exhibits—sometimes inconsistently
- XBRL tags exist but are often wrong or incomplete
- Formatting varies wildly between filers (every law firm has their own template)

### The Parsing Pipeline

```
Raw Filing (HTML/PDF)
         ↓
Document structure detection (headers, sections, exhibits)
         ↓
Table extraction with cell relationship preservation
         ↓
Entity extraction (companies, people, dates, dollar amounts)
         ↓
Cross-reference resolution (Ex. 10.1 → actual exhibit content)
         ↓
Fiscal period normalization (FY2024 → Oct 2023 to Sep 2024 for Apple)
         ↓
Quality scoring (confidence per extracted field)
```

### Table Extraction Deserves Its Own Work

Financial tables are dense with meaning. A revenue breakdown table might have:
- Merged header cells spanning multiple columns
- Footnote markers (1), (2), (a), (b) that reference explanations below
- Parentheses for negative numbers: $(1,234) means -1234
- Mixed units in the same table (millions for revenue, percentages for margins)
- Prior period in italics or with asterisks

**Scoring every extracted table on:**
- Cell boundary accuracy (did we split/merge correctly?)
- Header detection (is row 1 actually headers, or is there a title row above?)
- Numeric parsing (is "$1,234" parsed as 1234 or left as text?)
- Unit inference (millions? billions? per share? percentage?)

Tables below 90% confidence get flagged for review. Low-confidence extractions don't enter the agent's context—garbage in, garbage out.

### Fiscal Period Normalization Is Critical

"Q1 2024" is ambiguous:
- Calendar Q1 (January-March 2024)
- Apple's fiscal Q1 (October-December 2023)
- Microsoft's fiscal Q1 (July-September 2023)
- "Reported in Q1" (filed in Q1, but covers the prior period)

**Maintain a fiscal calendar database for 10,000+ companies.** Every date reference gets normalized to absolute date ranges.

---

## Skills Are Everything

> "The model is not the product. The skills are the product."

Without skills, models are surprisingly bad at domain tasks. Ask a frontier model to do a DCF valuation. It knows what DCF is. It can explain the theory. But actually executing one? It will miss critical steps, use wrong discount rates for the industry, forget to add back stock-based compensation, skip sensitivity analysis.

### What Is a Skill?

A skill is a markdown file that tells the agent how to do something specific:

```markdown
# dcf

## When to Use
Use this skill for discounted cash flow valuations.

## Instructions
1. Deep dive on the company using Task tool (understand all segments)
2. Identify the company's industry and load industry-specific guidelines
3. Gather financial data: revenue, margins, CapEx, working capital
4. Build the DCF model in Excel using xlsx skill
5. Calculate WACC using industry benchmarks
6. Run sensitivity analysis on WACC and terminal growth
7. Validate: reconcile base year to actuals, compare to market price
8. Document your view vs market pricing

## Industry Guidelines
- Technology/SaaS: `/public/skills/dcf/guidelines/technology-saas.md`
- Healthcare/Pharma: `/public/skills/dcf/guidelines/healthcare-pharma-biotech.md`
- Financial Services: `/public/skills/dcf/guidelines/financial-services.md`
[... 10+ industries with specific methodologies]
```

### Why Skills Are Better Than Code

1. **Non-engineers can create skills.** Analysts write skills. Customers write skills. A portfolio manager who's done 500 DCF valuations can encode their methodology without writing Python.

2. **No deployment needed.** Change a skill file and it takes effect immediately. No CI/CD, no code review, no waiting for release cycles.

3. **Readable and auditable.** When something goes wrong, you can read the skill and understand exactly what the agent was supposed to do.

### Skill Shadowing System

```
┌────────────────────────────────────────────────────────────┐
│  PRIVATE: /private/skills/{name}/SKILL.md     │  ← Wins   │
│  (user customization)                          │           │
├────────────────────────────────────────────────────────────┤
│  SHARED: /shared/skills/{name}/SKILL.md       │           │
│  (org customization)                           │           │
├────────────────────────────────────────────────────────────┤
│  PUBLIC: /public/skills/{name}/SKILL.md       │           │
│  (platform default)                            │           │
└────────────────────────────────────────────────────────────┘

Priority: private > shared > public
```

If you don't like how DCF valuations are done, write your own. Drop it in `/private/skills/dcf/SKILL.md`. Your version wins.

### Why NOT Mount All Skills to Filesystem

The naive approach would be to mount every skill file directly into the sandbox. **Wrong.** Use SQL discovery instead:

```sql
SELECT user_id, path, metadata
FROM fs_files
WHERE user_id = ANY(:user_ids)
AND path LIKE 'skills/%/SKILL.md'
```

**Reasons:**
1. **Lazy loading**: DCF skill alone has 10+ industry guideline files. Loading all of them into context for every conversation burns tokens and confuses the model.
2. **Access control at query time**: SQL query implements three-tier access model.
3. **Shadowing logic**: SQL makes priority rules trivial—query all three levels, apply priority, return the winner.
4. **Metadata-driven filtering**: The `fs_files.metadata` column stores parsed YAML frontmatter. Filter by skill type without reading files.

---

## The Model Will Eat Your Scaffolding

Everything about skills is temporary.

Models are getting better. Fast. Every few months, there's a new model that makes half your code obsolete. The elaborate scaffolding you built to handle edge cases? The model just handles them now.

**Prediction**: In two years, most basic skills will be one-liners. "Generate a 20 tabs DCF." The model will know what that means.

**But**: As basic tasks get commoditized, push into more complex territory. Multi-step valuations with segment-by-segment analysis. Automated backtesting of investment strategies. Real-time portfolio monitoring with complex triggers. The frontier keeps moving.

Write skills for when they work. Delete them when they become unnecessary. Build new ones for harder problems. **And all of them are files.**

---

## The S3-First Architecture

> "S3 for files is a better database than a database."

User data (watchlists, portfolio, preferences, memories, skills) stored in S3 as YAML files. S3 is the source of truth. Lambda function syncs changes to PostgreSQL for fast queries.

```
Writes → S3 (source of truth)
              ↓
         Lambda trigger
              ↓
         PostgreSQL (fs_files table)
              ↓
Reads  ← Fast queries
```

**Why?**
- **Durability**: S3 has 11 9's. A database doesn't.
- **Versioning**: S3 versioning gives audit trails for free
- **Simplicity**: YAML files are human-readable. Debug with `cat`.
- **Cost**: S3 is cheap. Database storage is not.

### The Sync Architecture

Two Lambda functions keep S3 and PostgreSQL in sync:

```
S3 (file upload/delete)
         ↓
fs-sync Lambda → Upsert/delete in fs_files table (real-time)

EventBridge (every 3 hours)
         ↓
fs-reconcile Lambda → Full S3 vs DB scan, fix discrepancies
```

Both use upsert with timestamp guards—newer data always wins.

### User Memories

Every user has a `/private/memories/UserMemories.md` file in S3. It's just markdown—users can edit it directly in the UI.

```python
org_memories, user_memories = await fetch_memories(safe_user_id, org_id)
conversation_manager.add_backend_message(
    UserMessage(content=f"<user-memories>\n{user_memories}\n</user-memories>")
)
```

Users write things like:
- "I focus on small-cap value stocks"
- "Always compare to industry median, not mean"
- "My portfolio is concentrated in tech, so flag concentration risk"

The agent sees this on every conversation and adapts. No schema changes. Just a markdown file the user controls.

---

## The File System Tools

Agents in financial services need to read and write files. A lot of files.

### ReadFile Tool

```
┌─────────────────────────────────────────────────────────────┐
│                      ReadFile Tool                           │
├─────────────────────────────────────────────────────────────┤
│  Images (PNG/JPG/GIF/WebP):                                 │
│    • Auto-compress to fit model context limits              │
│    • Detect actual format from magic bytes                  │
│                                                             │
│  PDFs:                                                      │
│    • Return as document attachment for native processing    │
│                                                             │
│  Word docs (.doc/.docx):                                    │
│    • Convert to markdown via python script                  │
│                                                             │
│  Text files:                                                │
│    • 256KB max size, 25K token limit                        │
│    • Offset/limit for chunked reading                       │
│    • Line numbers for navigation                            │
└─────────────────────────────────────────────────────────────┘
```

### WriteFile

Files in `/private/artifacts/` become clickable links:
```
computer://user_id/artifacts/chart.png → opens in viewer
```

### Bash

Persistent shell access with:
- 180 second timeout
- 100K character output limit
- Path normalization on everything (LLMs love trying path traversal attacks)

### Filesystem + Bash > SQL for Semi-Structured Data

Braintrust ran an eval comparing SQL agents, bash agents, and hybrid approaches for querying semi-structured data:
- Pure SQL: 100% accuracy but missed edge cases
- Pure bash: Slower and more expensive but caught verification opportunities
- **Winner**: Hybrid approach where agent uses bash to explore and verify, SQL for structured queries

---

## Temporal Changed Everything

Before Temporal, long-running tasks were a disaster. User asks for a comprehensive company analysis—that takes 5 minutes. What if the server restarts? What if the user closes the tab?

**Temporal handles:**
- Worker crashes
- Retries
- Everything

If a Heroku dyno restarts mid-conversation, Temporal automatically retries on another worker. The user never knows.

### Cancellation Handling

User clicks "stop"—what happens? The activity is already running on a different server. **Use heartbeats** sent every few seconds.

### Worker Types

- **Chat workers**: User-facing, 25 concurrent activities
- **Background workers**: Async tasks, 10 concurrent activities

They scale independently.

---

## Real-Time Streaming

In finance, people are impatient. They need to see something happening.

```
Agent → SSE Events → Redis Stream → API → Frontend
```

### Delta Updates, Not Full State

Instead of sending "here's the complete response so far" (expensive), send "append these 50 characters" (cheap):

```typescript
enum DeltaOperation {
  ADD = "add",       // Insert object at index
  APPEND = "append", // Append to string/array
  REPLACE = "replace",
  PATCH = "patch",
  TRUNCATE = "truncate"
}
```

### AskUserQuestion: Interactive Agent Workflows

Sometimes the agent needs user input mid-workflow:
- "Which valuation method do you prefer?"
- "Should I use consensus estimates or management guidance?"
- "Do you want me to include the pipeline assets in the valuation?"

When the agent calls this tool, the agentic loop intercepts it, saves state, and presents a UI to the user. The user picks an option (or types a custom answer), and the conversation resumes with their choice.

**This transforms agents from autonomous black boxes into collaborative tools.** Essential for high-stakes financial work where users need to validate assumptions.

---

## Evaluation Is Not Optional

> "'Ship faster' works for most startups. It does not work for financial services."

A wrong earnings number can cost someone money. You can't just "fix it later" when users are making million-dollar decisions based on output.

### Domain-Specific Evals

Generic NLP metrics (BLEU, ROUGE) don't work for finance. A response can be semantically similar but have completely wrong numbers.

**~2,000 test cases across categories:**

#### Ticker Disambiguation

This is deceptively hard:
- "Apple" → AAPL, not APLE (Appel Petroleum)
- "Meta" → META, not MSTR (which some people call "meta")
- "Delta" → DAL (airline) or delta hedging (options term)?

**Ticker changes are nasty**: Facebook became META in 2021. Twitter became X. When a user asks "What happened to Facebook stock in 2023?", you need to know that FB → META, and that historical data before Oct 2021 lives under the old ticker.

#### Fiscal Period Hell

This is where most financial agents silently fail:
- Apple's Q1 is October-December (fiscal year ends in September)
- Microsoft's Q2 is October-December (fiscal year ends in June)
- Most companies Q1 is January-March (calendar year)

"Last quarter" on January 15th means:
- Q4 2024 for calendar-year companies
- Q1 2025 for Apple (they just reported)
- Q2 2025 for Microsoft (they're mid-quarter)

**Maintain fiscal calendars for 10,000+ companies. 200+ test cases just for period extraction.**

#### Numeric Precision

Revenue of $4.2B vs $4,200M vs $4.2 billion vs "four point two billion." All equivalent. But "4" without units? Is it millions? Billions? Per share? Percentage?

#### Adversarial Grounding

Inject fake numbers into context and verify the model cites the real source, not the planted one.

**50 test cases specifically for hallucination resistance.**

### Eval-Driven Development

Every skill has a companion eval. The DCF skill has 40 test cases covering WACC edge cases, terminal value sanity checks, and stock-based compensation add-backs (models forget this constantly).

**PR blocked if eval score drops >5%. No exceptions.**

---

## Production Monitoring

### Observability Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Stack                       │
├─────────────────────────────────────────────────────────────┤
│  Braintrust:    LLM traces                                  │
│                 (prompt, response, latency, cost)           │
│                                                             │
│  Temporal UI:   Workflow debugging                          │
│                 (step failures, retry history)              │
│                                                             │
│  Datadog:       Infrastructure                              │
│                 (CPU, memory, latency percentiles)          │
└─────────────────────────────────────────────────────────────┘
```

### Auto-Filed GitHub Issues

Error happens → issue gets created with full context:
- Conversation ID
- User info
- Traceback
- Links to Braintrust traces and Temporal workflows

Paying customers get `priority:high` label.

### Model Routing by Complexity

- Simple queries → Haiku (cheap)
- Complex analysis → Sonnet (expensive)
- Enterprise users → Always get the best model

---

## The Meta Lesson

> "The model is not your product. The experience around the model is your product."

Anyone can call Claude or GPT. The API is the same for everyone.

**What makes your product different is everything else:**
- The data you have access to
- The skills you've built
- The UX you've designed
- The reliability you've engineered
- How well you know the industry (a function of time spent with customers)

Models will keep getting better. That's great! It means less scaffolding, less prompt engineering, less complexity. But it also means the model becomes more of a commodity.

**Your moat is everything you build around it.**

---

*Source: Nicolas Bustamante (@nicbstme), CEO of Fintool, January 25, 2026*

---

## Updates

### 2025-01-29 - Programmatic SEO Case Study

**BONUS: How Fintool Automated Inbound and Scaled to 10M+ Monthly Impressions on Google Search**

Same architecture. Same skills. They created a Fintool account for SEO.

The account has its own filesystem, its own watchlists, and its own skills. They wrote skills for news articles, earnings recaps, company pages, and a dozen more. Organized in a neatly grepable filesystem—essentially Markdown (.md) guideline files that describe what context to gather and what to write (and how).

**Triggers fire when:**
- Earnings drop
- Filings hit
- News breaks

The agent reads the relevant skill file, follows the instructions, writes the content, and publishes to fintool.com/news.

**Result:**
- 10M+ monthly impressions across Google Search, ChatGPT, and Perplexity
- No content team
- Completely autonomous

Google indexes the pages. ChatGPT and Perplexity cite them when users ask financial questions. AI referral traffic converts 4x better than traditional search.

**Key insight:** The same AI agent that customizes the product for users also generates the content that brings users in. The content is structured for both humans and models.
